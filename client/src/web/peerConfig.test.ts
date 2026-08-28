import { afterEach, describe, expect, it } from 'vitest'
import { peerOptions } from './peerConfig'

/**
 * These were checked once by opening a browser and calling peerOptions() from
 * the console. That found a real bug - the same relay listed twice for STUN,
 * because two transports differ only in a query string STUN does not take -
 * and then the check went away with the tab.
 *
 * What it protects is worth keeping: get the ICE list wrong and calls fail
 * only for the people behind a NAT that will not hole-punch, which is nobody
 * in an office and a good share of everybody on mobile data.
 */

const configure = (config: Record<string, string>) => {
  window.__SKYOFFICE_CONFIG__ = config
}

afterEach(() => {
  window.__SKYOFFICE_CONFIG__ = {}
})

describe('peerOptions', () => {
  it('says nothing when nothing is configured, leaving PeerJS its defaults', () => {
    configure({})
    expect(peerOptions()).toBeUndefined()
  })

  it('offers a relay, and derives STUN from it', () => {
    configure({
      turnUrl: 'turn:turn.example.com:3478?transport=udp',
      turnUsername: 'skyoffice',
      turnCredential: 's3cret',
    })

    expect(peerOptions()).toEqual({
      config: {
        iceServers: [
          { urls: ['stun:turn.example.com:3478'] },
          {
            urls: ['turn:turn.example.com:3478?transport=udp'],
            username: 'skyoffice',
            credential: 's3cret',
          },
        ],
      },
    })
  })

  it('asks one STUN server once, however many transports the relay offers', () => {
    configure({
      turnUrl:
        'turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp',
      turnUsername: 'u',
      turnCredential: 'c',
    })

    const [stun, relay] = peerOptions()!.config!.iceServers as RTCIceServer[]
    // the transports differ only in a query string, which STUN does not take
    expect(stun.urls).toEqual(['stun:turn.example.com:3478'])
    expect(relay.urls).toHaveLength(2)
  })

  it('accepts a relay written without its scheme', () => {
    configure({ turnUrl: 'turn.example.com:3478', turnUsername: 'u', turnCredential: 'c' })

    const [, relay] = peerOptions()!.config!.iceServers as RTCIceServer[]
    expect(relay.urls).toEqual(['turn:turn.example.com:3478'])
  })

  it('will not offer a relay without credentials, which anyone could use', () => {
    configure({ turnUrl: 'turn:turn.example.com:3478' })

    const servers = peerOptions()!.config!.iceServers as RTCIceServer[]
    expect(servers).toHaveLength(1)
    expect(servers[0].urls).toEqual(['stun:turn.example.com:3478'])
    expect(servers.some((server) => 'credential' in server)).toBe(false)
  })

  it('treats a blank or comma-only url as nothing configured', () => {
    configure({ turnUrl: '  ,  ', turnUsername: 'u', turnCredential: 'c' })
    expect(peerOptions()).toBeUndefined()
  })

  it('carries the relay alongside a self-hosted broker', () => {
    configure({
      peerHost: 'peer.example.com',
      peerPort: '443',
      peerSecure: 'true',
      turnUrl: 'turn:turn.example.com:3478',
      turnUsername: 'u',
      turnCredential: 'c',
    })

    const options = peerOptions()!
    expect(options.host).toBe('peer.example.com')
    expect(options.port).toBe(443)
    expect(options.secure).toBe(true)
    expect(options.config!.iceServers).toHaveLength(2)
  })

  it('still describes the broker when only the broker is configured', () => {
    configure({ peerHost: 'peer.example.com', peerPort: '9000', peerSecure: 'false' })

    const options = peerOptions()!
    expect(options.host).toBe('peer.example.com')
    expect(options.secure).toBe(false)
    expect(options.config).toBeUndefined()
  })
})
