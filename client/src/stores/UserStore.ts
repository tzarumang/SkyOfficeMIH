import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { toPeerId } from '../util'
import { BackgroundMode } from '../../../types/BackgroundMode'

import { bootstrapScene } from '../gameHandle'
import { leftOffice } from './leftOffice'

/**
 * The setting covers everything the office makes a noise about - pets, and now
 * the cleaning robot - but the key is the one it was first stored under, so
 * nobody who already turned the sound off has it come back on.
 */
const SOUND_KEY = 'skyoffice.petSounds'

/**
 * Remembered per browser, because somebody who turns the sound off wants it to
 * stay off tomorrow. Reading it is wrapped: a locked-down browser can throw on
 * localStorage rather than just return nothing.
 */
export function getInitialAmbientSounds() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function getInitialBackgroundMode() {
  const currentHour = new Date().getHours()
  return currentHour > 6 && currentHour <= 18 ? BackgroundMode.DAY : BackgroundMode.NIGHT
}

export const userSlice = createSlice({
  name: 'user',
  initialState: {
    backgroundMode: getInitialBackgroundMode(),
    sessionId: '',
    videoConnected: false,
    loggedIn: false,
    /**
     * Who this player chose to be, kept here rather than only on the sprite.
     *
     * Walking out of one office and into another builds a new sprite, and
     * without this the name, the face and the pet would be gone with the old
     * one - the login screen would have to be answered again on the way into
     * a lobby the player never left the app to reach.
     */
    playerName: '',
    avatar: '',
    pet: '',
    playerNameMap: new Map<string, string>(),
    showJoystick: window.innerWidth < 650,
    ambientSounds: getInitialAmbientSounds(),
  },
  reducers: {
    toggleAmbientSounds: (state) => {
      state.ambientSounds = !state.ambientSounds
      try {
        window.localStorage.setItem(SOUND_KEY, state.ambientSounds ? 'on' : 'off')
      } catch {
        // a browser that will not store it still honours it for this session
      }
    },
    toggleBackgroundMode: (state) => {
      const newMode =
        state.backgroundMode === BackgroundMode.DAY ? BackgroundMode.NIGHT : BackgroundMode.DAY

      state.backgroundMode = newMode
      const bootstrap = bootstrapScene()
      bootstrap?.changeBackgroundMode(newMode)
    },
    setSessionId: (state, action: PayloadAction<string>) => {
      state.sessionId = action.payload
    },
    setVideoConnected: (state, action: PayloadAction<boolean>) => {
      state.videoConnected = action.payload
    },
    setLoggedIn: (state, action: PayloadAction<boolean>) => {
      state.loggedIn = action.payload
    },
    /** what the login screen was answered with, so the next office can rebuild it */
    setIdentity: (
      state,
      action: PayloadAction<{ name: string; avatar: string; pet: string }>
    ) => {
      state.playerName = action.payload.name
      state.avatar = action.payload.avatar
      state.pet = action.payload.pet
    },
    setPlayerNameMap: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.playerNameMap.set(toPeerId(action.payload.id), action.payload.name)
    },
    removePlayerNameMap: (state, action: PayloadAction<string>) => {
      state.playerNameMap.delete(toPeerId(action.payload))
    },
    setShowJoystick: (state, action: PayloadAction<boolean>) => {
      state.showJoystick = action.payload
    },
  },
  extraReducers: (builder) => {
    /**
     * The office is behind us: its session id and the names that went with it
     * mean nothing in the next one, and the camera is torn down with the
     * connection that carried it. Who this player *is* survives, which is the
     * whole point of keeping it here.
     */
    builder.addCase(leftOffice, (state) => {
      state.sessionId = ''
      state.videoConnected = false
      state.playerNameMap.clear()
    })
  },
})

export const {
  toggleBackgroundMode,
  setSessionId,
  setVideoConnected,
  setLoggedIn,
  setIdentity,
  setPlayerNameMap,
  removePlayerNameMap,
  setShowJoystick,
  toggleAmbientSounds,
} = userSlice.actions

export default userSlice.reducer
