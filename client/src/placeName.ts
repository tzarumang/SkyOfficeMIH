import store from './stores'

/**
 * What to call where everybody is standing.
 *
 * A custom office is known by the name its creator gave it; the public lobby
 * has no name of its own and is simply the lobby. It sits out here rather than
 * in the chat slice because reading the store from inside a slice would have
 * the store and the slice importing each other.
 */
export function placeName() {
  return store.getState().room.roomName || 'the lobby'
}
