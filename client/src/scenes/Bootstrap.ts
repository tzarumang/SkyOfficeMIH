import Phaser from 'phaser'
import Network from '../services/Network'
import { BackgroundMode } from '../../../types/BackgroundMode'
import { ITEM_SPECS, ITEM_TYPES } from '../../../types/Items'
import { TILESETS } from '../../../types/MapLayers'
import store from '../stores'
import { setRoomJoined } from '../stores/RoomStore'
import { setLoggedIn } from '../stores/UserStore'
import { leftOffice } from '../stores/leftOffice'
import { OfficeMapUnavailable } from '../joinErrors'

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
    const sheets = [
      ...TILESETS,
      ...ITEM_TYPES.flatMap((itemType) => [
        ITEM_SPECS[itemType],
        ...(ITEM_SPECS[itemType].alternates ?? []),
      ]),
    ]
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

    this.scene.launch('game', {
      network: this.network,
      mapKey,
    })

    // Asked for after the scene is on its way, not before: granting camera
    // permission on a previous visit means the stream can arrive at once, and
    // whoever it is announced to has to exist by then. The scene reads the
    // answer out of the store as well, because `launch` only queues a start.
    this.network.webRTC?.checkPreviousPermission()

    // update Redux state
    store.dispatch(setRoomJoined(true))
  }

  /**
   * The tilemap cache key for this office, fetching it if it is new.
   *
   * Keyed by the drawing as well as the office, because Phaser's cache is
   * the third place a stale copy can hide - after the browser's and the
   * server's - and an office id alone cannot tell one drawing of an office
   * from another.
   */
  private async loadOfficeMap(id: string): Promise<string> {
    if (!id) return 'tilemap'

    const version = await this.network.drawingVersion()
    const key = version ? `tilemap-${id}-${version}` : `tilemap-${id}`
    if (this.cache.tilemap.has(key)) return key

    return new Promise((resolve, reject) => {
      this.load.tilemapTiledJSON(key, this.network.officeMapUrl(id, version))
      this.load.once('complete', () => {
        // Falling back to the office that ships with the client would draw a
        // building the server is not running, so this has to fail instead.
        if (this.cache.tilemap.has(key)) return resolve(key)
        reject(new OfficeMapUnavailable(id))
      })
      this.load.start()
    })
  }

  /**
   * Walks the player out of the office they are in and into the public lobby,
   * which is where the stairs of an office of somebody's own lead.
   *
   * They stay logged in on the way: nobody left the app, so being asked for a
   * name and a face again would read as having been thrown out of it. The
   * game scene puts the player back together on the other side - see
   * Game.restorePlayer().
   */
  async returnToLobby() {
    await this.leaveOffice()
    await this.network.joinOrCreatePublic()
    await this.launchGame()
  }

  /**
   * The lobby's own way out, which is all the way out: back to the list of
   * offices, which until now could only be reached by reloading the page.
   *
   * This is the one exit that does log the player out, because the next thing
   * they do is choose somewhere else to be, and that has its own login screen.
   * The listing is rejoined because joining a room drops it - see
   * Network.initialize() - so without this the room list would be whatever it
   * happened to say when this player first arrived.
   */
  async returnToRoomSelection() {
    await this.leaveOffice()
    store.dispatch(setLoggedIn(false))
    await this.network.joinLobbyRoom()
  }

  /**
   * The part both ways out share.
   *
   * The scene is stopped before the room is left rather than after, so that it
   * is not drawing people out of state that is in the middle of being
   * disconnected. Everything the office was is forgotten last, once there is
   * nothing left running that could put any of it back.
   */
  private async leaveOffice() {
    this.scene.stop('game')
    await this.network.leaveRoom()
    store.dispatch(leftOffice())
  }

  changeBackgroundMode(backgroundMode: BackgroundMode) {
    this.scene.stop('background')
    this.launchBackground(backgroundMode)
  }
}
