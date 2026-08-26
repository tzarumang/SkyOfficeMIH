import { PetKind } from '../../../types/Pet'
import { seededRandom } from './palette'

/**
 * Pet noises are synthesised rather than loaded, for the same reason the
 * sprites are drawn: nothing to ship, and a seed gives every pet its own voice.
 *
 * This is the first audio in the app, so the restraint matters more than the
 * sounds. People have this open beside their work all day: pets speak rarely,
 * quietly, only when they are near enough to be worth hearing, and never at all
 * if the listener has turned them off.
 */
let context: AudioContext | null = null

function audio() {
  if (context) return context

  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null

  context = new Ctor()
  return context
}

/** browsers hold the context suspended until the page has been interacted with */
function ready(ctx: AudioContext) {
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx.state !== 'closed'
}

type Voice = { start: number; peak: number; end: number; type: OscillatorType; length: number }

/** one call, shaped differently per animal; the seed shifts the pitch */
function voiceFor(kind: PetKind, pitch: number): Voice {
  if (kind === 'c') {
    // a meow rises then falls away
    return { start: 420 * pitch, peak: 700 * pitch, end: 380 * pitch, type: 'triangle', length: 0.42 }
  }
  if (kind === 'b') {
    return { start: 2200 * pitch, peak: 3200 * pitch, end: 2600 * pitch, type: 'sine', length: 0.09 }
  }
  // a bark drops sharply
  return { start: 260 * pitch, peak: 190 * pitch, end: 120 * pitch, type: 'sawtooth', length: 0.16 }
}

function speak(ctx: AudioContext, voice: Voice, at: number, volume: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = voice.type

  osc.frequency.setValueAtTime(voice.start, at)
  osc.frequency.exponentialRampToValueAtTime(voice.peak, at + voice.length * 0.4)
  osc.frequency.exponentialRampToValueAtTime(voice.end, at + voice.length)

  // a quick swell and a soft tail, so nothing clicks
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + voice.length * 0.15)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.length)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + voice.length + 0.02)
}

/**
 * @param volume 0 to 1, already scaled by how far away the pet is
 */
export function playPetVoice(kind: PetKind, seed: number, volume: number) {
  if (volume <= 0.001) return

  const ctx = audio()
  if (!ctx || !ready(ctx)) return

  const random = seededRandom(seed)
  // every pet of a kind sounds a little different from its neighbours
  const pitch = 0.85 + random() * 0.3
  const voice = voiceFor(kind, pitch)

  // dogs and birds repeat themselves; cats say it once
  const calls = kind === 'b' ? 3 : kind === 'd' ? 2 : 1
  const gap = kind === 'b' ? 0.11 : 0.19

  for (let i = 0; i < calls; i++) {
    speak(ctx, voice, ctx.currentTime + i * gap, Math.min(volume, 0.14))
  }
}

/** how loud a pet at this distance should be, and silent well before the edge */
export function volumeForDistance(distance: number, earshot: number) {
  if (distance >= earshot) return 0
  const near = 1 - distance / earshot
  return near * near
}
