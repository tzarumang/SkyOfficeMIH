import Peer from 'peerjs'
import store from '../stores'
import { setMyStream, addVideoStream, removeVideoStream } from '../stores/ComputerStore'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { PEER_RECONNECT_DELAY_MS, peerOptions } from './peerConfig'
import { toScreenSharePeerId } from '../util'
import { ItemType } from '../../../types/Items'

export default class ShareScreenManager {
  private myPeer: Peer
  myStream?: MediaStream
  /** screen-share peer ids of the users currently at the same computer */
  private allowedPeers = new Set<string>()
  /** whether the dialog is open, which is when this peer belongs on the broker */
  private wantsBroker = false

  constructor(private userId: string) {
    const sanatizedId = toScreenSharePeerId(userId)
    this.myPeer = new Peer(sanatizedId, peerOptions())
    this.myPeer.on('error', (err) => {
      console.log('ShareScreenWebRTC err.type', err.type)
      console.error('ShareScreenWebRTC', err)
    })

    // The same broker registration the voice peer keeps alive, except that
    // this one is dropped on purpose when the dialog closes - so it only
    // redials while the dialog is open and the drop was not ours.
    this.myPeer.on('disconnected', () => {
      window.setTimeout(() => {
        if (this.wantsBroker && !this.myPeer.destroyed && this.myPeer.disconnected) {
          this.myPeer.reconnect()
        }
      }, PEER_RECONNECT_DELAY_MS)
    })

    this.myPeer.on('call', (call) => {
      // only the users the server placed at this computer may push a stream
      // into our dialog
      if (!this.allowedPeers.has(call.peer)) {
        console.warn('rejected screen share from peer that is not at this computer:', call.peer)
        call.close()
        return
      }

      call.answer()

      call.on('stream', (userVideoStream) => {
        store.dispatch(addVideoStream({ id: call.peer, call, stream: userVideoStream }))
      })
      // we handled on close on our own
    })
  }

  onOpen(computerId: string) {
    this.wantsBroker = true
    if (this.myPeer.disconnected) {
      this.myPeer.reconnect()
    }

    // whoever is already at this computer joined before our dialog opened, so
    // they never came through onUserJoined - accept their share too
    const game = phaserGame.scene.keys.game as Game
    const computerItem = game.itemById(ItemType.COMPUTER, computerId)
    if (computerItem) {
      for (const userId of computerItem.currentUsers) {
        this.allowedPeers.add(toScreenSharePeerId(userId))
      }
    }
  }

  onClose() {
    this.wantsBroker = false
    this.stopScreenShare(false)
    this.allowedPeers.clear()
    this.myPeer.disconnect()
  }


  startScreenShare() {
    // @ts-ignore
    navigator.mediaDevices
      ?.getDisplayMedia({
        video: true,
        audio: true,
      })
      .then((stream) => {
        // Detect when user clicks "Stop sharing" outside of our UI.
        // https://stackoverflow.com/a/25179198
        const track = stream.getVideoTracks()[0]
        if (track) {
          track.onended = () => {
            this.stopScreenShare()
          }
        }

        this.myStream = stream
        store.dispatch(setMyStream(stream))

        // Call all existing users.
        const game = phaserGame.scene.keys.game as Game
        const computerItem = game.itemById(ItemType.COMPUTER, store.getState().computer.computerId!)
        if (computerItem) {
          for (const userId of computerItem.currentUsers) {
            this.onUserJoined(userId)
          }
        }
      })
  }

  // TODO(daxchen): Fix this trash hack, if we call store.dispatch here when calling
  // from onClose, it causes redux reducer cycle, this may be fixable by using thunk
  // or something.
  stopScreenShare(shouldDispatch = true) {
    this.myStream?.getTracks().forEach((track) => track.stop())
    this.myStream = undefined
    if (shouldDispatch) {
      store.dispatch(setMyStream(null))
      // Manually let all other existing users know screen sharing is stopped
      const game = phaserGame.scene.keys.game as Game
      game.network.onStopScreenShare(store.getState().computer.computerId!)
    }
  }

  onUserJoined(userId: string) {
    if (userId === this.userId) return

    const sanatizedId = toScreenSharePeerId(userId)
    this.allowedPeers.add(sanatizedId)

    if (!this.myStream) return
    this.myPeer.call(sanatizedId, this.myStream)
  }

  onUserLeft(userId: string) {
    if (userId === this.userId) return

    const sanatizedId = toScreenSharePeerId(userId)
    this.allowedPeers.delete(sanatizedId)
    store.dispatch(removeVideoStream(sanatizedId))
  }
}
