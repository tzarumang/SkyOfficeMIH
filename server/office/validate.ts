import { FLOOR, Layout, Room, WALL, cellAt, isFloor } from './layout'
import { Placement, doorways } from './furnish'
import { TILE, WALLS } from './vocabulary'

/**
 * What has to be true of every office, however the dice fell.
 *
 * A generator that only usually works is worse than no generator: the failures
 * are rare enough to reach players and strange enough to be hard to explain. So
 * every office is checked before it is handed out, and a failed check is a bug
 * report rather than a room nobody can get out of.
 */

export interface Problem {
  invariant: string
  detail: string
}

/** items a player has to be able to walk up to */
const INTERACTIVE = new Set(['Chair', 'Computer', 'Whiteboard', 'VendingMachine'])

/** the layers the client gives collision to, so anything here stops a player */
const SOLID_LAYERS = new Set([
  'ObjectsOnCollide',
  'GenericObjectsOnCollide',
  'Basement',
  'VendingMachine',
])

/** every tile a placement covers, from its size and where Tiled hangs it */
function occupiedTiles(placement: Placement): Array<[number, number]> {
  const columns = Math.ceil(placement.widthPx / TILE)
  const rows = Math.ceil(placement.heightPx / TILE)
  const tiles: Array<[number, number]> = []
  for (let dy = 0; dy < rows; dy++) {
    for (let dx = 0; dx < columns; dx++) tiles.push([placement.tx + dx, placement.ty - dy])
  }
  return tiles
}
/** the client's item selector reaches one tile; the server allows two */
const REACH_TILES = 2

export interface PaintedGround {
  /** the gid painted on every tile of the finished map */
  data: number[]
  /** true when the client will stop a player walking onto that gid */
  collides: (gid: number) => boolean
}

export function validate(
  layout: Layout,
  placements: Placement[],
  tilesets: Array<{ name: string; firstgid: number; tilecount: number }>,
  ground?: PaintedGround
): Problem[] {
  const problems: Problem[] = []
  const fail = (invariant: string, detail: string) => problems.push({ invariant, detail })

  const { width, height, spawn } = layout

  // --- a player has somewhere to stand ---------------------------------------
  if (!isFloor(layout, spawn.x, spawn.y) || !isFloor(layout, spawn.x, spawn.y + 1)) {
    fail('spawn is walkable', `spawn ${spawn.x},${spawn.y} is not clear floor`)
  }

  const reachable = floodFill(layout, spawn)

  // --- every room can be walked into ----------------------------------------
  for (const room of layout.rooms) {
    const inside = interiorTiles(room).filter(([x, y]) => isFloor(layout, x, y))
    if (inside.length === 0) {
      fail('every room has a floor', `${room.name} has no walkable tile`)
      continue
    }
    const unreachable = inside.filter(([x, y]) => !reachable.has(y * width + x))
    if (unreachable.length > 0) {
      fail(
        'every room is reachable',
        `${room.name} has ${unreachable.length}/${inside.length} tiles cut off from the spawn`
      )
    }
    if (room.archetype !== 'corridor' && room.doors.length === 0) {
      fail('every room has a door', `${room.name} has no way in`)
    }
  }

  // --- a closed room is really closed ---------------------------------------
  for (const room of layout.rooms) {
    if (room.archetype === 'corridor') continue
    const openings = wallRing(room).filter(([x, y]) => isFloor(layout, x, y))
    const doors = new Set(room.doors.map((door) => `${door.x},${door.y}`))
    const unexpected = openings.filter(([x, y]) => !doors.has(`${x},${y}`))
    if (unexpected.length > 0) {
      fail(
        'a room only opens through its doors',
        `${room.name} has ${unexpected.length} gap(s) in its walls at ${unexpected
          .slice(0, 3)
          .map(([x, y]) => `${x},${y}`)
          .join(' ')}`
      )
    }
  }

  // --- furniture is inside the building and usable --------------------------
  for (const placement of placements) {
    const rows = placement.heightPx / TILE
    const columns = placement.widthPx / TILE
    const left = placement.tx
    const top = placement.ty - Math.ceil(rows) + 1

    if (left < 0 || top < 0 || left + columns > width || placement.ty >= height) {
      fail('furniture is on the map', `${placement.layer} gid ${placement.gid} at ${left},${top}`)
      continue
    }

    if (!INTERACTIVE.has(placement.layer)) continue

    // A whiteboard hangs on a wall, so it is meant to overlap one. Everything
    // else has to be standing on the floor.
    if (placement.layer !== 'Whiteboard' && !isFloor(layout, placement.tx, placement.ty)) {
      fail(
        'furniture stands on floor',
        `${placement.layer} gid ${placement.gid} at ${placement.tx},${placement.ty} is in a wall`
      )
    }

    if (!hasReachableNeighbour(layout, reachable, placement)) {
      fail(
        'every item can be walked up to',
        `${placement.layer} gid ${placement.gid} at ${placement.tx},${placement.ty} is out of reach`
      )
    }
  }

  // --- a doorway is somewhere you can walk, not somewhere to put things -----
  //
  // Nothing here reads as a bug from the plan's point of view: the room is
  // enclosed, the door is a hole in the wall, every tile is reachable. It only
  // shows up as a water cooler standing in the doorway.
  const inTheWay: string[] = []
  for (const room of layout.rooms) {
    const clear = doorways(room)
    for (const placement of placements) {
      if (!SOLID_LAYERS.has(placement.layer)) continue

      for (const [x, y] of occupiedTiles(placement)) {
        if (clear.has(`${x},${y}`)) inTheWay.push(`${placement.layer} at ${x},${y} in ${room.name}`)
      }
    }
  }
  if (inTheWay.length > 0) {
    fail(
      'a doorway is kept clear',
      `${inTheWay.length} thing(s) stand in a doorway: ${[...new Set(inTheWay)]
        .slice(0, 3)
        .join(', ')}`
    )
  }

  // --- zones do not overlap, or "which room am I in" has no answer ----------
  const rooms = layout.rooms
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (interiorsOverlap(rooms[i], rooms[j])) {
        fail('zones do not overlap', `${rooms[i].name} overlaps ${rooms[j].name}`)
      }
    }
  }

  // --- every tile and object points at a real tileset frame ----------------
  const inSomeTileset = (gid: number) =>
    tilesets.some((set) => gid >= set.firstgid && gid < set.firstgid + set.tilecount)

  const badGids = new Set<number>()
  for (const placement of placements) if (!inSomeTileset(placement.gid)) badGids.add(placement.gid)
  if (badGids.size > 0) {
    fail('every gid exists', `unknown gids ${[...badGids].slice(0, 5).join(', ')}`)
  }

  // --- what was drawn agrees with what was planned --------------------------
  //
  // The floor plan says where a player may walk, but it is the tile that
  // actually stops them. A floor gid that happens to collide seals a room off
  // from the inside, and every check above still passes.
  if (ground) {
    let solidFloor = 0
    let softWall = 0
    const offenders = new Set<number>()

    for (let i = 0; i < ground.data.length; i++) {
      const gid = ground.data[i]
      const solid = gid !== 0 && ground.collides(gid)
      if (layout.cells[i] === FLOOR && solid) {
        solidFloor++
        offenders.add(gid)
      }
      if (layout.cells[i] === WALL && !solid) {
        softWall++
        offenders.add(gid)
      }
    }

    const listed = [...offenders].slice(0, 5).join(', ')
    if (solidFloor > 0) {
      fail('walkable tiles are walkable', `${solidFloor} floor tile(s) are drawn solid (${listed})`)
    }
    if (softWall > 0) {
      fail('walls are solid', `${softWall} wall tile(s) can be walked through (${listed})`)
    }

    // The tiles that cap a horizontal wall have transparent top and bottom
    // edges, so one standing in a vertical run is a hole with the sky showing
    // through it. A doorway used to leave one above and below itself.
    const verticalTiles = new Set([WALLS.shared, WALLS.leftEdge, WALLS.rightEdge])
    const wrongWay: string[] = []
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const at = y * layout.width + x
        if (layout.cells[at] !== WALL) continue

        const runsVertically =
          cellAt(layout, x, y - 1) === WALL || cellAt(layout, x, y + 1) === WALL
        const roomBeside = isFloor(layout, x - 1, y) || isFloor(layout, x + 1, y)
        if (runsVertically && roomBeside && !verticalTiles.has(ground.data[at])) {
          wrongWay.push(`${x},${y} is ${ground.data[at]}`)
        }
      }
    }
    if (wrongWay.length > 0) {
      fail(
        'a wall has no holes in it',
        `${wrongWay.length} tile(s) in a vertical wall are drawn with a horizontal cap: ` +
          wrongWay.slice(0, 3).join(', ')
      )
    }
  }

  return problems
}

function interiorTiles(room: Room): Array<[number, number]> {
  const tiles: Array<[number, number]> = []
  for (let y = room.iy0; y <= room.iy1; y++) {
    for (let x = room.ix0; x <= room.ix1; x++) tiles.push([x, y])
  }
  return tiles
}

function wallRing(room: Room): Array<[number, number]> {
  const ring: Array<[number, number]> = []
  for (let x = room.x0; x <= room.x1; x++) {
    ring.push([x, room.y0], [x, room.y1])
  }
  for (let y = room.y0 + 1; y < room.y1; y++) {
    ring.push([room.x0, y], [room.x1, y])
  }
  return ring
}

function interiorsOverlap(a: Room, b: Room) {
  return a.ix0 <= b.ix1 && b.ix0 <= a.ix1 && a.iy0 <= b.iy1 && b.iy0 <= a.iy1
}

/** every floor tile a player can actually walk to from where they appear */
function floodFill(layout: Layout, from: { x: number; y: number }) {
  const seen = new Set<number>()
  if (layout.cells[from.y * layout.width + from.x] !== FLOOR) return seen

  const queue = [from]
  seen.add(from.y * layout.width + from.x)

  while (queue.length > 0) {
    const { x, y } = queue.pop()!
    const neighbours = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ]
    for (const next of neighbours) {
      const at = next.y * layout.width + next.x
      if (seen.has(at)) continue
      if (!isFloor(layout, next.x, next.y)) continue
      seen.add(at)
      queue.push(next)
    }
  }

  return seen
}

function hasReachableNeighbour(layout: Layout, reachable: Set<number>, placement: Placement) {
  for (let dy = -REACH_TILES; dy <= REACH_TILES; dy++) {
    for (let dx = -REACH_TILES; dx <= REACH_TILES; dx++) {
      const x = placement.tx + dx
      const y = placement.ty + dy
      if (reachable.has(y * layout.width + x)) return true
    }
  }
  return false
}
