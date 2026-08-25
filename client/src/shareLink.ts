/**
 * A room is shared as a link carrying its id, so opening it drops you straight
 * into that office instead of the room list. Rooms are disposed once empty, so
 * a link is an invitation to join now rather than a permanent address.
 */
const ROOM_PARAM = 'room'

export function buildShareLink(roomId: string) {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
  url.searchParams.set(ROOM_PARAM, roomId)
  return url.toString()
}

/** the room id someone was invited to, if they arrived through a share link */
export function roomIdFromUrl() {
  const roomId = new URLSearchParams(window.location.search).get(ROOM_PARAM)
  return roomId && roomId.trim() ? roomId.trim() : null
}

/**
 * Drops the invite out of the address bar once it has been used, so a later
 * refresh lands on the room list rather than retrying a room that has since
 * been disposed.
 */
export function forgetShareLink() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(ROOM_PARAM)) return

  url.searchParams.delete(ROOM_PARAM)
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
}
