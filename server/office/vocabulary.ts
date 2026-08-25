/**
 * The tiles and furniture a generated office is built from.
 *
 * Every id here was read back out of the hand-drawn map rather than counted off
 * the tileset images, so a generated office is made of the same pieces, put
 * together the same way, as the office someone drew by hand. The comments name
 * the place in map.json each one came from.
 */

export const TILE = 32

/**
 * How a room is walled and floored.
 *
 * A wall is more than one tile tall. The hand-drawn map draws its walls as a
 * cap, a body, and sometimes a walkable base at the foot of them - and a wall
 * built out of fewer rows than that reads as cut off, with the room above
 * seeming to end in mid-air.
 */
export interface RoomStyle {
  /** solid rows at the top of the room, top to bottom */
  wallRows: number[]
  /** a walkable row under the wall that reads as its foot, if the style has one */
  skirt?: number
  /** plain floor inside the room */
  floor: number
}

export const STYLES: Record<string, RoomStyle> = {
  // the production floor, map rows 8-11 at columns 25-38
  open: { wallRows: [722, 786], skirt: 348, floor: 412 },
  // the conference room, map rows 15-18 at columns 6-18
  conference: { wallRows: [930, 994], skirt: 2319, floor: 2383 },
  // the games room at the top left, map rows 4-6: a carpet and no skirt
  lounge: { wallRows: [546, 610], floor: 1607 },
  // the private office at the top right, map rows 1-4: the tallest wall of the lot
  private: { wallRows: [594, 658], skirt: 604, floor: 668 },
  // the corridor down the middle, map rows 10-13
  corridor: { wallRows: [722, 786], skirt: 351, floor: 415 },
}

/**
 * Vertical walls and the bottom of the building do not change with the room
 * style - the same gids run down every wall in the hand-drawn map.
 */
export const WALLS = {
  /** nothing outside, room inside to the right (map column 5) */
  leftEdge: 152,
  /** room inside to the left, nothing outside (map column 39) */
  rightEdge: 154,
  /** rooms on both sides (map columns 19 and 24) */
  shared: 92,
  /** a wall with floor above it and nothing below (map row 24) */
  bottom: 217,
  /** the two bottom corners (map row 24 at columns 5 and 19) */
  bottomLeft: 216,
  bottomRight: 213,
}

export const CHAIRS = { down: 2562, left: 2563, right: 2564, up: 2566 }
export type ChairDirection = keyof typeof CHAIRS

/** five screens, so a bank of desks is not obviously repeating */
export const COMPUTER_GIDS = [4680, 4681, 4682, 4683, 4684]
export const WHITEBOARD_GIDS = [4685, 4686, 4687]
export const VENDING_GID = 5488

/**
 * A desk is three tiles wide and two rows deep: a top a player walks behind,
 * and a body they bump into. Map columns 36-38, rows 14-15.
 */
export const DESK = {
  width: 3,
  top: [2585, 2586, 2587],
  body: [2617, 2618, 2619],
}

/**
 * A meeting table: a left cap, a repeating middle and a right cap, over three
 * rows. Map columns 9-15, rows 19-21.
 */
export const TABLE = {
  top: { left: 2595, middle: 2596, right: 2597 },
  middle: { left: 2611, middle: 2612, right: 2613 },
  bottom: { left: 2627, middle: 2628, right: 2629 },
}

/**
 * A piece of furniture bigger than one tile, as a list of parts placed relative
 * to its top-left corner. Copied tile for tile out of the hand-drawn map, so a
 * generated room is furnished with the same things a drawn one is.
 */
export interface Prefab {
  width: number
  height: number
  parts: Array<{ gid: number; dx: number; dy: number; layer: string }>
}

function prefab(layer: string, rows: number[][], extra: Prefab['parts'] = []): Prefab {
  const parts: Prefab['parts'] = []
  rows.forEach((row, dy) => row.forEach((gid, dx) => parts.push({ gid, dx, dy, layer })))
  return {
    width: Math.max(...rows.map((row) => row.length)),
    height: rows.length,
    parts: [...parts, ...extra],
  }
}

/** the pool table in the games room, map columns 7-10 rows 7-9 */
export const POOL_TABLE = prefab(
  'Basement',
  [
    [5092, 5093, 5094, 5095],
    [5108, 5109, 5110, 5111],
    [5124, 5125, 5126, 5127],
  ],
  // the balls, drawn over the felt
  [{ gid: 5105, dx: 1, dy: 1, layer: 'Basement' }]
)

/** the corner couch beside it, map columns 15-16 rows 7-9 */
export const COUCH = prefab(
  'Basement',
  [
    [5037, 5038],
    [5055, 5039],
    [5053, 5054],
  ],
  [
    { gid: 5061, dx: 0, dy: 0, layer: 'Basement' },
    { gid: 5062, dx: 1, dy: 0, layer: 'Basement' },
    { gid: 5077, dx: 0, dy: 1, layer: 'Basement' },
    { gid: 5078, dx: 1, dy: 1, layer: 'Basement' },
  ]
)

/** windows, from the two rooms that have one */
export const WINDOWS = [
  prefab('GenericObjects', [
    [4130, 4131],
    [4146, 4147],
  ]),
  prefab('GenericObjects', [
    [3644, 3645],
    [3660, 3661],
  ]),
]

/** a potted plant, map column 32 rows 1-2 of the private office */
export const PLANT = prefab('Objects', [[2702], [2718]])

/** the water cooler in the games room, map column 18 rows 4-6 */
export const WATER_COOLER: Prefab = {
  width: 1,
  height: 3,
  parts: [
    { gid: 2836, dx: 0, dy: 0, layer: 'Objects' },
    { gid: 2852, dx: 0, dy: 1, layer: 'Objects' },
    { gid: 2868, dx: 0, dy: 2, layer: 'ObjectsOnCollide' },
  ],
}

/** the low cabinet in the private office, map columns 19-20 rows 4-5 */
export const CABINET = prefab('ObjectsOnCollide', [
  [2918, 2919],
  [2934, 2935],
])

/** the three-seat sofa in the private office - three chair tiles side by side */
export const SOFA_SEATS = [2580, 2581, 2582]

/**
 * The L-shaped desk in the private office, map columns 29-30 rows 3-6. Its two
 * middle rows on the right are drawn behind a player, the rest in front.
 */
export const CORNER_DESK: Prefab = {
  width: 2,
  height: 4,
  parts: [
    { gid: 3326, dx: 0, dy: 0, layer: 'ObjectsOnCollide' },
    { gid: 3327, dx: 1, dy: 0, layer: 'ObjectsOnCollide' },
    { gid: 3340, dx: 0, dy: 1, layer: 'ObjectsOnCollide' },
    { gid: 3343, dx: 1, dy: 1, layer: 'Objects' },
    { gid: 3341, dx: 0, dy: 2, layer: 'ObjectsOnCollide' },
    { gid: 3342, dx: 1, dy: 2, layer: 'Objects' },
    { gid: 3357, dx: 0, dy: 3, layer: 'ObjectsOnCollide' },
    { gid: 3358, dx: 1, dy: 3, layer: 'ObjectsOnCollide' },
  ],
}

/** a bookcase against a wall, map columns 5-6 rows 15-16 */
export const BOOKCASE = prefab('Objects', [
  [2831, 2832],
  [2847, 2848],
])

/**
 * The gid a tileset must start at for the ids above to mean what they say. The
 * generator copies the tileset table out of the reference map - which also
 * carries the per-tile `collides` flags the client turns into collision - and
 * refuses to run if the firstgids ever move.
 */
export const EXPECTED_FIRSTGIDS: Record<string, number> = {
  FloorAndGround: 1,
  chair: 2561,
  Modern_Office_Black_Shadow: 2584,
  Generic: 3432,
  computer: 4680,
  whiteboard: 4685,
  Basement: 4688,
  vendingmachine: 5488,
}
