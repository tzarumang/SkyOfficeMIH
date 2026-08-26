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
  // A training room is walled and floored like a meeting room - it is the same
  // kind of space, and borrowing the style keeps the two reading as one office
  // rather than as rooms from different buildings.
  training: { wallRows: [930, 994], skirt: 2319, floor: 2383 },
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

/**
 * The production floor uses a different chair from the meeting rooms - the
 * one the hand-drawn floor seats its desk banks with, map rows 14 and 17.
 */
export const DESK_CHAIRS: Partial<Record<ChairDirection, number>> = { down: 2568, up: 2572 }

/**
 * The tub chairs the corridor of the hand-drawn map is lined with, map row 12
 * at columns 7-9 and 15-18. Two of them, in runs, so a long wall of seating is
 * not one chair repeated.
 */
export const HALL_CHAIRS = [2573, 2574]

/** and the private office uses a third: the same chair seen from the side */
export const OFFICE_CHAIR = 2569

/** five screens, so a bank of desks is not obviously repeating */
export const COMPUTER_GIDS = [4680, 4681, 4682, 4683, 4684]
export const WHITEBOARD_GIDS = [4685, 4686, 4687]
export const VENDING_GID = 5488

/**
 * The screen a training room is arranged around.
 *
 * It sits on the Computer layer and the server counts it as one, because that
 * is exactly what it is: the same key, the same sharing, the same bookkeeping.
 * Only the picture differs, and the gid is what says so - it belongs to the
 * screen tileset rather than the computer one, and the client draws whichever
 * sheet the gid came from.
 */
export const SCREEN_GID = 5489

/**
 * The unit the production floor is built out of. Zooming right into the bank
 * on the hand-drawn map, at columns 30-38 rows 14-17, it is three pieces and
 * not one, which is what took so long to see:
 *
 *   row y-1   the far desk's back edge, and the chair of whoever sits at it
 *   row y     the glass partition, with the far desk's front behind it
 *   row y+1   the near desk
 *   row y+2   the chair of whoever sits at the near desk
 *
 * So a bench seats two people back to back, but they do not share one desk
 * sprite - each has their own, and the partition is what stands between them.
 * Drawing a bench for a seat nobody has been given is what leaves a desk with
 * no chair at it.
 */
export const BENCH_NEAR_DESK: Prefab = prefab('ObjectsOnCollide', [
  [3039, 3040, 3041],
  [3055, 3056, 3057],
])

/**
 * The desk on the other side of the partition. Only its back edge and its
 * front are drawn: the surface between them would be behind the partition, so
 * the map leaves it out. Two of them, so a bank is not one desk repeated.
 */
export const BENCH_FAR_DESK: Prefab[] = [
  prefab(
    'Objects',
    [[2585, 2586, 2587]],
    [
      { gid: 2617, dx: 0, dy: 1, layer: 'ObjectsOnCollide' },
      { gid: 2618, dx: 1, dy: 1, layer: 'ObjectsOnCollide' },
      { gid: 2619, dx: 2, dy: 1, layer: 'ObjectsOnCollide' },
    ]
  ),
  prefab(
    'Objects',
    [[2590, 2591, 2592]],
    [
      { gid: 2622, dx: 0, dy: 1, layer: 'ObjectsOnCollide' },
      { gid: 2623, dx: 1, dy: 1, layer: 'ObjectsOnCollide' },
      { gid: 2624, dx: 2, dy: 1, layer: 'ObjectsOnCollide' },
    ]
  ),
]

/**
 * The glass screen the two desks of a bench back onto. The third tile carries
 * the post at its right-hand end, so benches placed shoulder to shoulder end
 * up with a post between each pair without one being asked for.
 */
export const BENCH_PARTITION: Prefab = prefab('ObjectsOnCollide', [
  [3017, 3018, 3019],
  [3033, 3034, 3035],
])

/** the top of that post, which stands a row above the glass */
export const BENCH_POST_TOP = 3003

/** the post that closes the open end of a run of benches, map column 29 */
export const BENCH_END_POST = prefab('Objects', [[3000], [3016], [3032]])

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

/**
 * Pieces the revamped tileset brought with it.
 *
 * Version 1.2 of the artist's Modern Office pack fills in slots that were blank
 * in the copy this project shipped - 66 of them, every existing tile left
 * untouched - so these are new furniture rather than a redraw of old furniture.
 * Read off the sheet the same way as everything else here: rows 38 to 42 of the
 * Modern Office tileset, which used to be empty.
 */

/** a drinks counter: water on one side, coffee on the other, in two wood tones */
export const DRINKS_COUNTERS: Prefab[] = [
  prefab('ObjectsOnCollide', [
    [3200, 3201],
    [3216, 3217],
  ]),
  prefab('ObjectsOnCollide', [
    [3202, 3203],
    [3218, 3219],
  ]),
]

/** the office printer, its paper tray beside it */
export const PRINTERS: Prefab[] = [
  prefab('ObjectsOnCollide', [[3264, 3265]]),
  prefab('ObjectsOnCollide', [[3266, 3267]]),
]

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

/**
 * The tall plant that stands between the runs of chairs in that corridor, map
 * column 6 rows 10-12. Its pot is the only part of it you bump into.
 */
export const HALL_PLANT: Prefab = {
  width: 1,
  height: 3,
  parts: [
    { gid: 2782, dx: 0, dy: 0, layer: 'Objects' },
    { gid: 2798, dx: 0, dy: 1, layer: 'Objects' },
    { gid: 2814, dx: 0, dy: 2, layer: 'ObjectsOnCollide' },
  ],
}

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

/**
 * Things hung on a wall, from the wall bands of the hand-drawn map. They go on
 * the Objects layer, which nothing collides with - the wall behind them already
 * stops a player, and a picture you can bump into is a picture in the room.
 */
export const WALL_ART: Prefab[] = [
  // framed pictures, map columns 22-23 and 32-33 of the private office wall
  prefab('Objects', [
    [2776, 2777],
    [2792, 2793],
  ]),
  prefab('Objects', [
    [2783, 2784],
    [2799, 2800],
  ]),
  // narrow ones: a notice, a mirror, a clock
  prefab('Objects', [[2751], [2767]]),
  prefab('Objects', [[2752], [2768]]),
  prefab('Objects', [[2599], [2615]]),
  prefab('Objects', [[2798], [2814]]),
]

/**
 * What is left lying on a desk that has no screen on it: a lamp, a laptop.
 * Single tiles, dropped on the surface - the hand-drawn floor puts a lamp on
 * one desk and papers on another, and that is most of why its desks read as
 * somebody's rather than as furniture. Map row 15 column 36, and row 16
 * column 38.
 */
export const DESK_CLUTTER = [2835, 2837, 2839, 2869, 2871]

/** the printer everybody walks to, map columns 25-26 rows 26-28 */
export const PRINTER: Prefab = {
  width: 2,
  height: 3,
  parts: [
    { gid: 2880, dx: 0, dy: 0, layer: 'Objects' },
    { gid: 2881, dx: 1, dy: 0, layer: 'Objects' },
    { gid: 2878, dx: 0, dy: 1, layer: 'Objects' },
    { gid: 2879, dx: 1, dy: 1, layer: 'Objects' },
    { gid: 2896, dx: 0, dy: 1, layer: 'ObjectsOnCollide' },
    { gid: 2897, dx: 1, dy: 1, layer: 'ObjectsOnCollide' },
    { gid: 2894, dx: 0, dy: 2, layer: 'ObjectsOnCollide' },
    { gid: 2895, dx: 1, dy: 2, layer: 'ObjectsOnCollide' },
  ],
}

/** the stack of boxes nobody has unpacked, map columns 36-38 rows 27-28 */
export const BOXES: Prefab = {
  width: 3,
  height: 2,
  parts: [
    { gid: 4388, dx: 2, dy: 0, layer: 'GenericObjectsOnCollide' },
    { gid: 4389, dx: 0, dy: 1, layer: 'GenericObjectsOnCollide' },
    { gid: 4405, dx: 1, dy: 1, layer: 'GenericObjectsOnCollide' },
    { gid: 4404, dx: 2, dy: 1, layer: 'GenericObjectsOnCollide' },
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
  screen: 5489,
}
