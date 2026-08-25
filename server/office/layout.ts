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

export type Archetype = 'open' | 'conference' | 'private' | 'lounge' | 'corridor'

/** what each archetype does to the audio of the people standing in it */
export const ARCHETYPE_AUDIO: Record<Archetype, string> = {
  open: 'proximity',
  corridor: 'proximity',
  lounge: 'proximity',
  conference: 'room',
  private: 'room-sealed',
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
  /** where the production floor puts its desks, filled in by the layout */
  deskSlots: Array<{ x: number; y: number }>
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
const TOP = 1

/** wall-to-wall heights, from the three rooms down the left of the hand-drawn map */
const ROOM_HEIGHTS: Record<Exclude<Archetype, 'open' | 'corridor'>, number> = {
  // its conference room, rows 16-24: a table with chairs down both sides
  conference: 9,
  // its top-left room, rows 4-10, plus a row so a desk and its chair fit
  private: 8,
  // its middle room, rows 11-16
  lounge: 7,
}

/** a desk with its chair is three columns wide and four rows deep, plus a gap */
const DESK_COLUMN_STEP = 4
const DESK_BAND_STEP = 5
const MIN_DESK_COLUMNS = 3
const MAX_DESK_COLUMNS = 8
/** past this the production floor is a long thin corridor of desks, so widen instead */
const COMFORTABLE_BANDS = 6
/** past this a single column of rooms is a corridor march, so use two */
const MAX_SINGLE_COLUMN = 34

export function buildLayout(rng: Rng, options: LayoutOptions): Layout {
  const { spec } = options

  // --- how tall each side wants to be ---------------------------------------
  const desks = totalDesks(spec)
  const deskColumns = chooseDeskColumns(desks)
  const deskBands = desks === 0 ? 1 : Math.ceil(desks / deskColumns)
  const floorHeight = deskBands * DESK_BAND_STEP + 2

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
  const floorWidth = Math.max(deskColumns * DESK_COLUMN_STEP + 2, 15)
  const floorRight = CORRIDOR_RIGHT + floorWidth
  const right = farStack.length > 0 ? floorRight + ROOM_BLOCK_WIDTH : floorRight
  const width = right + 1 + MARGIN
  const height = bottom + 1 + MARGIN

  const cells: Cell[] = new Array(width * height).fill(VOID)
  const owner: number[] = new Array(width * height).fill(-1)
  const rooms: Room[] = []

  // Whatever height is left over goes to the last room of a column rather than
  // being left as a gap, so every column reaches the bottom of the building.
  const stackRoomsInto = (entries: StackEntry[], x0: number, x1: number) => {
    let cursor = TOP
    entries.forEach((entry, index) => {
      const y1 = index === entries.length - 1 ? bottom : cursor + entry.height
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
  layout.deskSlots = placeDeskSlots(floor, deskColumns, desks)

  return layout
}

/**
 * Where each desk goes on the production floor.
 *
 * The desks are spread over every band the room has rather than packed into the
 * top of it - a floor sized for the rooms beside it can end up taller than the
 * desks strictly need, and desks bunched at one end is exactly what "looks
 * empty" means.
 */
function placeDeskSlots(floor: Room, columns: number, desks: number) {
  if (desks === 0) return []

  const from = floor.iy0 + 1
  const columnXs: number[] = []
  for (let i = 0; i < columns; i++) {
    const x = floor.ix0 + 1 + i * DESK_COLUMN_STEP
    if (x + 2 <= floor.ix1 - 1) columnXs.push(x)
  }

  const bandYs: number[] = []
  for (let y = from; y + 3 <= floor.iy1; y += DESK_BAND_STEP) bandYs.push(y)

  const slots: Array<{ x: number; y: number }> = []
  for (const y of bandYs) for (const x of columnXs) slots.push({ x, y })
  if (slots.length === 0) return []

  if (desks >= slots.length) return slots.slice(0, desks)

  // evenly spaced, so gaps are shared out instead of all landing at the end
  const chosen: Array<{ x: number; y: number }> = []
  for (let i = 0; i < desks; i++) chosen.push(slots[Math.floor((i * slots.length) / desks)])
  return chosen
}

/** wide enough that the production floor is not a single long column of desks */
function chooseDeskColumns(desks: number) {
  let columns = MIN_DESK_COLUMNS
  while (Math.ceil(desks / columns) > COMFORTABLE_BANDS && columns < MAX_DESK_COLUMNS) columns++
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
