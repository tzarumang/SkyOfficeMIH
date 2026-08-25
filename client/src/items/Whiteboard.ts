import store from '../stores'
import Item from './Item'
import Network from '../services/Network'
import { openWhiteboardDialog } from '../stores/WhiteboardStore'

export default class Whiteboard extends Item {
  use(playerId: string, network: Network) {
    if (!this.id) return
    store.dispatch(openWhiteboardDialog(this.id))
    network.connectToWhiteboard(this.id)
  }
}
