/**
 * What an office is made of, as the person creating it asked for it.
 *
 * The seed decides how the rooms are arranged and where the furniture lands;
 * this decides how much of everything there is. Two people asking for the same
 * office get buildings of the same size with the same contents, laid out
 * differently - and an office that is mostly empty floor is now something you
 * asked for rather than something the generator did to you.
 */
export interface OfficeSpec {
  /** everyone inside hears everyone, however far apart they stand */
  meetingRooms: number
  /** sealed: nothing said inside is heard outside, and vice versa */
  oneOnOneRooms: number
  /** desks on the production floor with a screen you can share */
  computerDesks: number
  /** desks on the production floor without one */
  plainDesks: number
  /** a vending machine and somewhere to sit */
  lounges: number
  /** rows of chairs facing a screen anyone in the room can share to */
  trainingRooms: number
}

export interface OfficeSpecField {
  key: keyof OfficeSpec
  label: string
  hint: string
  max: number
}

/**
 * The caps are not arbitrary. Every computer is a screen share the server keeps
 * state for, every room is a zone the client tests every frame, and the
 * building grows to hold whatever is asked for - so all three have a ceiling.
 */
export const OFFICE_SPEC_FIELDS: OfficeSpecField[] = [
  {
    key: 'meetingRooms',
    label: 'Multi-purpose meeting rooms',
    hint: 'A table with chairs. Everyone in the room hears everyone.',
    max: 6,
  },
  {
    key: 'oneOnOneRooms',
    label: '1-on-1 rooms',
    hint: 'A desk and a board, sealed off from the rest of the office.',
    max: 6,
  },
  {
    key: 'computerDesks',
    label: 'Desks with a computer',
    hint: 'Each one can host a screen share.',
    max: 12,
  },
  {
    key: 'plainDesks',
    label: 'Desks without a computer',
    hint: 'The rest of the production floor.',
    max: 40,
  },
  {
    key: 'lounges',
    label: 'Lounges',
    hint: 'A vending machine and a few tables.',
    max: 3,
  },
  {
    key: 'trainingRooms',
    label: 'Training rooms',
    hint: 'Rows of chairs facing a screen anyone can share to.',
    max: 3,
  },
]

/** roughly the office that ships with the client */
export const DEFAULT_OFFICE_SPEC: OfficeSpec = {
  meetingRooms: 1,
  oneOnOneRooms: 1,
  computerDesks: 5,
  plainDesks: 10,
  lounges: 1,
  trainingRooms: 0,
}

function clampCount(value: unknown, max: number) {
  const count = Math.floor(Number(value))
  if (!Number.isFinite(count) || count < 0) return 0
  return Math.min(count, max)
}

/**
 * The options come from a client, so nothing here is trusted. An office with no
 * rooms at all would leave the corridor running past a blank wall, so the last
 * clamp is that there is always somewhere to go.
 */
export function clampOfficeSpec(input: Partial<OfficeSpec> | undefined | null): OfficeSpec {
  const spec = {} as OfficeSpec
  for (const field of OFFICE_SPEC_FIELDS) {
    spec[field.key] = clampCount(input?.[field.key], field.max)
  }

  if (spec.meetingRooms + spec.oneOnOneRooms + spec.lounges + spec.trainingRooms === 0) {
    spec.lounges = 1
  }
  return spec
}

export function totalDesks(spec: OfficeSpec) {
  return spec.computerDesks + spec.plainDesks
}

export function totalRooms(spec: OfficeSpec) {
  return spec.meetingRooms + spec.oneOnOneRooms + spec.lounges + spec.trainingRooms
}

/**
 * A whole office in one short string: which seed, and how much of everything.
 *
 * The client fetches the drawing over http, and the drawing depends on both, so
 * both have to travel together. Keeping it to digits and dashes means the id is
 * a URL, a cache key and a stored record without any encoding in between.
 */
export function encodeOfficeId(seed: number, spec: OfficeSpec) {
  return [
    seed,
    spec.meetingRooms,
    spec.oneOnOneRooms,
    spec.computerDesks,
    spec.plainDesks,
    spec.lounges,
    spec.trainingRooms,
  ].join('-')
}

/**
 * Five counts, or six.
 *
 * Training rooms arrived after offices had already been recorded with their
 * ids, and an office with a lifetime is found by that id. The sixth count is
 * optional so those ids still parse - an office written before training rooms
 * existed simply has none.
 */
export const OFFICE_ID_PATTERN = /^\d{1,10}(-\d{1,2}){5,6}$/

export function parseOfficeId(id: unknown): { seed: number; spec: OfficeSpec } | null {
  if (typeof id !== 'string' || !OFFICE_ID_PATTERN.test(id)) return null

  const [seed, meetingRooms, oneOnOneRooms, computerDesks, plainDesks, lounges, trainingRooms] =
    id.split('-').map(Number)

  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null

  return {
    seed,
    spec: clampOfficeSpec({
      meetingRooms,
      oneOnOneRooms,
      computerDesks,
      plainDesks,
      lounges,
      trainingRooms: trainingRooms ?? 0,
    }),
  }
}
