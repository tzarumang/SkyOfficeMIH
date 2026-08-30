import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { RoomAvailable } from 'colyseus.js'
import { RoomType } from '../../../types/Rooms'
import { leftOffice } from './leftOffice'

// 0.16 declares `name` on RoomAvailable itself, and as required rather than
// optional, so redeclaring it here is both redundant and a narrowing error
type RoomInterface = RoomAvailable

/**
 * Colyseus' real time room list always includes the public lobby so we have to remove it manually.
 */
const isCustomRoom = (room: RoomInterface) => {
  return room.name === RoomType.CUSTOM
}

export const roomSlice = createSlice({
  name: 'room',
  initialState: {
    lobbyJoined: false,
    roomJoined: false,
    /**
     * Whether the room joined is the public lobby rather than an office of
     * somebody's own.
     *
     * Recorded by the client from the join it made rather than read off the
     * room, because the lobby is a room like any other and answers to a name
     * like any other - "Public Lobby" - so there is nothing in what the server
     * sends that tells the two apart.
     */
    publicLobby: false,
    roomId: '',
    roomSlug: null as string | null,
    roomName: '',
    roomDescription: '',
    availableRooms: new Array<RoomAvailable>(),
  },
  reducers: {
    setLobbyJoined: (state, action: PayloadAction<boolean>) => {
      state.lobbyJoined = action.payload
    },
    setRoomJoined: (state, action: PayloadAction<boolean>) => {
      state.roomJoined = action.payload
    },
    setPublicLobby: (state, action: PayloadAction<boolean>) => {
      state.publicLobby = action.payload
    },
    setJoinedRoomData: (
      state,
      action: PayloadAction<{
        id: string
        name: string
        description: string
        slug?: string | null
      }>
    ) => {
      state.roomId = action.payload.id
      state.roomSlug = action.payload.slug ?? null
      state.roomName = action.payload.name
      state.roomDescription = action.payload.description
    },
    setAvailableRooms: (state, action: PayloadAction<RoomAvailable[]>) => {
      state.availableRooms = action.payload.filter((room) => isCustomRoom(room))
    },
    addAvailableRooms: (state, action: PayloadAction<{ roomId: string; room: RoomAvailable }>) => {
      if (!isCustomRoom(action.payload.room)) return
      const roomIndex = state.availableRooms.findIndex(
        (room) => room.roomId === action.payload.roomId
      )
      if (roomIndex !== -1) {
        state.availableRooms[roomIndex] = action.payload.room
      } else {
        state.availableRooms.push(action.payload.room)
      }
    },
    removeAvailableRooms: (state, action: PayloadAction<string>) => {
      state.availableRooms = state.availableRooms.filter((room) => room.roomId !== action.payload)
    },
  },
  extraReducers: (builder) => {
    /**
     * Nothing is joined for the moment. The listing is left alone: it comes
     * from the lobby connection, which is not the one being dropped, and it is
     * what the room selection screen shows if that is where this leads.
     */
    builder.addCase(leftOffice, (state) => {
      state.roomJoined = false
      state.publicLobby = false
      state.roomId = ''
      state.roomSlug = null
      state.roomName = ''
      state.roomDescription = ''
    })
  },
})

export const {
  setLobbyJoined,
  setRoomJoined,
  setPublicLobby,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
} = roomSlice.actions

export default roomSlice.reducer
