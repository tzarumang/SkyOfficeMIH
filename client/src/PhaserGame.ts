import Phaser from 'phaser'
import Game from './scenes/Game'
import Background from './scenes/Background'
import Bootstrap from './scenes/Bootstrap'
import { setPhaserGame } from './gameHandle'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'phaser-container',
  backgroundColor: '#93cbee',
  pixelArt: true, // Prevent pixel art from becoming blurred when scaled.
  scale: {
    mode: Phaser.Scale.ScaleModes.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  autoFocus: true,
  scene: [Bootstrap, Background, Game],
}

/**
 * Boots the engine.
 *
 * This module is reached by a dynamic import from index.tsx and by nothing
 * else, which is what keeps Phaser out of the entry chunk. It used to
 * construct the game as a side effect of being imported, and was imported by
 * the stores and by nine components, so the engine was on the critical path to
 * the first paint. The rest of the app now goes through gameHandle instead.
 *
 * Idempotent, because React's StrictMode runs effects twice in development and
 * two Phaser games fighting over one canvas is a mess to debug.
 */
let phaserGame: Phaser.Game | undefined

export function startPhaserGame() {
  if (!phaserGame) {
    phaserGame = new Phaser.Game(config)
    setPhaserGame(phaserGame)

    // handy in the console while developing, but it exposes the scene graph
    // and the live room connection, so it stays out of production builds
    if (import.meta.env.DEV) {
      ;(window as any).game = phaserGame
    }
  }

  return phaserGame
}
