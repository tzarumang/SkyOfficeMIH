import Phaser from 'phaser'
import {
  PET_CATCHUP_DISTANCE,
  PET_FOLLOW_DISTANCE,
  PetDescriptor,
  petTextureKey,
} from '../../../types/Pet'
import { ensurePetTexture } from '../avatars/petFactory'
import { playPetVoice, volumeForDistance } from '../avatars/petVoice'
import { petKindOf, petSeedOf } from '../../../types/Pet'
import store from '../stores'

/** a pet moves a little faster than its owner, so it can catch up */
const SPEED = 240

/**
 * How rarely a pet speaks, and how close it has to be to be heard. Both are
 * deliberately conservative: this runs beside somebody's work all day, so a pet
 * across the office is silent and even a nearby one is occasional.
 */
const QUIET_MS = 24000
const EXTRA_QUIET_MS = 46000
const EARSHOT = 260

/**
 * Follows one player around. Nothing about a pet is networked beyond its
 * owner's descriptor: every client knows where the owner is, so every client
 * draws the pet in the same place without a byte of extra traffic.
 */
export default class Pet extends Phaser.GameObjects.Sprite {
  private descriptor: PetDescriptor
  private facing: 'up' | 'down' | 'left' | 'right' = 'down'
  private nextVoiceAt = 0

  constructor(scene: Phaser.Scene, x: number, y: number, pet: PetDescriptor) {
    super(scene, x, y, petTextureKey(pet))
    this.descriptor = pet
    ensurePetTexture(scene, pet)
    this.setTexture(petTextureKey(pet))
    this.play(`${petTextureKey(pet)}_idle_down`, true)
    scene.add.existing(this)
  }

  setPet(pet: PetDescriptor) {
    if (pet === this.descriptor) return

    this.descriptor = pet
    ensurePetTexture(this.scene, pet)
    this.setTexture(petTextureKey(pet))
    this.play(`${petTextureKey(pet)}_idle_${this.facing}`, true)
  }

  /**
   * Occasionally speaks up, if anyone is close enough to hear it and the
   * listener has not turned pets off. Volume falls away with distance, so a pet
   * on the far side of the office cannot be heard at all.
   */
  maybeSpeak(listenerX: number, listenerY: number, now: number) {
    if (this.nextVoiceAt === 0) {
      this.nextVoiceAt = now + QUIET_MS + Math.random() * EXTRA_QUIET_MS
      return
    }
    if (now < this.nextVoiceAt) return

    this.nextVoiceAt = now + QUIET_MS + Math.random() * EXTRA_QUIET_MS

    if (!store.getState().user.petSounds) return

    const distance = Math.hypot(listenerX - this.x, listenerY - this.y)
    playPetVoice(
      petKindOf(this.descriptor),
      petSeedOf(this.descriptor),
      volumeForDistance(distance, EARSHOT)
    )
  }

  /**
   * Walks toward a spot behind the owner. It stays put until the owner is far
   * enough away to be worth following, which stops it jittering when somebody
   * is standing still.
   */
  follow(ownerX: number, ownerY: number, delta: number) {
    const dx = ownerX - this.x
    const dy = ownerY - this.y
    const distance = Math.hypot(dx, dy)

    // sit behind the player rather than on top of them
    const target = distance > 0.001 ? PET_FOLLOW_DISTANCE / distance : 0
    const goalX = ownerX - dx * target
    const goalY = ownerY - dy * target

    const toGoalX = goalX - this.x
    const toGoalY = goalY - this.y
    const toGoal = Math.hypot(toGoalX, toGoalY)

    if (distance < PET_CATCHUP_DISTANCE || toGoal < 1) {
      this.play(`${petTextureKey(this.descriptor)}_idle_${this.facing}`, true)
      this.setDepth(this.y)
      return
    }

    const stride = Math.min(toGoal, (SPEED * delta) / 1000)
    this.x += (toGoalX / toGoal) * stride
    this.y += (toGoalY / toGoal) * stride

    this.facing =
      Math.abs(toGoalX) > Math.abs(toGoalY)
        ? toGoalX > 0
          ? 'right'
          : 'left'
        : toGoalY > 0
        ? 'down'
        : 'up'

    this.play(`${petTextureKey(this.descriptor)}_walk_${this.facing}`, true)
    this.setDepth(this.y)
  }
}
