import { Schema, ArraySchema, SetSchema, MapSchema } from '@colyseus/schema'

export interface IPlayer extends Schema {
  name: string
  x: number
  y: number
  anim: string
  avatar: string
  pet: string
  readyToConnect: boolean
  videoConnected: boolean
}

export interface IComputer extends Schema {
  connectedUser: SetSchema<string>
}

export interface IWhiteboard extends Schema {
  roomId: string
  connectedUser: SetSchema<string>
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
}

export interface IRoomba extends Schema {
  x: number
  y: number
  angle: number
}

export interface IOfficeState extends Schema {
  /** the id the office was grown from, or empty for the hand-drawn one */
  mapId: string
  players: MapSchema<IPlayer>
  computers: MapSchema<IComputer>
  whiteboards: MapSchema<IWhiteboard>
  chatMessages: ArraySchema<IChatMessage>
  /** the logo hung in the hallway, or empty for an office without one */
  logo: string
  /** whether the office has a cleaning robot at all */
  hasRoomba: boolean
  /** where that robot is; meaningless unless hasRoomba */
  roomba?: IRoomba
}
