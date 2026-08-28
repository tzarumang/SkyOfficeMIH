/**
 * A way to reach the running game that does not drag Phaser in with it.
 *
 * Phaser is 1.4 MB, over half the bundle, and until this existed every route
 * into the app went through it: the redux stores and nine React components all
 * imported PhaserGame, PhaserGame constructed the game at import time, and so
 * `index.tsx` could not render a single pixel until the whole engine had
 * downloaded, parsed and booted. On a slow line that is a white page for as
 * long as it takes.
 *
 * Nothing here imports Phaser at runtime - the types below are `import type`,
 * which the compiler erases - so React can render the landing screen while the
 * engine is still arriving. startPhaserGame() hands the game back here once it
 * has, and the accessors are undefined until then.
 *
 * The waiting is already designed for: every control on the landing screen is
 * disabled until `lobbyJoined` turns true, and it is the game's Bootstrap
 * scene that connects the lobby and dispatches it. So the not-yet state these
 * accessors can return is the same one the UI already shows while connecting,
 * rather than a new one callers have to learn.
 */
import type Phaser from 'phaser'
import type Game from './scenes/Game'
import type Bootstrap from './scenes/Bootstrap'

let phaserGame: Phaser.Game | undefined

/** Called by PhaserGame.ts once the engine has loaded and the game is up. */
export function setPhaserGame(game: Phaser.Game) {
  phaserGame = game
}

/**
 * The office scene, or undefined before the engine has booted.
 *
 * Callers that only run once somebody is inside an office - the chat box, the
 * screen share, the joystick - will never see undefined in practice. It is
 * returned rather than thrown so the ones that can run earlier do not have to
 * be written twice.
 */
export function gameScene(): Game | undefined {
  return phaserGame?.scene.keys.game as Game | undefined
}

/** The bootstrap scene, which owns the network connection. */
export function bootstrapScene(): Bootstrap | undefined {
  return phaserGame?.scene.keys.bootstrap as Bootstrap | undefined
}
