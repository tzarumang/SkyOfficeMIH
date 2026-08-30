import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { gameScene } from '../gameHandle'
import { leftOffice } from './leftOffice'

/**
 * The question the staircase asks before it is used.
 *
 * Leaving is not something that should happen by walking into it: somebody
 * crossing the corridor while reading the chat must not find themselves back
 * in the lobby, so the stairs ask first and this holds the asking. Bootstrap
 * carries out the answer, because it owns both the connection and the scene
 * the office is drawn in.
 */
interface ExitState {
  exitDialogOpen: boolean
  /** true from the moment "leave" is pressed until the next place is up */
  leaving: boolean
  /** what went wrong on the way out, if anything did */
  error: string
}

const initialState: ExitState = {
  exitDialogOpen: false,
  leaving: false,
  error: '',
}

export const exitSlice = createSlice({
  name: 'exit',
  initialState,
  reducers: {
    openExitDialog: (state) => {
      // The dialog takes the keyboard the same way the computer and the
      // whiteboard do, so the player is not still walking about behind it.
      gameScene()?.disableKeys()
      state.exitDialogOpen = true
      state.error = ''
    },
    closeExitDialog: (state) => {
      gameScene()?.enableKeys()
      state.exitDialogOpen = false
      state.leaving = false
      state.error = ''
    },
    startLeaving: (state) => {
      state.leaving = true
      state.error = ''
    },
    /**
     * Leaving failed, so the player is still standing where they were. The
     * dialog stays up carrying the reason rather than closing on a room that
     * was never left - closing it would leave them with no way to try again.
     */
    failedLeaving: (state, action: PayloadAction<string>) => {
      state.leaving = false
      state.error = action.payload
    },
  },
  extraReducers: (builder) => {
    // the office is gone, so the question about it is too
    builder.addCase(leftOffice, () => initialState)
  },
})

export const { openExitDialog, closeExitDialog, startLeaving, failedLeaving } = exitSlice.actions

export default exitSlice.reducer
