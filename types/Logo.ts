/**
 * A company logo, cut down to something small enough to travel with an office
 * and blunt enough to hang in a pixel-art room without looking pasted on.
 *
 * Whoever creates the office picks the file; the browser does the reducing, and
 * what is sent is this - a handful of colours and one index per pixel. That
 * keeps the whole thing to about a kilobyte of text, which is small enough to
 * live in the room state and in the office record beside the chat, and means
 * the server never handles an image file at all.
 */

/** the longest side, in logo pixels - each one is drawn several screen pixels across */
export const LOGO_MAX_SIZE = 32

/** how many colours it is reduced to, with index 0 reserved for transparent */
export const LOGO_MAX_COLOURS = 15

/** an office with no logo */
export const NO_LOGO = ''

/**
 * `width:height:palette:pixels`, all hex. The palette is six digits a colour,
 * the pixels one digit each - 0 for transparent, otherwise the palette entry.
 */
export const LOGO_PATTERN = /^[0-9a-f]{2}:[0-9a-f]{2}:(?:[0-9a-f]{6})*:[0-9a-f]*$/

/** comfortably more than a full 32x32 with every colour used */
export const LOGO_MAX_LENGTH = 32 * 32 + LOGO_MAX_COLOURS * 6 + 8

export interface Logo {
  width: number
  height: number
  /** '#rrggbb' per entry; pixel index 1 is the first of these */
  palette: string[]
  /** one per pixel, row by row; 0 is transparent */
  pixels: number[]
}

const hex2 = (value: number) => value.toString(16).padStart(2, '0')

export function encodeLogo(logo: Logo): string {
  const palette = logo.palette.map((colour) => colour.replace('#', '').toLowerCase()).join('')
  const pixels = logo.pixels.map((index) => index.toString(16)).join('')
  return `${hex2(logo.width)}:${hex2(logo.height)}:${palette}:${pixels}`
}

/**
 * Reads one back, or returns nothing if it is not a logo. Every field is
 * checked against the others - a pixel naming a colour that is not there, or a
 * count that does not match the size, means the whole thing is refused rather
 * than drawn half way.
 */
export function decodeLogo(value: unknown): Logo | null {
  if (typeof value !== 'string' || value.length > LOGO_MAX_LENGTH) return null
  if (!LOGO_PATTERN.test(value)) return null

  const [widthHex, heightHex, paletteHex, pixelHex] = value.split(':')
  const width = parseInt(widthHex, 16)
  const height = parseInt(heightHex, 16)
  if (width < 1 || height < 1 || width > LOGO_MAX_SIZE || height > LOGO_MAX_SIZE) return null

  const palette: string[] = []
  for (let at = 0; at < paletteHex.length; at += 6) palette.push(`#${paletteHex.slice(at, at + 6)}`)
  if (palette.length < 1 || palette.length > LOGO_MAX_COLOURS) return null

  if (pixelHex.length !== width * height) return null

  const pixels: number[] = []
  for (const digit of pixelHex) {
    const index = parseInt(digit, 16)
    if (index > palette.length) return null
    pixels.push(index)
  }

  return { width, height, palette, pixels }
}

/** whether this is something an office can carry: a real logo, or none at all */
export function isLogo(value: unknown): value is string {
  if (value === NO_LOGO) return true
  return decodeLogo(value) !== null
}
