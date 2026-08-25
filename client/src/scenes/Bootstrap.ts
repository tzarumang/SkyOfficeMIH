import Phaser from 'phaser'
import Network from '../services/Network'
import { BackgroundMode } from '../../../types/BackgroundMode'
import { ITEM_SPECS, ITEM_TYPES } from '../../../types/Items'
import { TILESETS } from '../../../types/MapLayers'
import store from '../stores'
import { setRoomJoined } from '../stores/RoomStore'

export default class Bootstrap extends Phaser.Scene {
  private preloadComplete = false
  network!: Network

  constructor() {
    super('bootstrap')
  }

  preload() {
    this.load.atlas(
      'cloud_day',
      'assets/background/cloud_day.png',
      'assets/background/cloud_day.json'
    )
    this.load.image('backdrop_day', 'assets/background/backdrop_day.png')
    this.load.atlas(
      'cloud_night',
      'assets/background/cloud_night.png',
      'assets/background/cloud_night.json'
    )
    this.load.image('backdrop_night', 'assets/background/backdrop_night.png')
    this.load.image('sun_moon', 'assets/background/sun_moon.png')

    this.load.tilemapTiledJSON('tilemap', 'assets/map/map.json')

    // the map's scenery and its items each name their own artwork
    const sheets = [...TILESETS, ...ITEM_TYPES.map((itemType) => ITEM_SPECS[itemType])]
    sheets.forEach(({ texture, file, frameWidth, frameHeight }) => {
      this.load.spritesheet(texture, file, { frameWidth, frameHeight })
    })

    this.load.spritesheet('adam', 'assets/character/adam.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('ash', 'assets/character/ash.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('lucy', 'assets/character/lucy.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('nancy', 'assets/character/nancy.png', {
      frameWidth: 32,
      frameHeight: 48,
    })

    this.load.once('complete', () => {
      this.preloadComplete = true
      this.launchBackground(store.getState().user.backgroundMode)
    })
  }

  init() {
    this.network = new Network()
  }

  private launchBackground(backgroundMode: BackgroundMode) {
    this.scene.launch('background', { backgroundMode })
  }

  /**
   * Every office is its own map now, so which one to draw is only known once
   * the room has been joined. The game scene does not start until it is here:
   * starting on the wrong floor plan would put the furniture in places the
   * server does not believe in.
   */
  async launchGame() {
    if (!this.preloadComplete) return

    const mapKey = await this.loadOfficeMap(await this.network.officeId())

    this.network.webRTC?.checkPreviousPermission()
    this.scene.launch('game', {
      network: this.network,
      mapKey,
    })

    // update Redux state
    store.dispatch(setRoomJoined(true))
  }

  /** the tilemap cache key for this office, fetching it if it is new */
  private loadOfficeMap(id: string): Promise<string> {
    if (!id) return Promise.resolve('tilemap')

    const key = `tilemap-${id}`
    if (this.cache.tilemap.has(key)) return Promise.resolve(key)

    return new Promise((resolve, reject) => {
      this.load.tilemapTiledJSON(key, this.network.officeMapUrl(id))
      this.load.once('complete', () => {
        // Falling back to the office that ships with the client would draw a
        // building the server is not running, so this has to fail instead.
        if (this.cache.tilemap.has(key)) return resolve(key)
        reject(new Error(`Could not load the floor plan for office ${id}.`))
      })
      this.load.start()
    })
  }

  changeBackgroundMode(backgroundMode: BackgroundMode) {
    this.scene.stop('background')
    this.launchBackground(backgroundMode)
  }
}
