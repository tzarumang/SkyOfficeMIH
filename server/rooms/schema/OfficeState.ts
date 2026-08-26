import crypto from 'crypto'
import { Schema, ArraySchema, SetSchema, MapSchema, type } from '@colyseus/schema'
import {
  IPlayer,
  IOfficeState,
  IComputer,
  IWhiteboard,
  IChatMessage,
  IRoomba,
} from '../../../types/IOfficeState'

export class Player extends Schema implements IPlayer {
  @type('string') name = ''
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
  @type('string') avatar = ''
  @type('string') pet = ''
  @type('boolean') readyToConnect = false
  @type('boolean') videoConnected = false
}

export class Computer extends Schema implements IComputer {
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

export class Whiteboard extends Schema implements IWhiteboard {
  @type('string') roomId = getRoomId()
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

/**
 * The cleaning robot, which belongs to the office rather than to anybody in
 * it. Nothing a client already knows says where it is, so unlike a pet its
 * position is replicated - the server drives it and everyone watches.
 */
export class Roomba extends Schema implements IRoomba {
  @type('number') x = 0
  @type('number') y = 0
  /** heading in radians, so the client can point it where it is going */
  @type('number') angle = 0
}

export class ChatMessage extends Schema implements IChatMessage {
  @type('string') author = ''
  @type('number') createdAt = new Date().getTime()
  @type('string') content = ''
}

export class OfficeState extends Schema implements IOfficeState {
  /**
   * How the client knows which office to draw. It arrives with the first
   * state update, before the game scene starts, so the map can be fetched
   * then rather than being baked into the client build.
   */
  @type('string') mapId = ''

  @type({ map: Player })
  players = new MapSchema<Player>()

  @type({ map: Computer })
  computers = new MapSchema<Computer>()

  @type({ map: Whiteboard })
  whiteboards = new MapSchema<Whiteboard>()

  @type([ChatMessage])
  chatMessages = new ArraySchema<ChatMessage>()

  /**
   * The logo hung in the hallway, as the few colours it was reduced to, or
   * empty for an office without one. It is small enough to sit in the state
   * beside everything else, and every client draws it from the same string.
   */
  @type('string') logo = ''

  /**
   * Whether this office has a cleaning robot.
   *
   * The robot below would seem to say that on its own, but a child schema the
   * server never sets still reaches the client as an empty instance rather
   * than as nothing - so an office without a robot and an office whose robot
   * has not been heard from yet look identical. This says which it is.
   */
  @type('boolean') hasRoomba = false

  /** where that robot has got to; meaningless unless hasRoomba */
  @type(Roomba) roomba?: Roomba
}

/**
 * This id is the only thing protecting a whiteboard: the client turns it
 * straight into a public wbo.ophir.dev board URL. Math.random is not a CSPRNG -
 * its state can be recovered from a handful of outputs, and every room hands an
 * observer three ids on join - so board URLs minted for other rooms would be
 * predictable. 128 bits from the CSPRNG also makes collisions impossible, so
 * the old retry bookkeeping is gone.
 */
function getRoomId(): string {
  return crypto.randomBytes(16).toString('base64url')
}
