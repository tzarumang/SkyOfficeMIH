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
import { ITEM_SPECS, ITEM_TYPES, ItemType } from '../../../types/Items'
import { DECOR_LAYERS, DecorLayerSpec, GROUND_LAYER } from '../../../types/MapLayers'
import { textureFromAnim } from '../util'
import { ensureAvatarTexture } from '../avatars/spriteFactory'
import { isAvatar } from '../../../types/Avatar'

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

  constructor() {
    super('game')
  }

  registerKeys() {
    this.cursors = {
      ...this.input.keyboard.createCursorKeys(),
      ...(this.input.keyboard.addKeys('W,S,A,D') as Keyboard),
    }

    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyE = this.input.keyboard.addKey('E')
    this.keyR = this.input.keyboard.addKey('R')
    this.input.keyboard.disableGlobalCapture()
    this.input.keyboard.on('keydown-ENTER', (event) => {
      store.dispatch(setShowChat(true))
      store.dispatch(setFocused(true))
    })
    this.input.keyboard.on('keydown-ESC', (event) => {
      store.dispatch(setShowChat(false))
    })
  }

  disableKeys() {
    this.input.keyboard.enabled = false
  }

  enableKeys() {
    this.input.keyboard.enabled = true
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

    const groundLayer = this.map.createLayer(GROUND_LAYER.layer, groundTileset)
    groundLayer.setCollisionByProperty({ collides: true })

    // the social rules of the rooms live in the map alongside their furniture
    zoneManager.load(this.map)

    // debugDraw(groundLayer, this)

    const spawn = this.spawnPoint()
    this.myPlayer = this.add.myPlayer(spawn.x, spawn.y, 'adam', this.network.mySessionId)
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

      objectLayer.objects.forEach((object, index) => {
        const item = this.addObjectFromTiled(group, object, spec.texture, spec.tileset) as Item
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

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onMyPlayerVideoConnected(this.handleMyVideoConnected, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onItemUserAdded(this.handleItemUserAdded, this)
    this.network.onItemUserRemoved(this.handleItemUserRemoved, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)
  }

  /**
   * Where this office puts a player. A generated building is whatever size
   * its contents need, so it carries its own spawn; the hand-drawn one has
   * always used the same spot.
   */
  private spawnPoint() {
    const properties = this.map.properties as Array<{ name: string; value: number }>
    const read = (name: string) =>
      Number(properties?.find((property) => property.name === name)?.value)

    const x = read('spawnX')
    const y = read('spawnY')
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 705, y: 500 }
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

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5
    const obj = group
      .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
      .setDepth(actualY)
    return obj
  }

  private addGroupFromTiled(spec: DecorLayerSpec) {
    const group = this.physics.add.staticGroup()
    const objectLayer = this.map.getObjectLayer(spec.layer)
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
  }
}
