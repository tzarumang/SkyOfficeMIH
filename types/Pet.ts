/**
 * A pet belongs to a person, not to the office, so nothing about it needs to be
 * simulated or broadcast: every client already knows where its owner is, and
 * draws the pet trailing them. All that travels is this descriptor, the same
 * way an avatar does.
 */
export type PetKind = 'd' | 'c' | 'b'

export const PETS: { value: PetKind; label: string }[] = [
  { value: 'd', label: 'Dog' },
  { value: 'c', label: 'Cat' },
  { value: 'b', label: 'Bird' },
]

/**
 * The coats a pet can wear. Kept here rather than beside the drawing code so
 * the picker and the sprite read the same list, and one cannot drift from the
 * other. Each is a light shade and the darker one used for its markings.
 */
export const COATS: { label: string; light: string; dark: string }[] = [
  { label: 'Brown', light: '#8a5a34', dark: '#6b4526' },
  { label: 'Black', light: '#3b332c', dark: '#241e19' },
  { label: 'Cream', light: '#d8d0c0', dark: '#b0a795' },
  { label: 'Ginger', light: '#c96b3d', dark: '#a3532c' },
  { label: 'Grey', light: '#8c8c8c', dark: '#6e6e6e' },
  { label: 'Blue', light: '#4a90d9', dark: '#3670ad' },
  { label: 'Green', light: '#5ac96b', dark: '#46a153' },
  { label: 'Yellow', light: '#d9c04a', dark: '#ad9736' },
]

/** e.g. "c304b1e0" - kind, then the coat, then the seed that varies its voice */
export type PetDescriptor = string

export const PET_PATTERN = /^[dcb][0-9a-f]{7}$/
/** the empty string means no pet, which is the default */
export const NO_PET = ''

export function buildPet(kind: PetKind, coat: number, seed: number): PetDescriptor {
  const index = Math.max(0, Math.min(COATS.length - 1, Math.floor(coat)))
  return `${kind}${index.toString(16)}${(seed >>> 0).toString(16).padStart(6, '0').slice(-6)}`
}

export function isPet(value: unknown): value is PetDescriptor {
  return typeof value === 'string' && (value === NO_PET || PET_PATTERN.test(value))
}

export function hasPet(value: unknown): value is PetDescriptor {
  return typeof value === 'string' && PET_PATTERN.test(value)
}

export function petKindOf(pet: PetDescriptor): PetKind {
  return (pet[0] as PetKind) || 'd'
}

/** falls back to the first coat if a descriptor names one that no longer exists */
export function petCoatOf(pet: PetDescriptor) {
  const index = parseInt(pet.slice(1, 2), 16)
  return COATS[index] ? index : 0
}

export function petSeedOf(pet: PetDescriptor): number {
  return parseInt(pet.slice(2), 16) || 0
}

export function petTextureKey(pet: PetDescriptor) {
  return `pet${pet}`
}

/** how far behind its owner a pet settles, in pixels */
export const PET_FOLLOW_DISTANCE = 26
/** it only bothers moving once the owner is further away than this */
export const PET_CATCHUP_DISTANCE = 34
