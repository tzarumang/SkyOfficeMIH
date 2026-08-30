import { Rng } from './rng'
import { Layout, logoColumns, Room, styleKeyOf, TOP } from './layout'
import { OfficeSpec } from '../../types/Office'
import {
  BOOKCASE,
  BOXES,
  CABINET,
  CHAIRS,
  ChairDirection,
  COMPUTER_GIDS,
  CORNER_DESK,
  COUCH,
  BENCH_END_POST,
  BENCH_FAR_DESK,
  BENCH_NEAR_DESK,
  BENCH_PARTITION,
  BENCH_POST_TOP,
  DESK_CHAIRS,
  DESK_CLUTTER,
  HALL_CHAIRS,
  HALL_PLANT,
  OFFICE_CHAIR,
  PLANT,
  POOL_TABLE,
  Prefab,
  PRINTER,
  SOFA_SEATS,
  STAIRS,
  STAIRS_TILES,
  STYLES,
  TABLE,
  TILE,
  VENDING_GID,
  SCREEN_GID,
  DRINKS_COUNTERS,
  PRINTERS,
  WALL_ART,
  WATER_COOLER,
  WHITEBOARD_GIDS,
  WINDOWS,
} from './vocabulary'

/**
 * Furniture, placed room by room. Everything is expressed in tiles here and
 * turned into Tiled objects in ./paint, so this file never has to think about
 * where Tiled hangs an object from.
 *
 * The counts are not a matter of taste: the office holds exactly what was asked
 * for. Where the seed still has a say is which desk gets the screen, which way
 * the odd chair faces, and how wide a meeting table is.
 */
export interface Placement {
  layer: string
  gid: number
  /** leftmost tile column the object covers */
  tx: number
  /** bottom-most tile row the object covers */
  ty: number
  widthPx: number
  heightPx: number
  direction?: ChairDirection
  /** drawn mirrored left to right, for furniture that only exists one way round */
  flipX?: boolean
}

export function furnish(rng: Rng, layout: Layout, spec: OfficeSpec): Placement[] {
  const out: Placement[] = []

  // --- the production floor -------------------------------------------------
  // Which desks get a screen is decided across the whole floor rather than desk
  // by desk, so the office ends up with exactly the number that was asked for.
  // Only the near desks are in the running: a screen is two rows tall and the
  // far desk has one row showing above the partition, so a screen there is
  // drawn over the head of whoever is sitting at it. The floor is built with a
  // bench per screen for that reason, so there are always enough.
  const withComputer = new Set(
    rng
      .shuffle(
        layout.deskSlots
          .map((slot, index) => ({ slot, index }))
          .filter(({ slot }) => slot.facing === 'up')
          .map(({ index }) => index)
      )
      .slice(0, spec.computerDesks)
  )

  // Two desks share a bench, so the bench itself is stamped once and each
  // desk only brings its own chair and its own things.
  const benches = new Map<string, Array<{ facing: 'up' | 'down'; computer: boolean }>>()
  layout.deskSlots.forEach((slot, index) => {
    const key = `${slot.x},${slot.y}`
    const seats = benches.get(key) ?? []
    seats.push({ facing: slot.facing, computer: withComputer.has(index) })
    benches.set(key, seats)
  })
  // Only the bench at the open end of a run needs a post of its own; every
  // other one is closed off by its neighbour's.
  for (const [key, seats] of benches) {
    const [x, y] = key.split(',').map(Number)
    out.push(...deskBench(rng, x, y, seats, !benches.has(`${x - BENCH_PARTITION.width},${y}`)))
  }

  const floor = layout.rooms.find((room) => room.archetype === 'open')
  if (floor) out.push(...floorExtras(rng, layout, floor))

  // --- the rooms ------------------------------------------------------------
  for (const room of layout.rooms) {
    switch (room.archetype) {
      case 'conference':
        out.push(...meetingRoom(rng, room))
        break
      case 'private':
        out.push(...oneOnOneRoom(rng, room))
        break
      case 'lounge':
        out.push(...lounge(rng, room))
        break
      case 'training':
        out.push(...trainingRoom(rng, room))
        break
      case 'corridor':
        out.push(...hallway(rng, room))
        break
      // The production floor holds no furniture of its own, but its walls are
      // the biggest blank surfaces in the building.
      case 'open':
        out.push(...dressWalls(rng, room, [room.ix1 + 1, room.ix1 + 1], { board: false }))
        break
      default:
        break
    }
  }

  return out
}

/** the rows a room can hold furniture in - the skirt row stays clear */
const usableRows = (room: Room) => ({ from: room.iy0 + 1, to: room.iy1 })

/** how much floor a doorway needs to itself, in columns */
const DOOR_CLEARANCE = 2

/**
 * The columns a room may stand furniture in. A room is entered through one of
 * its side walls, so the couple of columns against that wall are the way in
 * rather than somewhere to put a pool table.
 */
function usableColumns(room: Room) {
  const onLeft = room.doors.some((door) => door.x === room.x0)
  const onRight = room.doors.some((door) => door.x === room.x1)
  return {
    from: onLeft ? room.ix0 + DOOR_CLEARANCE : room.ix0,
    to: onRight ? room.ix1 - DOOR_CLEARANCE : room.ix1,
  }
}

/**
 * A table with chairs down both long sides and one at each end, the way the
 * hand-drawn conference room is laid out.
 */
function meetingRoom(rng: Rng, room: Room): Placement[] {
  const out: Placement[] = []
  const rows = usableRows(room)
  const cols = usableColumns(room)
  const height = rows.to - rows.from + 1
  const width = cols.to - cols.from + 1

  // A table is three rows, with a row of chairs above it and another below. In
  // a room too short for both, the near side keeps its chairs and the far side
  // goes without, which still reads as a meeting room rather than an empty one.
  const bothSides = height >= 6
  const needed = bothSides ? 6 : 4
  if (height < needed || width < 5) return [chair('down', room.ix0 + 1, rows.to)]

  const tableWidth = Math.min(width - 4, 3 + 2 * rng.int(1, 3))
  const tx = cols.from + Math.floor((width - tableWidth) / 2)
  const ty = rows.from + Math.floor((height - needed) / 2) + 1

  const row = (
    parts: { left: number; middle: number; right: number },
    y: number,
    layer: string
  ) => {
    for (let i = 0; i < tableWidth; i++) {
      const gid = i === 0 ? parts.left : i === tableWidth - 1 ? parts.right : parts.middle
      out.push(tile(layer, gid, tx + i, y))
    }
  }

  // the top of the table is drawn behind a player, its body in front of them
  row(TABLE.top, ty, 'Objects')
  row(TABLE.middle, ty + 1, 'ObjectsOnCollide')
  row(TABLE.bottom, ty + 2, 'ObjectsOnCollide')

  for (let i = 1; i < tableWidth - 1; i += 2) {
    out.push(chair('down', tx + i, ty))
    if (bothSides) out.push(chair('up', tx + i, ty + 4))
  }
  out.push(chair('right', tx - 1, ty + 2))
  out.push(chair('left', tx + tableWidth, ty + 2))
  out.push(...dressWalls(rng, room, [tx - 1, tx + tableWidth]))
  out.push(whiteboard(rng, room))
  out.push(...fillRoom(rng, room, out, 3))

  return out
}

/**
 * Furnished after the private office at the top right of the hand-drawn map: a
 * corner desk with its chair, a sofa across from it, a cabinet, a window and
 * something green in the corner.
 */
function oneOnOneRoom(rng: Rng, room: Room): Placement[] {
  const rows = usableRows(room)
  const width = room.ix1 - room.ix0 + 1
  if (rows.to < rows.from || width < 8) return [chair('down', room.ix0 + 1, rows.to)]

  const out: Placement[] = []
  const bottom = rows.to

  /**
   * The desk stands at the end of the room furthest from the door, turned so
   * that whoever sits at it is looking back towards it.
   *
   * Nobody puts a desk facing a wall. You sit behind it looking at the way in,
   * because the whole point of the room is the person who is about to walk
   * through it. The sprite only exists one way round - its alcove is cut into
   * the right side, so its occupant sits on the right and looks left - which
   * is fine for a room entered from the left and exactly backwards for one
   * entered from the right. So the room entered from the right gets a mirrored
   * desk at its left-hand end, and the occupant looks right, at the door.
   */
  const cols = usableColumns(room)
  const clear = doorways(room)
  const doorOnRight = room.doors.some((door) => door.x === room.x1)

  /**
   * And it stands a column clear of the end wall, because the seat is not
   * something you sit down onto from above: the desk has an alcove cut into
   * one side, and that side is the only way in or out of it. Pushed hard
   * against the wall the alcove faces, the seat is walled in - a chair drawn
   * in a box nobody can reach, which is what the drawn office avoids by
   * leaving floor on that side too.
   */
  const deskX = doorOnRight ? cols.from + 1 : cols.to - CORNER_DESK.width

  // Bottom of the room by preference, sliding up until it is clear of the way
  // in - the doorway is on the same side of the room as one end of the desk.
  const stops: number[] = []
  for (let top = bottom - CORNER_DESK.height + 1; top >= rows.from; top--) stops.push(top)
  const deskTop =
    stops.find((top) => !blocks(clear, deskX, top, CORNER_DESK.width, CORNER_DESK.height)) ??
    Math.max(rows.from, stops[0])

  out.push(...stamp(CORNER_DESK, deskX, deskTop, doorOnRight))

  // the seat is in the desk's alcove, which the mirroring moves to its far side
  const seatX = doorOnRight ? deskX : deskX + 1
  out.push({
    ...chair(doorOnRight ? 'right' : 'left', seatX, Math.min(bottom, deskTop + 2)),
    gid: OFFICE_CHAIR,
    flipX: doorOnRight,
  })

  // The sofa faces the desk from the other end of the room, which is where a
  // visitor coming through the door ends up.
  const visitorFrom = doorOnRight ? cols.to - SOFA_SEATS.length + 1 : cols.from
  const clearOfDesk = (x: number) => (doorOnRight ? x > deskX + CORNER_DESK.width : x < deskX - 1)

  SOFA_SEATS.forEach((gid, index) => {
    const x = visitorFrom + index
    if (
      x >= room.ix0 &&
      x <= room.ix1 &&
      clearOfDesk(x) &&
      !blocks(clear, x, rows.from + 1, 1, 1)
    ) {
      out.push({
        layer: 'Chair',
        gid,
        tx: x,
        ty: rows.from + 1,
        widthPx: 32,
        heightPx: 64,
        direction: 'down',
      })
    }
  })

  // One cabinet, at the end of the sofa. The drawn office has exactly one other
  // solid thing in it and puts it here.
  const inward = doorOnRight ? -1 : 1
  const cabinetX =
    inward > 0 ? visitorFrom + SOFA_SEATS.length : visitorFrom - 1 - CABINET.width + 1
  if (
    bottom - rows.from >= 3 &&
    cabinetX >= room.ix0 &&
    cabinetX + CABINET.width - 1 <= room.ix1 &&
    clearOfDesk(cabinetX) &&
    clearOfDesk(cabinetX + CABINET.width - 1) &&
    !blocks(clear, cabinetX, rows.from + 1, CABINET.width, CABINET.height)
  ) {
    out.push(...stamp(CABINET, cabinetX, rows.from + 1))
  }

  // And something green in the two corners at the desk end, which is what the
  // drawn office does and the whole of what it does. This room is not filled
  // the way the others are: a private office is meant to read as bare, and a
  // pass that stands a bookcase against every clear stretch of wall turns it
  // into a furniture showroom.
  const cornerX = doorOnRight ? cols.to : cols.from
  for (const top of [rows.from + 1, bottom - PLANT.height + 1]) {
    if (top < rows.from || top + PLANT.height - 1 > bottom) continue
    if (blocks(clear, cornerX, top, PLANT.width, PLANT.height)) continue
    out.push(...stamp(PLANT, cornerX, top))
  }

  const used: [number, number] = doorOnRight
    ? [room.ix0, cabinetX + CABINET.width]
    : [cabinetX, room.ix1]
  out.push(...dressWalls(rng, room, used, { pictures: 1, corner: false }))
  out.push(whiteboard(rng, room))
  return out
}

/**
 * The corridor, lined the way the one on the hand-drawn map is: runs of tub
 * chairs down the wall with a tall plant standing between them.
 *
 * A corridor is the longest wall in the building and the only room nobody
 * has any reason to stop in, which is exactly why it looks unfinished when
 * it is left bare. The chairs are on the Chair layer, so they are somewhere
 * to sit and wait rather than something to walk round.
 */
const HALL_RUN = 3

function hallway(rng: Rng, room: Room): Placement[] {
  const out: Placement[] = []
  const rows = usableRows(room)
  const clear = doorways(room)

  // The way out stands across the far end of the corridor, so the last row of
  // it is spoken for before anything is lined up along the wall.
  out.push(stairwell(room))
  for (let x = room.ix0; x <= room.ix1; x++) clear.add(`${x},${room.iy1}`)
  // Whichever wall has fewer doors in it: every room off the corridor opens
  // through one side of it, so seating that side is seating a wall that is
  // mostly doorway.
  const doorsOn = (x: number) => room.doors.filter((door) => door.x === x).length
  const wall = doorsOn(room.x0) <= doorsOn(room.x1) ? room.ix0 : room.ix1
  const seat = rng.pick(HALL_CHAIRS)

  const free = (y: number, height: number) =>
    y + height - 1 <= rows.to && !blocks(clear, wall, y, 1, height)

  let y = rows.from + 1
  let seated = 0
  while (y <= rows.to) {
    if (!free(y, 1)) {
      // past a doorway the run starts again, so the chairs do not read as one
      // long bench somebody has cut a hole in
      seated = 0
      y++
      continue
    }

    // A run of chairs, then something green to break it up. The plant stands
    // in a pot you bump into, so it needs its whole height clear of a doorway.
    if (seated >= HALL_RUN) {
      if (free(y, HALL_PLANT.height)) {
        out.push(...stamp(HALL_PLANT, wall, y))
        y += HALL_PLANT.height
      } else {
        y++
      }
      seated = 0
      continue
    }

    out.push({
      layer: 'Chair',
      gid: seat,
      tx: wall,
      ty: y,
      widthPx: TILE,
      heightPx: TILE * 2,
      direction: 'down',
    })
    seated++
    y++
  }

  out.push(
    ...dressWalls(rng, room, [room.ix1 + 1, room.ix1 + 1], {
      board: false,
      corner: false,
      // the wall the company logo hangs on, which is this room's end wall
      reserved: logoColumns(room),
    })
  )
  return out
}

/**
 * The staircase out of the building, at the end of the corridor.
 *
 * It goes where the hand-drawn office puts its own: the far end of the hallway
 * from the company logo, half in the end wall and half on the last row of
 * floor in front of it, which is where somebody stands to use it. That end
 * wall is the one piece of the building nothing else wants - the logo has the
 * other end and every room opens off the sides - and it is the wall a corridor
 * naturally walks you up to.
 */
function stairwell(room: Room): Placement {
  return {
    layer: 'Exit',
    gid: STAIRS,
    tx: room.ix0,
    // the wall row: Tiled hangs the object from its bottom edge, so the step
    // above it lands on the last row of corridor floor
    ty: room.y1,
    widthPx: STAIRS_TILES.width * TILE,
    heightPx: STAIRS_TILES.height * TILE,
  }
}

/**
 * A room arranged around a screen: rows of chairs, all of them facing it.
 *
 * The screen goes on the Computer layer rather than one of its own, because it
 * is a computer - the server counts it, tracks who is on it and hands out the
 * screen share exactly as it does for a desk. Only the picture is different,
 * and its gid is what chooses that.
 *
 * The front row starts clear of the screen so nobody is sitting under it, and
 * the aisle down the middle is what stops a full room being a wall of chairs
 * with no way to the back.
 */
function trainingRoom(rng: Rng, room: Room): Placement[] {
  const out: Placement[] = []
  const rows = usableRows(room)
  const cols = usableColumns(room)
  const clear = doorways(room)

  // the screen, centred on the wall everyone is looking at
  const SCREEN = { width: 2, height: 2 }
  const screenX = Math.floor((cols.from + cols.to + 1 - SCREEN.width) / 2)
  out.push({
    layer: 'Computer',
    gid: SCREEN_GID,
    tx: screenX,
    // Hung the way the whiteboard is: its foot on the first walkable row, so
    // it is against the wall to look at and inside the room to use. Squarely
    // in the wall rows it would be out of everyone's reach.
    ty: room.y0 + STYLES[styleKeyOf(room.archetype)].wallRows.length,
    widthPx: SCREEN.width * TILE,
    heightPx: SCREEN.height * TILE,
  })

  // Rows of chairs facing it, with a gap at the front so the first row is not
  // pressed against the wall, and an aisle down the middle.
  const aisle = Math.floor((cols.from + cols.to) / 2)
  for (let y = rows.from + 2; y <= rows.to; y += 2) {
    for (let x = cols.from; x <= cols.to; x++) {
      if (x === aisle) continue
      if (blocks(clear, x, y, 1, 1)) continue
      out.push(chair('up', x, y))
    }
  }

  // No corner piece: the chair rows run wall to wall, so whatever stands in a
  // corner stands on a seat - which is how a water cooler ended up planted on
  // the back-row chair of the first training room drawn with one.
  out.push(
    ...dressWalls(rng, room, [screenX - 1, screenX + SCREEN.width], {
      board: false,
      corner: false,
    })
  )
  return out
}

/**
 * The games room from the hand-drawn map: a pool table, a couch with a seat
 * either side of it, and the machine everyone actually comes for.
 */
function lounge(rng: Rng, room: Room): Placement[] {
  const out: Placement[] = []
  const rows = usableRows(room)
  const cols = usableColumns(room)
  const top = Math.max(rows.from, rows.to - POOL_TABLE.height + 1)

  // A pool table and then a couch, over and over for as long as the room
  // lasts - which is how the games room of the hand-drawn map is arranged, and
  // stops a big lounge being nothing but pool tables.
  // A couch needs a seat either side of it, so it asks for two more columns
  // than it is wide.
  const POOL = { width: POOL_TABLE.width, gap: 2 }
  const SEATED_COUCH = { width: COUCH.width + 2, gap: 2 }

  // Every solid thing in here has to leave the room in one piece: a lounge
  // is short, and a pool table with a vending machine above it reaches from
  // wall to wall.
  const solid = new Set<string>()
  const standsClear = (piece: Prefab, px: number, py: number) => {
    const footprint = solidFootprint(piece, px, py)
    if (wouldSplitRoom(room, solid, footprint)) return false
    for (const cell of footprint) solid.add(cell)
    return true
  }

  let x = cols.from + 1
  let wantsTable = true
  while (x <= cols.to) {
    // Whichever of the two fits, preferring the one whose turn it is. Giving
    // up the moment the piece on the rota does not fit is what used to leave
    // half a lounge bare.
    const order: boolean[] = wantsTable ? [true, false] : [false, true]
    const asTable = order.find(
      (wants: boolean) => x + (wants ? POOL.width : SEATED_COUCH.width) - 1 <= cols.to
    )
    if (asTable === undefined) break

    if (asTable) {
      if (standsClear(POOL_TABLE, x, top)) out.push(...stamp(POOL_TABLE, x, top))
      x += POOL.width + POOL.gap
    } else {
      if (standsClear(COUCH, x + 1, top)) {
        out.push(...stamp(COUCH, x + 1, top))
        out.push(chair('right', x, top + 1))
        out.push(chair('left', x + 1 + COUCH.width, top + 1))
      }
      x += SEATED_COUCH.width + SEATED_COUCH.gap
    }
    wantsTable = !asTable
  }

  // The machine everyone actually comes for, in the first spot along the
  // back wall that does not put it in line with what is already down.
  const VENDING = { width: 2, height: 3 }
  for (let vx = cols.from; vx <= cols.to - VENDING.width + 1; vx++) {
    const footprint: string[] = []
    for (let dy = 0; dy < VENDING.height; dy++) {
      for (let dx = 0; dx < VENDING.width; dx++) {
        footprint.push(`${vx + dx},${rows.from - VENDING.height + 1 + dy}`)
      }
    }
    if (footprint.some((cell) => solid.has(cell))) continue
    if (wouldSplitRoom(room, solid, footprint)) continue

    for (const cell of footprint) solid.add(cell)
    out.push({
      layer: 'VendingMachine',
      gid: VENDING_GID,
      tx: vx,
      ty: rows.from,
      widthPx: 48,
      heightPx: 72,
    })
    break
  }


  // The tables run the length of the room at the same rows a decoration would
  // want, so what is left over is whatever the loop above did not reach.
  out.push(...dressWalls(rng, room, [cols.from, x]))
  // A lounge is the room people are meant to linger in, so it gets the most.
  out.push(...fillRoom(rng, room, out, 6))
  return out
}

/** every tile a placement covers, so nothing is stood on top of anything */
function occupied(placed: Placement[]): Set<string> {
  const cells = new Set<string>()
  for (const piece of placed) {
    const width = Math.max(1, Math.round(piece.widthPx / TILE))
    const height = Math.max(1, Math.round(piece.heightPx / TILE))
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) cells.add(`${piece.tx + dx},${piece.ty - dy}`)
    }
  }
  return cells
}

/** the layers the client stops a player on */
const SOLID_PLACEMENT_LAYERS = new Set([
  'ObjectsOnCollide',
  'GenericObjectsOnCollide',
  'Basement',
  'VendingMachine',
])

/** every tile a player is stopped by */
function solidCells(placed: Placement[]): Set<string> {
  const cells = new Set<string>()
  for (const piece of placed) {
    if (!SOLID_PLACEMENT_LAYERS.has(piece.layer)) continue
    const width = Math.max(1, Math.round(piece.widthPx / TILE))
    const height = Math.max(1, Math.round(piece.heightPx / TILE))
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) cells.add(`${piece.tx + dx},${piece.ty - dy}`)
    }
  }
  return cells
}

/**
 * Which of a room's tiles can be walked to from its doorway, given what is
 * standing in it. A room is a carved rectangle, so its interior is floor and
 * only the furniture can be in the way.
 */
function walkRoom(room: Room, blocked: Set<string>): Set<string> {
  const start = room.doors
    .map((door) => ({
      x: door.x <= room.x0 ? room.ix0 : door.x >= room.x1 ? room.ix1 : door.x,
      y: Math.min(Math.max(door.y, room.iy0), room.iy1),
    }))
    .find((tile) => !blocked.has(`${tile.x},${tile.y}`))

  const reached = new Set<string>()
  if (!start) return reached

  const queue = [start]
  reached.add(`${start.x},${start.y}`)
  while (queue.length > 0) {
    const { x, y } = queue.pop()!
    for (const next of [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ]) {
      if (next.x < room.ix0 || next.x > room.ix1) continue
      if (next.y < room.iy0 || next.y > room.iy1) continue
      const key = `${next.x},${next.y}`
      if (reached.has(key) || blocked.has(key)) continue
      reached.add(key)
      queue.push(next)
    }
  }
  return reached
}

/** the tiles a prefab would make solid if it were stamped at (x, y) */
function solidFootprint(piece: Prefab, x: number, y: number): string[] {
  return piece.parts
    .filter((part) => SOLID_PLACEMENT_LAYERS.has(part.layer))
    .map((part) => `${x + part.dx},${y + part.dy}`)
}

/**
 * Would putting this here cut the room in two?
 *
 * Rooms are furnished piece by piece, and no piece is wide enough to wall a
 * room off on its own - but two of them in the same columns are. A vending
 * machine against the top wall and a pool table below it stood in one line
 * across a five-row lounge, and everything past them was floor nobody could
 * reach. Nothing looked wrong: each piece was against a wall, on the floor,
 * clear of the door.
 */
function wouldSplitRoom(room: Room, solid: Set<string>, adding: string[]): boolean {
  const blocked = new Set(solid)
  for (const cell of adding) blocked.add(cell)

  const reached = walkRoom(room, blocked)
  for (let y = room.iy0; y <= room.iy1; y++) {
    for (let x = room.ix0; x <= room.ix1; x++) {
      const key = `${x},${y}`
      if (!blocked.has(key) && !reached.has(key)) return true
    }
  }
  return false
}

/** what a room stands against its walls once the big thing in it is down */
const FILLERS: Prefab[] = [BOOKCASE, CABINET, PLANT, WATER_COOLER]

/**
 * Whatever wall a room has left over.
 *
 * Each room is furnished around one idea - a table, a desk, a pool table -
 * and that leaves most of the wall doing nothing, which is what makes a
 * generated room read as unfinished next to a drawn one. This walks the back
 * wall and then the front and stands something against whatever is still
 * clear. It works off the footprints of what is already placed rather than a
 * range of columns, so it cannot put a plant inside a sofa.
 */
function fillRoom(rng: Rng, room: Room, placed: Placement[], limit: number): Placement[] {
  const out: Placement[] = []
  const rows = usableRows(room)
  const cols = usableColumns(room)
  const taken = occupied(placed)
  for (const cell of doorways(room)) taken.add(cell)

  // The whiteboard hangs on the wall, so nothing already placed occupies the
  // floor in front of it - but that floor is where you have to stand to use it,
  // and a cabinet pushed under a board is a board nobody can reach.
  const board = placed.find((piece) => piece.layer === 'Whiteboard')
  if (board) {
    const wide = Math.max(1, Math.round(board.widthPx / TILE))
    for (let dx = 0; dx < wide; dx++) taken.add(`${board.tx + dx},${board.ty + 1}`)
  }

  const free = (piece: Prefab, x: number, y: number) => {
    if (x < cols.from || x + piece.width - 1 > cols.to) return false
    if (y < rows.from || y + piece.height - 1 > rows.to) return false
    for (let dy = 0; dy < piece.height; dy++) {
      for (let dx = 0; dx < piece.width; dx++) {
        if (taken.has(`${x + dx},${y + dy}`)) return false
      }
    }
    return true
  }

  // The back wall is the one you look at from the door, so it is dressed
  // first. The front wall is only used in a room deep enough that a piece
  // against it still leaves floor to walk on.
  const bands: Array<(piece: Prefab) => number> = [() => rows.from]
  if (rows.to - rows.from + 1 >= 5) bands.push((piece) => rows.to - piece.height + 1)

  /**
   * Nothing may be stood anywhere that walls somebody in.
   *
   * A room is furnished around one big solid thing, and the seats at it are
   * often in a one-tile strip between that thing and a wall. Drop a cabinet
   * across the end of the strip and the chairs behind a meeting table become
   * a row nobody can reach - which is what this used to do. A room is small
   * enough to walk in full for every candidate, so it is walked.
   */
  const solid = solidCells(placed)
  const strands = (piece: Prefab, x: number, y: number) =>
    wouldSplitRoom(room, solid, solidFootprint(piece, x, y))

  let standing = 0
  for (const band of bands) {
    for (let x = cols.from; x <= cols.to && standing < limit;) {
      const piece = rng.pick(FILLERS)
      const y = band(piece)
      if (free(piece, x, y) && !strands(piece, x, y) && rng.chance(0.5)) {
        out.push(...stamp(piece, x, y))
        for (let dy = 0; dy < piece.height; dy++) {
          for (let dx = 0; dx < piece.width; dx++) taken.add(`${x + dx},${y + dy}`)
        }
        for (const cell of solidFootprint(piece, x, y)) solid.add(cell)
        standing++
        // a gap either side, so the wall reads as furnished and not stacked
        x += piece.width + 1
      } else {
        x++
      }
    }
  }
  return out
}

/**
 * The things that stop a room being four walls and a floor: a window let into
 * the back wall where that wall is an outer one, and something in whichever
 * corner is still free.
 *
 * `taken` is the span of columns the room's own furniture claimed. The doorway
 * is off limits too - a water cooler pushed into a corner that happens to be
 * the way in is a water cooler nobody can get past.
 */
interface WallOptions {
  /** false in a room whose only wall fitting is a window */
  board?: boolean
  /** how many pictures may be hung, at most */
  pictures?: number
  /** whether to stand something in whichever corner is still free */
  corner?: boolean
  /** a span of the wall that is spoken for before anything is hung on it */
  reserved?: [number, number]
}

function dressWalls(
  rng: Rng,
  room: Room,
  taken: [number, number],
  options: WallOptions = {}
): Placement[] {
  const { board = true, pictures = 3, corner = true, reserved } = options
  const out: Placement[] = []
  const rows = usableRows(room)
  const clear = doorways(room)

  // whatever else goes on this wall has to work around the board, and around
  // anything the office has already claimed - the hallway logo, in a corridor
  const spoken: Array<[number, number]> = board ? [[boardColumn(room), boardColumn(room) + 1]] : []
  if (reserved) spoken.push(reserved)

  // A window is let into the wall itself, across the rows the wall occupies.
  // It sits off to one side because the board is what goes in the middle.
  //
  // Only a wall with the outdoors behind it can hold one. The rooms stack
  // down from the top of the building, so every back wall but the topmost is
  // the wall of the room above - and a window cut there is a view of the sky
  // between two rooms that are both indoors.
  if (room.y0 === TOP) {
    const window = rng.pick(WINDOWS)
    const windowX = room.ix0 + Math.max(1, Math.floor((room.ix1 - room.ix0) / 4) - 1)
    if (
      windowX + window.width - 1 <= room.ix1 &&
      (!board || windowX + window.width <= boardColumn(room) - 1) &&
      !spoken.some(([from, to]) => windowX <= to && windowX + window.width - 1 >= from)
    ) {
      out.push(...stamp(window, windowX, room.y0))
      spoken.push([windowX, windowX + window.width - 1])
    }
  }

  // A drinks counter, let into the wall the same way the window is. It cannot
  // stand on the floor: a lounge has none to spare, and a second solid thing
  // against the back wall pinches the room in two.
  if (rng.chance(0.45)) {
    const counter = rng.pick(DRINKS_COUNTERS)
    for (let cx = room.ix0; cx <= room.ix1 - counter.width + 1; cx++) {
      const clashes =
        spoken.some(([from, to]) => cx <= to && cx + counter.width - 1 >= from) ||
        blocks(clear, cx, room.y0, counter.width, counter.height)
      if (clashes) continue

      out.push(...stamp(counter, cx, room.y0))
      spoken.push([cx, cx + counter.width - 1])
      break
    }
  }

  // Pictures along the rest of it. A blank wall is what makes a room read as
  // unfinished however much furniture is standing in front of it.
  let hung = 0
  for (let x = room.ix0; x <= room.ix1 && hung < pictures;) {
    const art = rng.pick(WALL_ART)
    const clashes =
      x + art.width - 1 > room.ix1 ||
      spoken.some(([from, to]) => x <= to && x + art.width - 1 >= from) ||
      blocks(clear, x, room.y0, art.width, art.height)

    if (!clashes && rng.chance(0.55)) {
      out.push(...stamp(art, x, room.y0))
      spoken.push([x, x + art.width - 1])
      hung++
      x += art.width + 1
    } else {
      x++
    }
  }

  if (!corner) return out

  // A printer is the third thing an office corner holds, after something to
  // drink from and something green. It is short, so unlike the water cooler it
  // fits a room with barely any wall left.
  const tall = rows.to - 2 >= rows.from
  const piece = rng.chance(0.3)
    ? rng.pick(PRINTERS)
    : rng.chance(0.4) && tall
    ? WATER_COOLER
    : PLANT
  const top = rows.to - piece.height + 1
  if (top >= rows.from) {
    const corners = [room.ix0, room.ix1 - piece.width + 1].filter(
      (x) =>
        (x < taken[0] - 1 || x > taken[1] + 1) && !blocks(clear, x, top, piece.width, piece.height)
    )
    if (corners.length > 0) out.push(...stamp(piece, rng.pick(corners), top))
  }

  return out
}

/**
 * The tiles a doorway needs to itself: the gap in the wall, and the tile you
 * step into on either side of it. Furniture in any of them is furniture stood
 * in a doorway.
 */
export function doorways(room: Room): Set<string> {
  const clear = new Set<string>()
  for (const door of room.doors) {
    clear.add(`${door.x},${door.y}`)
    clear.add(`${door.x},${door.y - 1}`)
    clear.add(`${door.x},${door.y + 1}`)

    // A door is a gap in a side wall, so coming through it means moving
    // sideways. Two tiles of that is the difference between a way in and a
    // gap you have to squeeze through sideways past somebody's desk.
    for (const step of [1, 2]) {
      clear.add(`${door.x + step},${door.y}`)
      clear.add(`${door.x - step},${door.y}`)
    }
  }
  return clear
}

function blocks(clear: Set<string>, x: number, y: number, width: number, height: number) {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (clear.has(`${x + dx},${y + dy}`)) return true
    }
  }
  return false
}

/**
 * Places a piece of furniture with its top-left corner at (x, y), either as
 * drawn or mirrored left to right.
 *
 * Mirroring a whole prefab means two things at once: every tile of it is
 * flipped, and the tiles swap ends - what was the left edge has to end up as
 * the right one, or the piece comes out inside out.
 */
function stamp(piece: Prefab, x: number, y: number, flipX = false): Placement[] {
  return piece.parts.map((part) => ({
    layer: part.layer,
    gid: part.gid,
    tx: x + (flipX ? piece.width - 1 - part.dx : part.dx),
    ty: y + part.dy,
    widthPx: TILE,
    heightPx: TILE,
    flipX,
  }))
}

/**
 * A bench: the glass partition, and a desk on whichever side of it somebody
 * has actually been given a seat.
 *
 * Only the partition is unconditional. A desk is drawn for a seat and never
 * without one, because a desk with no chair at it is the first thing anybody
 * notices - and the bench is not a single piece of furniture that has to be
 * drawn whole, it is two desks that happen to share a screen.
 */
function deskBench(
  rng: Rng,
  x: number,
  y: number,
  seats: Array<{ facing: 'up' | 'down'; computer: boolean }>,
  endPost: boolean
): Placement[] {
  const out: Placement[] = []
  out.push(...stamp(BENCH_PARTITION, x, y))
  out.push(tile('Objects', BENCH_POST_TOP, x + 2, y - 1))

  // Each partition carries the post at its right-hand end, so a run of them
  // only needs one more to close the left end of the run.
  if (endPost) out.push(...stamp(BENCH_END_POST, x - 1, y - 1))

  for (const seat of seats) {
    const near = seat.facing === 'up'

    // The near desk sits below the partition and is worked at from below; the
    // far one sits above it and is worked at from above.
    out.push(...(near ? stamp(BENCH_NEAR_DESK, x, y) : stamp(rng.pick(BENCH_FAR_DESK), x, y - 1)))

    // The surface you can see: the near desk's own front row, and for the far
    // one the back edge, which is all of it the partition leaves showing.
    const surface = near ? y + 1 : y - 1
    if (seat.computer) {
      out.push({
        layer: 'Computer',
        gid: rng.pick(COMPUTER_GIDS),
        tx: x,
        ty: surface,
        widthPx: 96,
        heightPx: 64,
      })
    } else if (rng.chance(0.5)) {
      // one flat thing left on the desk - anything taller would stand over the
      // chair the same way a screen would
      out.push(tile('Objects', rng.pick(DESK_CLUTTER), x + rng.int(0, 2), surface))
    }

    out.push(deskChair(near ? 'up' : 'down', x + 1, near ? y + 2 : y - 1))
  }
  return out
}

/**
 * The things a floor has that are nobody's desk: the printer everyone walks to,
 * and the boxes nobody has unpacked. They go in the corners the desk grid does
 * not reach, which is where they end up in a real office too.
 */
function floorExtras(rng: Rng, layout: Layout, floor: Room): Placement[] {
  const out: Placement[] = []
  const clear = doorways(floor)
  const taken = new Set<string>()
  for (const slot of layout.deskSlots) {
    for (let dy = -1; dy <= 3; dy++) {
      for (let dx = -1; dx <= BENCH_PARTITION.width; dx++)
        taken.add(`${slot.x + dx},${slot.y + dy}`)
    }
  }

  const free = (piece: Prefab, x: number, y: number) => {
    if (x < floor.ix0 || x + piece.width - 1 > floor.ix1) return false
    if (y < floor.iy0 + 1 || y + piece.height - 1 > floor.iy1) return false
    if (blocks(clear, x, y, piece.width, piece.height)) return false

    for (let dy = 0; dy < piece.height; dy++) {
      for (let dx = 0; dx < piece.width; dx++) {
        if (taken.has(`${x + dx},${y + dy}`)) return false
      }
    }
    return true
  }

  // bottom left and bottom right, the two corners a grid of desks leaves over
  for (const piece of [PRINTER, BOXES, BOOKCASE, PLANT]) {
    const spots = [
      { x: floor.ix0 + 1, y: floor.iy1 - piece.height + 1 },
      { x: floor.ix1 - piece.width, y: floor.iy1 - piece.height + 1 },
      { x: floor.ix0 + 1, y: floor.iy0 + 2 },
      { x: floor.ix1 - piece.width, y: floor.iy0 + 2 },
    ]
    const spot = rng.shuffle(spots).find((candidate) => free(piece, candidate.x, candidate.y))
    if (!spot) continue

    out.push(...stamp(piece, spot.x, spot.y))
    for (let dy = 0; dy < piece.height; dy++) {
      for (let dx = 0; dx < piece.width; dx++) taken.add(`${spot.x + dx},${spot.y + dy}`)
    }
  }

  return out
}

/** the middle of the back wall, which is where a board goes */
function boardColumn(room: Room) {
  return room.ix0 + Math.floor((room.ix1 - room.ix0) / 2)
}

/**
 * Hung on the room's back wall, low enough to be inside the room.
 *
 * A board sitting squarely in the wall rows is in the wall the room *shares*
 * with the room above, which puts it within arm's reach of somebody standing
 * on the other side of it. Dropping it a row keeps it against the wall to look
 * at and inside this room to use.
 */
function whiteboard(rng: Rng, room: Room): Placement {
  return {
    layer: 'Whiteboard',
    gid: rng.pick(WHITEBOARD_GIDS),
    tx: boardColumn(room),
    ty: room.y0 + STYLES[styleKeyOf(room.archetype)].wallRows.length,
    widthPx: 64,
    heightPx: 64,
  }
}

function tile(layer: string, gid: number, tx: number, ty: number): Placement {
  return { layer, gid, tx, ty, widthPx: TILE, heightPx: TILE }
}

/** the desk-bank chair, which is not the chair the meeting rooms use */
function deskChair(direction: 'up' | 'down', tx: number, ty: number): Placement {
  return { ...chair(direction, tx, ty), gid: DESK_CHAIRS[direction] ?? CHAIRS[direction] }
}

function chair(direction: ChairDirection, tx: number, ty: number): Placement {
  return {
    layer: 'Chair',
    gid: CHAIRS[direction],
    tx,
    ty,
    widthPx: 32,
    heightPx: 64,
    direction,
  }
}
