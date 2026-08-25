import crypto from 'crypto'
import { generateOffice } from '../office'
import { TiledMap } from '../office/paint'
import { OfficeSpec, encodeOfficeId, parseOfficeId } from '../../types/Office'
import { OfficeMap, classicOfficeMap, officeMapFrom, TiledMap as ReadableMap } from './MapObjects'

/**
 * Hands out the office a room runs in.
 *
 * An office id is the whole building: the seed that arranged it and the counts
 * that sized it. The same id always grows the same office, so the server can
 * throw the drawing away and rebuild it when a client asks for the picture, and
 * an office that outlives its room comes back identical from the id recorded
 * against its slug.
 *
 * Drawing one costs a few milliseconds, which is cheap once and wasteful on
 * every join, so a bounded cache keeps the recent ones. The bound matters: the
 * id in a map request comes from whoever made it, and an unbounded cache would
 * let a stranger fill the process with offices nobody is standing in.
 */

const CACHE_LIMIT = 64

interface CachedOffice {
  map: TiledMap
  office: OfficeMap
}

const cache = new Map<string, CachedOffice>()

export function newOfficeId(spec: OfficeSpec) {
  return encodeOfficeId(crypto.randomBytes(4).readUInt32BE(0), spec)
}

/** returns the id when it names a real office, null otherwise */
export function readOfficeId(value: unknown): string | null {
  return parseOfficeId(value) ? (value as string) : null
}

function build(id: string): CachedOffice {
  const cached = cache.get(id)
  if (cached) {
    // touch it, so the offices in use are the ones that survive
    cache.delete(id)
    cache.set(id, cached)
    return cached
  }

  const parsed = parseOfficeId(id)
  if (!parsed) throw new Error(`"${id}" is not an office id.`)

  const generated = generateOffice({ seed: parsed.seed, spec: parsed.spec })
  if (generated.problems.length > 0) {
    const lines = generated.problems.map((p) => `${p.invariant}: ${p.detail}`).join('; ')
    throw new Error(`Office ${id} failed its own checks: ${lines}`)
  }

  const entry: CachedOffice = {
    map: generated.map,
    office: officeMapFrom(generated.map as unknown as ReadableMap, id),
  }

  cache.set(id, entry)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)

  return entry
}

/** the items, bounds and spawn a room needs; null id means the hand-drawn office */
export function officeMapFor(id: string | null): OfficeMap {
  return id === null ? classicOfficeMap : build(id).office
}

/** the drawing itself, for the client to render */
export function officeDrawingFor(id: string): TiledMap {
  return build(id).map
}
