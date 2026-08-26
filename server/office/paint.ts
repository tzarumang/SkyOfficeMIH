import { withFlipX } from '../../types/Gid'
import {
  ARCHETYPE_AUDIO,
  FLOOR,
  Layout,
  Room,
  VOID,
  WALL,
  cellAt,
  isFloor,
  styleKeyOf,
} from './layout'
import { Placement } from './furnish'
import { STYLES, TILE, WALLS } from './vocabulary'

/**
 * Turns a floor plan and a pile of furniture into a Tiled map, in the format
 * the client already loads and the server already reads. Nothing downstream
 * knows or cares that this one was not drawn by hand.
 */

/** every layer the client looks for - a missing one is a crash, not a blank room */
const OBJECT_LAYERS = [
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

export interface TiledMap {
  [key: string]: unknown
}

export function paint(layout: Layout, placements: Placement[], tilesets: unknown[]): TiledMap {
  const ground = paintGround(layout)

  let nextObjectId = 1
  const objectLayers = new Map<string, unknown[]>(OBJECT_LAYERS.map((name) => [name, []]))

  for (const placement of placements) {
    const objects = objectLayers.get(placement.layer)
    if (!objects) throw new Error(`Nothing draws the "${placement.layer}" layer.`)

    objects.push({
      gid: withFlipX(placement.gid, placement.flipX),
      height: placement.heightPx,
      id: nextObjectId++,
      name: '',
      rotation: 0,
      type: '',
      visible: true,
      width: placement.widthPx,
      // Tiled hangs a tile object from its bottom-left corner
      x: placement.tx * TILE,
      y: (placement.ty + 1) * TILE,
      ...(placement.direction
        ? { properties: [{ name: 'direction', type: 'string', value: placement.direction }] }
        : {}),
    })
  }

  for (const room of layout.rooms) {
    objectLayers.get('Zone')!.push({
      height: (room.iy1 - room.iy0 + 1) * TILE,
      id: nextObjectId++,
      name: room.name,
      properties: [{ name: 'audio', type: 'string', value: ARCHETYPE_AUDIO[room.archetype] }],
      rotation: 0,
      type: '',
      visible: true,
      width: (room.ix1 - room.ix0 + 1) * TILE,
      // a plain rectangle is anchored at its top-left corner, unlike a tile
      x: room.ix0 * TILE,
      y: room.iy0 * TILE,
    })
  }

  let nextLayerId = 1
  const layers: unknown[] = [
    {
      data: ground,
      height: layout.height,
      id: nextLayerId++,
      name: 'Ground',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: layout.width,
      x: 0,
      y: 0,
    },
    ...OBJECT_LAYERS.map((name) => ({
      draworder: 'topdown',
      id: nextLayerId++,
      name,
      objects: objectLayers.get(name),
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    })),
  ]

  return {
    compressionlevel: -1,
    height: layout.height,
    infinite: false,
    layers,
    // A generated building is whatever size its contents need, so where a
    // player appears is a property of the map rather than a constant both
    // ends of the app agree on out of band.
    properties: [
      { name: 'spawnX', type: 'int', value: layout.spawn.x * TILE + TILE / 2 },
      { name: 'spawnY', type: 'int', value: layout.spawn.y * TILE + TILE / 2 },
    ],
    nextlayerid: nextLayerId,
    nextobjectid: nextObjectId,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.7.0',
    tileheight: TILE,
    tilesets,
    tilewidth: TILE,
    type: 'map',
    version: '1.6',
    width: layout.width,
  }
}

function paintGround(layout: Layout): number[] {
  const { width, height } = layout
  const data = new Array(width * height).fill(0)

  /**
   * The two rows at the top of a room are the room speaking, not its
   * neighbours: the wall itself, and the face of that wall under it. Painting
   * them from the room rather than from what happens to be next to them keeps
   * a style that draws a two-tile wall from being read as two separate ones.
   */
  const fixed = new Map<number, number>()
  for (const room of layout.rooms) {
    const style = STYLES[styleKeyOf(room.archetype)]
    for (let x = room.ix0; x <= room.ix1; x++) {
      style.wallRows.forEach((gid, row) => fixed.set((room.y0 + row) * width + x, gid))
      if (style.skirt !== undefined) {
        fixed.set((room.y0 + style.wallRows.length) * width + x, style.skirt)
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x
      const cell = layout.cells[at]
      if (cell === VOID) continue

      const explicit = fixed.get(at)
      if (explicit !== undefined) {
        data[at] = explicit
        continue
      }

      data[at] = cell === FLOOR ? styleOf(layout, x, y).floor : wallGid(layout, x, y)
    }
  }

  return data
}

function roomOf(layout: Layout, x: number, y: number): Room | undefined {
  const index = layout.owner[y * layout.width + x]
  return index >= 0 ? layout.rooms[index] : undefined
}

function styleOf(layout: Layout, x: number, y: number) {
  const room = roomOf(layout, x, y)
  return STYLES[styleKeyOf(room?.archetype ?? 'corridor')] ?? STYLES.open
}

/**
 * Which wall tile a solid cell should be, decided from what is around it.
 *
 * A vertical run is settled first, and that matters. The tiles that cap a
 * horizontal wall are drawn with transparent edges - they are meant to have
 * more wall beside them, not above and below - so putting one in a vertical run
 * leaves a hole you can see the sky through. A doorway punched into a wall used
 * to do exactly that to the tiles either side of it.
 */
/** the deepest wall any style draws, which is how far a run has to look */
const WALL_DEPTH = Math.max(...Object.values(STYLES).map((style) => style.wallRows.length))

function wallGid(layout: Layout, x: number, y: number): number {
  // A run of vertical wall keeps one tile from top to bottom, so the corner
  // where a room's top wall meets it has to look one row further down to see
  // which sides the run really has rooms on.
  // A wall is several rows deep, so a run has to look past all of them to see
  // which sides really have a room against it. Looking only one row down left
  // the join between two rooms drawn as an outside edge - a hole, in a tile
  // whose outer side is transparent.
  const roomBeside = (dx: number) => {
    for (let below = 0; below <= WALL_DEPTH; below++) {
      if (isFloor(layout, x + dx, y + below)) return true
    }
    return false
  }
  const floorLeft = roomBeside(-1)
  const floorRight = roomBeside(1)
  const runsVertically = isWall(layout, x, y - 1) || isWall(layout, x, y + 1)

  if (runsVertically && (floorLeft || floorRight)) {
    // A doorway punched through the wall stops the run here, and a wall seen
    // end-on is not a bare edge - it shows its front. That is the room's own
    // wall face, so the body runs straight into it and the wall reads as
    // having a front rather than simply stopping.
    //
    // The cap that sits over a face on a room's top wall has no place here:
    // there the cap is the top of the wall, while here the wall above it is
    // already drawn, so it only opened a bare strip between the two.
    //
    // Only against floor - the outside of the building ends against nothing at
    // all, and is left exactly as it was.
    if (isFloor(layout, x, y + 1)) return styleOf(layout, x, y + 1).wallRows[1]

    if (floorLeft && floorRight) return WALLS.shared
    return floorRight ? WALLS.leftEdge : WALLS.rightEdge
  }

  if (isFloor(layout, x, y + 1)) return styleOf(layout, x, y + 1).wallRows[0]
  if (isFloor(layout, x, y - 1)) return WALLS.bottom

  if (floorLeft && floorRight) return WALLS.shared
  if (floorRight) return WALLS.leftEdge
  if (floorLeft) return WALLS.rightEdge

  // nothing orthogonal: the bottom corners of the building
  const upRight = isFloor(layout, x + 1, y - 1)
  const upLeft = isFloor(layout, x - 1, y - 1)
  if (upRight && !upLeft) return WALLS.bottomLeft
  if (upLeft && !upRight) return WALLS.bottomRight

  return WALLS.shared
}

function isWall(layout: Layout, x: number, y: number) {
  return cellAt(layout, x, y) === WALL
}

export function cellIsSolid(layout: Layout, x: number, y: number) {
  return cellAt(layout, x, y) === WALL
}
