import { PeerOptions } from 'peerjs'
import { peerHost, peerPath, peerPort, peerSecure } from '../runtimeConfig'
import { parsePeerHost } from '../../../types/PeerHost'

/**
 * With no options PeerJS uses its free public broker, which means signalling
 * metadata for every call leaves our infrastructure, availability depends on a
 * service we do not run, and peer ids share a namespace with every other app
 * using the default - so an id can be reached from outside the room.
 *
 * Point VITE_PEER_HOST at a self-hosted PeerServer to avoid all three. Unset,
 * behaviour is unchanged.
 */
export function peerOptions(): PeerOptions | undefined {
  const configured = peerHost()

  if (!configured) return undefined

  // PeerJS takes a hostname and builds the url around it, so a url given here
  // has to be read apart first rather than passed through.
  const parsed = parsePeerHost(configured)
  if (!parsed.host) return undefined

  // What was set explicitly wins; what the url carried stands in for the rest.
  const configuredPort = Number(peerPort())
  const port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : parsed.port

  const configuredSecure = peerSecure()
  const secure = configuredSecure ? configuredSecure !== 'false' : (parsed.secure ?? true)

  return {
    host: parsed.host,
    path: peerPath() || '/',
    secure,
    ...(port ? { port } : {}),
  }
}
