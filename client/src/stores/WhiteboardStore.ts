import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { gameScene } from '../gameHandle'
import { leftOffice } from './leftOffice'

interface WhiteboardState {
  whiteboardDialogOpen: boolean
  whiteboardId: null | string
  whiteboardUrl: null | string
  urls: Map<string, string>
}

const initialState: WhiteboardState = {
  whiteboardDialogOpen: false,
  whiteboardId: null,
  whiteboardUrl: null,
  urls: new Map(),
}

export const whiteboardSlice = createSlice({
  name: 'whiteboard',
  initialState,
  reducers: {
    openWhiteboardDialog: (state, action: PayloadAction<string>) => {
      state.whiteboardDialogOpen = true
      state.whiteboardId = action.payload
      const url = state.urls.get(action.payload)
      if (url) state.whiteboardUrl = url
      const game = gameScene()
      game?.disableKeys()
    },
    closeWhiteboardDialog: (state) => {
      const game = gameScene()
      game?.enableKeys()
      game?.network.disconnectFromWhiteboard(state.whiteboardId!)
      state.whiteboardDialogOpen = false
      state.whiteboardId = null
      state.whiteboardUrl = null
    },
    setWhiteboardUrls: (state, action: PayloadAction<{ whiteboardId: string; roomId: string }>) => {
      state.urls.set(
        action.payload.whiteboardId,
        `https://wbo.ophir.dev/boards/sky-office-${action.payload.roomId}`
      )
    },
  },
  extraReducers: (builder) => {
    /**
     * Board urls are keyed by the whiteboard's place in its own map, so the
     * third whiteboard of the office just left and the third of the next one
     * answer to the same key. Keeping them would open the old office's board
     * on a wall in the new one.
     */
    builder.addCase(leftOffice, (state) => {
      state.urls.clear()
    })
  },
})

export const { openWhiteboardDialog, closeWhiteboardDialog, setWhiteboardUrls } =
  whiteboardSlice.actions

export default whiteboardSlice.reducer
