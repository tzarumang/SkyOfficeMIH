export enum ItemType {
  CHAIR,
  COMPUTER,
  WHITEBOARD,
  VENDINGMACHINE,
}

/**
 * Everything the client and the server need to know about a kind of item, in
 * one table. Placement, artwork, the key that works it and how far away it can
 * be used are data, so adding an item is an entry here plus a sprite rather
 * than an edit in six files - which is also what lets a generated office place
 * items the hand-drawn map never had.
 *
 * What actually happens when the key is pressed stays in code: a screen share
 * needs WebRTC and a whiteboard needs its board URL. The table says which items
 * are interactive; the item classes say what they do.
 */
export interface ItemSpec {
  /** object layer of the Tiled map holding these */
  layer: string
  /** texture key, and the spritesheet it is loaded from */
  texture: string
  file: string
  frameWidth: number
  frameHeight: number
  /** tileset in the map, used to turn an object's gid into a frame */
  tileset: string
  /** key that interacts with it, or none for scenery the player can only bump into */
  key?: 'E' | 'R'
  /** dialog shown while the player has it selected */
  prompt: (users: number) => string
  /** blocks the player from walking through it */
  collides: boolean
  /** the server tracks who is connected to each one of these */
  shared: boolean
  /**
   * How far outside its own footprint a player may stand and still use it.
   * Comfortably more than the reach of the client's item selector, and far less
   * than the distance between two items, so nobody connects across the map.
   */
  reach: number
  /** shifts the sprite along the depth axis, to sit in front of or behind a player */
  depthOffset: number
}

export const ITEM_SPECS: Record<ItemType, ItemSpec> = {
  [ItemType.CHAIR]: {
    layer: 'Chair',
    texture: 'chairs',
    file: 'assets/items/chair.png',
    frameWidth: 32,
    frameHeight: 64,
    tileset: 'chair',
    key: 'E',
    prompt: () => 'Press E to sit',
    collides: false,
    shared: false,
    reach: 64,
    depthOffset: 0,
  },
  [ItemType.COMPUTER]: {
    layer: 'Computer',
    texture: 'computers',
    file: 'assets/items/computer.png',
    frameWidth: 96,
    frameHeight: 64,
    tileset: 'computer',
    key: 'R',
    prompt: (users) => (users === 0 ? 'Press R to use computer' : 'Press R join'),
    collides: false,
    shared: true,
    reach: 64,
    // the sprite is tall, and a player using it stands behind the screen
    depthOffset: 0.27,
  },
  [ItemType.WHITEBOARD]: {
    layer: 'Whiteboard',
    texture: 'whiteboards',
    file: 'assets/items/whiteboard.png',
    frameWidth: 64,
    frameHeight: 64,
    tileset: 'whiteboard',
    key: 'R',
    prompt: (users) => (users === 0 ? 'Press R to use whiteboard' : 'Press R join'),
    collides: false,
    shared: true,
    reach: 64,
    depthOffset: 0,
  },
  [ItemType.VENDINGMACHINE]: {
    layer: 'VendingMachine',
    texture: 'vendingmachines',
    file: 'assets/items/vendingmachine.png',
    frameWidth: 48,
    frameHeight: 72,
    tileset: 'vendingmachine',
    key: 'R',
    prompt: () => 'Press R to buy a coffee :)',
    collides: true,
    shared: false,
    reach: 64,
    depthOffset: 0,
  },
}

/** every item type, in a stable order both sides agree on */
export const ITEM_TYPES: ItemType[] = [
  ItemType.CHAIR,
  ItemType.COMPUTER,
  ItemType.WHITEBOARD,
  ItemType.VENDINGMACHINE,
]

/** the types the server keeps connected-user state for */
export const SHARED_ITEM_TYPES = ITEM_TYPES.filter((type) => ITEM_SPECS[type].shared)
