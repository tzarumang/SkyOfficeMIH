/**
 * A way to reach the store from modules the store itself depends on.
 *
 * ShareScreenManager dispatches and reads state, so it imported the store
 * directly - while ComputerStore imported ShareScreenManager in order to
 * construct one. That is a cycle: stores/index -> ComputerStore ->
 * ShareScreenManager -> stores/index. ES modules tolerate a cycle only if
 * nothing in it is *used* during evaluation, and configureStore() uses every
 * reducer as it builds the store, so whichever module the entry point happened
 * to reach first decided whether the app booted at all.
 *
 * It booted because index.tsx imported PhaserGame before anything else, and
 * that graph reached stores/index first by luck. Deferring Phaser took the
 * luck away and the app died on `Cannot access 'computerReducer' before
 * initialization` - a fault that was always there, waiting for any change to
 * the import order.
 *
 * Nothing here imports the store at runtime, so the cycle is gone rather than
 * re-ordered.
 */
import type { AppStore } from './index'

let store: AppStore | undefined

/** Called once by stores/index.ts, as soon as the store exists. */
export function setAppStore(created: AppStore) {
  store = created
}

/**
 * Throws rather than returning undefined: unlike the game, which genuinely is
 * absent for the first moment, the store is built during module evaluation and
 * every caller here runs long after. Reaching this without one is a bug in the
 * wiring, and silence would only hide it.
 */
export function appStore(): AppStore {
  if (!store) throw new Error('the redux store was reached before it was created')
  return store
}
