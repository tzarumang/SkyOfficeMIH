/**
 * Where a player appears in an office.
 *
 * A generated building is whatever size its contents need, so it records its
 * own spawn in the map's properties. The hand-drawn office has no properties at
 * all, and the two sides of the app are handed that absence differently: the
 * server parses the JSON and gets `undefined`, while Phaser defaults it to an
 * empty *object* rather than an empty list. Reading it in one place, from
 * whatever shape turns up, is what stops that difference becoming a crash.
 */

/** the spot the hand-drawn office has always used */
export const CLASSIC_SPAWN = { x: 705, y: 500 }

interface TiledProperty {
  name?: string
  value?: unknown
}

export function readSpawn(properties: unknown): { x: number; y: number } {
  const list: TiledProperty[] = Array.isArray(properties) ? properties : []
  const read = (name: string) => Number(list.find((property) => property?.name === name)?.value)

  const x = read('spawnX')
  const y = read('spawnY')
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : CLASSIC_SPAWN
}

export const SPAWN_X_PROPERTY = 'spawnX'
export const SPAWN_Y_PROPERTY = 'spawnY'
