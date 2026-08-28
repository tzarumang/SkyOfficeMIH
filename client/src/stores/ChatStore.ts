import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { IChatMessage } from '../../../types/IOfficeState'
import { gameScene } from '../gameHandle'

/**
 * The server keeps the last 100 messages; this is the client copy, which also
 * holds join/leave notices. It only ever grew, so a long session accumulated
 * every message it had ever seen.
 */
const MAX_VISIBLE_MESSAGES = 200

function trim(messages: { length: number; splice: (start: number, count: number) => unknown }) {
  if (messages.length > MAX_VISIBLE_MESSAGES) {
    messages.splice(0, messages.length - MAX_VISIBLE_MESSAGES)
  }
}

export enum MessageType {
  PLAYER_JOINED,
  PLAYER_LEFT,
  REGULAR_MESSAGE,
}

export interface Arrival {
  name: string
  /** what to call where they arrived: the office by name, or the lobby */
  place: string
}

export const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    chatMessages: new Array<{ messageType: MessageType; chatMessage: IChatMessage }>(),
    focused: false,
    showChat: true,
  },
  reducers: {
    pushChatMessage: (state, action: PayloadAction<IChatMessage>) => {
      state.chatMessages.push({
        messageType: MessageType.REGULAR_MESSAGE,
        chatMessage: action.payload,
      })
      trim(state.chatMessages)
    },
    /**
     * Who came and went, and from where. An office has a name its people chose,
     * and saying "joined the lobby" inside it reads as though they walked into
     * somewhere else entirely - so the place says its own name, and only the
     * public lobby is "the lobby".
     */
    pushPlayerJoinedMessage: (state, action: PayloadAction<Arrival>) => {
      state.chatMessages.push({
        messageType: MessageType.PLAYER_JOINED,
        chatMessage: {
          createdAt: new Date().getTime(),
          author: action.payload.name,
          content: `joined ${action.payload.place}`,
        } as IChatMessage,
      })
      trim(state.chatMessages)
    },
    pushPlayerLeftMessage: (state, action: PayloadAction<Arrival>) => {
      state.chatMessages.push({
        messageType: MessageType.PLAYER_LEFT,
        chatMessage: {
          createdAt: new Date().getTime(),
          author: action.payload.name,
          content: `left ${action.payload.place}`,
        } as IChatMessage,
      })
      trim(state.chatMessages)
    },
    setFocused: (state, action: PayloadAction<boolean>) => {
      const game = gameScene()
      if (action.payload) game?.disableKeys()
      else game?.enableKeys()
      state.focused = action.payload
    },
    setShowChat: (state, action: PayloadAction<boolean>) => {
      state.showChat = action.payload
    },
  },
})

export const {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
  setFocused,
  setShowChat,
} = chatSlice.actions

export default chatSlice.reducer
