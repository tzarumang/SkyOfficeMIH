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
}

export interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
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

  return {
    id,
    bounds: { width: map.width * map.tilewidth, height: map.height * map.tileheight },
    spawn: readSpawn(map),
    boxes: (itemType) => boxes.get(itemType) ?? [],
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
