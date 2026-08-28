import { describe, expect, it } from 'vitest'
import {
  basePeerId,
  getAvatarString,
  getColorByString,
  textureFromAnim,
  toPeerId,
  toScreenSharePeerId,
} from './util'

describe('peer ids', () => {
  it('survives the characters a Colyseus session id can contain', () => {
    // PeerJS wants alphanumeric; session ids include - and _
    expect(toPeerId('a-b_c')).toMatch(/^[0-9a-f]+$/)
  })

  it('never collapses two sessions onto one peer', () => {
    // the old approach rewrote every invalid character to G, so these two
    // different sessions became the same peer and their calls crossed
    expect(toPeerId('_ub816c6r')).not.toBe(toPeerId('-ub816c6r'))
  })

  it('is reversible, two hex digits per character', () => {
    const id = 'aZ9_-'
    const decoded = (toPeerId(id).match(/../g) || [])
      .map((pair) => String.fromCharCode(parseInt(pair, 16)))
      .join('')
    expect(decoded).toBe(id)
  })

  it('marks a screen share apart from the same camera peer', () => {
    expect(toScreenSharePeerId('abc')).not.toBe(toPeerId('abc'))
    expect(toScreenSharePeerId('abc').startsWith(toPeerId('abc'))).toBe(true)
  })

  it('collapses either flavour back onto one key', () => {
    expect(basePeerId(toScreenSharePeerId('abc'))).toBe(toPeerId('abc'))
    expect(basePeerId(toPeerId('abc'))).toBe(toPeerId('abc'))
  })
})

describe('getColorByString', () => {
  it('is stable for a given name', () => {
    expect(getColorByString('Ada')).toBe(getColorByString('Ada'))
  })

  it('answers for a name that is not there yet', () => {
    // this used to index the palette with NaN and hand back undefined, which
    // the login dialog hits before room data arrives
    expect(getColorByString('')).toBeTruthy()
  })
})

describe('getAvatarString', () => {
  it('takes an initial from one name and two from two', () => {
    expect(getAvatarString('Ada')).toBe('A')
    expect(getAvatarString('Ada Lovelace')).toBe('AL')
  })

  it('is not fooled by a leading space', () => {
    // this used to render "undefinedL", because the split left an empty first part
    expect(getAvatarString(' Ada Lovelace')).toBe('AL')
  })

  it('has nothing to show for an empty name', () => {
    expect(getAvatarString('')).toBe('')
    expect(getAvatarString('   ')).toBe('')
  })
})

describe('textureFromAnim', () => {
  it('takes the texture off the front of an animation key', () => {
    expect(textureFromAnim('lucy_idle_down')).toBe('lucy')
  })

  it('falls back rather than returning nothing', () => {
    expect(textureFromAnim('')).toBe('adam')
  })
})
