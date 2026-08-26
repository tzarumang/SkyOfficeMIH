import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { toPeerId } from '../util'
import { BackgroundMode } from '../../../types/BackgroundMode'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'

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
      const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
      bootstrap.changeBackgroundMode(newMode)
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
})

export const {
  toggleBackgroundMode,
  setSessionId,
  setVideoConnected,
  setLoggedIn,
  setPlayerNameMap,
  removePlayerNameMap,
  setShowJoystick,
  toggleAmbientSounds,
} = userSlice.actions

export default userSlice.reducer
