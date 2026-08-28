import { describe, expect, it } from 'vitest'
import { RoomType } from '../../../types/Rooms'
import roomReducer, {
  addAvailableRooms,
  removeAvailableRooms,
  setAvailableRooms,
  setJoinedRoomData,
} from './RoomStore'

/**
 * Colyseus' realtime listing includes the public lobby along with the custom
 * offices, so every path that takes a listing has to drop it again - and there
 * are three of them, which is three chances to forget.
 */
const room = (roomId: string, name = RoomType.CUSTOM) =>
  ({ roomId, name, clients: 1, maxClients: 20, metadata: { name: roomId } }) as never

const lobby = (roomId: string) => room(roomId, RoomType.PUBLIC)

const initial = () => roomReducer(undefined, { type: '@@INIT' })

describe('the office list', () => {
  it('keeps custom offices and drops the public lobby', () => {
    const state = roomReducer(initial(), setAvailableRooms([room('a'), lobby('public'), room('b')]))
    expect(state.availableRooms.map((r) => r.roomId)).toEqual(['a', 'b'])
  })

  it('drops the lobby when it arrives on its own, too', () => {
    const state = roomReducer(initial(), addAvailableRooms({ roomId: 'public', room: lobby('public') }))
    expect(state.availableRooms).toHaveLength(0)
  })

  it('adds an office it has not seen', () => {
    const state = roomReducer(initial(), addAvailableRooms({ roomId: 'a', room: room('a') }))
    expect(state.availableRooms.map((r) => r.roomId)).toEqual(['a'])
  })

  it('updates one it has, rather than listing it twice', () => {
    let state = roomReducer(initial(), setAvailableRooms([room('a')]))
    const busier = { ...(room('a') as object), clients: 9 } as never
    state = roomReducer(state, addAvailableRooms({ roomId: 'a', room: busier }))

    expect(state.availableRooms).toHaveLength(1)
    expect(state.availableRooms[0].clients).toBe(9)
  })

  it('forgets an office that has closed', () => {
    let state = roomReducer(initial(), setAvailableRooms([room('a'), room('b')]))
    state = roomReducer(state, removeAvailableRooms('a'))
    expect(state.availableRooms.map((r) => r.roomId)).toEqual(['b'])
  })
})

describe('the joined room', () => {
  it('remembers what the server called it', () => {
    const state = roomReducer(
      initial(),
      setJoinedRoomData({ id: 'r1', name: 'Design', description: 'ours', slug: 'design' })
    )
    expect(state).toMatchObject({
      roomId: 'r1',
      roomName: 'Design',
      roomDescription: 'ours',
      roomSlug: 'design',
    })
  })

  it('has no slug for an office that was not given one', () => {
    const state = roomReducer(
      initial(),
      setJoinedRoomData({ id: 'r1', name: 'Throwaway', description: '' })
    )
    expect(state.roomSlug).toBeNull()
  })
})
