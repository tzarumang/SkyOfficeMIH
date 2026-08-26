import Phaser from 'phaser'
import {
  PET_CATCHUP_DISTANCE,
  PET_FOLLOW_DISTANCE,
  PetDescriptor,
  petTextureKey,
} from '../../../types/Pet'
import { ensurePetTexture } from '../avatars/petFactory'

/** a pet moves a little faster than its owner, so it can catch up */
const SPEED = 240

/**
 * Follows one player around. Nothing about a pet is networked beyond its
 * owner's descriptor: every client knows where the owner is, so every client
 * draws the pet in the same place without a byte of extra traffic.
 */
export default class Pet extends Phaser.GameObjects.Sprite {
  private descriptor: PetDescriptor
  private facing: 'up' | 'down' | 'left' | 'right' = 'down'

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
