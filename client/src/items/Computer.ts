import store from '../stores'
import Item from './Item'
import Network from '../services/Network'
import { openComputerDialog } from '../stores/ComputerStore'

export default class Computer extends Item {
  use(playerId: string, network: Network) {
    if (!this.id) return
    store.dispatch(openComputerDialog({ computerId: this.id, myUserId: playerId }))
    network.connectToComputer(this.id)
  }

  /**
   * The share screen manager only knows about the computer the dialog is open
   * on, so it has to be told who comes and goes at that one.
   */
  protected onUserAdded(userId: string) {
    const computerState = store.getState().computer
    if (computerState.computerId === this.id) {
      computerState.shareScreenManager?.onUserJoined(userId)
    }
  }

  protected onUserRemoved(userId: string) {
    const computerState = store.getState().computer
    if (computerState.computerId === this.id) {
      computerState.shareScreenManager?.onUserLeft(userId)
    }
  }
}
