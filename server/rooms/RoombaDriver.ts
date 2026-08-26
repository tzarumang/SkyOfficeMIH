import { ItemBox, OfficeMap } from './MapObjects'
import { ROOMBA_RADIUS, ROOMBA_SPEED } from '../../types/Roomba'

/**
 * Drives the cleaning robot around an office, the way the real thing does it:
 * head in a straight line until something is in the way, then turn and carry
 * on. There is no path to plan and nothing to remember, which is the point -
 * the room ticks this ten times a second and it has to stay cheap.
 *
 * It lives apart from the room so the steering can be exercised against a map
 * without standing a server up.
 */

/** how often it changes its mind with nothing in the way, per second */
const WANDER_PER_SECOND = 0.06

/**
 * The headings it tries when it bumps into something, as turns away from the
 * one it was on. Sharp turns come first so it hugs whatever it hit rather than
 * bouncing back across the room, and turning right round is the last resort
 * for a dead end.
 */
const ESCAPE_TURNS = [
  Math.PI / 2,
  -Math.PI / 2,
  (Math.PI * 2) / 3,
  (-Math.PI * 2) / 3,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI,
]

/** how far off each escape heading it is allowed to wobble */
const ESCAPE_JITTER = 0.35

export interface RoombaPose {
  x: number
  y: number
  /** heading in radians */
  angle: number
}

export default class RoombaDriver {
  private office: OfficeMap
  private obstacles: ItemBox[]
  private random: () => number
  pose: RoombaPose

  /**
   * Builds a driver if the office has somewhere to put the robot, and nothing
   * if it has not. A floor plan with no room for a disc this wide is not worth
   * failing a room over - that office simply goes uncleaned.
   */
  static place(office: OfficeMap, obstacles: ItemBox[], random: () => number = Math.random) {
    const driver = new RoombaDriver(office, obstacles, random)
    const start = driver.startingPoint()
    if (!start) return null

    driver.pose = { ...start, angle: random() * Math.PI * 2 }
    return driver
  }

  private constructor(office: OfficeMap, obstacles: ItemBox[], random: () => number) {
    this.office = office
    this.obstacles = obstacles
    this.random = random
    this.pose = { x: 0, y: 0, angle: 0 }
  }

  /**
   * Moves it on by one tick. Anything that is in the way simply costs it the
   * step it was going to take, so it turns on the spot and sets off again -
   * which is both what the real thing does and what stops it ever ending up
   * inside a wall.
   */
  advance(deltaMs: number) {
    const seconds = deltaMs / 1000
    const step = ROOMBA_SPEED * seconds
    const next = {
      x: this.pose.x + Math.cos(this.pose.angle) * step,
      y: this.pose.y + Math.sin(this.pose.angle) * step,
    }

    if (this.isClear(next.x, next.y)) {
      this.pose.x = next.x
      this.pose.y = next.y

      // Left alone it would trace the same loop forever, so now and then it
      // strikes out somewhere else even with a clear run ahead.
      if (this.random() < WANDER_PER_SECOND * seconds) {
        this.pose.angle = this.wrap(this.pose.angle + (this.random() - 0.5) * Math.PI)
      }
      return this.pose
    }

    this.pose.angle = this.escapeHeading(step)
    return this.pose
  }

  /**
   * Picks a way out of whatever it just ran into: the first turn that has
   * room to move, or a reversal if it is boxed in. Without the free-space
   * check it could pick a heading straight back into the same wall and spend
   * the next several seconds shuffling against it.
   */
  private escapeHeading(step: number) {
    const preferred = this.random() < 0.5 ? 1 : -1

    for (const turn of ESCAPE_TURNS) {
      const angle = this.wrap(
        this.pose.angle + turn * preferred + (this.random() - 0.5) * ESCAPE_JITTER
      )
      // look a few steps ahead, so a heading with barely a pixel of room does
      // not count as an escape
      if (this.isClear(this.pose.x + Math.cos(angle) * step * 4, this.pose.y + Math.sin(angle) * step * 4)) {
        return angle
      }
    }

    return this.wrap(this.pose.angle + Math.PI)
  }

  /** whether the whole disc fits here, walls and furniture included */
  private isClear(x: number, y: number) {
    const { width, height } = this.office.bounds
    if (x < ROOMBA_RADIUS || y < ROOMBA_RADIUS) return false
    if (x > width - ROOMBA_RADIUS || y > height - ROOMBA_RADIUS) return false

    // the centre and four points on the rim: enough to keep a disc this size
    // out of a wall without sampling every tile it covers
    if (this.office.isSolidAt(x, y)) return false
    if (this.office.isSolidAt(x - ROOMBA_RADIUS, y)) return false
    if (this.office.isSolidAt(x + ROOMBA_RADIUS, y)) return false
    if (this.office.isSolidAt(x, y - ROOMBA_RADIUS)) return false
    if (this.office.isSolidAt(x, y + ROOMBA_RADIUS)) return false

    return !this.obstacles.some(
      (box) =>
        Math.abs(x - box.x) <= box.halfWidth + ROOMBA_RADIUS &&
        Math.abs(y - box.y) <= box.halfHeight + ROOMBA_RADIUS
    )
  }

  /**
   * Somewhere it can actually stand. The door is the obvious place to start,
   * but a player spawn is not necessarily clear of a disc this wide, so it
   * searches outwards from there and only gives up once it has covered the
   * floor.
   */
  private startingPoint(): { x: number; y: number } | null {
    const spawn = this.office.spawn
    if (this.isClear(spawn.x, spawn.y)) return { x: spawn.x, y: spawn.y }

    const { width, height } = this.office.bounds
    const stride = ROOMBA_RADIUS * 2

    for (let ring = 1; ring * stride < Math.max(width, height); ring++) {
      const span = ring * stride
      for (let i = 0; i <= ring * 8; i++) {
        const at = (i / (ring * 8)) * Math.PI * 2
        const x = spawn.x + Math.cos(at) * span
        const y = spawn.y + Math.sin(at) * span
        if (this.isClear(x, y)) return { x, y }
      }
    }

    // nowhere on this floor plan has room for it
    return null
  }

  private wrap(angle: number) {
    const full = Math.PI * 2
    return ((angle % full) + full) % full
  }
}
