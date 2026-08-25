/**
 * Tiled's way of saying "this one is drawn the other way round".
 *
 * A tile object's gid is not only a tile id: the top three bits are flags, and
 * the highest of them means the tile is mirrored left to right. It is the only
 * way to place a piece of furniture whose sprite exists in one handedness only
 * - the L-shaped desk in the private office being the case that forced it,
 * since whoever sits at it sits on its right, and half the rooms need them
 * sitting on its left instead.
 *
 * The flag is added rather than or-ed because `|` in JavaScript works on signed
 * 32-bit integers, and 0x80000000 or-ed onto anything comes back negative -
 * which is not what belongs in the JSON.
 */

export const FLIP_HORIZONTAL = 0x80000000

/** the tile id inside a gid, with any flip flags taken back off */
export function bareGid(gid: number): number {
  return gid & 0x1fffffff
}

export function withFlipX(gid: number, flipped: boolean | undefined): number {
  return flipped ? gid + FLIP_HORIZONTAL : gid
}
