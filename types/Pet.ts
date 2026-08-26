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

/** e.g. "c4b1e0" - one character of kind, then the seed that colours it */
export type PetDescriptor = string

export const PET_PATTERN = /^[dcb][0-9a-f]{6}$/
/** the empty string means no pet, which is the default */
export const NO_PET = ''

export function buildPet(kind: PetKind, seed: number): PetDescriptor {
  return `${kind}${(seed >>> 0).toString(16).padStart(6, '0').slice(-6)}`
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

export function petSeedOf(pet: PetDescriptor): number {
  return parseInt(pet.slice(1), 16) || 0
}

export function petTextureKey(pet: PetDescriptor) {
  return `pet${pet}`
}

/** how far behind its owner a pet settles, in pixels */
export const PET_FOLLOW_DISTANCE = 26
/** it only bothers moving once the owner is further away than this */
export const PET_CATCHUP_DISTANCE = 34
