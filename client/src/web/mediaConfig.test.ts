import { describe, expect, it, vi } from 'vitest'
import {
  CAMERA_CONSTRAINTS,
  MIN_VIDEO_BITRATE_BPS,
  SCREEN_SHARE_BITRATE_BPS,
  VIDEO_UPLOAD_BUDGET_BPS,
  applyVideoBudget,
  videoBitrateFor,
  whenConnected,
} from './mediaConfig'

/**
 * The numbers here decide what a call costs, and getting them wrong is quiet:
 * too high and the game's own websocket starts arriving late behind the video,
 * too low and nobody can see anybody. The screen share cap was wrong for a
 * while in exactly that way - hung on an event that never fires - and a
 * passing build said nothing about it.
 */

type FakeSender = {
  track: { kind: string } | null
  params: RTCRtpSendParameters
  getParameters(): RTCRtpSendParameters
  setParameters(next: RTCRtpSendParameters): Promise<void>
}

function sender(kind: string, encodings: RTCRtpEncodingParameters[] = [{}]): FakeSender {
  const self: FakeSender = {
    track: kind ? { kind } : null,
    params: { encodings } as RTCRtpSendParameters,
    getParameters: () => self.params,
    setParameters: async (next) => {
      self.params = next
    },
  }
  return self
}

const connection = (senders: FakeSender[], state: RTCPeerConnectionState = 'connected') => {
  const listeners: Array<() => void> = []
  return {
    connectionState: state,
    getSenders: () => senders,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => {
      const at = listeners.indexOf(fn)
      if (at >= 0) listeners.splice(at, 1)
    },
    listeners,
  }
}

describe('videoBitrateFor', () => {
  it('gives one call the whole budget', () => {
    expect(videoBitrateFor(1)).toBe(VIDEO_UPLOAD_BUDGET_BPS)
  })

  it('splits it evenly, because a mesh encodes the camera once per person', () => {
    expect(videoBitrateFor(2)).toBe(VIDEO_UPLOAD_BUDGET_BPS / 2)
    expect(videoBitrateFor(4)).toBe(VIDEO_UPLOAD_BUDGET_BPS / 4)
  })

  it('never divides below the floor - past that it drops video instead', () => {
    const lastWatchable = Math.floor(VIDEO_UPLOAD_BUDGET_BPS / MIN_VIDEO_BITRATE_BPS)
    expect(videoBitrateFor(lastWatchable)).toBeGreaterThanOrEqual(MIN_VIDEO_BITRATE_BPS)
    expect(videoBitrateFor(lastWatchable + 1)).toBeNull()
  })

  it('has nothing to share out when no call is open', () => {
    expect(videoBitrateFor(0)).toBeNull()
  })
})

describe('capture constraints', () => {
  it('asks for far less than a webcam would volunteer', () => {
    const video = CAMERA_CONSTRAINTS.video as MediaTrackConstraints
    // the tiles are 160x160 CSS pixels, so 320x240 is already generous
    expect((video.width as ConstrainULongRange).max).toBeLessThanOrEqual(640)
    expect((video.height as ConstrainULongRange).max).toBeLessThanOrEqual(480)
    expect((video.frameRate as ConstrainDoubleRange).max).toBeLessThanOrEqual(24)
  })

  it('asks for the echo cancellation a shared room needs', () => {
    const audio = CAMERA_CONSTRAINTS.audio as MediaTrackConstraints
    expect(audio.echoCancellation).toBe(true)
    expect(audio.noiseSuppression).toBe(true)
  })
})

describe('applyVideoBudget', () => {
  it('caps video and leaves audio alone', async () => {
    const video = sender('video')
    const audio = sender('audio')
    await applyVideoBudget(connection([video, audio]) as never, 300000)

    expect(video.params.encodings[0].maxBitrate).toBe(300000)
    expect(video.params.encodings[0].active).toBe(true)
    expect(audio.params.encodings[0].maxBitrate).toBeUndefined()
  })

  it('switches the sender off rather than sending unwatchable video', async () => {
    const video = sender('video')
    await applyVideoBudget(connection([video]) as never, null)

    expect(video.params.encodings[0].active).toBe(false)
  })

  it('gives a sender an encoding when negotiation has not left one', async () => {
    const video = sender('video', [])
    await applyVideoBudget(connection([video]) as never, 500000)

    expect(video.params.encodings).toHaveLength(1)
    expect(video.params.encodings[0].maxBitrate).toBe(500000)
  })

  it('survives a sender that refuses the change', async () => {
    const video = sender('video')
    video.setParameters = () => Promise.reject(new Error('nope'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // an uncapped call is better than no call
    await expect(applyVideoBudget(connection([video]) as never, 100)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does nothing without a connection', async () => {
    await expect(applyVideoBudget(undefined, 100)).resolves.toBeUndefined()
  })
})

describe('whenConnected', () => {
  it('runs at once when the call is already up', () => {
    const run = vi.fn()
    whenConnected(connection([], 'connected') as never, run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('waits, then runs when the call connects', () => {
    const run = vi.fn()
    const pc = connection([], 'new')
    whenConnected(pc as never, run)
    expect(run).not.toHaveBeenCalled()

    pc.connectionState = 'connected'
    pc.listeners.forEach((fn) => fn())
    expect(run).toHaveBeenCalledTimes(1)
    // and stops listening, so a later change cannot run it twice
    expect(pc.listeners).toHaveLength(0)
  })

  it('gives up on a call that fails', () => {
    const run = vi.fn()
    const pc = connection([], 'new')
    whenConnected(pc as never, run)

    pc.connectionState = 'failed'
    pc.listeners.forEach((fn) => fn())
    expect(run).not.toHaveBeenCalled()
    expect(pc.listeners).toHaveLength(0)
  })

  it('does nothing without a connection', () => {
    const run = vi.fn()
    whenConnected(null, run)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('screen share', () => {
  it('is capped on its own rather than out of the camera budget', () => {
    // one person shares at a computer; the mesh split does not apply
    expect(SCREEN_SHARE_BITRATE_BPS).toBeGreaterThan(MIN_VIDEO_BITRATE_BPS)
  })
})
