import Phaser from 'phaser'
import { BackgroundMode } from '../../../types/BackgroundMode'

export default class Background extends Phaser.Scene {
  private cloud!: Phaser.Physics.Arcade.Group
  private cloudKey!: string
  private backdropKey!: string
  private backdrop!: Phaser.GameObjects.Image
  private sunMoon!: Phaser.GameObjects.Image

  constructor() {
    super('background')
  }

  create(data: { backgroundMode: BackgroundMode }) {
    const sceneHeight = this.cameras.main.height
    const sceneWidth = this.cameras.main.width

    // set texture of images based on the background mode
    if (data.backgroundMode === BackgroundMode.DAY) {
      this.backdropKey = 'backdrop_day'
      this.cloudKey = 'cloud_day'
      this.cameras.main.setBackgroundColor('#c6eefc')
    } else {
      this.backdropKey = 'backdrop_night'
      this.cloudKey = 'cloud_night'
      this.cameras.main.setBackgroundColor('#2c4464')
    }

    this.backdrop = this.add.image(0, 0, this.backdropKey).setScrollFactor(0)
    this.sunMoon = this.add.image(0, 0, 'sun_moon').setScrollFactor(0)
    this.fitToScreen()

    /**
     * The sky is sized to the window, so it has to be sized again when the
     * window changes. Without this it keeps whatever size it was built at and
     * a wider window shows the camera's flat backing colour beside it, with a
     * hard seam where the picture stops.
     */
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitToScreen, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitToScreen, this)
    })

    // Add 24 clouds at random positions and with random speeds
    const frames = this.textures.get(this.cloudKey).getFrameNames()
    this.cloud = this.physics.add.group()
    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.RND.between(-sceneWidth * 0.5, sceneWidth * 1.5)
      const y = Phaser.Math.RND.between(sceneHeight * 0.2, sceneHeight * 0.8)
      const velocity = Phaser.Math.RND.between(15, 30)

      this.cloud
        .get(x, y, this.cloudKey, frames[i % 6])
        .setScale(3)
        .setVelocity(velocity, 0)
    }
  }

  /** centres the sky and scales it to cover whatever the window is now */
  private fitToScreen() {
    const width = this.scale.width
    const height = this.scale.height

    for (const image of [this.backdrop, this.sunMoon]) {
      if (!image) continue
      const scale = Math.max(width / image.width, height / image.height)
      image.setPosition(width / 2, height / 2).setScale(scale)
    }
  }

  update(_t: number, _dt: number) {
    this.physics.world.wrap(this.cloud, 500)
  }
}
