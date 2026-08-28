import { PeerOptions } from 'peerjs'
import {
  peerHost,
  peerPath,
  peerPort,
  peerSecure,
  turnCredential,
  turnUrl,
  turnUsername,
} from '../runtimeConfig'
import { parsePeerHost } from '../../../types/PeerHost'

/**
 * With no options PeerJS uses its free public broker, which means signalling
 * metadata for every call leaves our infrastructure, availability depends on a
 * service we do not run, and peer ids share a namespace with every other app
 * using the default - so an id can be reached from outside the room.
 *
 * Point VITE_PEER_HOST at a self-hosted PeerServer to avoid all three. Unset,
 * behaviour is unchanged.
 */
/**
 * How long after losing the signalling broker before dialling it again.
 *
 * PeerJS never redials on its own: one dropped socket and the peer stays off
 * the broker for good, still in the game and unreachable for every call. Long
 * enough not to hammer a broker that is restarting, short enough that two
 * people stood together are talking again before they give up and type.
 */
export const PEER_RECONNECT_DELAY_MS = 3000

/**
 * Where the browsers should try to reach each other.
 *
 * STUN only tells a peer what its own public address looks like, which is
 * enough whenever something along the path is willing to forward a packet
 * back. Behind symmetric NAT or carrier-grade NAT - most mobile data, and a
 * great many home ISPs - nothing is, and the two peers never find a path at
 * all. That is not a slow call, it is silence, and no amount of tuning the
 * bitrate fixes it; the only answer is a relay both sides can reach.
 *
 * So a configured TURN server is also used for STUN, since coturn answers
 * both on the same port and asking it keeps the address discovery on
 * infrastructure we run. With nothing configured this returns undefined and
 * PeerJS falls back to its own defaults, exactly as before.
 */
function iceServers(): RTCIceServer[] | undefined {
  const configured = turnUrl()
  if (!configured) return undefined

  const urls = configured
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    // a bare host:port is a reasonable thing to write and an unreasonable
    // thing to have silently ignored
    .map((url) => (/^turns?:/.test(url) ? url : `turn:${url}`))

  if (urls.length === 0) return undefined

  const username = turnUsername()
  const credential = turnCredential()

  // Offering both transports of one relay is normal and useful, but they only
  // differ in a query string STUN does not take - so without the dedupe the
  // same server would be asked the same question twice on every call.
  const stunUrls = [
    ...new Set(urls.map((url) => url.replace(/^turns?:/, 'stun:').replace(/\?.*$/, ''))),
  ]

  const servers: RTCIceServer[] = [{ urls: stunUrls }]

  // An unauthenticated relay is one anybody on the internet can push traffic
  // through, so a TURN entry without credentials is not worth offering.
  if (username && credential) {
    servers.push({ urls, username, credential })
  } else {
    console.warn('TURN url is set without a username and credential, so no relay will be used')
  }

  return servers
}

export function peerOptions(): PeerOptions | undefined {
  const ice = iceServers()
  // TURN is worth having whether or not the broker is self-hosted, so the two
  // are configured independently.
  const config = ice ? { config: { iceServers: ice } } : undefined

  const configured = peerHost()
  if (!configured) return config

  // PeerJS takes a hostname and builds the url around it, so a url given here
  // has to be read apart first rather than passed through.
  const parsed = parsePeerHost(configured)
  if (!parsed.host) return config

  // What was set explicitly wins; what the url carried stands in for the rest.
  const configuredPort = Number(peerPort())
  const port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : parsed.port

  const configuredSecure = peerSecure()
  const secure = configuredSecure ? configuredSecure !== 'false' : (parsed.secure ?? true)

  return {
    host: parsed.host,
    path: peerPath() || '/',
    secure,
    ...(port ? { port } : {}),
    ...config,
  }
}
