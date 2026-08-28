import { describe, expect, it } from 'vitest'
import chatReducer, {
  MessageType,
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
} from './ChatStore'

const initial = () => chatReducer(undefined, { type: '@@INIT' })
const message = (content: string) =>
  ({ author: 'Ada', content, createdAt: 0 }) as never

describe('the chat log', () => {
  it('keeps what was said', () => {
    const state = chatReducer(initial(), pushChatMessage(message('hello')))
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].messageType).toBe(MessageType.REGULAR_MESSAGE)
    expect(state.chatMessages[0].chatMessage.content).toBe('hello')
  })

  it('stops growing, and drops the oldest first', () => {
    // it only ever grew, so a long session accumulated every message it had
    // ever seen - this is the cap that fixed it
    let state = initial()
    for (let i = 0; i < 260; i++) state = chatReducer(state, pushChatMessage(message(`m${i}`)))

    expect(state.chatMessages.length).toBeLessThanOrEqual(200)
    const contents = state.chatMessages.map((m) => m.chatMessage.content)
    expect(contents).toContain('m259')
    expect(contents).not.toContain('m0')
  })

  it('trims the arrival notices too, not just what people typed', () => {
    let state = initial()
    for (let i = 0; i < 260; i++) {
      state = chatReducer(state, pushPlayerJoinedMessage({ name: `p${i}`, place: 'the lobby' }))
    }
    expect(state.chatMessages.length).toBeLessThanOrEqual(200)
  })
})

describe('arrival notices', () => {
  it('says where somebody arrived by its own name', () => {
    // "joined the lobby" inside a named office reads as somewhere else
    const state = chatReducer(initial(), pushPlayerJoinedMessage({ name: 'Ada', place: 'Design' }))
    expect(state.chatMessages[0].chatMessage.content).toBe('joined Design')
    expect(state.chatMessages[0].messageType).toBe(MessageType.PLAYER_JOINED)
  })

  it('and where they left from', () => {
    const state = chatReducer(initial(), pushPlayerLeftMessage({ name: 'Ada', place: 'the lobby' }))
    expect(state.chatMessages[0].chatMessage.content).toBe('left the lobby')
    expect(state.chatMessages[0].messageType).toBe(MessageType.PLAYER_LEFT)
  })
})
