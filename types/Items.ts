export enum ItemType {
  CHAIR,
  COMPUTER,
  WHITEBOARD,
  VENDINGMACHINE,
  EXIT,
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
/**
 * A second picture for a kind of item, drawn from its own tileset.
 *
 * A training room's screen is a computer in every way that matters - the same
 * key, the same sharing, the same server bookkeeping - and differs only in
 * what it looks like. Rather than a second item type carrying a duplicate of
 * all that, an item may be drawn from more than one sheet, and which one is
 * decided by the tileset the map's gid came from.
 */
export interface ItemArt {
  /** tileset in the map whose gids select this picture */
  tileset: string
  /** texture key, and the spritesheet it is loaded from */
  texture: string
  file: string
  frameWidth: number
  frameHeight: number
}

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
  /** other pictures the same item can be drawn with */
  alternates?: ItemArt[]
  /**
   * Let a map get away with not having this item's layer at all.
   *
   * A map with no chairs in it is broken and should say so. A map with no way
   * out of it was simply drawn before there was one - every office a previous
   * build of the generator produced, and the hand-drawn one until now - and
   * refusing to open one of those would take a whole office down over a
   * staircase.
   */
  optional?: boolean
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
    // Worded for both the pictures below: a desk computer and a training
    // room's screen are the same item, and share this line.
    prompt: (users) => (users === 0 ? 'Press R to share your screen' : 'Press R to join'),
    collides: false,
    shared: true,
    reach: 64,
    // the sprite is tall, and a player using it stands behind the screen
    depthOffset: 0.27,
    alternates: [
      {
        tileset: 'screen',
        texture: 'screens',
        file: 'assets/items/screen.png',
        frameWidth: 64,
        frameHeight: 64,
      },
    ],
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
  [ItemType.EXIT]: {
    layer: 'Exit',
    texture: 'stairs',
    file: 'assets/items/stairs.png',
    frameWidth: 128,
    frameHeight: 64,
    tileset: 'stairs',
    key: 'E',
    prompt: () => 'Press E to leave',
    /**
     * The staircase stops nobody by itself: what a player may walk onto is
     * already settled by the floor underneath it, which is a step at the top
     * and something solid at the bottom in both the hand-drawn office and a
     * generated one. Giving the picture a collider as well would take the top
     * step away from the office that has drawn one there for years.
     */
    collides: false,
    shared: false,
    reach: 64,
    depthOffset: 0,
    optional: true,
  },
  [ItemType.VENDINGMACHINE]: {
    layer: 'VendingMachine',
    texture: 'vendingmachines',
    file: 'assets/items/vendingmachine.png',
    frameWidth: 48,
    frameHeight: 72,
    tileset: 'vendingmachine',
    // No key, so it is scenery: an item without one is never selectable, which
    // is what has the buy-a-coffee link turned off for the time being. Putting
    // `key: 'R'` back is all it takes to switch it on again.
    prompt: () => 'A vending machine',
    collides: true,
    shared: false,
    reach: 64,
    depthOffset: 0,
  },
}

/**
 * The sign that hangs over a staircase.
 *
 * Somewhere to leave from is no use if nobody can find it, and a staircase at
 * the end of a corridor looks like the end of a corridor. So the way out says
 * what it is, in the office rather than in a panel over it - the instruction
 * is a thing bolted to the ceiling that you walk under, like the one in the
 * building you are sitting in.
 *
 * It hangs off the item rather than off anything in the map, so every office
 * with stairs gets one without the map having to say so twice, and an office
 * drawn before there were stairs gets neither.
 */
export const EXIT_SIGN = {
  texture: 'exit_sign',
  file: 'assets/items/exit_sign.png',
  /**
   * How far above the top step it hangs.
   *
   * A tile and a half, which is enough that somebody standing at the foot of
   * the stairs is not wearing it - their name floats over their head, and at
   * any less than this the two overlap.
   */
  gap: 48,
}

/** every item type, in a stable order both sides agree on */
export const ITEM_TYPES: ItemType[] = [
  ItemType.CHAIR,
  ItemType.COMPUTER,
  ItemType.WHITEBOARD,
  ItemType.VENDINGMACHINE,
  ItemType.EXIT,
]

/** the types the server keeps connected-user state for */
export const SHARED_ITEM_TYPES = ITEM_TYPES.filter((type) => ITEM_SPECS[type].shared)
