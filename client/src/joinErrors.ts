/**
 * Why a room did not open, in words a player can act on.
 *
 * Joining is a chain - match-make, then fetch the office's floor plan, then
 * start the scene - and a failure anywhere in it leaves the player looking at
 * the same dialog they started on. Saying nothing there reads as the button
 * being broken.
 */

/**
 * The floor plan could not be fetched. The room is deliberately not opened
 * rather than falling back to the office that ships with the client: that
 * office is not the one the server is running, so its furniture would be in
 * places the server does not believe in.
 */
export class OfficeMapUnavailable extends Error {
  constructor(officeId: string) {
    super(`Could not load the floor plan for office ${officeId}.`)
    this.name = 'OfficeMapUnavailable'
  }
}

export function isOfficeMapError(error: unknown) {
  return (error as Error | undefined)?.name === 'OfficeMapUnavailable'
}

const MAP_UNAVAILABLE =
  'This office could not be drawn, so the office was not opened. The server may be unreachable - try again in a moment.'

/**
 * `fallback` is what to say when the failure is an ordinary one for wherever
 * this is being called from - a bad room id, a room that has closed - which
 * only the caller knows.
 */
export function joinErrorMessage(error: unknown, fallback: string) {
  if (isOfficeMapError(error)) return MAP_UNAVAILABLE

  const code = (error as { code?: number } | undefined)?.code
  if (code === 403) return 'Incorrect password for that office.'

  return fallback
}
