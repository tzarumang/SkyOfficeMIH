/**
 * A cleaning robot belongs to the office rather than to any one person, so
 * unlike a pet it cannot be drawn from something every client already knows.
 * The server drives it and replicates where it is; these are the few numbers
 * both sides have to agree on.
 */

/** how fast it trundles, in pixels per second - a quarter of walking pace */
export const ROOMBA_SPEED = 52

/**
 * It is a disc, and this is how much room it needs. Kept deliberately tight:
 * a doorway is one tile, and a wider robot spends its life in whichever room
 * it started in rather than finding its way around the office.
 */
export const ROOMBA_RADIUS = 9

/**
 * How often the server moves it. Ten times a second is far coarser than the
 * frame rate, which is fine: the client interpolates towards wherever the
 * server last said it was, the same way it already draws other players.
 */
export const ROOMBA_TICK_MS = 100

/** past this it cannot be heard at all */
export const ROOMBA_EARSHOT = 300
