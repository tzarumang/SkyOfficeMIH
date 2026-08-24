import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard } from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { IRoomData } from '../../types/Rooms'
import { whiteboardRoomIds } from './schema/OfficeState'
import { computerBoxes, whiteboardBoxes, mapBounds, isWithinReach, ItemBox } from './MapObjects'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  ComputerAddUserCommand,
  ComputerRemoveUserCommand,
} from './commands/ComputerUpdateArrayCommand'
import {
  WhiteboardAddUserCommand,
  WhiteboardRemoveUserCommand,
} from './commands/WhiteboardUpdateArrayCommand'
import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'

const MAX_NAME_LENGTH = 32
const MAX_CHAT_LENGTH = 500
const MAX_ANIM_LENGTH = 64

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private description: string
  private password: string | null = null

  async onCreate(options: IRoomData) {
    const { name, description, password } = options
    this.name = name
    this.description = description

    // never let a client decide whether its room is eligible for cleanup - only
    // the server-defined public lobby opts out of auto-disposal
    this.autoDispose = true

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword })

    this.setState(new OfficeState())

    // items come from the same Tiled map the client renders, so the ids on both
    // sides always line up
    computerBoxes.forEach((_, index) => {
      this.state.computers.set(String(index), new Computer())
    })

    whiteboardBoxes.forEach((_, index) => {
      this.state.whiteboards.set(String(index), new Whiteboard())
    })

    // when a player connect to a computer, add to the computer connectedUser array
    this.onSafeMessage(Message.CONNECT_TO_COMPUTER, (client, message: { computerId: string }) => {
      const computerId = this.readItemId(message?.computerId, computerBoxes.length)
      if (computerId === null) return
      if (!this.isPlayerNearItem(client, computerBoxes[Number(computerId)])) return

      this.dispatcher.dispatch(new ComputerAddUserCommand(), { client, computerId })
    })

    // when a player disconnect from a computer, remove from the computer connectedUser array
    this.onSafeMessage(
      Message.DISCONNECT_FROM_COMPUTER,
      (client, message: { computerId: string }) => {
        const computerId = this.readItemId(message?.computerId, computerBoxes.length)
        if (computerId === null) return

        this.dispatcher.dispatch(new ComputerRemoveUserCommand(), { client, computerId })
      }
    )

    // when a player stop sharing screen
    this.onSafeMessage(Message.STOP_SCREEN_SHARE, (client, message: { computerId: string }) => {
      const computerId = this.readItemId(message?.computerId, computerBoxes.length)
      if (computerId === null) return

      const computer = this.state.computers.get(computerId)
      if (!computer) return

      computer.connectedUser.forEach((id) => {
        this.clients.forEach((cli) => {
          if (cli.sessionId === id && cli.sessionId !== client.sessionId) {
            cli.send(Message.STOP_SCREEN_SHARE, client.sessionId)
          }
        })
      })
    })

    // when a player connect to a whiteboard, add to the whiteboard connectedUser array
    this.onSafeMessage(
      Message.CONNECT_TO_WHITEBOARD,
      (client, message: { whiteboardId: string }) => {
        const whiteboardId = this.readItemId(message?.whiteboardId, whiteboardBoxes.length)
        if (whiteboardId === null) return
        if (!this.isPlayerNearItem(client, whiteboardBoxes[Number(whiteboardId)])) return

        this.dispatcher.dispatch(new WhiteboardAddUserCommand(), { client, whiteboardId })
      }
    )

    // when a player disconnect from a whiteboard, remove from the whiteboard connectedUser array
    this.onSafeMessage(
      Message.DISCONNECT_FROM_WHITEBOARD,
      (client, message: { whiteboardId: string }) => {
        const whiteboardId = this.readItemId(message?.whiteboardId, whiteboardBoxes.length)
        if (whiteboardId === null) return

        this.dispatcher.dispatch(new WhiteboardRemoveUserCommand(), { client, whiteboardId })
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateCommand
    this.onSafeMessage(
      Message.UPDATE_PLAYER,
      (client, message: { x: number; y: number; anim: string }) => {
        const x = this.readCoordinate(message?.x, mapBounds.width)
        const y = this.readCoordinate(message?.y, mapBounds.height)
        if (x === null || y === null) return
        if (typeof message.anim !== 'string' || message.anim.length > MAX_ANIM_LENGTH) return

        this.dispatcher.dispatch(new PlayerUpdateCommand(), { client, x, y, anim: message.anim })
      }
    )

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onSafeMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      if (typeof message?.name !== 'string') return

      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name.slice(0, MAX_NAME_LENGTH),
      })
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onSafeMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onSafeMessage(Message.VIDEO_CONNECTED, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.videoConnected = true
    })

    // when a player disconnect a stream, broadcast the signal to the other player connected to the stream
    this.onSafeMessage(Message.DISCONNECT_STREAM, (client, message: { clientId: string }) => {
      if (typeof message?.clientId !== 'string') return

      this.clients.forEach((cli) => {
        if (cli.sessionId === message.clientId) {
          cli.send(Message.DISCONNECT_STREAM, client.sessionId)
        }
      })
    })

    // when a player send a chat message, update the message array and broadcast to all connected clients except the sender
    this.onSafeMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      if (typeof message?.content !== 'string') return

      const content = message.content.slice(0, MAX_CHAT_LENGTH)

      // update the message array (so that players join later can also see the message)
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), { client, content })

      // broadcast to all currently connected clients except the sender (to render in-game dialog on top of the character)
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content },
        { except: client }
      )
    })
  }

  /**
   * Colyseus does not wrap message handlers, so an exception raised while
   * handling one message would otherwise escape to the socket layer and take
   * the whole process down - every other room included.
   */
  private onSafeMessage<T>(type: Message, handler: (client: Client, message: T) => void) {
    this.onMessage(type, (client: Client, message: T) => {
      try {
        handler(client, message)
      } catch (error) {
        console.error(
          `[SkyOffice] failed to handle ${Message[type]} from ${client.sessionId}:`,
          error
        )
      }
    })
  }

  /** returns the id when it names a real item, null otherwise */
  private readItemId(value: unknown, itemCount: number) {
    if (typeof value !== 'string') return null

    const index = Number(value)
    if (!Number.isInteger(index) || index < 0 || index >= itemCount) return null

    return value
  }

  private readCoordinate(value: unknown, limit: number) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    if (value < 0 || value > limit) return null

    return value
  }

  /**
   * Screen shares and whiteboards are handed to whoever is connected to the
   * item, so connecting has to be gated on actually standing next to it -
   * otherwise any client can subscribe to every item in the room at once.
   */
  private isPlayerNearItem(client: Client, box: ItemBox) {
    const player = this.state.players.get(client.sessionId)
    if (!player) return false

    return isWithinReach(box, player.x, player.y)
  }

  async onAuth(client: Client, options: { password: string | null }) {
    if (this.password) {
      if (typeof options?.password !== 'string') {
        throw new ServerError(403, 'Password is incorrect!')
      }

      const validPassword = await bcrypt.compare(options.password, this.password)
      if (!validPassword) {
        throw new ServerError(403, 'Password is incorrect!')
      }
    }
    return true
  }

  onJoin(client: Client, options: any) {
    this.state.players.set(client.sessionId, new Player())
    client.send(Message.SEND_ROOM_DATA, {
      id: this.roomId,
      name: this.name,
      description: this.description,
    })
  }

  onLeave(client: Client, consented: boolean) {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
    this.state.computers.forEach((computer) => {
      if (computer.connectedUser.has(client.sessionId)) {
        computer.connectedUser.delete(client.sessionId)
      }
    })
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboard.connectedUser.has(client.sessionId)) {
        whiteboard.connectedUser.delete(client.sessionId)
      }
    })
  }

  onDispose() {
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboardRoomIds.has(whiteboard.roomId)) whiteboardRoomIds.delete(whiteboard.roomId)
    })

    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }
}
