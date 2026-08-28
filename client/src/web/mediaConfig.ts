/**
 * What the camera captures, and what each call is allowed to spend on sending
 * it. Both of these were previously left to the browser, which is the wrong
 * default for this app in two different ways.
 *
 * Capture: the video tiles in this office are 160x160 CSS pixels - see
 * `.video-grid` in index.scss, which also sets `object-fit: cover`, so
 * anything wider is cropped away rather than shown. An unconstrained
 * getUserMedia picks 1280x720 on most webcams, roughly thirty times the pixels
 * that survive to the screen. On a slow uplink that is the entire budget spent
 * on detail nobody sees.
 *
 * Spend: this is a full mesh. Standing with four other people means four
 * separate encodes of the same camera going out, so what matters is not the
 * bitrate of one call but the total of all of them - which is what
 * videoBitrateFor() divides up.
 */

/**
 * Deliberately below what the camera can do. `ideal` rather than `exact` so a
 * device that cannot hit these still opens instead of failing outright, and a
 * `max` so an obliging camera does not quietly hand back 1080p.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 320, max: 640 },
    height: { ideal: 240, max: 480 },
    frameRate: { ideal: 20, max: 24 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}

/**
 * A shared screen is text far more often than it is motion, so this trades
 * frames for legibility - the opposite of the camera above. Capped at 1600
 * wide because a 4K monitor shared raw is megabits per second on its own.
 */
export const SCREEN_SHARE_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { max: 1600 },
    height: { max: 900 },
    frameRate: { ideal: 5, max: 10 },
  },
  audio: true,
}

/**
 * Total outbound video, across every call at once, in bits per second.
 *
 * Sized for the slow end of what people actually have rather than for a good
 * office line: many home and mobile uplinks are under 1 Mbit, and the game's
 * own websocket has to keep flowing through the same pipe. Left uncapped,
 * WebRTC probes upward until it finds the ceiling, and finding the ceiling
 * means the movement updates start arriving late.
 */
export const VIDEO_UPLOAD_BUDGET_BPS = 600_000

/**
 * Below this a video stream is worth less than the congestion it causes, so
 * the sender is switched off and the call carries audio alone. Reached only in
 * a large huddle - at the budget above, seven people or more.
 */
export const MIN_VIDEO_BITRATE_BPS = 90_000

/** Screen share gets its own allowance; only one person usually has one open. */
export const SCREEN_SHARE_BITRATE_BPS = 500_000

/**
 * The share of the budget each call gets, or null when there are so many that
 * each share would be unwatchable and video should be dropped instead.
 */
export function videoBitrateFor(callCount: number): number | null {
  if (callCount <= 0) return null

  const share = Math.floor(VIDEO_UPLOAD_BUDGET_BPS / callCount)
  return share < MIN_VIDEO_BITRATE_BPS ? null : share
}

/**
 * Runs something once the connection is actually negotiated.
 *
 * A cap can only be set on senders that carry encodings, which they do not
 * until negotiation finishes, so it has to wait for a signal that the call is
 * up. The camera mesh could hang that on the far side's stream arriving,
 * because there both ends answer with one. A screen share cannot: the
 * receiving end answers with no media at all, so `stream` never fires on the
 * sender and the cap it was waiting behind was never applied - the shared
 * screen, the most expensive thing here, was the one stream going out
 * uncapped.
 *
 * Connection state is the signal that holds either way, and it is already
 * 'connected' by the time some callers reach this, hence the check before the
 * listener.
 */
export function whenConnected(
  connection: RTCPeerConnection | undefined | null,
  run: () => void
) {
  if (!connection) return

  if (connection.connectionState === 'connected') {
    run()
    return
  }

  const onChange = () => {
    const state = connection.connectionState
    if (state === 'connected') {
      connection.removeEventListener('connectionstatechange', onChange)
      run()
    } else if (state === 'failed' || state === 'closed') {
      // nothing left to cap, and nothing that would ever fire again
      connection.removeEventListener('connectionstatechange', onChange)
    }
  }

  connection.addEventListener('connectionstatechange', onChange)
}

/**
 * Caps what a peer connection may spend on video.
 *
 * `maxBitrate` is the cap itself; `active` is how video is dropped without
 * tearing the call down, so audio keeps flowing and the picture comes back by
 * itself when the huddle thins out. Audio senders are left alone throughout -
 * Opus is some 30 kbit and is the last thing worth saving.
 *
 * degradationPreference decides what gives when the cap bites: talking heads
 * stay watchable by shedding resolution, a shared screen by shedding frames.
 */
export async function applyVideoBudget(
  connection: RTCPeerConnection | undefined | null,
  bitrate: number | null,
  degradationPreference: RTCDegradationPreference = 'maintain-framerate'
) {
  if (!connection) return

  const senders = connection.getSenders().filter((sender) => sender.track?.kind === 'video')

  for (const sender of senders) {
    const parameters = sender.getParameters()

    // A sender that has not finished negotiating has no encodings yet, and
    // setParameters refuses anything it did not just hand out.
    if (!parameters.encodings || parameters.encodings.length === 0) {
      parameters.encodings = [{}]
    }

    for (const encoding of parameters.encodings) {
      if (bitrate === null) {
        encoding.active = false
      } else {
        encoding.active = true
        encoding.maxBitrate = bitrate
      }
    }

    // Not in every browser, and not worth failing the cap over when missing.
    if ('degradationPreference' in parameters) {
      parameters.degradationPreference = degradationPreference
    }

    try {
      await sender.setParameters(parameters)
    } catch (error) {
      // Losing the cap is worse than a call that never opened, but not by
      // enough to drop the call over - it just means this one runs uncapped.
      console.warn('could not apply the video budget to a call:', error)
    }
  }
}
