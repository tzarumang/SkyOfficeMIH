/**
 * The cleaning robot's motor. Unlike a pet, which speaks now and then, this
 * runs the whole time it is near you - so it has to be quiet enough to sit
 * under somebody's work all day without ever being the thing they notice.
 *
 * That is what the ceiling below is for: even standing on top of the robot it
 * stays well under a pet's bark, and it fades to nothing across the room.
 * Synthesised for the same reason the sprite is drawn - nothing to ship.
 */
const CEILING = 0.045

/** how quickly it fades in and out, so walking past is a swell and not a click */
const FADE_SECONDS = 0.25

let context: AudioContext | null = null

function audio() {
  if (context) return context

  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null

  context = new Ctor()
  return context
}

interface Motor {
  gain: GainNode
  stop(): void
}

/**
 * One motor per robot, built the first time it can actually be heard. Building
 * it lazily keeps a muted office from ever opening an audio context, and means
 * the browser's autoplay rules are met by then - nothing here runs before
 * somebody has clicked into the game.
 */
function build(ctx: AudioContext): Motor {
  const gain = ctx.createGain()
  gain.gain.value = 0

  // a lowpass takes the buzz off the sawtooth and leaves the body of a motor
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 620
  filter.Q.value = 0.7

  const motor = ctx.createOscillator()
  motor.type = 'sawtooth'
  motor.frequency.value = 86

  const suction = ctx.createOscillator()
  suction.type = 'triangle'
  suction.frequency.value = 193

  const suctionGain = ctx.createGain()
  suctionGain.gain.value = 0.35

  // a slow sweep of the filter, so it breathes rather than sitting on one dead
  // note - a perfectly steady tone is the kind of sound that wears people down
  const wobble = ctx.createOscillator()
  wobble.type = 'sine'
  wobble.frequency.value = 0.23
  const wobbleDepth = ctx.createGain()
  wobbleDepth.gain.value = 90

  motor.connect(filter)
  suction.connect(suctionGain)
  suctionGain.connect(filter)
  wobble.connect(wobbleDepth)
  wobbleDepth.connect(filter.frequency)
  filter.connect(gain)
  gain.connect(ctx.destination)

  motor.start()
  suction.start()
  wobble.start()

  return {
    gain,
    stop() {
      motor.stop()
      suction.stop()
      wobble.stop()
      gain.disconnect()
    },
  }
}

export default class RoombaHum {
  private motor: Motor | null = null

  /**
   * @param volume 0 to 1, already scaled by how far away the robot is. Zero
   * before anything has been built means no audio context is ever created.
   */
  set(volume: number) {
    const wanted = Math.min(Math.max(volume, 0), 1) * CEILING

    if (!this.motor) {
      if (wanted <= 0.0001) return

      const ctx = audio()
      if (!ctx) return
      if (ctx.state === 'suspended') void ctx.resume()
      if (ctx.state === 'closed') return

      this.motor = build(ctx)
    }

    const ctx = context!
    this.motor.gain.gain.setTargetAtTime(wanted, ctx.currentTime, FADE_SECONDS)
  }

  stop() {
    this.motor?.stop()
    this.motor = null
  }
}
