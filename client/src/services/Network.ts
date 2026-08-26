import { toPeerId } from '../util'
import { Client, Room } from 'colyseus.js'
import { IComputer, IOfficeState, IPlayer, IWhiteboard } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'
import { IRoomData, RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import WebRTC from '../web/WebRTC'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap } from '../stores/UserStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
} from '../stores/RoomStore'
import {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
} from '../stores/ChatStore'
import { setWhiteboardUrls } from '../stores/WhiteboardStore'
import { serverUrl } from '../runtimeConfig'

/**
 * What a player carries besides their name and position. Anyone joining a
 * room has to be told all of it about everybody already in it.
 */
const CATCH_UP_FIELDS = ['avatar', 'anim', 'readyToConnect', 'videoConnected'] as const

export default class Network {
  private endpoint: string
  private client: Client
  private room?: Room<IOfficeState>
  private lobby!: Room
  webRTC?: WebRTC

  mySessionId!: string

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')
    // configured at container start, at build time, or fall back to a server
    // on the same host - which is what `yarn dev` wants
    this.endpoint = serverUrl() || `${protocol}//${window.location.hostname}:2567`
    this.client = new Client(this.endpoint)
    this.joinLobbyRoom().then(() => {
      store.dispatch(setLobbyJoined(true))
    })

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_AVATAR_CHANGE, this.updatePlayerAvatar, this)
    phaserEvents.on(Event.MY_PLAYER_PET_CHANGE, this.updatePlayerPet, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
    phaserEvents.on(Event.PLAYER_DISCONNECTED, this.playerStreamDisconnect, this)
  }

  /**
   * method to join Colyseus' built-in LobbyRoom, which automatically notifies
   * connected clients whenever rooms with "realtime listing" have updates
   */
  async joinLobbyRoom() {
    this.lobby = await this.client.joinOrCreate(RoomType.LOBBY)

    this.lobby.onMessage('rooms', (rooms) => {
      store.dispatch(setAvailableRooms(rooms))
    })

    this.lobby.onMessage('+', ([roomId, room]) => {
      store.dispatch(addAvailableRooms({ roomId, room }))
    })

    this.lobby.onMessage('-', (roomId) => {
      store.dispatch(removeAvailableRooms(roomId))
    })
  }

  // method to join the public lobby
  async joinOrCreatePublic() {
    this.room = await this.client.joinOrCreate(RoomType.PUBLIC)
    this.initialize()
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    this.room = await this.client.joinById(roomId, { password })
    this.initialize()
  }

  // method to create a custom room
  async createCustom(roomData: IRoomData) {
    const { name, description, password, unlisted, slug, lifetimeDays, layout, office } = roomData
    this.room = await this.client.create(RoomType.CUSTOM, {
      name,
      description,
      password,
      unlisted,
      layout,
      office,
      ...(slug ? { slug, lifetimeDays } : {}),
    })
    this.initialize()
  }

  /**
   * Reopens an office by its slug. The room may well have been disposed when it
   * emptied, so this creates it again from the definition the server kept.
   */
  async joinOfficeBySlug(slug: string, password: string | null) {
    this.room = await this.client.joinOrCreate(RoomType.CUSTOM, { slug, password })
    this.initialize()
  }

  /** where the server draws a generated office, given its id */
  officeMapUrl(id: string, version: string) {
    const base = `${this.endpoint.replace(/^ws/, 'http')}/office/map/${id}.json`
    return version ? `${base}?v=${encodeURIComponent(version)}` : base
  }

  /**
   * Which drawing of an office this server produces, asked for once.
   *
   * An office id names the office and says nothing about how it is drawn, so
   * on its own it cannot tell a cached copy of last week's furniture from
   * this morning's. Hanging the server's own fingerprint off the url gives
   * the two copies different names, and the stale one is simply never asked
   * for again.
   *
   * An office still draws without it, so a server too old to answer is not
   * a reason to refuse to start.
   */
  private version: Promise<string> | null = null

  drawingVersion(): Promise<string> {
    if (!this.version) {
      const url = `${this.endpoint.replace(/^ws/, 'http')}/office/version`
      this.version = fetch(url)
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => String(body?.version ?? ''))
        .catch(() => '')
    }
    return this.version
  }

  /**
   * Which office this room is running, as an id - empty for the one that
   * ships with the client. The server puts it in the state, which may not
   * have arrived yet when the join promise settles, so wait one update for
   * it. Joining always adds us to the players map, so an update is coming.
   */
  officeId(timeoutMs = 5000): Promise<string> {
    const known = this.room?.state?.mapId
    if (known) return Promise.resolve(known)

    return new Promise((resolve) => {
      const settle = () => resolve(this.room?.state?.mapId ?? '')
      const timer = setTimeout(settle, timeoutMs)
      this.room?.onStateChange.once(() => {
        clearTimeout(timer)
        settle()
      })
    })
  }

  // set up all network listeners before the game starts
  initialize() {
    if (!this.room) return

    this.lobby.leave()
    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))
    this.webRTC = new WebRTC(this.mySessionId, this)

    // new instance added to the players MapSchema
    this.room.state.players.onAdd = (player: IPlayer, key: string) => {
      if (key === this.mySessionId) return

      // track changes on every child object inside the players MapSchema
      player.onChange = (changes) => {
        changes.forEach((change) => {
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

          // when a new player finished setting up player name
          if (field === 'name' && value !== '') {
            this.announcePlayer(player, key, { arriving: true })
          }
        })
      }
    }

    // an instance removed from the players MapSchema
    this.room.state.players.onRemove = (player: IPlayer, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      this.webRTC?.deleteVideoStream(key)
      this.webRTC?.deleteOnCalledVideoStream(key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
    }

    // new instance added to the computers MapSchema
    this.room.state.computers.onAdd = (computer: IComputer, key: string) => {
      // track changes on every child object's connectedUser
      computer.connectedUser.onAdd = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.COMPUTER)
      }
      computer.connectedUser.onRemove = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.COMPUTER)
      }
    }

    // new instance added to the whiteboards MapSchema
    this.room.state.whiteboards.onAdd = (whiteboard: IWhiteboard, key: string) => {
      store.dispatch(
        setWhiteboardUrls({
          whiteboardId: key,
          roomId: whiteboard.roomId,
        })
      )
      // track changes on every child object's connectedUser
      whiteboard.connectedUser.onAdd = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.WHITEBOARD)
      }
      whiteboard.connectedUser.onRemove = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.WHITEBOARD)
      }
    }

    // new instance added to the chatMessages ArraySchema
    this.room.state.chatMessages.onAdd = (item, index) => {
      store.dispatch(pushChatMessage(item))
    }

    // when the server sends room data
    this.room.onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    // when a user sends a message
    this.room.onMessage(Message.ADD_CHAT_MESSAGE, ({ clientId, content }) => {
      phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, clientId, content)
    })

    // when a peer disconnects with myPeer
    this.room.onMessage(Message.DISCONNECT_STREAM, (clientId: string) => {
      this.webRTC?.deleteOnCalledVideoStream(clientId)
    })

    // when a computer user stops sharing screen
    this.room.onMessage(Message.STOP_SCREEN_SHARE, (clientId: string) => {
      const computerState = store.getState().computer
      computerState.shareScreenManager?.onUserLeft(clientId)
    })
  }

  // method to register event listener and call back function when a item user added
  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  // method to register event listener and call back function when a item user added
  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)
  }

  // method to register event listener and call back function when a item user removed
  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  // method to register event listener and call back function when a player joined
  /**
   * Everyone already in the office, for a scene that started after they were
   * announced.
   *
   * A player is announced as the first state update is decoded, which happens
   * the moment the room is joined. A scene that has to fetch its office over
   * http before it can start is not listening yet, and the announcement is not
   * repeated - so without this, whoever arrives last sees an empty room while
   * everybody already in it sees them arrive.
   *
   * Anyone still choosing a name is skipped: they have no name yet, and the
   * event that carries it will arrive normally.
   */
  /**
   * Tells everything that cares that a player is in the office.
   *
   * One path for somebody walking in and somebody who was already standing
   * there, so the two cannot drift apart. `arriving` is the only difference:
   * a player already here did not just arrive, and saying so in the chat would
   * be a lie.
   */
  private announcePlayer(player: IPlayer, id: string, options: { arriving: boolean }) {
    phaserEvents.emit(Event.PLAYER_JOINED, player, id)
    store.dispatch(setPlayerNameMap({ id, name: player.name }))
    if (options.arriving) store.dispatch(pushPlayerJoinedMessage(player.name))

    /**
     * Everything else about them, as it stands right now.
     *
     * Being announced only says who somebody is and where. The rest of what
     * a client knows about a player - whether they are ready to be called,
     * whether they are on camera, which way they are facing - arrives as
     * changes, and a player who was already here changed all of that before
     * we could hear it. So they were drawn as somebody who is not ready to
     * talk, and stayed that way: `readyToConnect` is one of the conditions
     * for placing a call, and it never became true.
     *
     * The same path the changes take, so there is one place that knows how
     * to apply a field.
     */
    for (const field of CATCH_UP_FIELDS) {
      phaserEvents.emit(Event.PLAYER_UPDATED, field, player[field], id)
    }
  }

  /**
   * Announces everyone already in the office, and everyone already sitting at
   * something, to whoever has just started listening.
   *
   * All of that is announced as the first state update is decoded, which
   * happens the moment the room is joined. A scene that has to fetch its
   * office over http before it can start is not listening yet, and none of it
   * is repeated - so without this the last person in sees an empty room while
   * everybody already in it watches them arrive.
   *
   * Anyone still choosing a name is skipped; the event carrying it arrives
   * normally.
   */
  /**
   * Where everybody is, keyed the way WebRTC names them.
   *
   * Read straight from the room rather than from the game, because the game
   * stops running the moment its window is not the one being painted - and a
   * call can arrive at any time, whether or not anything is being drawn.
   */
  peerPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()
    this.room?.state.players.forEach((player: IPlayer, id: string) => {
      positions.set(toPeerId(id), { x: player.x, y: player.y })
    })
    return positions
  }

  /** and where we are, from the same place */
  myPosition(): { x: number; y: number } | undefined {
    const me = this.room?.state.players.get(this.mySessionId)
    return me ? { x: me.x, y: me.y } : undefined
  }

  replayWhoIsHere() {
    if (!this.room) return

    this.room.state.players.forEach((player: IPlayer, id: string) => {
      if (id === this.mySessionId) return
      if (!player.name) return
      this.announcePlayer(player, id, { arriving: false })
    })

    this.room.state.computers.forEach((computer: IComputer, itemId: string) => {
      computer.connectedUser.forEach((playerId) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, playerId, itemId, ItemType.COMPUTER)
      })
    })

    this.room.state.whiteboards.forEach((whiteboard: IWhiteboard, itemId: string) => {
      whiteboard.connectedUser.forEach((playerId) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, playerId, itemId, ItemType.WHITEBOARD)
      })
    })
  }

  onPlayerJoined(callback: (Player: IPlayer, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)
  }

  // method to register event listener and call back function when a player left
  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  // method to register event listener and call back function when myPlayer is ready to connect
  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
  }

  // method to register event listener and call back function when my video is connected
  onMyPlayerVideoConnected(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_VIDEO_CONNECTED, callback, context)
  }

  // method to register event listener and call back function when a player updated
  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  // method to send player updates to Colyseus server
  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }

  // method to send the generated avatar descriptor to Colyseus server
  updatePlayerAvatar(avatar: string) {
    this.room?.send(Message.UPDATE_PLAYER_AVATAR, { avatar })
  }

  // method to send the chosen pet to Colyseus server
  updatePlayerPet(pet: string) {
    this.room?.send(Message.UPDATE_PLAYER_PET, { pet })
  }

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  // method to send ready-to-connect signal to Colyseus server
  videoConnected() {
    this.room?.send(Message.VIDEO_CONNECTED)
    phaserEvents.emit(Event.MY_PLAYER_VIDEO_CONNECTED)
  }

  // method to send stream-disconnection signal to Colyseus server
  playerStreamDisconnect(id: string) {
    this.room?.send(Message.DISCONNECT_STREAM, { clientId: id })
    this.webRTC?.deleteVideoStream(id)
  }

  connectToComputer(id: string) {
    this.room?.send(Message.CONNECT_TO_COMPUTER, { computerId: id })
  }

  disconnectFromComputer(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_COMPUTER, { computerId: id })
  }

  connectToWhiteboard(id: string) {
    this.room?.send(Message.CONNECT_TO_WHITEBOARD, { whiteboardId: id })
  }

  disconnectFromWhiteboard(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_WHITEBOARD, { whiteboardId: id })
  }

  onStopScreenShare(id: string) {
    this.room?.send(Message.STOP_SCREEN_SHARE, { computerId: id })
  }

  addChatMessage(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content: content })
  }
}
