import { enableMapSet } from 'immer'
import { configureStore } from '@reduxjs/toolkit'
import userReducer from './UserStore'
import computerReducer from './ComputerStore'
import whiteboardReducer from './WhiteboardStore'
import chatReducer from './ChatStore'
import roomReducer from './RoomStore'
import { setAppStore } from './storeHandle'

enableMapSet()

const store = configureStore({
  reducer: {
    user: userReducer,
    computer: computerReducer,
    whiteboard: whiteboardReducer,
    chat: chatReducer,
    room: roomReducer,
  },
  // Temporary disable serialize check for redux as we store MediaStream in ComputerStore.
  // https://stackoverflow.com/a/63244831
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

// Handed to storeHandle so the modules this store depends on can reach it
// without importing it back and closing a cycle - see storeHandle.ts.
setAppStore(store)

export type AppStore = typeof store
// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch

export default store
