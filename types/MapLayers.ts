/**
 * The scenery of the map: the floor, and the object layers that are only ever
 * drawn and bumped into. Interactive furniture is described by ITEM_SPECS in
 * ./Items instead.
 */

export interface TilesetSpec {
  /** texture key the layers refer to, and the spritesheet it is loaded from */
  texture: string
  file: string
  frameWidth: number
  frameHeight: number
}

export const TILESETS: TilesetSpec[] = [
  {
    texture: 'tiles_wall',
    file: 'assets/map/FloorAndGround.png',
    frameWidth: 32,
    frameHeight: 32,
  },
  {
    texture: 'office',
    file: 'assets/tileset/Modern_Office_Black_Shadow.png',
    frameWidth: 32,
    frameHeight: 32,
  },
  {
    texture: 'basement',
    file: 'assets/tileset/Basement.png',
    frameWidth: 32,
    frameHeight: 32,
  },
  {
    texture: 'generic',
    file: 'assets/tileset/Generic.png',
    frameWidth: 32,
    frameHeight: 32,
  },
]

/** the one tile layer, which carries the floor and the walls that stop a player */
export const GROUND_LAYER = { layer: 'Ground', tileset: 'FloorAndGround', texture: 'tiles_wall' }

export interface DecorLayerSpec {
  /** object layer of the Tiled map */
  layer: string
  /** texture key, from TILESETS */
  texture: string
  /** tileset in the map, used to turn an object's gid into a frame */
  tileset: string
  collides: boolean
}

export const DECOR_LAYERS: DecorLayerSpec[] = [
  { layer: 'Wall', texture: 'tiles_wall', tileset: 'FloorAndGround', collides: false },
  { layer: 'Objects', texture: 'office', tileset: 'Modern_Office_Black_Shadow', collides: false },
  {
    layer: 'ObjectsOnCollide',
    texture: 'office',
    tileset: 'Modern_Office_Black_Shadow',
    collides: true,
  },
  { layer: 'GenericObjects', texture: 'generic', tileset: 'Generic', collides: false },
  { layer: 'GenericObjectsOnCollide', texture: 'generic', tileset: 'Generic', collides: true },
  { layer: 'Basement', texture: 'basement', tileset: 'Basement', collides: true },
]
