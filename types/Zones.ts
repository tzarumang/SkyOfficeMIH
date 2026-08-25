/**
 * A zone is a rectangle of the map that gives the space inside it a social
 * rule. With no zone at all two players hear each other when their proximity
 * bubbles overlap, which is the open-plan office. A zone widens that to a whole
 * room, or seals the room so nothing leaks past its walls.
 *
 * Zones are read from the "Zone" object layer of the Tiled map rather than
 * written in code, so the same mechanism serves a hand-drawn office and a
 * generated one.
 */

export const ZONE_LAYER_NAME = 'Zone'

/** custom property on a zone object naming its audio policy */
export const ZONE_AUDIO_PROPERTY = 'audio'

export type AudioPolicy =
  /** the default: players hear each other when their bubbles overlap */
  | 'proximity'
  /** everyone inside the zone hears everyone else, however far apart */
  | 'room'
  /** as 'room', and no audio crosses the boundary in either direction */
  | 'room-sealed'

export const AUDIO_POLICIES: readonly AudioPolicy[] = ['proximity', 'room', 'room-sealed']

export const DEFAULT_AUDIO_POLICY: AudioPolicy = 'proximity'

export interface Zone {
  name: string
  audio: AudioPolicy
  /** world pixels; right and bottom are exclusive */
  left: number
  top: number
  right: number
  bottom: number
}

export function isAudioPolicy(value: unknown): value is AudioPolicy {
  return typeof value === 'string' && (AUDIO_POLICIES as readonly string[]).includes(value)
}

export function zoneContains(zone: Zone, x: number, y: number) {
  return x >= zone.left && x < zone.right && y >= zone.top && y < zone.bottom
}
