import { Rng } from './rng'
import { Layout, Room, styleKeyOf } from './layout'
import { OfficeSpec } from '../../types/Office'
import {
  CABINET,
  CHAIRS,
  ChairDirection,
  COMPUTER_GIDS,
  CORNER_DESK,
  COUCH,
  DESK,
  PLANT,
  POOL_TABLE,
  Prefab,
  SOFA_SEATS,
  STYLES,
  TABLE,
  TILE,
  VENDING_GID,
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
}

export function furnish(rng: Rng, layout: Layout, spec: OfficeSpec): Placement[] {
  const out: Placement[] = []

  // --- the production floor -------------------------------------------------
  // Which desks get a screen is decided across the whole floor rather than desk
  // by desk, so the office ends up with exactly the number that was asked for.
  const withComputer = new Set(
    rng.shuffle(layout.deskSlots.map((_, index) => index)).slice(0, spec.computerDesks)
  )

  layout.deskSlots.forEach((slot, index) => {
    out.push(...desk(rng, slot.x, slot.y, withComputer.has(index)))
  })

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
      // The production floor and the corridor hold no furniture of their own,
      // but their walls are the biggest blank surfaces in the building.
      case 'open':
      case 'corridor':
        out.push(...dressWalls(rng, room, [room.ix1 + 1, room.ix1 + 1], false))
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
   * The desk goes against the wall furthest from the way in.
   *
   * A room is entered through one of its side walls, and putting the desk on
   * that same wall means walking straight into the back of it - the door ends
   * up behind whoever is sitting there. Everything else then fills the half
   * nearer the door, which is where a visitor would stop anyway.
   */
  const doorOnRight = room.doors.some((door) => door.x === room.x1)
  const deskX = doorOnRight ? room.ix0 + 1 : room.ix1 - CORNER_DESK.width
  const deskTop = Math.max(rows.from, bottom - CORNER_DESK.height + 1)
  out.push(...stamp(CORNER_DESK, deskX, deskTop))
  out.push(chair('left', deskX + 1, Math.min(bottom, deskTop + 2)))

  // a sofa along the wall the desk did not take, three seats side by side
  const sofaFrom = doorOnRight ? room.ix1 - SOFA_SEATS.length : room.ix0 + 1
  const clearOfDesk = (x: number) => (doorOnRight ? x > deskX + CORNER_DESK.width : x < deskX - 1)

  SOFA_SEATS.forEach((gid, index) => {
    const x = sofaFrom + index
    if (x >= room.ix0 && x <= room.ix1 && clearOfDesk(x)) {
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

  // A cabinet beside the desk rather than by the door - it is the one other
  // solid thing in the room, and solid things belong away from the way in.
  const clear = doorways(room)
  const cabinetX = doorOnRight ? deskX + CORNER_DESK.width + 1 : deskX - CABINET.width - 1
  const cabinetTop = Math.min(bottom - 1, rows.from + 2)
  if (
    bottom - rows.from >= 3 &&
    cabinetX >= room.ix0 &&
    cabinetX + CABINET.width - 1 <= room.ix1 &&
    !blocks(clear, cabinetX, cabinetTop, CABINET.width, CABINET.height)
  ) {
    out.push(...stamp(CABINET, cabinetX, cabinetTop))
  }

  const used: [number, number] = doorOnRight
    ? [deskX, deskX + CORNER_DESK.width]
    : [deskX, room.ix1]
  out.push(...dressWalls(rng, room, used))
  out.push(whiteboard(rng, room))
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
  let x = cols.from + 1
  let wantsTable = true
  while (x < cols.to) {
    const piece = wantsTable ? POOL_TABLE : COUCH
    // a couch needs a seat either side of it, so it asks for two more columns
    const needed = wantsTable ? piece.width : piece.width + 2
    if (x + needed > cols.to) break

    if (wantsTable) {
      out.push(...stamp(POOL_TABLE, x, top))
      x += POOL_TABLE.width + 2
    } else {
      out.push(...stamp(COUCH, x + 1, top))
      out.push(chair('right', x, top + 1))
      out.push(chair('left', x + 1 + COUCH.width, top + 1))
      x += COUCH.width + 4
    }
    wantsTable = !wantsTable
  }

  out.push({
    layer: 'VendingMachine',
    gid: VENDING_GID,
    tx: cols.from + 1,
    ty: rows.from,
    widthPx: 48,
    heightPx: 72,
  })

  // The tables run the length of the room at the same rows a decoration would
  // want, so what is left over is whatever the loop above did not reach.
  out.push(...dressWalls(rng, room, [cols.from, x]))
  return out
}

/**
 * The things that stop a room being four walls and a floor: a window let into
 * the back wall, and something in whichever corner is still free.
 *
 * `taken` is the span of columns the room's own furniture claimed. The doorway
 * is off limits too - a water cooler pushed into a corner that happens to be
 * the way in is a water cooler nobody can get past.
 */
function dressWalls(rng: Rng, room: Room, taken: [number, number], board = true): Placement[] {
  const out: Placement[] = []
  const rows = usableRows(room)
  const clear = doorways(room)

  // whatever else goes on this wall has to work around the board
  const spoken: Array<[number, number]> = board ? [[boardColumn(room), boardColumn(room) + 1]] : []

  // A window is let into the wall itself, across the rows the wall occupies.
  // It sits off to one side because the board is what goes in the middle.
  const window = rng.pick(WINDOWS)
  const windowX = room.ix0 + Math.max(1, Math.floor((room.ix1 - room.ix0) / 4) - 1)
  if (
    windowX + window.width - 1 <= room.ix1 &&
    (!board || windowX + window.width <= boardColumn(room) - 1)
  ) {
    out.push(...stamp(window, windowX, room.y0))
    spoken.push([windowX, windowX + window.width - 1])
  }

  // Pictures along the rest of it. A blank wall is what makes a room read as
  // unfinished however much furniture is standing in front of it.
  let hung = 0
  for (let x = room.ix0; x <= room.ix1 && hung < 3; ) {
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

  const piece = rng.chance(0.4) && rows.to - 2 >= rows.from ? WATER_COOLER : PLANT
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

/** places a piece of furniture with its top-left corner at (x, y) */
function stamp(piece: Prefab, x: number, y: number): Placement[] {
  return piece.parts.map((part) => ({
    layer: part.layer,
    gid: part.gid,
    tx: x + part.dx,
    ty: y + part.dy,
    widthPx: TILE,
    heightPx: TILE,
  }))
}

/**
 * One desk: a top, a body to bump into, sometimes a screen, and the chair
 * pulled up to it. Offsets copied from the hand-drawn map, columns 36-38.
 */
function desk(rng: Rng, x: number, y: number, withComputer: boolean): Placement[] {
  const out: Placement[] = []
  for (let i = 0; i < DESK.width; i++) {
    out.push(tile('Objects', DESK.top[i], x + i, y))
    out.push(tile('ObjectsOnCollide', DESK.body[i], x + i, y + 1))
  }

  // The screen stands on the desk, so it covers the desk's own two rows - its
  // base on the front edge. A row lower and it is standing on the floor in
  // front of the desk, which is where it used to be.
  if (withComputer) {
    out.push({
      layer: 'Computer',
      gid: rng.pick(COMPUTER_GIDS),
      tx: x,
      ty: y + 1,
      widthPx: 96,
      heightPx: 64,
    })
  }

  // and the chair is pulled up to that front edge, not left a row adrift
  out.push(chair('up', x + 1, y + 2))
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
