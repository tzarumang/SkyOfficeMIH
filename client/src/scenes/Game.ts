import Phaser from 'phaser'

// import { debugDraw } from '../utils/debug'
import { createCharacterAnims } from '../anims/CharacterAnims'

import Item from '../items/Item'
import Chair from '../items/Chair'
import { itemClass } from '../items'
import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import PlayerSelector from '../characters/PlayerSelector'
import Network from '../services/Network'
import { zoneManager } from '../zones/ZoneManager'
import { IPlayer } from '../../../types/IOfficeState'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { ITEM_SPECS, ITEM_TYPES, ItemSpec, ItemType } from '../../../types/Items'
import { DECOR_LAYERS, DecorLayerSpec, GROUND_LAYER } from '../../../types/MapLayers'
import { readSpawn } from '../../../types/Spawn'
import { textureFromAnim } from '../util'
import { ensureAvatarTexture } from '../avatars/spriteFactory'
import { isAvatar } from '../../../types/Avatar'
import { hasPet, PET_FOLLOW_DISTANCE } from '../../../types/Pet'
import Pet from '../characters/Pet'
import Roomba from '../characters/Roomba'
import { ensureLogoTexture } from '../logo/logoFactory'

import store from '../stores'
import { setFocused, setShowChat } from '../stores/ChatStore'
import { NavKeys, Keyboard } from '../../../types/KeyboardState'

/** custom property set on the object in Tiled */
function readProperty(object: Phaser.Types.Tilemaps.TiledObject, name: string) {
  return object.properties?.find((property: { name: string }) => property.name === name)?.value
}

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: NavKeys
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  myPlayer!: MyPlayer
  private playerSelector!: Phaser.GameObjects.Zone
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  private itemsByType = new Map<ItemType, Map<string, Item>>()
  /** one per player who has chosen one, keyed by session id */
  private pets = new Map<string, Pet>()
  private roomba?: Roomba
  private myPlayerId = ''

  constructor() {
    super('game')
  }

  /**
   * 3.90 types keyboard input as optional, because a game can be configured
   * without it. Ours is not, so assert it once here rather than at every use.
   */
  private get keyboard() {
    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('this game needs keyboard input to be enabled')
    return keyboard
  }

  registerKeys() {
    this.cursors = {
      ...this.keyboard.createCursorKeys(),
      ...(this.keyboard.addKeys('W,S,A,D') as Keyboard),
    }

    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyE = this.keyboard.addKey('E')
    this.keyR = this.keyboard.addKey('R')
    this.keyboard.disableGlobalCapture()
    this.keyboard.on('keydown-ENTER', () => {
      store.dispatch(setShowChat(true))
      store.dispatch(setFocused(true))
    })
    this.keyboard.on('keydown-ESC', () => {
      store.dispatch(setShowChat(false))
    })
  }

  disableKeys() {
    this.keyboard.enabled = false
  }

  enableKeys() {
    this.keyboard.enabled = true
  }

  create(data: { network: Network; mapKey?: string }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }

    createCharacterAnims(this.anims)

    this.map = this.make.tilemap({ key: data.mapKey ?? 'tilemap' })
    const groundTileset = this.map.addTilesetImage(GROUND_LAYER.tileset, GROUND_LAYER.texture)
    if (!groundTileset) {
      throw new Error(`office is missing the "${GROUND_LAYER.tileset}" tileset`)
    }

    const groundLayer = this.map.createLayer(GROUND_LAYER.layer, groundTileset)
    if (!groundLayer) {
      throw new Error(`office is missing the "${GROUND_LAYER.layer}" layer`)
    }
    groundLayer.setCollisionByProperty({ collides: true })

    // the social rules of the rooms live in the map alongside their furniture
    zoneManager.load(this.map)

    // debugDraw(groundLayer, this)

    const spawn = this.spawnPoint()
    this.myPlayerId = this.network.mySessionId
    this.myPlayer = this.add.myPlayer(spawn.x, spawn.y, 'adam', this.myPlayerId)
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)

    // Items come out of the Tiled map one group per kind. ITEM_SPECS says
    // where they live, what they are drawn with and how they behave, so a kind
    // of item this map has never held before needs no change here.
    const selectableItems: Phaser.Physics.Arcade.StaticGroup[] = []
    this.itemsByType.clear()

    ITEM_TYPES.forEach((itemType) => {
      const spec = ITEM_SPECS[itemType]
      const group = this.physics.add.staticGroup({ classType: itemClass(itemType) })
      const objectLayer = this.map.getObjectLayer(spec.layer)
      const itemsById = new Map<string, Item>()
      if (!objectLayer) throw new Error(`office is missing the "${spec.layer}" layer`)

      objectLayer.objects.forEach((object, index) => {
        const art = this.artFor(spec, object.gid!)
        const item = this.addObjectFromTiled(group, object, art.texture, art.tileset) as Item
        item.itemType = itemType
        item.id = `${index}`
        if (spec.depthOffset) item.setDepth(item.y + item.height * spec.depthOffset)
        if (item instanceof Chair) item.itemDirection = readProperty(object, 'direction')
        itemsById.set(item.id, item)
      })

      this.itemsByType.set(itemType, itemsById)
      if (spec.key) selectableItems.push(group)
      if (spec.collides)
        this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], group)
    })

    // import other objects from Tiled map to Phaser
    DECOR_LAYERS.forEach((spec) => this.addGroupFromTiled(spec))

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    this.cameras.main.zoom = 1.5
    this.cameras.main.startFollow(this.myPlayer, true)

    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], groundLayer)

    this.physics.add.overlap(
      this.playerSelector,
      selectableItems,
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    this.physics.add.overlap(
      this.myPlayer,
      this.otherPlayers,
      this.handlePlayersOverlap,
      undefined,
      this
    )

    this.hangLogo()

    // An office whose creator asked for a cleaning robot has one in its state
    // from the moment the room was made, so it is already there to be drawn.
    const roomba = this.network.roomba
    if (roomba) this.roomba = new Roomba(this, roomba.x, roomba.y, roomba.angle)

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onMyPlayerVideoConnected(this.handleMyVideoConnected, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onItemUserAdded(this.handleItemUserAdded, this)
    this.network.onItemUserRemoved(this.handleItemUserRemoved, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)

    /**
     * Everyone who was already standing here when we walked in.
     *
     * A player is announced while the first state update is decoded, which
     * happens as soon as the room is joined - and this scene does not start
     * until the office has been drawn, which for a generated one means waiting
     * on it over http. So every announcement about somebody already in the
     * room is made before there is anything listening, and nothing replays
     * them: the room simply looked empty to whoever arrived last.
     *
     * The listeners above are for people who arrive after us. This is for the
     * people who were already here.
     */
    this.network.replayWhoIsHere()

    /**
     * And the state of our own player, for the same reason.
     *
     * Bootstrap asks the browser whether camera permission was granted on a
     * previous visit, and if it was, the stream can arrive before this scene
     * exists - so the announcement that we are on camera is made to nobody.
     * `videoConnected` is one of the conditions for placing a call, so missing
     * it means proximity chat never starts at all, however close two people
     * stand. The store holds the answer either way, so it is read rather than
     * waited for.
     */
    const user = store.getState().user
    if (user.videoConnected) this.myPlayer.videoConnected = true
    if (user.loggedIn) this.myPlayer.readyToConnect = true
  }

  /**
   * Where this office puts a player. A generated building is whatever size its
   * contents need, so it carries its own spawn; the hand-drawn one has none at
   * all, and Phaser hands that back as an empty object rather than a list.
   */
  private spawnPoint() {
    return readSpawn(this.map.properties)
  }

  private handleItemSelectorOverlap(playerSelector, selectionItem) {
    const currentItem = playerSelector.selectedItem as Item
    // currentItem is undefined if nothing was perviously selected
    if (currentItem) {
      // if the selection has not changed, do nothing
      if (currentItem === selectionItem || currentItem.depth >= selectionItem.depth) {
        return
      }
      // if selection changes, clear pervious dialog
      if (this.myPlayer.playerBehavior !== PlayerBehavior.SITTING) currentItem.clearDialogBox()
    }

    // set selected item and set up new dialog
    playerSelector.selectedItem = selectionItem
    selectionItem.onOverlapDialog()
  }

  /**
   * Which of an item's pictures a placement wants. An item drawn from more
   * than one sheet says so in its spec, and the gid decides: it belongs to one
   * tileset, and that tileset names the sheet.
   */
  private artFor(spec: ItemSpec, gid: number) {
    for (const alternate of spec.alternates ?? []) {
      const tileset = this.map.getTileset(alternate.tileset)
      if (!tileset) continue
      if (gid >= tileset.firstgid && gid < tileset.firstgid + tileset.total) return alternate
    }
    return spec
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5
    const tileset = this.map.getTileset(tilesetName)
    if (!tileset) throw new Error(`office is missing the "${tilesetName}" tileset`)

    const obj = group
      .get(actualX, actualY, key, object.gid! - tileset.firstgid)
      .setDepth(actualY)

    // Furniture that only exists one way round is placed mirrored: Tiled packs
    // that into the top bits of the gid and Phaser hands it back here.
    if (object.flippedHorizontal) obj.setFlipX(true)
    return obj
  }

  private addGroupFromTiled(spec: DecorLayerSpec) {
    const group = this.physics.add.staticGroup()
    const objectLayer = this.map.getObjectLayer(spec.layer)
    if (!objectLayer) throw new Error(`office is missing the "${spec.layer}" layer`)

    objectLayer.objects.forEach((object) => {
      this.addObjectFromTiled(group, object, spec.texture, spec.tileset)
    })
    if (this.myPlayer && spec.collides)
      this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], group)
  }

  /** the item a server update is talking about */
  itemById(itemType: ItemType, itemId: string) {
    return this.itemsByType.get(itemType)?.get(itemId)
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    // Somebody can be announced twice: once by the event and once by the walk
    // over everyone already here. Whichever arrives second is not a new person.
    if (this.otherPlayerMap.has(id)) return

    this.setPetFor(id, newPlayer.pet, newPlayer.x, newPlayer.y)

    // Avatars are generated, so the texture may not exist on this client yet.
    // It is deterministic from the descriptor, so everyone builds the same one.
    const texture = isAvatar(newPlayer.avatar)
      ? ensureAvatarTexture(this, newPlayer.avatar)
      : textureFromAnim(newPlayer.anim)
    const otherPlayer = this.add.otherPlayer(newPlayer.x, newPlayer.y, texture, id, newPlayer.name)
    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  // function to remove the player who left from the otherPlayer group
  private handlePlayerLeft(id: string) {
    this.pets.get(id)?.destroy()
    this.pets.delete(id)

    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id)
      if (!otherPlayer) return
      this.otherPlayers.remove(otherPlayer, true, true)
      this.otherPlayerMap.delete(id)
    }
  }

  private handleMyPlayerReady() {
    this.myPlayer.readyToConnect = true
  }

  private handleMyVideoConnected() {
    this.myPlayer.videoConnected = true
  }

  // function to update target position upon receiving player updates
  private handlePlayerUpdated(field: string, value: number | string, id: string) {
    if (field === 'pet' && typeof value === 'string') {
      const owner = id === this.myPlayerId ? this.myPlayer : this.otherPlayerMap.get(id)
      this.setPetFor(id, value, owner?.x ?? 0, owner?.y ?? 0)
      return
    }

    // someone regenerating their avatar mid-session needs the new sheet built
    if (field === 'avatar' && typeof value === 'string' && isAvatar(value)) {
      const texture = ensureAvatarTexture(this, value)
      this.otherPlayerMap.get(id)?.setPlayerTexture(texture)
      return
    }

    const otherPlayer = this.otherPlayerMap.get(id)
    otherPlayer?.updateOtherPlayer(field, value)
  }

  private handlePlayersOverlap(myPlayer, otherPlayer) {
    if (!this.network?.webRTC) return
    otherPlayer.makeCall(myPlayer, this.network.webRTC)
  }

  private handleItemUserAdded(playerId: string, itemId: string, itemType: ItemType) {
    this.itemById(itemType, itemId)?.addCurrentUser(playerId)
  }

  private handleItemUserRemoved(playerId: string, itemId: string, itemType: ItemType) {
    this.itemById(itemType, itemId)?.removeCurrentUser(playerId)
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content)
  }

  update(t: number, dt: number) {
    if (this.myPlayer && this.network) {
      this.playerSelector.update(this.myPlayer, this.cursors)
      this.myPlayer.update(this.playerSelector, this.cursors, this.keyE, this.keyR, this.network)
    }

    this.updatePets(dt)
    this.updateRoomba(dt)
  }

  /**
   * Hangs the office's logo on the wall the map set aside for it.
   *
   * The spot belongs to the map and the logo belongs to the office, so neither
   * knows about the other until here. An office with no logo, or a map drawn
   * before there was anywhere to put one, simply leaves the wall bare.
   */
  private hangLogo() {
    const logo = this.network?.logo
    if (!logo) return

    const spot = this.map.getObjectLayer('Logo')?.objects?.[0]
    if (!spot?.width || !spot?.height) return

    const texture = ensureLogoTexture(this, logo)
    if (!texture) return

    const sign = this.add.image(spot.x! + spot.width / 2, spot.y! + spot.height / 2, texture)

    // Scaled to fit the wall it was given rather than stretched to fill it, so
    // a tall logo and a wide one both keep the shape they were drawn in.
    const fit = Math.min(spot.width / sign.width, spot.height / sign.height)
    sign.setScale(fit)
    sign.setDepth(sign.y)
  }

  /**
   * The robot is the one thing here the server moves, so this only follows
   * where it has got to. It is read rather than listened for: it moves every
   * tick, so there is no update to miss and nothing to unsubscribe.
   */
  private updateRoomba(dt: number) {
    if (!this.roomba) return

    const state = this.network?.roomba
    if (state) this.roomba.moveTo(state.x, state.y, state.angle)

    // heard from where this player is standing
    this.roomba.update(dt, this.myPlayer?.x ?? 0, this.myPlayer?.y ?? 0)
  }

  /**
   * Pets are drawn from their owner's replicated position, so every client
   * arrives at the same place for them without anything being sent about the
   * pet itself.
   */
  private updatePets(dt: number) {
    const now = this.time.now
    this.pets.forEach((pet, id) => {
      const owner = id === this.myPlayerId ? this.myPlayer : this.otherPlayerMap.get(id)
      if (!owner) {
        pet.destroy()
        this.pets.delete(id)
        return
      }
      pet.follow(owner.x, owner.y, dt)
      // heard from where this player is standing, not from where the pet is
      if (this.myPlayer) pet.maybeSpeak(this.myPlayer.x, this.myPlayer.y, now)
    })
  }

  /** gives a player the pet they chose, takes it away, or swaps it */
  setPetFor(id: string, descriptor: string, x: number, y: number) {
    if (!hasPet(descriptor)) {
      this.pets.get(id)?.destroy()
      this.pets.delete(id)
      return
    }

    const existing = this.pets.get(id)
    if (existing) {
      existing.setPet(descriptor)
      return
    }

    // start it behind its owner rather than on top of them, or it sits over
    // their chest until somebody walks
    this.pets.set(id, new Pet(this, x, y + PET_FOLLOW_DISTANCE, descriptor))
  }
}
