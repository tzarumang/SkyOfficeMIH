import http from 'http'
import crypto from 'crypto'
import express, { RequestHandler } from 'express'
import cors from 'cors'
import { Server, LobbyRoom } from 'colyseus'
import { monitor } from '@colyseus/monitor'
import { RoomType } from '../types/Rooms'

// import socialRoutes from "@colyseus/social/express"

import { SkyOffice } from './rooms/SkyOffice'
import { officeDrawingFor, readOfficeId } from './rooms/OfficeMaps'
import { drawingVersion } from './office/index'

const port = Number(process.env.PORT || 2567)
const isProduction = process.env.NODE_ENV === 'production'
const app = express()

/**
 * A single bad message must never be able to take the whole server down with it.
 * Handlers are guarded individually (see SkyOffice.onSafeMessage), so anything
 * that reaches here is unexpected - log it loudly, but keep serving the rooms
 * that are still healthy.
 */
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

/**
 * Colyseus 0.14 does matchmaking over HTTP, so the client origin has to be
 * allowed here. Set ALLOWED_ORIGINS to a comma-separated list of the origins
 * that serve the client, e.g. "https://office.example.com".
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins }))
} else {
  app.use(cors())
  console.warn('ALLOWED_ORIGINS is not set - accepting requests from any origin.')
}

/**
 * Colyseus 0.14 answers /matchmake/* on the raw http server, before express and
 * its cors middleware ever see the request, and hardcodes
 * Access-Control-Allow-Origin: *. Restricting origins therefore has to happen in
 * front of Colyseus's own listener rather than through express.
 *
 * This only protects browsers, which is all CORS ever does: a browser always
 * sends Origin on a cross-origin request, while anything else can just leave it
 * out. Requests arriving without an Origin are passed through so non-browser
 * clients keep working - it stops another site driving this server through a
 * visitor's browser, not someone with a script.
 */
function restrictMatchmakingOrigins(httpServer: http.Server, origins: string[]) {
  const existing = httpServer.listeners('request') as Array<
    (req: http.IncomingMessage, res: http.ServerResponse) => void
  >
  httpServer.removeAllListeners('request')

  httpServer.on('request', (req, res) => {
    const origin = req.headers.origin
    const isMatchmaking = (req.url || '').includes('/matchmake/')

    if (isMatchmaking && origin && !origins.includes(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Origin not allowed' }))
      return
    }

    for (const listener of existing) listener.call(httpServer, req, res)
  })
}

app.use(express.json())
// app.use(express.static('dist'))

// Liveness probe for the container runtime. Deliberately says nothing about
// rooms or players - it is reachable without credentials.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/**
 * The floor plan of a generated office.
 *
 * The seed is the whole drawing, so the server rebuilds it on demand rather
 * than keeping a copy per room. Anyone may ask for any seed - a floor plan is
 * not a secret, and knowing one gets you no closer to joining the office that
 * uses it, which still needs the room id and its password.
 */
/**
 * Which drawing of an office this build produces.
 *
 * The client hangs this off the map url it asks for. An id names the office
 * and says nothing about how it is drawn, so without this a copy of the old
 * drawing and a copy of the new one have the same name - which is how three
 * rounds of furniture fixes stayed invisible to the person testing them.
 */
app.get('/office/version', (_req, res) => {
  res.set('Cache-Control', 'no-cache')
  res.json({ version: drawingVersion() })
})

app.get('/office/map/:id.json', (req, res) => {
  const id = readOfficeId(req.params.id)
  if (id === null) return res.status(400).json({ error: 'not an office id' })

  try {
    /**
     * Cached, but revalidated every time.
     *
     * This used to be `max-age=31536000, immutable`, on the reasoning that an
     * id encodes the seed and the spec so the drawing for it never changes.
     * That is true of the id and false of the generator: change how offices are
     * furnished and the same id draws a different office, while every browser
     * that has ever opened it goes on showing the old one - and `immutable`
     * means it will not even ask. Days of fixes can land on the server and be
     * invisible to the person testing them.
     *
     * `no-cache` still stores the response; it just has to check first. The
     * check is an ETag away and comes back 304 whenever nothing has moved.
     */
    res.set('Cache-Control', 'no-cache')
    return res.json(officeDrawingFor(id))
  } catch (error: any) {
    console.error(`[office] could not draw ${id}:`, error?.message)
    return res.status(500).json({ error: 'could not draw that office' })
  }
})

const server = http.createServer(app)
const gameServer = new Server({
  server,
})

// must come after the Server constructor, which is what installs the
// matchmaking listener we are wrapping
if (allowedOrigins.length > 0) {
  restrictMatchmakingOrigins(server, allowedOrigins)
}

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, SkyOffice, {
  name: 'Public Lobby',
  description: 'For making friends and familiarizing yourself with the controls',
  password: null,
  unlisted: false,
})
// filterBy makes joinOrCreate find an office by its slug, which is how a
// permanent link reopens an office that was disposed when it emptied
gameServer.define(RoomType.CUSTOM, SkyOffice).filterBy(['slug']).enableRealtimeListing()

/**
 * Register @colyseus/social routes
 *
 * - uncomment if you want to use default authentication (https://docs.colyseus.io/server/authentication/)
 * - also uncomment the import statement
 */
// app.use("/", socialRoutes);

function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return crypto.timingSafeEqual(bufferA, bufferB)
}

function basicAuth(user: string, password: string): RequestHandler {
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ')

    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      const separator = decoded.indexOf(':')

      if (separator !== -1) {
        // compare both halves before branching so a wrong username and a wrong
        // password take the same amount of time
        const userMatches = safeEqual(decoded.slice(0, separator), user)
        const passwordMatches = safeEqual(decoded.slice(separator + 1), password)
        if (userMatches && passwordMatches) return next()
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="SkyOffice monitor", charset="UTF-8"')
    res.status(401).send('Authentication required.')
  }
}

/**
 * The monitor can read every room's full state (player names, chat history of
 * private rooms) and disconnect clients, so it is only mounted when credentials
 * are configured. In production, no credentials means no monitor.
 */
const monitorUser = process.env.COLYSEUS_MONITOR_USER
const monitorPassword = process.env.COLYSEUS_MONITOR_PASSWORD

if (monitorUser && monitorPassword) {
  // register colyseus monitor AFTER registering your room handlers
  app.use('/colyseus', basicAuth(monitorUser, monitorPassword), monitor())
  console.log('Colyseus monitor available at /colyseus (password protected)')
} else if (isProduction) {
  console.warn(
    'Colyseus monitor is disabled - set COLYSEUS_MONITOR_USER and COLYSEUS_MONITOR_PASSWORD to enable it.'
  )
} else {
  app.use('/colyseus', monitor())
  console.warn('Colyseus monitor available at /colyseus WITHOUT authentication (development only)')
}

gameServer.listen(port)
console.log(`Listening on ws://localhost:${port}`)
