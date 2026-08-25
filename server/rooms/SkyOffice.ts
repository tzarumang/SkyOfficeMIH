import { IncomingMessage } from 'http'
import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard } from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { IRoomData, RoomType } from '../../types/Rooms'
import RateLimiter from './RateLimiter'
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
const MAX_ROOM_NAME_LENGTH = 64
const MAX_ROOM_DESCRIPTION_LENGTH = 2000

/** the client sends a position on every frame it moves, so ~60/s is normal */
const MOVEMENT_PER_SECOND = 120
const MOVEMENT_BURST = 240
const CHAT_PER_SECOND = 0.5
const CHAT_BURST = 5
/** five quick tries at a room password, then one a minute */
const PASSWORD_ATTEMPTS_PER_SECOND = 1 / 60
const PASSWORD_ATTEMPT_BURST = 5

/** best effort origin for throttling; a reverse proxy puts the real ip here */
function clientAddress(request?: IncomingMessage) {
  const forwarded = request?.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return first?.trim() || request?.socket?.remoteAddress || 'unknown'
}

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private description: string
  private password: string | null = null
  private movementLimiter = new RateLimiter(MOVEMENT_BURST, MOVEMENT_PER_SECOND)
  private chatLimiter = new RateLimiter(CHAT_BURST, CHAT_PER_SECOND)
  private passwordLimiter = new RateLimiter(PASSWORD_ATTEMPT_BURST, PASSWORD_ATTEMPTS_PER_SECOND)

  async onCreate(options: IRoomData) {
    const { name, description, password, unlisted } = options
    this.name = (name ?? '').slice(0, MAX_ROOM_NAME_LENGTH)
    this.description = (description ?? '').slice(0, MAX_ROOM_DESCRIPTION_LENGTH)

    // A client must not be able to keep a room resident forever by asking for
    // it, so the option is ignored - only the public lobby, which the server
    // defines itself, stays alive while empty.
    this.autoDispose = this.roomName !== RoomType.PUBLIC

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    // A password stops people joining, but the lobby listing still published
    // the name, description and occupancy of every custom room. Unlisted rooms
    // stay out of it and are reachable by id only.
    if (unlisted) await this.setPrivate(true)

    this.setMetadata({ name: this.name, description: this.description, hasPassword })

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
        if (!this.movementLimiter.consume(client.sessionId)) return

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
      if (!this.chatLimiter.consume(client.sessionId)) return

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

  async onAuth(client: Client, options: { password: string | null }, request?: IncomingMessage) {
    if (this.password) {
      const origin = clientAddress(request)

      // Checked before the compare: bcrypt at cost 10 is deliberately slow, so
      // an unthrottled guessing loop is both a brute force and a cheap way to
      // burn our CPU.
      if (!this.passwordLimiter.check(origin)) {
        throw new ServerError(429, 'Too many attempts, please try again later.')
      }

      if (typeof options?.password !== 'string') {
        this.passwordLimiter.consume(origin)
        throw new ServerError(403, 'Password is incorrect!')
      }

      const validPassword = await bcrypt.compare(options.password, this.password)
      if (!validPassword) {
        // only a wrong guess costs allowance, so honest users are never limited
        this.passwordLimiter.consume(origin)
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
    this.movementLimiter.forget(client.sessionId)
    this.chatLimiter.forget(client.sessionId)

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
    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }
}
