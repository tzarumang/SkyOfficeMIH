import fs from 'fs'
import path from 'path'
import { ITEM_SPECS, ItemType, SHARED_ITEM_TYPES } from '../../types/Items'

/**
 * The client builds its items straight out of the Tiled map, keyed by the order
 * they appear in the object layer. The server reads the same map, through the
 * same ITEM_SPECS manifest, so the two agree on how many items exist and where
 * they are instead of both sides hard-coding counts that silently drift apart.
 *
 * Every office has its own map now - one is drawn by hand, the rest are
 * generated - so this reads a map rather than *the* map, and a room holds on to
 * the one it was opened with.
 */

export interface ItemBox {
  /** center of the item, matching how the client positions the sprite */
  x: number
  y: number
  halfWidth: number
  halfHeight: number
  /**
   * How far outside its own footprint a player may stand and still interact
   * with it. Comfortably more than the reach the client's item selector allows,
   * while still far smaller than the distance between two different items - so
   * a player cannot connect to an item across the map.
   */
  reach: number
}

export interface MapBounds {
  width: number
  height: number
}

interface TiledObject {
  x: number
  y: number
  width: number
  height: number
}

interface TiledLayer {
  name: string
  type: string
  objects?: TiledObject[]
  /** a tile layer carries its gids here, row by row */
  data?: number[]
}

interface TiledTileset {
  firstgid: number
  tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }>
}

export interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
  tilesets?: TiledTileset[]
  properties?: Array<{ name: string; value: unknown }>
}

/** everything a room needs to know about the office it is running */
export interface OfficeMap {
  /** null for the hand-drawn office, the id it was grown from otherwise */
  id: string | null
  bounds: MapBounds
  /** where a player appears, in world pixels */
  spawn: { x: number; y: number }
  boxes(itemType: ItemType): ItemBox[]
  /**
   * Whether anything solid stands between two points. Reaching an item is not
   * only a matter of distance: a board hung on a wall is a couple of tiles from
   * the room on the other side of that wall, and being close to something you
   * cannot see is not the same as being able to use it.
   */
  hasLineOfSight(from: { x: number; y: number }, to: { x: number; y: number }): boolean
}

/** the spawn the hand-drawn office has always used */
export const CLASSIC_SPAWN = { x: 705, y: 500 }

function readSpawn(map: TiledMap) {
  const value = (name: string) =>
    Number((map.properties ?? []).find((property) => property.name === name)?.value)

  const x = value('spawnX')
  const y = value('spawnY')
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : CLASSIC_SPAWN
}

/**
 * The tiles a player cannot walk through, read the way the client reads them:
 * the ground layer, and the per-tile `collides` flag of the tileset each gid
 * came from.
 */
function readSolidTiles(map: TiledMap) {
  const solid = new Set<number>()
  const ground = map.layers.find((layer) => layer.type === 'tilelayer' && layer.data)
  if (!ground?.data) return solid

  const blocking = new Set<number>()
  for (const tileset of map.tilesets ?? []) {
    for (const tile of tileset.tiles ?? []) {
      const collides = (tile.properties ?? []).find((property) => property.name === 'collides')
      if (collides?.value) blocking.add(tileset.firstgid + tile.id)
    }
  }

  ground.data.forEach((gid, index) => {
    if (gid !== 0 && blocking.has(gid)) solid.add(index)
  })
  return solid
}

const MAP_RELATIVE_PATH = path.join('client', 'public', 'assets', 'map', 'map.json')

/**
 * Walk up from this module until the client's map turns up. Keeps working for
 * both `ts-node-dev` out of ./server and the compiled build under ./server/lib.
 */
function findMapFile(): string {
  let dir = __dirname

  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, MAP_RELATIVE_PATH)
    if (fs.existsSync(candidate)) return candidate

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  throw new Error(
    `Unable to locate ${MAP_RELATIVE_PATH} starting from ${__dirname}. ` +
      'The server reads the Tiled map to place items and validate player positions.'
  )
}

function readItemLayer(map: TiledMap, itemType: ItemType): ItemBox[] {
  const spec = ITEM_SPECS[itemType]
  const layer = map.layers.find((l) => l.name === spec.layer && l.type === 'objectgroup')

  if (!layer || !layer.objects) {
    throw new Error(`Object layer "${spec.layer}" is missing from the Tiled map.`)
  }

  // Tiled anchors tile objects at their bottom-left corner - same math the
  // client uses in Game.addObjectFromTiled()
  return layer.objects.map((object) => ({
    x: object.x + object.width * 0.5,
    y: object.y - object.height * 0.5,
    halfWidth: object.width * 0.5,
    halfHeight: object.height * 0.5,
    reach: spec.reach,
  }))
}

/** reads a Tiled map into the shape a room works with */
export function officeMapFrom(map: TiledMap, id: string | null): OfficeMap {
  const boxes = new Map<ItemType, ItemBox[]>(
    SHARED_ITEM_TYPES.map((itemType) => [itemType, readItemLayer(map, itemType)])
  )

  const solid = readSolidTiles(map)
  const blocked = (tileX: number, tileY: number) => {
    if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return false
    return solid.has(tileY * map.width + tileX)
  }

  return {
    id,
    bounds: { width: map.width * map.tilewidth, height: map.height * map.tileheight },
    spawn: readSpawn(map),
    boxes: (itemType) => boxes.get(itemType) ?? [],
    hasLineOfSight: (from, to) => {
      const fromTile = {
        x: Math.floor(from.x / map.tilewidth),
        y: Math.floor(from.y / map.tileheight),
      }
      const toTile = { x: Math.floor(to.x / map.tilewidth), y: Math.floor(to.y / map.tileheight) }

      // Step along the line in half tiles. The tiles at either end are skipped:
      // the player stands on one, and an item mounted on a wall sits on the
      // other, so neither ever counts as being in the way.
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (map.tilewidth / 2))
      for (let step = 1; step < steps; step++) {
        const at = step / steps
        const tileX = Math.floor((from.x + (to.x - from.x) * at) / map.tilewidth)
        const tileY = Math.floor((from.y + (to.y - from.y) * at) / map.tileheight)
        if (tileX === fromTile.x && tileY === fromTile.y) continue
        if (tileX === toTile.x && tileY === toTile.y) continue
        if (blocked(tileX, tileY)) return false
      }
      return true
    },
  }
}

/** where the hand-drawn map lives; the office generator reads its tilesets from here */
export const REFERENCE_MAP_PATH = findMapFile()

/** the office someone drew by hand, which the public lobby still runs in */
export const classicOfficeMap = officeMapFrom(
  JSON.parse(fs.readFileSync(REFERENCE_MAP_PATH, 'utf8')),
  null
)

export function isWithinReach(box: ItemBox | undefined, x: number, y: number) {
  if (!box) return false

  return (
    Math.abs(x - box.x) <= box.halfWidth + box.reach &&
    Math.abs(y - box.y) <= box.halfHeight + box.reach
  )
}
