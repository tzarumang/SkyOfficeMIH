import Phaser from 'phaser'
import {
  AudioPolicy,
  DEFAULT_AUDIO_POLICY,
  Zone,
  ZONE_AUDIO_PROPERTY,
  ZONE_LAYER_NAME,
  isAudioPolicy,
  zoneContains,
} from '../../../types/Zones'

interface Positioned {
  x: number
  y: number
}

/**
 * Holds the zones of the map currently being played and answers the two
 * questions the audio rules need: may these two players be connected at all,
 * and are they in a room that keeps them connected once they are.
 */
export class ZoneManager {
  private zones: Zone[] = []

  load(map: Phaser.Tilemaps.Tilemap) {
    this.zones = []

    // A map without the layer is proximity chat everywhere, which is what every
    // map did before zones existed.
    const layer = map.getObjectLayer(ZONE_LAYER_NAME)
    if (!layer) return

    layer.objects.forEach((object) => {
      const { x, y, width, height } = object
      if (x === undefined || y === undefined || !width || !height) return

      // Tiled anchors a rectangle object at its top left corner, unlike the
      // tile objects the items are built from, which hang from their bottom
      // left. Reading a zone with the item math would slide it a room upwards.
      this.zones.push({
        name: object.name || 'zone',
        audio: readAudioPolicy(object),
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
      })
    })
  }

  /** zones are not allowed to overlap, so the first hit is the only hit */
  zoneAt(x: number, y: number) {
    return this.zones.find((zone) => zoneContains(zone, x, y))
  }

  /**
   * True while both players stand in the same zone that pools its audio. This
   * is what lets a meeting spread out around a table without the calls
   * dropping the moment two people are more than a few tiles apart.
   */
  sharesRoomAudio(a: Positioned, b: Positioned) {
    const zone = this.zoneAt(a.x, a.y)
    if (!zone || zone.audio === 'proximity') return false

    return zone === this.zoneAt(b.x, b.y)
  }

  /**
   * True when a sealed room stands between the two. Standing right at the
   * doorway of a private office is not enough to be heard inside it - one of
   * them has to actually be in the room with the other.
   */
  sealedApart(a: Positioned, b: Positioned) {
    const zoneA = this.zoneAt(a.x, a.y)
    const zoneB = this.zoneAt(b.x, b.y)
    if (zoneA === zoneB) return false

    return isSealed(zoneA) || isSealed(zoneB)
  }
}

function isSealed(zone?: Zone) {
  return zone?.audio === 'room-sealed'
}

function readAudioPolicy(object: Phaser.Types.Tilemaps.TiledObject): AudioPolicy {
  const property = object.properties?.find(
    (candidate: { name: string }) => candidate.name === ZONE_AUDIO_PROPERTY
  )
  if (property === undefined) return DEFAULT_AUDIO_POLICY

  if (!isAudioPolicy(property.value)) {
    console.warn(
      `Zone "${object.name}" has an unknown ${ZONE_AUDIO_PROPERTY} policy ` +
        `"${property.value}" - falling back to ${DEFAULT_AUDIO_POLICY}.`
    )
    return DEFAULT_AUDIO_POLICY
  }

  return property.value
}

/** one map is loaded at a time, so the scene and the players can share this */
export const zoneManager = new ZoneManager()
