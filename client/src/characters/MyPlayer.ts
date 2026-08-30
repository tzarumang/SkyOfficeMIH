import Phaser from 'phaser'
import PlayerSelector from './PlayerSelector'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { sittingShiftData } from './Player'
import Player from './Player'
import Network from '../services/Network'
import Chair from '../items/Chair'

import { phaserEvents, Event } from '../events/EventCenter'
import type Game from '../scenes/Game'
import { ensureAvatarTexture } from '../avatars/spriteFactory'
import store from '../stores'
import { pushPlayerJoinedMessage } from '../stores/ChatStore'
import { placeName } from '../placeName'
import { ITEM_SPECS } from '../../../types/Items'
import { NavKeys } from '../types/KeyboardState'
import { JoystickMovement } from '../components/Joystick'

/**
 * How often a walking player's position goes on the wire, in milliseconds.
 *
 * This used to be every frame - sixty messages a second for as long as
 * somebody held a key down - which is far more than anyone can see. Other
 * clients do not draw what arrives anyway: OtherPlayer eases towards the last
 * position it was given rather than snapping to it, so between updates it is
 * already inventing the intervening motion, and at twenty a second it invents
 * two frames' worth instead of none.
 *
 * The saving is the point. This traffic shares a connection with the voice
 * calls, and on a slow uplink sixty position updates a second is bandwidth
 * taken from the thing people actually notice. The server is comfortable
 * either way - it allows 120 messages a second and refills a movement budget
 * at 600 px/s against a player who moves at 200 - so this is purely about
 * leaving room for everything else.
 */
const MOVEMENT_UPDATE_MS = 50

export default class MyPlayer extends Player {
  private playContainerBody: Phaser.Physics.Arcade.Body
  private chairOnSit?: Chair
  public joystickMovement?: JoystickMovement
  /**
   * A tap on the on-screen action button, waiting for the next frame to read
   * it. Held the same way joystick movement is: the button is a React
   * component and the thing it acts on is a Phaser item, so the two meet at a
   * field rather than at a call.
   */
  private touchAction = false
  private lastMovementSentAt = 0
  private lastSentAnimKey = ''
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, id, frame)
    this.playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
  }

  setPlayerName(name: string) {
    this.playerName.setText(name)
    phaserEvents.emit(Event.MY_PLAYER_NAME_CHANGE, name)
    store.dispatch(pushPlayerJoinedMessage({ name, place: placeName() }))
  }

  setPlayerTexture(texture: string) {
    this.playerTexture = texture
    this.anims.play(`${this.playerTexture}_idle_down`, true)
    phaserEvents.emit(Event.MY_PLAYER_TEXTURE_CHANGE, this.x, this.y, this.currentAnimKey)
  }

  /**
   * The pet follows on every client from this alone; nothing else is sent.
   * Our own copy is made here, because the network deliberately skips replaying
   * our own updates back to us.
   */
  setPet(pet: string) {
    ;(this.scene as Game).setPetFor(this.playerId, pet, this.x, this.y)
    phaserEvents.emit(Event.MY_PLAYER_PET_CHANGE, pet)
  }

  /** builds the generated sheet, then tells everyone which one to build */
  setAvatar(avatar: string) {
    const texture = ensureAvatarTexture(this.scene, avatar)
    this.setPlayerTexture(texture)
    phaserEvents.emit(Event.MY_PLAYER_AVATAR_CHANGE, avatar)
  }

  handleJoystickMovement(movement: JoystickMovement) {
    this.joystickMovement = movement
  }

  /** the on-screen stand-in for E and R, for a player who has neither */
  handleTouchAction() {
    this.touchAction = true
  }

  /**
   * Puts this player's position on the wire, at most every
   * MOVEMENT_UPDATE_MS while they are walking.
   *
   * Turning is exempt from the interval. A change of direction is the one
   * thing the receiving end cannot invent - it eases towards wherever it was
   * last told, so it would keep walking the old way until the next tick - and
   * turns are rare enough that sending them at once costs nothing.
   *
   * `force` is for the moments that are not a step at all: sitting down,
   * standing up, and coming to a halt. Those carry the position everyone else
   * will hold until the player moves again, so they are never dropped - and
   * the halt is what makes the throttle safe, since it always lands the true
   * final position after the last interval was skipped.
   */
  private sendMovement(network: Network, force = false) {
    const now = this.scene.time.now
    const turned = this.currentAnimKey !== this.lastSentAnimKey

    if (!force && !turned && now - this.lastMovementSentAt < MOVEMENT_UPDATE_MS) return

    this.lastMovementSentAt = now
    this.lastSentAnimKey = this.currentAnimKey
    network.updatePlayer(this.x, this.y, this.currentAnimKey)
  }

  update(
    playerSelector: PlayerSelector,
    cursors: NavKeys,
    keyE: Phaser.Input.Keyboard.Key,
    keyR: Phaser.Input.Keyboard.Key,
    network: Network
  ) {
    if (!cursors) return

    const item = playerSelector.selectedItem

    // The manifest says which key an item answers to; the item says what that
    // does, because a screen share and a coffee machine share no code.
    const spec = item ? ITEM_SPECS[item.itemType] : undefined

    /**
     * Asked once a frame, because asking is what spends it: JustDown clears
     * the flag it reports. More than one thing here wants the same press -
     * sitting down, standing up, and walking out of the office - and the first
     * to ask used to take it whether or not it turned out to be the one the
     * press was for.
     */
    const pressedE = Phaser.Input.Keyboard.JustDown(keyE)
    const pressedR = Phaser.Input.Keyboard.JustDown(keyR)

    /**
     * And a tap on the on-screen button, which means "use what I am standing
     * at" - a touchscreen has no E and no R, so the manifest decides which of
     * the two the tap stands for. Read the same way, and spent the same way:
     * one tap is one action.
     */
    const tapped = this.touchAction
    this.touchAction = false

    const useE = pressedE || (tapped && spec?.key === 'E')
    const useR = pressedR || (tapped && spec?.key === 'R')

    if (useR && spec?.key === 'R') {
      item!.use(this.playerId, network)
    }

    switch (this.playerBehavior) {
      case PlayerBehavior.IDLE: {
        // if press E in front of selected chair
        if (useE && spec?.key === 'E' && item instanceof Chair) {
          const chairItem = item
          /**
           * move player to the chair and play sit animation
           * a delay is called to wait for player movement (from previous velocity) to end
           * as the player tends to move one more frame before sitting down causing player
           * not sitting at the center of the chair
           */
          this.scene.time.addEvent({
            delay: 10,
            callback: () => {
              // update character velocity and position
              this.setVelocity(0, 0)
              if (chairItem.itemDirection) {
                this.setPosition(
                  chairItem.x + sittingShiftData[chairItem.itemDirection][0],
                  chairItem.y + sittingShiftData[chairItem.itemDirection][1]
                ).setDepth(chairItem.depth + sittingShiftData[chairItem.itemDirection][2])
                // also update playerNameContainer velocity and position
                this.playContainerBody.setVelocity(0, 0)
                this.playerContainer.setPosition(
                  chairItem.x + sittingShiftData[chairItem.itemDirection][0],
                  chairItem.y + sittingShiftData[chairItem.itemDirection][1] - 30
                )
              }

              this.play(`${this.playerTexture}_sit_${chairItem.itemDirection}`, true)
              playerSelector.selectedItem = undefined
              if (chairItem.itemDirection === 'up') {
                playerSelector.setPosition(this.x, this.y - this.height)
              } else {
                playerSelector.setPosition(0, 0)
              }
              // send new location and anim to server
              this.sendMovement(network, true)
            },
            loop: false,
          })
          // set up new dialog as player sits down
          chairItem.clearDialogBox()
          chairItem.setDialogBox('Press E to leave')
          this.chairOnSit = chairItem
          this.playerBehavior = PlayerBehavior.SITTING
          return
        }

        /**
         * Anything else that answers to E says for itself what pressing it
         * does. The chair above is the exception rather than the rule: sitting
         * takes the player over for a moment and has to be written out here,
         * while the stairs out of the office only need telling they were used.
         */
        if (useE && spec?.key === 'E') {
          item!.use(this.playerId, network)
        }

        const speed = 200
        let vx = 0
        let vy = 0

        let joystickLeft = false
        let joystickRight = false
        let joystickUp = false
        let joystickDown = false

        if (this.joystickMovement?.isMoving) {
          joystickLeft = this.joystickMovement.direction.left
          joystickRight = this.joystickMovement.direction.right
          joystickUp = this.joystickMovement.direction.up
          joystickDown = this.joystickMovement.direction.down
        }

        if (cursors.left?.isDown || cursors.A?.isDown || joystickLeft) vx -= speed
        if (cursors.right?.isDown || cursors.D?.isDown || joystickRight) vx += speed
        if (cursors.up?.isDown || cursors.W?.isDown || joystickUp) {
          vy -= speed
          this.setDepth(this.y) //change player.depth if player.y changes
        }
        if (cursors.down?.isDown || cursors.S?.isDown || joystickDown) {
          vy += speed
          this.setDepth(this.y) //change player.depth if player.y changes
        }
        // update character velocity
        this.setVelocity(vx, vy)
        this.arcadeBody.velocity.setLength(speed)
        // also update playerNameContainer velocity
        this.playContainerBody.setVelocity(vx, vy)
        this.playContainerBody.velocity.setLength(speed)

        // update animation according to velocity and send new location and anim to server
        if (vx !== 0 || vy !== 0) this.sendMovement(network)
        if (vx > 0) {
          this.play(`${this.playerTexture}_run_right`, true)
        } else if (vx < 0) {
          this.play(`${this.playerTexture}_run_left`, true)
        } else if (vy > 0) {
          this.play(`${this.playerTexture}_run_down`, true)
        } else if (vy < 0) {
          this.play(`${this.playerTexture}_run_up`, true)
        } else {
          const parts = this.currentAnimKey.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          // this prevents idle animation keeps getting called
          if (this.currentAnimKey !== newAnim) {
            this.play(parts.join('_'), true)
            // send new location and anim to server
            this.sendMovement(network, true)
          }
        }
        break
      }

      case PlayerBehavior.SITTING: {
        // back to idle if player press E while sitting. A tap counts too, and
        // needs no item to have been selected: sitting clears the selection,
        // so there is nothing left whose key the tap could be matched against.
        if (pressedE || tapped) {
          const parts = this.currentAnimKey.split('_')
          parts[1] = 'idle'
          this.play(parts.join('_'), true)
          this.playerBehavior = PlayerBehavior.IDLE
          this.chairOnSit?.clearDialogBox()
          playerSelector.setPosition(this.x, this.y)
          playerSelector.update(this, cursors)
          this.sendMovement(network, true)
        }
        break
      }
    }
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      myPlayer(x: number, y: number, texture: string, id: string, frame?: string | number): MyPlayer
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'myPlayer',
  function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    const sprite = new MyPlayer(this.scene, x, y, texture, id, frame)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

    const collisionScale = [0.5, 0.2]
    ;(sprite.body as Phaser.Physics.Arcade.Body)
      .setSize(sprite.width * collisionScale[0], sprite.height * collisionScale[1])
      .setOffset(
        sprite.width * (1 - collisionScale[0]) * 0.5,
        sprite.height * (1 - collisionScale[1])
      )

    return sprite
  }
)
