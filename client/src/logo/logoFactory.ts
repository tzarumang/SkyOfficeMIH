import Phaser from 'phaser'
import { Logo, LOGO_MAX_COLOURS, LOGO_MAX_SIZE, decodeLogo, encodeLogo } from '../../../types/Logo'

/**
 * Turns whatever file somebody picked into the handful of colours an office
 * carries around.
 *
 * All of it happens in the browser: the server never sees the image, only the
 * reduced result. Two steps, and the order matters. The picture is scaled down
 * first with smoothing left on, so a fine logo averages into whole pixels
 * instead of losing the thin parts of its strokes; then the colours are cut
 * down, which is what gives it the flat blocky look of the room it has to hang
 * in.
 */

/** anything below this is treated as see-through rather than as a pale colour */
const ALPHA_FLOOR = 128

/** how wide it hangs on the wall, and how tall it is allowed to get */
export const LOGO_DISPLAY_WIDTH = 96
export const LOGO_DISPLAY_HEIGHT = 64

type Bucket = { colours: Array<[number, number, number]> }

/**
 * Median cut: keep splitting the box of colours along whichever channel is
 * most spread out until there are as many boxes as colours wanted, then take
 * the average of each. A logo is mostly flat colour, so this lands almost
 * exactly on the colours it was drawn with rather than on a fixed palette that
 * happens to be near them.
 */
function palette(colours: Array<[number, number, number]>, want: number) {
  if (colours.length === 0) return []

  let buckets: Bucket[] = [{ colours }]

  while (buckets.length < want) {
    let widest = -1
    let widestSpread = 0
    let widestChannel = 0

    buckets.forEach((bucket, at) => {
      if (bucket.colours.length < 2) return
      for (let channel = 0; channel < 3; channel++) {
        let low = 255
        let high = 0
        for (const colour of bucket.colours) {
          low = Math.min(low, colour[channel])
          high = Math.max(high, colour[channel])
        }
        if (high - low > widestSpread) {
          widestSpread = high - low
          widest = at
          widestChannel = channel
        }
      }
    })

    // every box holds a single colour: there is nothing left to split
    if (widest < 0 || widestSpread === 0) break

    const splitting = buckets[widest].colours
    splitting.sort((a, b) => a[widestChannel] - b[widestChannel])
    const middle = Math.floor(splitting.length / 2)
    buckets = [
      ...buckets.slice(0, widest),
      { colours: splitting.slice(0, middle) },
      { colours: splitting.slice(middle) },
      ...buckets.slice(widest + 1),
    ]
  }

  return buckets
    .filter((bucket) => bucket.colours.length > 0)
    .map((bucket) => {
      const total = bucket.colours.reduce(
        (sum, colour) => [sum[0] + colour[0], sum[1] + colour[1], sum[2] + colour[2]],
        [0, 0, 0]
      )
      const count = bucket.colours.length
      return [
        Math.round(total[0] / count),
        Math.round(total[1] / count),
        Math.round(total[2] / count),
      ] as [number, number, number]
    })
}

const asHex = (colour: [number, number, number]) =>
  '#' + colour.map((part) => part.toString(16).padStart(2, '0')).join('')

function nearest(colour: [number, number, number], colours: Array<[number, number, number]>) {
  let best = 0
  let bestDistance = Infinity
  colours.forEach((candidate, at) => {
    const dr = colour[0] - candidate[0]
    const dg = colour[1] - candidate[1]
    const db = colour[2] - candidate[2]
    const distance = dr * dr + dg * dg + db * db
    if (distance < bestDistance) {
      bestDistance = distance
      best = at
    }
  })
  return best
}

/** how big it comes out, keeping the shape it was drawn in */
function sizeFor(width: number, height: number) {
  const longest = Math.max(width, height)
  const scale = Math.min(1, LOGO_MAX_SIZE / longest)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function readImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    image.src = url
  })
}

/** the reduced logo, ready to be sent with the office */
export async function logoFromFile(file: File): Promise<string> {
  const image = await readImage(file)
  const size = sizeFor(image.naturalWidth || image.width, image.naturalHeight || image.height)

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')!
  // left on deliberately - this is the one place smoothing helps, averaging a
  // detailed logo into whole pixels rather than dropping every other one
  context.imageSmoothingEnabled = true
  context.drawImage(image, 0, 0, size.width, size.height)

  const data = context.getImageData(0, 0, size.width, size.height).data
  const opaque: Array<[number, number, number]> = []
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] < ALPHA_FLOOR) continue
    opaque.push([data[at], data[at + 1], data[at + 2]])
  }

  if (opaque.length === 0) throw new Error('That image is empty once the see-through parts go.')

  const colours = palette(opaque, LOGO_MAX_COLOURS)
  const pixels: number[] = []
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] < ALPHA_FLOOR) {
      pixels.push(0)
      continue
    }
    pixels.push(nearest([data[at], data[at + 1], data[at + 2]], colours) + 1)
  }

  return encodeLogo({
    width: size.width,
    height: size.height,
    palette: colours.map(asHex),
    pixels,
  })
}

/** paints one into a canvas, a block per pixel - used for the preview and the texture */
export function paintLogo(canvas: HTMLCanvasElement, logo: Logo, scale: number) {
  canvas.width = logo.width * scale
  canvas.height = logo.height * scale
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)

  logo.pixels.forEach((index, at) => {
    if (index === 0) return
    context.fillStyle = logo.palette[index - 1]
    context.fillRect((at % logo.width) * scale, Math.floor(at / logo.width) * scale, scale, scale)
  })
}

export function logoTextureKey(value: string) {
  // the descriptor is the texture: two offices with the same logo share one
  let hash = 0
  for (let at = 0; at < value.length; at++) hash = (hash * 31 + value.charCodeAt(at)) | 0
  return `logo_${(hash >>> 0).toString(36)}`
}

/** builds the texture a scene draws the logo from, once per logo */
export function ensureLogoTexture(scene: Phaser.Scene, value: string) {
  const key = logoTextureKey(value)
  if (scene.textures.exists(key)) return key

  const logo = decodeLogo(value)
  if (!logo) return null

  const canvas = document.createElement('canvas')
  paintLogo(canvas, logo, 1)
  scene.textures.addCanvas(key, canvas)
  return key
}
