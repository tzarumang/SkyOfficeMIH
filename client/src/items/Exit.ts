import store from '../stores'
import Item from './Item'
import { openExitDialog } from '../stores/ExitStore'

/**
 * The staircase out of the office.
 *
 * Every other item here does something inside the room; this one is the way
 * out of it, and it is furniture rather than a trigger underfoot on purpose -
 * a doorway you fall through by walking over it would send people back to the
 * lobby mid-conversation. Pressing the key asks first; ExitStore holds the
 * question and Bootstrap carries out the answer.
 */
export default class Exit extends Item {
  use() {
    store.dispatch(openExitDialog())
  }
}
