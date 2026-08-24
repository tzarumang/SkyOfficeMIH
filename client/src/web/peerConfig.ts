import { PeerOptions } from 'peerjs'

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
  const host = import.meta.env.VITE_PEER_HOST

  if (!host) return undefined

  const port = Number(import.meta.env.VITE_PEER_PORT)
  const secure = import.meta.env.VITE_PEER_SECURE !== 'false'

  return {
    host,
    path: import.meta.env.VITE_PEER_PATH || '/',
    secure,
    ...(Number.isFinite(port) && port > 0 ? { port } : {}),
  }
}
