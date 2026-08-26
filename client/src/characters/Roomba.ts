import Phaser from 'phaser'
import { ROOMBA_EARSHOT } from '../../../types/Roomba'
import { ensureRoombaTexture, ROOMBA_TEXTURE } from '../avatars/roombaFactory'
import { volumeForDistance } from '../avatars/petVoice'
import RoombaHum from '../avatars/roombaHum'
import store from '../stores'

/**
 * How quickly it catches up to where the server says it is. The server moves
 * it ten times a second and the client draws sixty, so what is on screen is
 * always easing towards the last position that arrived rather than jumping to
 * it - the same thing the other players' sprites do.
 */
const SMOOTHING_MS = 70

/**
 * The office cleaning robot. It belongs to the room rather than to a player,
 * so unlike a pet it is not something each client works out for itself: the
 * server drives it and this draws whatever it is told.
 */
export default class Roomba extends Phaser.GameObjects.Sprite {
  private targetX: number
  private targetY: number
  private targetAngle: number
  private hum = new RoombaHum()

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number) {
    ensureRoombaTexture(scene)
    super(scene, x, y, ROOMBA_TEXTURE)

    this.targetX = x
    this.targetY = y
    this.targetAngle = angle
    this.rotation = angle
    this.play(`${ROOMBA_TEXTURE}_clean`, true)
    scene.add.existing(this)
  }

  /** where the server last said it was */
  moveTo(x: number, y: number, angle: number) {
    this.targetX = x
    this.targetY = y
    this.targetAngle = angle
  }

  update(delta: number, listenerX: number, listenerY: number) {
    // easing rather than a fixed step, so a late update is caught up smoothly
    // however far behind it has fallen
    const t = 1 - Math.exp(-delta / SMOOTHING_MS)
    this.x += (this.targetX - this.x) * t
    this.y += (this.targetY - this.y) * t

    // turn the short way round, or it spins the long way past the wrap point
    let turn = (this.targetAngle - this.rotation) % (Math.PI * 2)
    if (turn > Math.PI) turn -= Math.PI * 2
    if (turn < -Math.PI) turn += Math.PI * 2
    this.rotation += turn * t

    // it is on the floor, so it passes under whoever is standing there
    this.setDepth(this.y - 1)

    if (!store.getState().user.ambientSounds) {
      this.hum.set(0)
      return
    }

    const distance = Math.hypot(listenerX - this.x, listenerY - this.y)
    this.hum.set(volumeForDistance(distance, ROOMBA_EARSHOT))
  }

  destroy(fromScene?: boolean) {
    this.hum.stop()
    super.destroy(fromScene)
  }
}
