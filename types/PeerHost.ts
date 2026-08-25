/**
 * Where the signalling server is, from whatever someone put in the setting.
 *
 * PeerJS wants a bare hostname: it builds the socket url itself out of a
 * scheme, the host, a port and a path. Hand it a full url and it concatenates
 * anyway, which is how `https://peer.example.com` with port 443 becomes
 * `wss://https//peer.example.com:443/peerjs` - a url that cannot connect and
 * says nothing about why.
 *
 * A url is the obvious thing to paste into a setting whose value is a server,
 * so it is read rather than rejected: the hostname comes out of it, and the
 * scheme and port it carries stand in for `PEER_SECURE` and `PEER_PORT` when
 * those were not set explicitly.
 */

export interface PeerHost {
  host: string
  /** from the scheme, when one was given */
  secure?: boolean
  /** from the url, when one was given */
  port?: number
}

export function parsePeerHost(value: string): PeerHost {
  const trimmed = value.trim()
  if (!trimmed) return { host: '' }

  const scheme = /^(https?|wss?):\/\//i.exec(trimmed)
  if (!scheme) {
    // a bare host, possibly with a port or a stray path on the end
    const [hostAndPort] = trimmed.split('/')
    const [host, port] = hostAndPort.split(':')
    const asNumber = Number(port)
    return {
      host,
      ...(port && Number.isFinite(asNumber) && asNumber > 0 ? { port: asNumber } : {}),
    }
  }

  try {
    const url = new URL(trimmed)
    const port = Number(url.port)
    return {
      host: url.hostname,
      secure: url.protocol === 'https:' || url.protocol === 'wss:',
      ...(url.port && Number.isFinite(port) && port > 0 ? { port } : {}),
    }
  } catch {
    // not a url after all - fall back to whatever is between the scheme and
    // the first slash, which is the part that was meant to be the host
    const rest = trimmed.slice(scheme[0].length).split('/')[0]
    return { host: rest.split(':')[0] }
  }
}
