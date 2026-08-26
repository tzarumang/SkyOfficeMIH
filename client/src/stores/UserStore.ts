import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { toPeerId } from '../util'
import { BackgroundMode } from '../../../types/BackgroundMode'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'

const PET_SOUND_KEY = 'skyoffice.petSounds'

/**
 * Remembered per browser, because somebody who turns the pets off wants them to
 * stay off tomorrow. Reading it is wrapped: a locked-down browser can throw on
 * localStorage rather than just return nothing.
 */
export function getInitialPetSounds() {
  try {
    return window.localStorage.getItem(PET_SOUND_KEY) !== 'off'
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
    petSounds: getInitialPetSounds(),
  },
  reducers: {
    togglePetSounds: (state) => {
      state.petSounds = !state.petSounds
      try {
        window.localStorage.setItem(PET_SOUND_KEY, state.petSounds ? 'on' : 'off')
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
  togglePetSounds,
} = userSlice.actions

export default userSlice.reducer
