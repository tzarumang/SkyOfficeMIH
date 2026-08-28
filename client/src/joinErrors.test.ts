import { describe, expect, it } from 'vitest'
import { OfficeMapUnavailable, isOfficeMapError, joinErrorMessage } from './joinErrors'

/**
 * Joining is a chain, and a failure anywhere in it leaves the player looking
 * at the dialog they started on. What this decides is whether they are told
 * something they can act on or left thinking the button is broken.
 */
describe('joinErrorMessage', () => {
  const fallback = 'No office with that ID.'

  it('says the floor plan failed rather than blaming the id', () => {
    const message = joinErrorMessage(new OfficeMapUnavailable('52242-1-1-5-10-1-1'), fallback)
    expect(message).not.toBe(fallback)
    expect(message).toMatch(/could not be drawn/i)
  })

  it('names a wrong password, which the player can do something about', () => {
    expect(joinErrorMessage({ code: 403 }, fallback)).toMatch(/password/i)
  })

  it('falls back to whatever the caller knows for anything else', () => {
    expect(joinErrorMessage({ code: 500 }, fallback)).toBe(fallback)
    expect(joinErrorMessage(new Error('socket died'), fallback)).toBe(fallback)
    expect(joinErrorMessage(undefined, fallback)).toBe(fallback)
  })
})

describe('isOfficeMapError', () => {
  it('recognises the map failure across a boundary that loses the class', () => {
    // matched by name, so a structured-cloned or re-thrown copy still counts
    expect(isOfficeMapError(new OfficeMapUnavailable('x'))).toBe(true)
    expect(isOfficeMapError({ name: 'OfficeMapUnavailable' })).toBe(true)
  })

  it('is not fooled by anything else', () => {
    expect(isOfficeMapError(new Error('nope'))).toBe(false)
    expect(isOfficeMapError(undefined)).toBe(false)
  })
})
