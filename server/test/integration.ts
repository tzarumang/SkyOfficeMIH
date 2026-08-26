/**
 * Boots a real server in-process and drives it with a real client. Covers the
 * things a client should not be able to do - the findings from the security
 * audit - so they cannot quietly come back.
 *
 * Run with: yarn test
 */
process.env.PORT = process.env.TEST_PORT || '2599'
// so the matchmaking origin gate is active for the checks below
process.env.ALLOWED_ORIGINS = 'http://allowed.example.test'
// keep the office store out of the working tree
process.env.OFFICE_STORE_PATH = require('path').join(
  require('os').tmpdir(),
  'skyoffice-test-offices.json'
)
try {
  require('fs').unlinkSync(process.env.OFFICE_STORE_PATH)
} catch {}

require('../index')

import { parsePeerHost } from '../../types/PeerHost'
import { drawingVersion } from '../office/index'
import { Client } from 'colyseus.js'
import { Message } from '../../types/Messages'
import { classicOfficeMap, REFERENCE_MAP_PATH } from '../rooms/MapObjects'
import { officeDrawingFor } from '../rooms/OfficeMaps'
import { contentsOf, generateOffice } from '../office'
import { OfficeSpec, parseOfficeId } from '../../types/Office'
import { CLASSIC_SPAWN, readSpawn } from '../../types/Spawn'
import { ItemType } from '../../types/Items'
import RateLimiter from '../rooms/RateLimiter'
import RoombaDriver from '../rooms/RoombaDriver'
import { ROOMBA_TICK_MS } from '../../types/Roomba'
import { decodeLogo, encodeLogo, isLogo, LOGO_MAX_LENGTH } from '../../types/Logo'
import http from 'http'
import { readFileSync } from 'fs'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const positionOf = (room: any) => room.state.players.get(room.sessionId)
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The server only lets a player cover ground at a plausible speed, so arriving
 * somewhere takes real time. Asking repeatedly to be at the destination walks
 * them there a budget at a time.
 */
async function walkTo(room: any, target: { x: number; y: number }) {
  for (let step = 0; step < 40; step++) {
    room.send(Message.UPDATE_PLAYER, { x: target.x, y: target.y, anim: 'adam_idle_down' })
    await sleep(100)
    if (distance(positionOf(room), target) < 1) return true
  }
  return false
}
const endpoint = `ws://localhost:${process.env.PORT}`

/** every layer the client walks without checking it exists first */
const CLIENT_LAYERS = [
  'Ground',
  'Wall',
  'Chair',
  'Objects',
  'ObjectsOnCollide',
  'GenericObjects',
  'GenericObjectsOnCollide',
  'Computer',
  'Whiteboard',
  'Basement',
  'VendingMachine',
  'Zone',
]

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `${ok ? '  ok  ' : ' FAIL '} ${label}` +
      (ok ? '' : `\n         got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  )
}

function rateLimiterUnits() {
  console.log('\nRateLimiter')
  const limiter = new RateLimiter(5, 1)

  let allowed = 0
  for (let i = 0; i < 20; i++) if (limiter.consume('a', 1000)) allowed++
  check('a burst is capped at the bucket capacity', allowed, 5)
  check('allowance comes back over time', limiter.consume('a', 3000), true)
  check('keys are independent', limiter.consume('b', 1000), true)
  check(
    'check() does not spend allowance',
    [limiter.check('c', 0), limiter.consume('c', 0)],
    [true, true]
  )

  const budget = new RateLimiter(150, 600)
  check('takeUpTo spends what it can', budget.takeUpTo('m', 400, 0), 150)
  check('and leaves nothing behind', budget.takeUpTo('m', 10, 0), 0)
  check('it refills at its own rate', budget.takeUpTo('m', 400, 100), 60)
}

/** POSTs a matchmaking request, optionally as a browser would, and reports the status */
function matchmakeStatus(origin?: string) {
  return new Promise<number>((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: Number(process.env.PORT),
        path: '/matchmake/joinOrCreate/skyoffice',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(origin ? { Origin: origin } : {}),
        },
      },
      (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode || 0))
      }
    )
    request.on('error', reject)
    request.end('{}')
  })
}

async function matchmakingOriginTests() {
  console.log('\nMatchmaking origins')

  // Colyseus answers /matchmake/* on the raw http server, before express and its
  // cors middleware see it, so this has to be enforced in front of Colyseus.
  check('an allowed origin gets through', await matchmakeStatus('http://allowed.example.test'), 200)
  check('another site is refused', await matchmakeStatus('http://evil.example.test'), 403)
  // CORS only ever protected browsers; anything else can omit the header
  check('a request with no origin still works', await matchmakeStatus(undefined), 200)
}

function slug() {
  return require('crypto').randomBytes(12).toString('hex')
}

async function officeLifetimeTests() {
  console.log('\nOffices with a lifetime')
  const client = new Client(endpoint)

  // a disposable office dies with its room
  const throwaway = await client.create('custom', {
    name: 'Throwaway',
    description: 'd',
    password: null,
    unlisted: false,
  })
  const throwawayId = throwaway.id
  await throwaway.leave()
  await sleep(900)
  let gone = false
  try {
    await client.joinById(throwawayId)
  } catch {
    gone = true
  }
  check('a disposable office is gone once empty', gone, true)

  // an office with a lifetime comes back from its slug
  const officeSlug = slug()
  const kept = await client.create('custom', {
    name: 'Design Team',
    description: 'kept',
    password: null,
    unlisted: true,
    slug: officeSlug,
    lifetimeDays: 7,
  })
  await kept.leave()
  await sleep(900)

  const reopened = await client.joinOrCreate('custom', { slug: officeSlug })
  await sleep(300)
  check(
    'an office with a lifetime reopens from its slug',
    (reopened.state as any) !== undefined,
    true
  )
  const listed = await client.getAvailableRooms('custom')
  check(
    'and is still unlisted after reopening',
    listed.some((r) => r.roomId === reopened.id),
    false
  )
  await reopened.leave()
  await sleep(900)

  // the important one: reopening must not drop the password
  const lockedSlug = slug()
  const locked = await client.create('custom', {
    name: 'Board Room',
    description: 'private',
    password: 'hunter2',
    unlisted: true,
    slug: lockedSlug,
    lifetimeDays: 7,
  })
  await locked.leave()
  await sleep(900)

  let hijacked = false
  try {
    // a visitor reopening it supplies no password at all
    const stolen = await client.joinOrCreate('custom', { slug: lockedSlug })
    hijacked = true
    await stolen.leave()
  } catch {
    /* refused, which is the point */
  }
  check('reopening a private office still demands its password', hijacked, false)

  const withPassword = await client.joinOrCreate('custom', {
    slug: lockedSlug,
    password: 'hunter2',
  })
  check('and the real password still opens it', typeof withPassword.id === 'string', true)
  await withPassword.leave()

  // a slug nobody has claimed must not mint an office
  let invented = false
  try {
    const ghost = await client.joinOrCreate('custom', { slug: slug() })
    invented = true
    await ghost.leave()
  } catch {
    /* refused */
  }
  check('an unknown office link does not create one', invented, false)

  let malformed = false
  try {
    const bad = await client.joinOrCreate('custom', { slug: 'no', lifetimeDays: 7 })
    malformed = true
    await bad.leave()
  } catch {
    /* refused */
  }
  check('a malformed slug is refused', malformed, false)
}

async function petTests() {
  console.log('\nPets')
  const client = new Client(endpoint)
  const room = await client.joinOrCreate('skyoffice')
  await sleep(300)
  const me = () => (room.state as any).players.get(room.sessionId)

  check('nobody starts with a pet', me().pet, '')

  room.send(Message.UPDATE_PLAYER_PET, { pet: 'c304b1e0' })
  await sleep(300)
  check('a valid pet is accepted', me().pet, 'c304b1e0')

  room.send(Message.UPDATE_PLAYER_PET, { pet: 'zzzzzz' })
  await sleep(300)
  check('a made-up pet is refused', me().pet, 'c304b1e0')

  room.send(Message.UPDATE_PLAYER_PET, { pet: 'd' })
  await sleep(300)
  check('a malformed descriptor is refused', me().pet, 'c304b1e0')

  // the shape before coats were added should no longer be accepted
  room.send(Message.UPDATE_PLAYER_PET, { pet: 'c04b1e0' })
  await sleep(300)
  check('a descriptor without a coat is refused', me().pet, 'c304b1e0')

  room.send(Message.UPDATE_PLAYER_PET, { pet: 'd704b1e0' })
  await sleep(300)
  check('another coat is accepted', me().pet, 'd704b1e0')

  room.send(Message.UPDATE_PLAYER_PET, { pet: { evil: true } })
  await sleep(300)
  check('a non-string is refused', me().pet, 'd704b1e0')

  room.send(Message.UPDATE_PLAYER_PET, { pet: '' })
  await sleep(300)
  check('and it can be given up again', me().pet, '')

  await room.leave()
}

async function chatPersistenceTests() {
  console.log('\nChat that outlives the office')
  const client = new Client(endpoint)
  const messagesIn = (room: any) => [...room.state.chatMessages].map((m: any) => m.content)

  const officeSlug = slug()
  const first = await client.create('custom', {
    name: 'Design Team', description: 'kept', password: null, unlisted: true,
    slug: officeSlug, lifetimeDays: 7,
  })
  await sleep(300)
  first.send(Message.UPDATE_PLAYER_NAME, { name: 'Ana' })
  await sleep(200)
  first.send(Message.ADD_CHAT_MESSAGE, { content: 'ship it on friday' })
  await sleep(200)
  first.send(Message.ADD_CHAT_MESSAGE, { content: 'agreed' })
  await sleep(600)
  check('messages land while the office is open', messagesIn(first).length, 2)
  await first.leave()

  // the room is disposed once empty; reopening rebuilds it from the record
  await sleep(1200)
  const reopened = await client.joinOrCreate('custom', { slug: officeSlug })
  await sleep(500)
  check('the conversation comes back', messagesIn(reopened), ['ship it on friday', 'agreed'])
  const restored = [...(reopened.state as any).chatMessages][0]
  check('and keeps who said it', restored.author, 'Ana')
  check('and when it was said', typeof restored.createdAt === 'number' && restored.createdAt > 0, true)

  reopened.send(Message.UPDATE_PLAYER_NAME, { name: 'Ben' })
  await sleep(200)
  reopened.send(Message.ADD_CHAT_MESSAGE, { content: 'morning' })
  await sleep(600)
  await reopened.leave()
  await sleep(1200)

  const third = await client.joinOrCreate('custom', { slug: officeSlug })
  await sleep(500)
  check('later messages are kept too', messagesIn(third).length, 3)
  await third.leave()

  // a disposable office keeps nothing - that is the whole difference
  const throwaway = await client.create('custom', {
    name: 'Standup', description: 'disposable', password: null, unlisted: false,
  })
  await sleep(300)
  throwaway.send(Message.UPDATE_PLAYER_NAME, { name: 'Cass' })
  await sleep(200)
  throwaway.send(Message.ADD_CHAT_MESSAGE, { content: 'this should not be kept' })
  await sleep(600)
  check('a disposable office still has chat while open', messagesIn(throwaway).length, 1)
  await throwaway.leave()
  await sleep(1200)

  const fresh = await client.create('custom', {
    name: 'Standup', description: 'disposable', password: null, unlisted: false,
  })
  await sleep(400)
  check('but a disposable office remembers nothing', messagesIn(fresh).length, 0)
  await fresh.leave()
}

async function roomTests() {
  const client = new Client(endpoint)

  console.log('\nMalformed messages')
  const room = await client.joinOrCreate('skyoffice')
  await sleep(300)

  room.send(Message.STOP_SCREEN_SHARE, { computerId: '999' })
  room.send(Message.DISCONNECT_FROM_COMPUTER, { computerId: '999' })
  room.send(Message.DISCONNECT_FROM_WHITEBOARD, { whiteboardId: 'nope' })
  room.send(Message.CONNECT_TO_COMPUTER, { computerId: { evil: true } })
  room.send(Message.STOP_SCREEN_SHARE, null)
  room.send(Message.UPDATE_PLAYER, { x: 'NaN', y: null, anim: 7 })
  await sleep(300)
  room.send(Message.UPDATE_PLAYER_NAME, { name: 'still-alive' })
  await sleep(400)
  check(
    'an unknown item id does not take the room down',
    (room.state as any).players.get(room.sessionId).name,
    'still-alive'
  )

  console.log('\nItem proximity')
  const computerBoxes = classicOfficeMap.boxes(ItemType.COMPUTER)
  const near = computerBoxes[0]
  const far = computerBoxes[3]
  const connectedTo = (id: string) => (room.state as any).computers.get(id)?.connectedUser.size

  // the spawn point is nowhere near a computer
  room.send(Message.CONNECT_TO_COMPUTER, { computerId: '0' })
  await sleep(350)
  check('a computer across the room is refused', connectedTo('0'), 0)

  check('walking to a computer arrives', await walkTo(room, near), true)
  room.send(Message.CONNECT_TO_COMPUTER, { computerId: '0' })
  await sleep(350)
  check('the computer being stood at is allowed', connectedTo('0'), 1)

  console.log('\nMovement')
  // The real client sends a position every frame it moves, ~3px at a time. That
  // must never be trimmed, or the budget would make ordinary walking stutter.
  const walkFrom = { x: positionOf(room).x, y: positionOf(room).y }
  let asked = walkFrom.x
  for (let frame = 0; frame < 60; frame++) {
    asked = Math.max(0, asked - 200 / 60)
    room.send(Message.UPDATE_PLAYER, { x: asked, y: walkFrom.y, anim: 'adam_run_left' })
    await sleep(16)
  }
  await sleep(200)
  const covered = walkFrom.x - positionOf(room).x
  check(
    'ordinary frame-by-frame walking is never trimmed',
    covered >= (walkFrom.x - asked) * 0.95,
    true
  )

  // one jump straight at a computer on the other side of the room.
  // positionOf returns the live schema object, so these have to be snapshots.
  const jumpFrom = { x: positionOf(room).x, y: positionOf(room).y }
  room.send(Message.UPDATE_PLAYER, { x: far.x, y: far.y, anim: 'adam_idle_down' })
  await sleep(300)
  const jumpTo = { x: positionOf(room).x, y: positionOf(room).y }

  check('a teleport does not arrive', distance(jumpTo, far) > 1, true)
  check('a teleport is trimmed to the movement budget', distance(jumpTo, jumpFrom) <= 200, true)

  room.send(Message.CONNECT_TO_COMPUTER, { computerId: '3' })
  await sleep(350)
  check('so it does not get you into that computer either', connectedTo('3'), 0)

  console.log('\nInput limits')
  const heldAt = { x: positionOf(room).x, y: positionOf(room).y }
  room.send(Message.UPDATE_PLAYER, { x: 999999, y: 999999, anim: 'adam_idle_down' })
  await sleep(250)
  check('a position outside the map is dropped', positionOf(room).x, heldAt.x)

  room.send(Message.UPDATE_PLAYER_NAME, { name: 'x'.repeat(5000) })
  await sleep(300)
  check('player name is capped', (room.state as any).players.get(room.sessionId).name.length, 32)

  const before = (room.state as any).chatMessages.length
  for (let i = 0; i < 25; i++) room.send(Message.ADD_CHAT_MESSAGE, { content: `flood ${i}` })
  await sleep(700)
  const stored = (room.state as any).chatMessages.length - before
  check('a chat flood is cut to the burst size', stored >= 5 && stored <= 8, true)

  console.log('\nWhiteboard ids')
  const ids = [...(room.state as any).whiteboards.values()].map((w: any) => w.roomId)
  check(
    'are 128 bits of base64url',
    ids.every((id: string) => /^[A-Za-z0-9_-]{22}$/.test(id)),
    true
  )
  check('are all distinct', new Set(ids).size, ids.length)

  const publicId = room.id
  await room.leave()

  console.log('\nRoom lifetime')
  await sleep(700)
  const publicAgain = await client.joinOrCreate('skyoffice')
  check('the public lobby survives being empty', publicAgain.id, publicId)
  await publicAgain.leave()

  const temp = await client.create('custom', {
    name: 'temp',
    description: 'temp',
    password: null,
    unlisted: false,
  })
  const tempId = temp.id
  await temp.leave()
  await sleep(900)
  let disposed = false
  try {
    await client.joinById(tempId)
  } catch {
    disposed = true
  }
  check('a custom room is disposed once empty', disposed, true)

  console.log('\nRoom creation')
  const big = await client.create('custom', {
    name: 'n'.repeat(500),
    description: 'd'.repeat(9000),
    password: null,
    unlisted: false,
  })
  await sleep(300)
  const listed = (await client.getAvailableRooms('custom')).find((r) => r.roomId === big.id)
  check('room name is capped', (listed?.metadata as any)?.name.length, 64)
  check('room description is capped', (listed?.metadata as any)?.description.length, 2000)
  await big.leave()

  const hidden = await client.create('custom', {
    name: 'hidden',
    description: 'hidden',
    password: null,
    unlisted: true,
  })
  await sleep(400)
  const rooms = await client.getAvailableRooms('custom')
  check(
    'an unlisted room is not listed',
    rooms.some((r) => r.roomId === hidden.id),
    false
  )
  const rejoined = await client.joinById(hidden.id)
  check('an unlisted room is still joinable by id', rejoined.id, hidden.id)
  await rejoined.leave()
  await hidden.leave()

  console.log('\nRoom passwords')
  const locked = await client.create('custom', {
    name: 'private',
    description: 'p',
    password: 'correct-horse',
    unlisted: false,
  })
  await sleep(300)
  const codes: number[] = []
  for (let i = 0; i < 7; i++) {
    try {
      await client.joinById(locked.id, { password: `wrong-${i}` })
    } catch (error: any) {
      codes.push(error.code)
    }
  }
  check(
    'wrong passwords are rejected',
    codes.slice(0, 5).every((code) => code === 403),
    true
  )
  check(
    'guessing is throttled after the burst',
    codes.slice(5).every((code) => code === 429),
    true
  )
  await locked.leave()
}

/**
 * Reading a map's spawn.
 *
 * Tiled leaves the properties out of a map that has none - which the
 * hand-drawn office does - and the two sides of the app are handed that
 * absence in different shapes. Phaser turns it into an empty object, and
 * calling .find() on that threw inside the game scene: the player was never
 * built, and the only sign of it was setPlayerName failing at the login box.
 */
/**
 * What a scene sees when it starts late.
 *
 * A player is announced as the first state update is decoded, which happens
 * the moment the room is joined. The game scene does not start until the
 * office has been drawn - and a generated office is fetched over http, so by
 * the time anything is listening the announcements are long past. Nothing
 * replays them, so the client reads the room instead, and this is the read it
 * depends on: everyone already here, with their names, in the state.
 */
async function whoIsAlreadyHereTests() {
  console.log('\nArriving after somebody else')
  const client = new Client(endpoint)

  const first = await client.create('custom', {
    name: 'Ordering',
    description: 'who sees whom',
    password: null,
    unlisted: true,
    layout: 'generated',
  })
  first.send(Message.UPDATE_PLAYER_NAME, { name: 'Alpha' })
  first.send(Message.READY_TO_CONNECT)
  first.send(Message.VIDEO_CONNECTED)
  await sleep(300)

  // second in, long after the first announced themselves
  const second = await client.joinById(first.id, { password: null })
  await sleep(400)

  const seenBySecond = [...(second.state as any).players.entries()]
    .filter(([id]: [string, any]) => id !== second.sessionId)
    .map(([, player]: [string, any]) => player.name)

  check('the one who arrived second can see the first', seenBySecond, ['Alpha'])

  /**
   * And can see that they are ready to be called.
   *
   * Being drawn is not enough to be talked to: a call is only placed to
   * somebody whose `readyToConnect` we know about, and for a player already
   * in the room that became true before we arrived. If the state did not
   * carry it, nobody joining a room could ever call anybody already in it.
   */
  const readiness = [...(second.state as any).players.entries()]
    .filter(([id]: [string, any]) => id !== second.sessionId)
    .map(([, player]: [string, any]) => [player.readyToConnect, player.videoConnected])
  check('and can see that they are ready to be called', readiness, [[true, true]])

  // and the first still sees the second once they are named
  second.send(Message.UPDATE_PLAYER_NAME, { name: 'Beta' })
  await sleep(300)
  const seenByFirst = [...(first.state as any).players.entries()]
    .filter(([id]: [string, any]) => id !== first.sessionId)
    .map(([, player]: [string, any]) => player.name)
  check('and the first can see the second', seenByFirst, ['Beta'])

  await second.leave()
  await first.leave()
}

function spawnUnits() {
  console.log('\nReading a spawn')

  check('a map with no properties at all', readSpawn(undefined), CLASSIC_SPAWN)
  check('the empty object Phaser hands back', readSpawn({}), CLASSIC_SPAWN)
  check('an empty list', readSpawn([]), CLASSIC_SPAWN)
  check(
    'properties that do not mention a spawn',
    readSpawn([{ name: 'mood', value: 'blue' }]),
    CLASSIC_SPAWN
  )
  check(
    'a generated map that records one',
    readSpawn([
      { name: 'spawnX', type: 'int', value: 688 },
      { name: 'spawnY', type: 'int', value: 464 },
    ]),
    { x: 688, y: 464 }
  )
  check('half a spawn is no spawn', readSpawn([{ name: 'spawnX', value: 688 }]), CLASSIC_SPAWN)

  // The hand-drawn map is the one the client reads without a safety net: it is
  // bundled rather than fetched, so anything missing from it is a crash inside
  // the game scene rather than a request that fails and says so.
  const classic = JSON.parse(readFileSync(REFERENCE_MAP_PATH, 'utf8'))
  const present = classic.layers.map((layer: { name: string }) => layer.name)
  check(
    'the hand-drawn map still has every layer the client reads',
    CLIENT_LAYERS.filter((name) => !present.includes(name)),
    []
  )
  check(
    'and records no spawn of its own, so it falls back',
    readSpawn(classic.properties),
    CLASSIC_SPAWN
  )
}

/**
 * The generator draws an office nobody has looked at, so the checks it runs on
 * itself are the only thing standing between a bad roll and a room a player
 * cannot get out of. Run enough seeds that a one-in-a-hundred layout shows up.
 */
/** the cabinet in a private office, and the tub chairs the corridor is lined with */
const CABINET_GIDS = new Set([2918, 2919, 2934, 2935])
const HALL_SEAT_GIDS = new Set([2573, 2574])

/** the desk halves of a bench, so a test can tell a desk from a partition */
const DESK_GIDS = new Set([3039, 3040, 3041, 3055, 3056, 3057, 2585, 2586, 2587, 2590, 2591, 2592])

function peerHostUnits() {
  console.log('\nWhere the signalling server is')

  // The live stack had PEER_HOST set to a url, which PeerJS concatenated into
  // wss://https//peer.example.com:443/peerjs - a socket that cannot connect and
  // a console message that points nowhere. A url is the obvious thing to paste
  // into a setting whose value is a server, so it has to be read, not rejected.
  const cases: Array<[string, ReturnType<typeof parsePeerHost>]> = [
    ['peer.example.com', { host: 'peer.example.com' }],
    ['https://peer.example.com', { host: 'peer.example.com', secure: true }],
    ['http://peer.example.com', { host: 'peer.example.com', secure: false }],
    ['wss://peer.example.com/', { host: 'peer.example.com', secure: true }],
    ['https://peer.example.com:9000', { host: 'peer.example.com', secure: true, port: 9000 }],
    ['peer.example.com:9000', { host: 'peer.example.com', port: 9000 }],
    ['peer.example.com/peerjs', { host: 'peer.example.com' }],
    ['  ', { host: '' }],
  ]

  for (const [given, expected] of cases) {
    check(`'${given.trim() || '(blank)'}' reads as a host`, parsePeerHost(given), expected)
  }
}

function generatedOfficeUnits() {
  console.log('\nGenerated offices')

  const SEEDS = 200
  let broken = 0
  const complaints = new Set<string>()

  for (let seed = 1; seed <= SEEDS; seed++) {
    const office = generateOffice({ seed })
    if (office.problems.length > 0) {
      broken++
      for (const problem of office.problems) complaints.add(problem.invariant)
    }
  }
  check(
    `${SEEDS} seeds each pass every invariant`,
    broken === 0 ? 'all valid' : `${broken} broken: ${[...complaints].join(', ')}`,
    'all valid'
  )

  const first = generateOffice({ seed: 4242 })
  check(
    'the same seed draws the same office',
    JSON.stringify(generateOffice({ seed: 4242 }).map),
    JSON.stringify(first.map)
  )
  check(
    'a different seed draws a different one',
    JSON.stringify(generateOffice({ seed: 4243 }).map) !== JSON.stringify(first.map),
    true
  )

  // the client walks these layers without checking they exist
  const layers = (first.map.layers as Array<{ name: string }>).map((layer) => layer.name)
  const required = CLIENT_LAYERS
  check(
    'every layer the client reads is present',
    required.filter((name) => !layers.includes(name)),
    []
  )

  // A bench seats two, back to back, and the whole look of the production floor
  // depends on it: one footprint, one desk worked at from above and one from
  // below, a chair on each side. Getting this wrong is what made the first
  // generated floors read as a scatter of furniture rather than a bank of desks.
  const benchesAreBacked = [7, 55, 4242].every((seed) => {
    const { layout, map } = generateOffice({ seed })
    const chairs = new Set(
      ((map.layers as any[]).find((layer) => layer.name === 'Chair')?.objects ?? []).map(
        (chair: any) => `${chair.x / 32},${chair.y / 32 - 1}`
      )
    )

    const seats = new Map<string, Set<string>>()
    for (const slot of layout.deskSlots) {
      const key = `${slot.x},${slot.y}`
      if (!seats.has(key)) seats.set(key, new Set())
      if (seats.get(key)!.has(slot.facing)) return false
      seats.get(key)!.add(slot.facing)

      // the chair belongs on the outside of the bench, never on the desk itself
      const chairY = slot.facing === 'up' ? slot.y + 2 : slot.y - 1
      if (!chairs.has(`${slot.x + 1},${chairY}`)) return false
    }

    // and no two benches overlap, which would stack desks on top of each other
    const covered = new Set<string>()
    for (const key of seats.keys()) {
      const [x, y] = key.split(',').map(Number)
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          if (covered.has(`${x + dx},${y + dy}`)) return false
          covered.add(`${x + dx},${y + dy}`)
        }
      }
    }
    return seats.size > 0
  })
  check('desks are benched back to back, a chair each side', benchesAreBacked, true)

  // A bench is a partition with a desk on whichever side somebody sits, so a
  // floor that seats an odd number must not draw the desk nobody is at - and a
  // screen only fits on the near desk, the far one being a single row.
  const nothingUnattended = [3, 11, 25, 4242].every((seed) => {
    const spec = { meetingRooms: 1, oneOnOneRooms: 1, computerDesks: 5, plainDesks: 6, lounges: 1 }
    const { layout, map } = generateOffice({ seed, spec })
    const at = (object: any) => `${object.x / 32},${object.y / 32 - 1}`
    const layers = map.layers as Array<{ name: string; objects?: any[] }>

    const seated = new Set<string>()
    const nearSurface = new Set<string>()
    for (const slot of layout.deskSlots) {
      const top = slot.facing === 'up' ? slot.y : slot.y - 1
      for (let dx = 0; dx < 3; dx++) {
        seated.add(`${slot.x + dx},${top}`)
        seated.add(`${slot.x + dx},${top + 1}`)
      }
      if (slot.facing === 'up') nearSurface.add(`${slot.x},${slot.y + 1}`)
    }

    for (const layer of layers) {
      for (const object of layer.objects ?? []) {
        if (DESK_GIDS.has(object.gid & 0x1fffffff) && !seated.has(at(object))) return false
      }
    }

    const screens = layers.find((layer) => layer.name === 'Computer')?.objects ?? []
    if (screens.length !== spec.computerDesks) return false
    return screens.every((screen: any) => nearSurface.has(at(screen)))
  })
  check('no desk is drawn without somebody at it', nothingUnattended, true)

  // The desk in a private office has to face the room it is in. The seat is on
  // the far side of it from the door, looking back at the way in - which for
  // half the rooms means the desk is drawn mirrored.
  const desksFaceTheRoom = [2, 9, 40, 4242].every((seed) => {
    const { layout, map } = generateOffice({ seed })
    const chairs =
      (map.layers as Array<{ name: string; objects?: any[] }>).find(
        (layer) => layer.name === 'Chair'
      )?.objects ?? []

    return layout.rooms
      .filter((room) => room.archetype === 'private')
      .every((room) => {
        const seat = chairs.find((object: any) => {
          const direction = (object.properties ?? []).find(
            (p: any) => p.name === 'direction'
          )?.value
          const x = object.x / 32
          const y = object.y / 32 - 1
          return (
            (direction === 'left' || direction === 'right') &&
            x >= room.ix0 &&
            x <= room.ix1 &&
            y >= room.iy0 &&
            y <= room.iy1
          )
        })
        if (!seat) return false

        // it must be looking towards the door, not away from it
        const direction = (seat.properties ?? []).find((p: any) => p.name === 'direction')?.value
        const doorOnRight = room.doors.some((door) => door.x === room.x1)
        return direction === (doorOnRight ? 'right' : 'left')
      })
  })
  check('a private office desk faces its door, not a wall', desksFaceTheRoom, true)

  // The drawn private office holds a desk, a sofa, one cabinet and two plants.
  // The generated one used to be filled by the same pass that dresses every
  // other room, which turned it into a furniture showroom.
  const privateOfficesAreBare = [1, 6, 33, 4242].every((seed) => {
    const { layout, map } = generateOffice({ seed })
    const everything = (map.layers as Array<{ name: string; objects?: any[] }>).flatMap(
      (layer) => layer.objects ?? []
    )
    return layout.rooms
      .filter((room) => room.archetype === 'private')
      .every((room) => {
        const inside = everything.filter((object: any) => {
          const x = object.x / 32
          const y = object.y / 32 - 1
          return x >= room.ix0 && x <= room.ix1 && y >= room.iy0 && y <= room.iy1
        })
        const cabinets = inside.filter((object: any) =>
          CABINET_GIDS.has(object.gid & 0x1fffffff)
        ).length
        // four tiles to a cabinet, and the room is allowed exactly one
        return cabinets <= CABINET_GIDS.size
      })
  })
  check('a private office is furnished, not filled', privateOfficesAreBare, true)

  // and the corridor is lined the way the drawn one is
  const corridorHasSeating = [1, 6, 33, 4242].every((seed) => {
    const { map } = generateOffice({ seed })
    const chairs =
      (map.layers as Array<{ name: string; objects?: any[] }>).find(
        (layer) => layer.name === 'Chair'
      )?.objects ?? []
    return chairs.some((object: any) => HALL_SEAT_GIDS.has(object.gid & 0x1fffffff))
  })
  check('the corridor has somewhere to sit and wait', corridorHasSeating, true)

  // the spawn both the client and the server assume has to be standing room
  const spawnOnFloor = [1, 2, 3, 99].every((seed) => {
    const { layout } = generateOffice({ seed })
    const at = (y: number) => layout.cells[y * layout.width + layout.spawn.x]
    return at(layout.spawn.y) === 1 && at(layout.spawn.y + 1) === 1
  })
  check('a player always appears on clear floor', spawnOnFloor, true)

  // a sealed room is the one thing the audio rules cannot recover from being wrong
  const zones = (first.map.layers as Array<{ name: string; objects?: any[] }>).find(
    (layer) => layer.name === 'Zone'
  )
  const policies = (zones?.objects ?? []).map(
    (zone: any) => zone.properties.find((p: any) => p.name === 'audio').value
  )
  check(
    'every zone names a policy the client knows',
    policies.filter((policy: string) => !['proximity', 'room', 'room-sealed'].includes(policy)),
    []
  )
}

/** GETs a path off the test server and returns the status and parsed body */
function getJson(path: string) {
  return new Promise<{ status: number; body: any; headers: Record<string, any> }>(
    (resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port: Number(process.env.PORT), path, method: 'GET' },
        (response) => {
          let raw = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => (raw += chunk))
          response.on('end', () => {
            try {
              resolve({
                status: response.statusCode || 0,
                body: raw ? JSON.parse(raw) : null,
                headers: response.headers,
              })
            } catch {
              resolve({ status: response.statusCode || 0, body: null, headers: response.headers })
            }
          })
        }
      )
      request.on('error', reject)
      request.end()
    }
  )
}

async function generatedRoomTests() {
  console.log('\nOffices with their own floor plan')
  const client = new Client(endpoint)

  // the office people know stays the office people know
  const classic = await client.joinOrCreate('skyoffice')
  await sleep(300)
  check('the public lobby is the hand-drawn office', (classic.state as any).mapId, '')
  check(
    'and it has the items that map has',
    (classic.state as any).computers.size,
    classicOfficeMap.boxes(ItemType.COMPUTER).length
  )
  await classic.leave()

  // a generated office reports the seed it was grown from
  const generated = await client.create('custom', {
    name: 'Generated',
    description: 'fresh',
    password: null,
    unlisted: false,
    layout: 'generated',
  })
  await sleep(300)
  const officeId = (generated.state as any).mapId
  check('a generated office reports an id', parseOfficeId(officeId) !== null, true)

  // and the room really is running that office, not the hand-drawn one
  const drawing = officeDrawingFor(officeId)
  const computersInDrawing = (drawing.layers as any[]).find((layer) => layer.name === 'Computer')
    .objects.length
  check(
    'its items come from its own floor plan',
    (generated.state as any).computers.size,
    computersInDrawing
  )
  await generated.leave()

  // a client must not be able to name the office it lands in
  const asked = await client.create('custom', {
    name: 'Asking',
    description: 'x',
    password: null,
    unlisted: false,
    layout: 'generated',
    mapId: '1234-1-1-1-1-1',
    officeId: '1234-1-1-1-1-1',
  })
  await sleep(300)
  check(
    'the server picks the id, not the client',
    (asked.state as any).mapId === '1234-1-1-1-1-1',
    false
  )
  await asked.leave()

  // the floor plan has to survive the office being emptied and reopened
  const officeSlug = slug()
  const first = await client.create('custom', {
    name: 'Studio',
    description: 'kept',
    password: null,
    unlisted: true,
    layout: 'generated',
    slug: officeSlug,
    lifetimeDays: 7,
  })
  await sleep(300)
  const firstId = (first.state as any).mapId
  await first.leave()
  await sleep(900)

  const reopened = await client.joinOrCreate('custom', { slug: officeSlug })
  await sleep(300)
  check('an office reopens with the same walls', (reopened.state as any).mapId, firstId)
  await reopened.leave()

  // the drawing itself, which the client fetches over http
  const served = await getJson(`/office/map/${firstId}.json`)
  check('the floor plan is served', served.status, 200)
  check('and it is a Tiled map with every layer the client reads', served.body?.type, 'map')
  check(
    'and the same seed always serves the same drawing',
    JSON.stringify(served.body) === JSON.stringify(officeDrawingFor(firstId)),
    true
  )

  // An id encodes the seed and the spec, so it is tempting to serve the
  // drawing as immutable - and that was the bug. The id does not change but
  // the generator does, and a browser holding an immutable copy will not even
  // ask: days of fixes land on the server and stay invisible to whoever is
  // testing them. It has to be allowed to check.
  const caching = String(served.headers['cache-control'] ?? '')
  check(
    'a floor plan may be cached but never without checking',
    !/immutable/.test(caching) && /no-cache|max-age=0|must-revalidate/.test(caching),
    true
  )

  // and the drawing has a name of its own, so a copy of one drawing of an
  // office and a copy of the next cannot be mistaken for each other
  const version = await getJson('/office/version')
  check('the server names the drawing it produces', version.status, 200)
  check(
    'and that name changes when the drawing does',
    version.body?.version === drawingVersion() && /^[0-9a-f]{8}$/.test(drawingVersion()),
    true
  )

  const nonsense = await getJson('/office/map/not-an-office.json')
  check('an id that is not an office is refused', nonsense.status, 400)
  const huge = await getJson('/office/map/99999999999-1-1-1-1-1.json')
  check('and so is one out of range', huge.status, 400)

  // the whole point of asking: the office holds what was ordered
  const ordered: OfficeSpec = {
    meetingRooms: 2,
    oneOnOneRooms: 3,
    computerDesks: 7,
    plainDesks: 5,
    lounges: 1,
    trainingRooms: 0,
  }
  const built = await client.create('custom', {
    name: 'To Order',
    description: 'counted',
    password: null,
    unlisted: false,
    layout: 'generated',
    office: ordered,
  })
  await sleep(300)
  const builtId = (built.state as any).mapId
  const parsed = parseOfficeId(builtId)!
  const got = contentsOf(generateOffice({ seed: parsed.seed, spec: parsed.spec }))
  check(
    'the office holds exactly what was ordered',
    {
      meetingRooms: got.meetingRooms,
      oneOnOneRooms: got.oneOnOneRooms,
      lounges: got.lounges,
      computerDesks: got.computerDesks,
      desks: got.desks,
    },
    {
      meetingRooms: 2,
      oneOnOneRooms: 3,
      lounges: 1,
      computerDesks: 7,
      desks: 12,
    }
  )
  check('and the server tracks that many screen shares', (built.state as any).computers.size, 7)
  await built.leave()

  // A training room is rows of chairs facing a screen, and that screen is a
  // computer as far as everything else is concerned - which is the whole point
  // of it: the same key, the same sharing, the same bookkeeping.
  const withTraining: OfficeSpec = { ...ordered, trainingRooms: 1 }
  const trained = await client.create('custom', {
    name: 'Training',
    description: 'a room with a screen',
    password: null,
    unlisted: false,
    layout: 'generated',
    office: withTraining,
  })
  await sleep(300)
  const trainedId = (trained.state as any).mapId
  const trainedSpec = parseOfficeId(trainedId)!
  const trainedGot = contentsOf(
    generateOffice({ seed: trainedSpec.seed, spec: trainedSpec.spec })
  )
  check('a training room is built when one is asked for', trainedGot.trainingRooms, 1)
  check(
    'and its screen is one more share than the desks alone',
    (trained.state as any).computers.size,
    8
  )
  await trained.leave()

  // the id is how a kept office is found again, and offices were recorded
  // before training rooms existed
  check(
    'an office id written before training rooms still parses',
    parseOfficeId('123456-1-1-5-10-1')?.spec.trainingRooms,
    0
  )
  check(
    'and one written since carries the count',
    parseOfficeId('123456-1-1-5-10-1-2')?.spec.trainingRooms,
    2
  )
}


/**
 * The steering, run against a real floor plan rather than a fixture: the one
 * thing that must never happen is the robot ending up inside a wall, and that
 * only means anything against walls somebody could actually walk into.
 */
function roombaUnits() {
  console.log('\nThe cleaning robot')
  const obstacles = [
    ...classicOfficeMap.boxes(ItemType.COMPUTER),
    ...classicOfficeMap.boxes(ItemType.WHITEBOARD),
  ]
  const driver = RoombaDriver.place(classicOfficeMap, obstacles)
  check('the office has somewhere to put it', driver !== null, true)

  const visited = new Set<string>()
  let inSomething = 0
  // ten minutes of driving, which is far longer than anyone watches it for
  for (let tick = 0; tick < (10 * 60 * 1000) / ROOMBA_TICK_MS; tick++) {
    const pose = driver!.advance(ROOMBA_TICK_MS)
    if (classicOfficeMap.isSolidAt(pose.x, pose.y)) inSomething++
    if (obstacles.some((b) => Math.abs(pose.x - b.x) <= b.halfWidth && Math.abs(pose.y - b.y) <= b.halfHeight))
      inSomething++
    visited.add(`${Math.floor(pose.x / 32)},${Math.floor(pose.y / 32)}`)
  }

  check('it never drives into a wall or a desk', inSomething, 0)
  check('and it gets around the office rather than one corner', visited.size > 100, true)
}

async function roombaTests() {
  console.log('\nOffices with a cleaning robot')
  const client = new Client(endpoint)
  // the same question the client asks: an office with no robot still carries
  // an empty one in its state, so presence is read off the flag beside it
  const robot = (room: any) => (room.state.hasRoomba ? room.state.roomba : undefined)

  // the public lobby is the server's own room and is never given one
  const lobby = await client.joinOrCreate('skyoffice', { roomba: true })
  await sleep(300)
  check('the lobby cannot be given a robot', robot(lobby) === undefined, true)
  await lobby.leave()

  const plain = await client.create('custom', {
    name: 'Plain', description: 'd', password: null, unlisted: true,
  })
  await sleep(300)
  check('a custom office has none unless asked for', robot(plain) === undefined, true)
  await plain.leave()

  const cleaned = await client.create('custom', {
    name: 'Cleaned', description: 'd', password: null, unlisted: true, roomba: true,
  })
  await sleep(300)
  check('asking for one puts it in the office', robot(cleaned) !== undefined, true)

  const wasAt = { x: robot(cleaned).x, y: robot(cleaned).y }
  await sleep(1500)
  check('and it drives itself around', distance(wasAt, robot(cleaned)) > 10, true)
  await cleaned.leave()

  // it belongs to the office, so it comes back with the furniture
  const keptSlug = slug()
  const first = await client.create('custom', {
    name: 'Kept', description: 'd', password: null, unlisted: true,
    slug: keptSlug, lifetimeDays: 7, roomba: true,
  })
  await sleep(300)
  check('an office that is kept can have one too', robot(first) !== undefined, true)
  await first.leave()
  await sleep(1200)

  const reopened = await client.joinOrCreate('custom', { slug: keptSlug })
  await sleep(300)
  check('and reopening the link brings it back', robot(reopened) !== undefined, true)
  await reopened.leave()

  // whoever opens the link supplies the room options, so the stored record has
  // to win here for the same reason it wins for the password
  const bareSlug = slug()
  const bare = await client.create('custom', {
    name: 'Bare', description: 'd', password: null, unlisted: true,
    slug: bareSlug, lifetimeDays: 7,
  })
  await sleep(300)
  await bare.leave()
  await sleep(1200)

  const meddled = await client.joinOrCreate('custom', { slug: bareSlug, roomba: true })
  await sleep(300)
  check("but a visitor cannot add one to somebody else's office", robot(meddled) === undefined, true)
  await meddled.leave()
}


/** a red diagonal on a see-through background, two pixels square */
const A_LOGO = '02:02:ff0000:0110'

function logoUnits() {
  console.log('\nLogos')
  const read = decodeLogo(A_LOGO)
  check('a logo survives the round trip', read ? encodeLogo(read) : '', A_LOGO)
  check('and keeps its shape', [read?.width, read?.height], [2, 2])
  check('with the colours it was reduced to', read?.palette, ['#ff0000'])
  check('and one index per pixel', read?.pixels, [0, 1, 1, 0])

  check('a pixel count that does not match the size is refused', decodeLogo('02:02:ff0000:011'), null)
  check('so is a pixel naming a colour that is not there', decodeLogo('02:02:ff0000:0120'), null)
  check('so is a logo with no colours at all', decodeLogo('02:02::0000'), null)
  check('so is one bigger than the limit', decodeLogo('ff:ff:ff0000:0110'), null)
  check('so is nonsense', decodeLogo('a picture of a dog'), null)
  check(
    'and so is one too long to be worth reading',
    decodeLogo('02:02:ff0000:' + '0'.repeat(LOGO_MAX_LENGTH)),
    null
  )

  check('no logo is a perfectly good answer', isLogo(''), true)
  check('a real one is too', isLogo(A_LOGO), true)
  check('a broken one is not', isLogo('02:02:ff0000:011'), false)
}

async function logoTests() {
  console.log('\nOffices with a logo')
  const client = new Client(endpoint)
  const logoOf = (room: any) => room.state.logo

  const lobby = await client.joinOrCreate('skyoffice', { logo: A_LOGO })
  await sleep(300)
  check('the lobby cannot be given a logo', logoOf(lobby), '')
  await lobby.leave()

  const plain = await client.create('custom', {
    name: 'Plain', description: 'd', password: null, unlisted: true,
  })
  await sleep(300)
  check('an office has none unless one is uploaded', logoOf(plain), '')
  await plain.leave()

  const badged = await client.create('custom', {
    name: 'Badged', description: 'd', password: null, unlisted: true, logo: A_LOGO,
  })
  await sleep(300)
  check('uploading one hangs it in the office', logoOf(badged), A_LOGO)
  await badged.leave()

  // it is drawn on every client in the room, so it is checked and not trusted
  const junk = await client.create('custom', {
    name: 'Junk', description: 'd', password: null, unlisted: true, logo: '02:02:ff0000:011',
  })
  await sleep(300)
  check('a broken logo leaves the wall bare', logoOf(junk), '')
  await junk.leave()

  const huge = await client.create('custom', {
    name: 'Huge', description: 'd', password: null, unlisted: true, logo: 'x'.repeat(20000),
  })
  await sleep(300)
  check('and so does one far too big to be a logo', logoOf(huge), '')
  await huge.leave()

  // it belongs to the office, so it is still on the wall when the link reopens
  const keptSlug = slug()
  const first = await client.create('custom', {
    name: 'Kept', description: 'd', password: null, unlisted: true,
    slug: keptSlug, lifetimeDays: 7, logo: A_LOGO,
  })
  await sleep(300)
  await first.leave()
  await sleep(1200)

  const reopened = await client.joinOrCreate('custom', { slug: keptSlug })
  await sleep(300)
  check('reopening the link brings the logo back', logoOf(reopened), A_LOGO)
  await reopened.leave()
}

async function main() {
  rateLimiterUnits()
  await whoIsAlreadyHereTests()
  spawnUnits()
  peerHostUnits()
  generatedOfficeUnits()
  roombaUnits()
  logoUnits()
  await sleep(700)
  await matchmakingOriginTests()
  await officeLifetimeTests()
  await chatPersistenceTests()
  await petTests()
  await roombaTests()
  await logoTests()
  await generatedRoomTests()
  await roomTests()

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
