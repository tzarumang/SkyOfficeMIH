import { Rng } from './rng'
import { STYLES } from './vocabulary'
import { OfficeSpec, totalDesks } from '../../types/Office'

/**
 * The floor plan, before anything is drawn: which tiles are solid, which are
 * walkable, and which room each one belongs to.
 *
 * The plan is not a dungeon of corridors and dead ends, and it is not a random
 * size either. It is the shape of the office someone drew by hand - a column of
 * rooms, a corridor beside them, the production floor on the other side - at
 * the sizes that office uses. What changes is how many rooms there are and how
 * big the production floor has to be to hold the desks that were asked for, so
 * the building grows to fit its contents rather than the contents rattling
 * around inside a building of arbitrary size.
 */

export const VOID = 0
export const FLOOR = 1
export const WALL = 2
export type Cell = typeof VOID | typeof FLOOR | typeof WALL

export type Archetype = 'open' | 'conference' | 'private' | 'lounge' | 'corridor' | 'training'

/** what each archetype does to the audio of the people standing in it */
export const ARCHETYPE_AUDIO: Record<Archetype, string> = {
  open: 'proximity',
  corridor: 'proximity',
  lounge: 'proximity',
  conference: 'room',
  private: 'room-sealed',
  // everyone in a training room is meant to hear whoever is presenting
  training: 'room',
}

export interface Room {
  archetype: Archetype
  name: string
  /** wall bounds, inclusive: the wall ring belongs to the room */
  x0: number
  y0: number
  x1: number
  y1: number
  /** walkable interior, inclusive */
  ix0: number
  iy0: number
  ix1: number
  iy1: number
  /** cells punched through the wall ring to reach the corridor */
  doors: Array<{ x: number; y: number }>
}

export interface Layout {
  width: number
  height: number
  cells: Cell[]
  /** index into rooms for every cell, or -1 */
  owner: number[]
  rooms: Room[]
  corridor: Room
  spawn: { x: number; y: number }
  /**
   * Where the production floor puts its desks. `facing` is which side the chair
   * goes, so two rows of desks can be set back to back and share a partition
   * rather than each standing on its own.
   */
  deskSlots: Array<{ x: number; y: number; facing: 'up' | 'down' }>
}

/** how much of the corridor's end wall a company logo is given, in tiles */
export const LOGO_TILES = { width: 3, height: 2 }

/**
 * The columns that wall gives up to the logo.
 *
 * Both the painter, which marks the spot, and the furnisher, which hangs the
 * pictures, have to agree on it - the first office drawn with a logo had a
 * window let into the wall straight through the middle of it.
 */
export function logoColumns(corridor: Room): [number, number] {
  const left = Math.floor((corridor.ix0 + corridor.ix1 + 1 - LOGO_TILES.width) / 2)
  return [left, left + LOGO_TILES.width - 1]
}

export interface LayoutOptions {
  spec: OfficeSpec
}

/**
 * Measured off the hand-drawn map, which is what makes a generated room feel
 * the size a room should be. The column of rooms is at columns 5-19 there, the
 * corridor at 19-24, and the production floor from 24 rightwards.
 */
const MARGIN = 1
const ROOM_BLOCK_LEFT = 5
const ROOM_BLOCK_RIGHT = 19
const ROOM_BLOCK_WIDTH = ROOM_BLOCK_RIGHT - ROOM_BLOCK_LEFT
const CORRIDOR_RIGHT = 24
/**
 * The row every column of rooms hangs from. A room whose back wall is on this
 * row has the outdoors behind it; every other back wall is shared with the
 * room above, which is what the furnisher needs to know before it cuts a
 * window into one.
 */
export const TOP = 1

/** wall-to-wall heights, from the three rooms down the left of the hand-drawn map */
const ROOM_HEIGHTS: Record<Exclude<Archetype, 'open' | 'corridor'>, number> = {
  // its conference room, rows 16-24: a table with chairs down both sides
  conference: 9,
  // its top-left room, rows 4-10, plus a row so a desk and its chair fit
  private: 8,
  // its middle room, rows 11-16
  lounge: 7,
  // deep enough for the screen, a gap to see past it, and rows of chairs
  training: 9,
}

/**
 * A bench seats two: three columns wide, two rows deep, worked at from above
 * and from below. Benches stand shoulder to shoulder across the floor, which
 * is why the step is the width and not the width plus a gap.
 */
const DESK_WIDTH = 3
const DESK_COLUMN_STEP = DESK_WIDTH
const SEATS_PER_BENCH = 2
/**
 * Rows from one bench to the next: two for the bench, one for the chair each
 * side of it, and three of clear floor to walk down between the banks.
 */
const BENCH_PITCH = 7
const MIN_DESK_COLUMNS = 3
const MAX_DESK_COLUMNS = 8
/** past this the production floor is a long thin corridor of desks, so widen instead */
const COMFORTABLE_BANDS = 6
/**
 * Columns of clear floor kept against the walls the production floor is
 * entered through, so the desks nearest a door are not standing in it.
 */
const FLOOR_AISLE = 2
/** past this a single column of rooms is a corridor march, so use two */
const MAX_SINGLE_COLUMN = 34

export function buildLayout(rng: Rng, options: LayoutOptions): Layout {
  const { spec } = options

  // --- how tall each side wants to be ---------------------------------------
  const desks = totalDesks(spec)
  const benches = benchesFor(desks, spec.computerDesks)
  const deskColumns = chooseDeskColumns(benches)
  const benchRows = benches === 0 ? 1 : Math.ceil(benches / deskColumns)
  const floorHeight = benchRows * BENCH_PITCH + 2

  // A single column of rooms turns a big office into a very long walk, so once
  // it would tower over the production floor the rooms are split over two
  // columns: one off the corridor, one off the far side of the floor. Nobody
  // builds an office by stacking fifteen meeting rooms on top of each other.
  const [nearStack, farStack] = splitStack(roomStack(rng, spec), floorHeight)
  const columnHeight = (entries: StackEntry[]) =>
    entries.reduce((total, entry) => total + entry.height, 0)

  const buildingHeight = Math.max(columnHeight(nearStack), columnHeight(farStack), floorHeight)
  const bottom = TOP + buildingHeight

  // The production floor is as wide as its desks need, and never narrower than
  // the one on the hand-drawn map.
  // The bank stands one column clear of the aisle on its left, where the
  // partition at the end of it goes.
  const floorWidth = Math.max(deskColumns * DESK_COLUMN_STEP + 2 * FLOOR_AISLE + 2, 15)
  const floorRight = CORRIDOR_RIGHT + floorWidth
  const right = farStack.length > 0 ? floorRight + ROOM_BLOCK_WIDTH : floorRight
  const width = right + 1 + MARGIN
  const height = bottom + 1 + MARGIN

  const cells: Cell[] = new Array(width * height).fill(VOID)
  const owner: number[] = new Array(width * height).fill(-1)
  const rooms: Room[] = []

  // A column has to reach the bottom of the building, and it is almost never
  // exactly as tall as its rooms want to be. The leftover rows are shared out
  // a row at a time instead of being dumped on the last room, which is what
  // used to leave one enormous meeting room at the foot of the column with a
  // small table adrift in the middle of it.
  const stackRoomsInto = (entries: StackEntry[], x0: number, x1: number) => {
    if (entries.length === 0) return
    const wanted = entries.reduce((total, entry) => total + entry.height, 0)
    const slack = Math.max(0, bottom - TOP - wanted)
    const each = Math.floor(slack / entries.length)
    const spare = slack % entries.length

    let cursor = TOP
    entries.forEach((entry, index) => {
      const grown = entry.height + each + (index < spare ? 1 : 0)
      const y1 = index === entries.length - 1 ? bottom : cursor + grown
      rooms.push(makeRoom(entry.archetype, entry.name, x0, cursor, x1, y1))
      cursor = y1
    })
  }

  stackRoomsInto(nearStack, ROOM_BLOCK_LEFT, ROOM_BLOCK_RIGHT)
  stackRoomsInto(farStack, floorRight, right)

  const corridor = makeRoom('corridor', 'Corridor', ROOM_BLOCK_RIGHT, TOP, CORRIDOR_RIGHT, bottom)
  const floor = makeRoom('open', 'Production Floor', CORRIDOR_RIGHT, TOP, floorRight, bottom)

  rooms.push(floor, corridor)

  for (const room of rooms) carve(cells, owner, width, room, rooms.indexOf(room))

  // --- a doorway from every room onto the space it opens off ----------------
  // The near rooms and the floor open onto the corridor; the far rooms open
  // onto the floor, which is itself reachable from the corridor.
  for (const room of rooms) {
    if (room === corridor) continue

    const opensOnto = room.x0 === floorRight ? floor : corridor
    const doorX = room.x1 === ROOM_BLOCK_RIGHT ? room.x1 : room.x0
    const lo = Math.max(room.iy0 + 1, opensOnto.iy0)
    const hi = Math.min(room.iy1, opensOnto.iy1)
    if (hi < lo) continue

    // The production floor is wide open, so it gets more than one way in.
    const doorCount = room === floor ? Math.min(3, 1 + Math.floor((hi - lo) / 8)) : 1
    for (const doorY of spreadWithin(rng, lo, hi, doorCount)) {
      cells[doorY * width + doorX] = FLOOR
      owner[doorY * width + doorX] = rooms.indexOf(opensOnto)

      // A doorway is a hole in one wall that two rooms share, so both of them
      // have to know about it - otherwise the room on the other side looks like
      // it has a gap somebody forgot to close.
      room.doors.push({ x: doorX, y: doorY })
      opensOnto.doors.push({ x: doorX, y: doorY })
    }
  }

  const layout: Layout = {
    width,
    height,
    cells,
    owner,
    rooms,
    corridor,
    // The building is whatever size its contents need, so a player appears in
    // the middle of the corridor rather than at a spot agreed in advance.
    spawn: {
      x: Math.floor((corridor.ix0 + corridor.ix1) / 2),
      y: Math.floor((corridor.iy0 + corridor.iy1) / 2),
    },
    deskSlots: [],
  }
  layout.deskSlots = placeDeskSlots(floor, deskColumns, desks, spec.computerDesks)

  return layout
}

/**
 * Where each desk goes on the production floor: a grid, centred in the room.
 *
 * Every row holds the same number of desks and every column lines up. An
 * earlier version spread the desks over all the space it had, which filled the
 * room but left the rows ragged - a floor plan nobody would draw.
 *
 * Only the last row is ever short, and only when the total does not divide by
 * the width. When the room is taller than the desks need, the rows are spaced
 * further apart rather than being shuffled about.
 */
function placeDeskSlots(floor: Room, columns: number, desks: number, computerDesks: number) {
  if (desks === 0) return []

  // how many benches fit side by side between the walls, past the aisle and
  // the column the partition stands in
  const fits: number[] = []
  for (let i = 0; i < columns; i++) {
    const x = floor.ix0 + FLOOR_AISLE + 1 + i * DESK_COLUMN_STEP
    if (x + DESK_WIDTH - 1 <= floor.ix1 - FLOOR_AISLE) fits.push(x)
  }
  if (fits.length === 0) return []

  const perRow = Math.min(fits.length, columns)
  const rowsNeeded = Math.ceil(benchesFor(desks, computerDesks) / perRow)

  // A bench needs the row above it for the far chair and the row below for the
  // near one, so the first one cannot sit against either wall.
  const first = floor.iy0 + 2
  const last = floor.iy1 - 2
  if (last < first) return []

  const rows = Math.min(rowsNeeded, Math.floor((last - first) / BENCH_PITCH) + 1)

  /**
   * The floor is as tall as the building, which is as tall as whichever side
   * of it wanted more room - so it is usually taller than its desks need. The
   * spare rows widen the aisles between the banks, up to a point, and past
   * that the bank simply sits in the middle of the floor. Spreading the banks
   * the whole height regardless leaves one row marooned at each end.
   */
  const even = rows > 1 ? (last - first) / (rows - 1) : 0
  const pitch = Math.min(Math.max(BENCH_PITCH, Math.floor(even)), BENCH_PITCH + 3)
  const top = first + Math.floor((last - first - (rows - 1) * pitch) / 2)
  const bandAt = (row: number) => top + row * pitch

  // Centred, but never closer to a wall than the aisle - the floor is entered
  // through both of its side walls, and a desk in a doorway is a desk you have
  // to squeeze past to get onto the floor at all.
  const gridWidth = perRow * DESK_COLUMN_STEP
  const room = floor.ix1 - floor.ix0 + 1
  const centred = floor.ix0 + Math.floor((room - gridWidth) / 2)
  const left = Math.max(
    floor.ix0 + FLOOR_AISLE + 1,
    Math.min(centred, floor.ix1 - FLOOR_AISLE - gridWidth + 1)
  )

  const benchXs: Array<{ x: number; y: number }> = []
  for (let row = 0; row < rows; row++) {
    const y = bandAt(row)
    for (let column = 0; column < perRow; column++) {
      benchXs.push({ x: left + column * DESK_COLUMN_STEP, y })
    }
  }

  /**
   * Every bench gets its near desk before any bench gets its far one.
   *
   * The near side is the one a screen fits on, so filling it first is what
   * lets an office of mostly screens have somewhere to put them. It also
   * means a bench is never seated on the far side alone, which would leave
   * the near desk drawn with nobody at it.
   */
  const slots: Array<{ x: number; y: number; facing: 'up' | 'down' }> = []
  for (const facing of ['up', 'down'] as const) {
    for (const bench of benchXs) {
      if (slots.length >= desks) break
      slots.push({ x: bench.x, y: bench.y, facing })
    }
  }
  return slots
}

/**
 * How many desks to a row.
 *
 * Wide enough that the floor is not one long column, and where there is a
 * choice, a width that divides the total evenly - so every row is full rather
 * than the last one trailing off.
 */
/**
 * How many benches a floor needs.
 *
 * Two to a bench, except that a screen only fits on the near desk: the far
 * one has a single row showing above the partition, and the rest of it is
 * behind. So an office that asks for more screens than half its desks gets
 * one bench per screen and a wider floor to stand them on, rather than a
 * monitor drawn hovering over somebody's chair.
 */
function benchesFor(desks: number, computerDesks: number) {
  if (desks === 0) return 0
  return Math.max(Math.ceil(desks / SEATS_PER_BENCH), Math.min(computerDesks, desks))
}

/**
 * How wide the bank of benches is.
 *
 * Roughly as wide as it is deep, rather than as wide as it can be. A bench is
 * three columns and seven rows, so a bank laid out five across and one deep is
 * a strip of desks stranded in the middle of the floor - which is what it
 * looked like before, because the old rule took the first width that divided
 * the count exactly and five divides five.
 */
function chooseDeskColumns(benches: number) {
  if (benches === 0) return MIN_DESK_COLUMNS

  const square = Math.round(Math.sqrt(benches * (BENCH_PITCH / DESK_COLUMN_STEP) * 0.5))
  let columns = Math.min(MAX_DESK_COLUMNS, Math.max(MIN_DESK_COLUMNS, square))
  while (Math.ceil(benches / columns) > COMFORTABLE_BANDS && columns < MAX_DESK_COLUMNS) columns++

  // A width that divides the count exactly leaves no half-empty last row, so
  // it wins over the ideal shape if it is within a column of it.
  for (const candidate of [columns, columns + 1, columns - 1]) {
    if (
      candidate >= MIN_DESK_COLUMNS &&
      candidate <= MAX_DESK_COLUMNS &&
      benches % candidate === 0
    ) {
      return candidate
    }
  }
  return columns
}

interface StackEntry {
  archetype: Exclude<Archetype, 'open' | 'corridor'>
  name: string
  height: number
}

/**
 * Splits the rooms over one column or two. Everything fits in one column
 * while that column is not much taller than the production floor beside it;
 * past that the office is wider rather than endlessly longer.
 */
function splitStack(entries: StackEntry[], floorHeight: number): [StackEntry[], StackEntry[]] {
  const total = entries.reduce((sum, entry) => sum + entry.height, 0)
  if (total <= Math.max(floorHeight, MAX_SINGLE_COLUMN)) return [entries, []]

  const half = total / 2
  let taken = 0
  let at = 0
  while (at < entries.length - 1 && taken + entries[at].height / 2 < half) {
    taken += entries[at].height
    at++
  }
  return [entries.slice(0, at), entries.slice(at)]
}

/** the rooms that were asked for, in an order the seed decides */
function roomStack(rng: Rng, spec: OfficeSpec): StackEntry[] {
  const entries: StackEntry[] = []
  const add = (archetype: StackEntry['archetype'], label: string, count: number) => {
    for (let i = 0; i < count; i++) {
      entries.push({
        archetype,
        name: count > 1 ? `${label} ${i + 1}` : label,
        height: ROOM_HEIGHTS[archetype],
      })
    }
  }

  add('conference', 'Meeting Room', spec.meetingRooms)
  add('private', '1-on-1 Room', spec.oneOnOneRooms)
  add('lounge', 'Lounge', spec.lounges)
  add('training', 'Training Room', spec.trainingRooms)

  return rng.shuffle(entries)
}

/** `count` positions inside [from, to], kept apart from each other */
function spreadWithin(rng: Rng, from: number, to: number, count: number) {
  const span = to - from + 1
  const wanted = Math.max(1, Math.min(count, span))
  const slice = span / wanted

  const positions: number[] = []
  for (let i = 0; i < wanted; i++) {
    const start = Math.floor(from + i * slice)
    const end = Math.floor(from + (i + 1) * slice) - 1
    positions.push(rng.int(start, Math.max(start, end)))
  }
  return positions
}

export function styleKeyOf(archetype: Archetype) {
  return archetype
}

/** how many rows of the top wall a player cannot walk on */
export function topWallDepth(archetype: Archetype) {
  return STYLES[styleKeyOf(archetype)].wallRows.length
}

function makeRoom(
  archetype: Archetype,
  name: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Room {
  return {
    archetype,
    name,
    x0,
    y0,
    x1,
    y1,
    ix0: x0 + 1,
    // the skirt row is walkable in most styles and part of the wall in others
    iy0: y0 + topWallDepth(archetype),
    ix1: x1 - 1,
    iy1: y1 - 1,
    doors: [],
  }
}

/** writes a room's wall ring and interior into the grid */
function carve(cells: Cell[], owner: number[], width: number, room: Room, index: number) {
  for (let y = room.y0; y <= room.y1; y++) {
    for (let x = room.x0; x <= room.x1; x++) {
      const at = y * width + x
      const onRing = x === room.x0 || x === room.x1 || y < room.iy0 || y === room.y1
      if (onRing) {
        // A wall already carried by a neighbouring room stays a wall; only an
        // interior must never be overwritten by the ring of the room next door.
        if (cells[at] !== FLOOR) cells[at] = WALL
        continue
      }
      cells[at] = FLOOR
      owner[at] = index
    }
  }
}

export function cellAt(layout: Layout, x: number, y: number): Cell {
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return VOID
  return layout.cells[y * layout.width + x]
}

export function isFloor(layout: Layout, x: number, y: number) {
  return cellAt(layout, x, y) === FLOOR
}
