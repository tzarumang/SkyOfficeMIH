import fs from 'fs'
import { Rng } from './rng'
import { buildLayout, Layout } from './layout'
import { furnish, Placement } from './furnish'
import { paint, TiledMap } from './paint'
import { Problem, validate } from './validate'
import { EXPECTED_FIRSTGIDS } from './vocabulary'
import { DEFAULT_OFFICE_SPEC, OfficeSpec, clampOfficeSpec, totalDesks } from '../../types/Office'
import { REFERENCE_MAP_PATH } from '../rooms/MapObjects'

export { Problem } from './validate'

/**
 * Builds an office from a seed.
 *
 * The result is an ordinary Tiled map: the same tilesets, the same layers and
 * the same conventions as the one someone drew by hand, so the client renders
 * it and the server reads its items without either of them being told where it
 * came from.
 */

export interface GenerateOptions {
  seed: number
  /** how much of everything the office holds; the size follows from it */
  spec?: Partial<OfficeSpec>
}

export interface GeneratedOffice {
  map: TiledMap
  layout: Layout
  placements: Placement[]
  spec: OfficeSpec
  problems: Problem[]
}

interface Tileset {
  name: string
  firstgid: number
  tilecount: number
  tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }>
}

let cachedTilesets: Tileset[] | undefined
let cachedColliding: Set<number> | undefined

/**
 * Which gids stop a player. The client works this out from the same per-tile
 * `collides` flags with setCollisionByProperty, so reading them here is asking
 * the same question the game will ask.
 */
export function collidingGids(): Set<number> {
  if (cachedColliding) return cachedColliding

  const solid = new Set<number>()
  for (const tileset of referenceTilesets()) {
    for (const tile of tileset.tiles ?? []) {
      const collides = (tile.properties ?? []).find((property) => property.name === 'collides')
      if (collides?.value) solid.add(tileset.firstgid + tile.id)
    }
  }

  cachedColliding = solid
  return solid
}

/**
 * The tileset table is copied from the reference map rather than written out
 * here, because it carries the per-tile `collides` flags the client turns into
 * collision. Writing it by hand would mean maintaining 2560 of them.
 */
export function referenceTilesets(): Tileset[] {
  if (cachedTilesets) return cachedTilesets

  const reference = JSON.parse(fs.readFileSync(REFERENCE_MAP_PATH, 'utf8'))
  const tilesets: Tileset[] = reference.tilesets

  for (const [name, firstgid] of Object.entries(EXPECTED_FIRSTGIDS)) {
    const found = tilesets.find((set) => set.name === name)
    if (!found) throw new Error(`The reference map no longer has a "${name}" tileset.`)
    if (found.firstgid !== firstgid) {
      throw new Error(
        `"${name}" now starts at gid ${found.firstgid}, not ${firstgid}. Every id in ` +
          'office/vocabulary.ts was read against the old numbering and would draw the wrong tile.'
      )
    }
  }

  cachedTilesets = tilesets
  return tilesets
}

export function generateOffice(options: GenerateOptions): GeneratedOffice {
  const rng = new Rng(options.seed)
  const spec = clampOfficeSpec(options.spec ?? DEFAULT_OFFICE_SPEC)

  const layout = buildLayout(rng, { spec })
  const placements = furnish(rng, layout, spec)
  const tilesets = referenceTilesets()
  const map = paint(layout, placements, tilesets)

  const ground = (map.layers as Array<{ name: string; data?: number[] }>).find(
    (layer) => layer.name === 'Ground'
  )
  const solid = collidingGids()
  const problems = validate(layout, placements, tilesets, {
    data: ground?.data ?? [],
    collides: (gid) => solid.has(gid),
  })

  return { map, layout, placements, spec, problems }
}

/** the same office every time, and never a broken one */
export function generateValidOffice(options: GenerateOptions): GeneratedOffice {
  const office = generateOffice(options)
  if (office.problems.length > 0) {
    const lines = office.problems.map((p) => `  - ${p.invariant}: ${p.detail}`).join('\n')
    throw new Error(`Office ${options.seed} failed its own checks:\n${lines}`)
  }
  return office
}

/** a readable summary, for the command line and the tests */
export function describe(office: GeneratedOffice) {
  const counts = new Map<string, number>()
  for (const placement of office.placements) {
    counts.set(placement.layer, (counts.get(placement.layer) ?? 0) + 1)
  }

  return {
    size: `${office.layout.width}x${office.layout.height}`,
    asked:
      `${office.spec.meetingRooms} meeting, ${office.spec.oneOnOneRooms} 1-on-1, ` +
      `${office.spec.computerDesks}+${office.spec.plainDesks} desks, ${office.spec.lounges} lounge`,
    rooms: office.layout.rooms.map((room) => `${room.name} (${room.archetype})`),
    items: Object.fromEntries([...counts].sort()),
    problems: office.problems.length,
  }
}

/**
 * What the office actually ended up holding. The generator promises to build
 * what was asked for, so this is the thing worth checking.
 */
export function contentsOf(office: GeneratedOffice) {
  const layers = new Map<string, number>()
  for (const placement of office.placements) {
    layers.set(placement.layer, (layers.get(placement.layer) ?? 0) + 1)
  }

  const roomsOfType = (archetype: string) =>
    office.layout.rooms.filter((room) => room.archetype === archetype).length

  return {
    meetingRooms: roomsOfType('conference'),
    oneOnOneRooms: roomsOfType('private'),
    lounges: roomsOfType('lounge'),
    computerDesks: layers.get('Computer') ?? 0,
    desks: office.layout.deskSlots.length,
    whiteboards: layers.get('Whiteboard') ?? 0,
  }
}
