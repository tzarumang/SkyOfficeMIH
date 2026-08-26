import Phaser from 'phaser'
import {
  COATS,
  PetDescriptor,
  petCoatOf,
  petKindOf,
  petTextureKey,
} from '../../../types/Pet'

/**
 * Pets are drawn rather than recoloured, because there is no artwork to start
 * from. They can be: a 16 pixel animal seen from above is a body, a head, ears
 * and a tail, and two frames of leg movement read as walking at this size.
 * Everything here is plain canvas drawing, so a descriptor produces the same
 * pet on every client with nothing to load.
 */
const FRAME = 16
const DIRECTIONS = ['down', 'up', 'left', 'right'] as const
const FRAMES_PER_DIRECTION = 2

/**
 * The drawn characters carry a dark outline, which is what lets them read
 * against any floor. A pale pet on a pale floor vanished without one.
 */
const OUTLINE = '#3a3040'

type Ctx = CanvasRenderingContext2D

const px = (ctx: Ctx, x: number, y: number, w = 1, h = 1) => ctx.fillRect(x, y, w, h)

/** a filled blob, drawn as rows so the edges stay chunky rather than smooth */
function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  for (let y = -ry; y <= ry; y++) {
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    if (span <= 0) continue
    px(ctx, cx - span, cy + y, span * 2 + 1, 1)
  }
}

function drawFrame(
  ctx: Ctx,
  kind: string,
  direction: (typeof DIRECTIONS)[number],
  frame: number,
  coat: string[]
) {
  // an outline pass first: the same silhouette a pixel larger, so the fill
  // that follows leaves a dark edge all the way round
  drawBody(ctx, kind, direction, frame, [OUTLINE, OUTLINE], 1)
  drawBody(ctx, kind, direction, frame, coat, 0)
}

function drawBody(
  ctx: Ctx,
  kind: string,
  direction: (typeof DIRECTIONS)[number],
  frame: number,
  coat: string[],
  grow: number
) {
  const [light, dark] = coat
  const step = frame === 0 ? 0 : 1
  const side = direction === 'left' || direction === 'right'
  const facingUp = direction === 'up'

  // legs first, so the body covers where they meet it
  ctx.fillStyle = dark
  if (side) {
    px(ctx, 5 + step - grow, 13 - grow, 2 + grow * 2, 2 + grow)
    px(ctx, 9 - step - grow, 13 - grow, 2 + grow * 2, 2 + grow)
  } else {
    px(ctx, 5 - grow, 13 - step - grow, 2 + grow * 2, 2 + grow)
    px(ctx, 9 - grow, 13 - (1 - step) - grow, 2 + grow * 2, 2 + grow)
  }

  // body
  ctx.fillStyle = light
  blob(ctx, 8, 10, (side ? 4 : 3) + grow, 3 + grow)

  // tail, opposite whichever way it faces
  ctx.fillStyle = dark
  if (kind === 'c') {
    // a cat carries it up
    if (side) px(ctx, direction === 'right' ? 3 : 12, 6, 1, 4)
    else if (facingUp) px(ctx, 8, 12, 1, 3)
    else px(ctx, 8, 5, 1, 3)
  } else if (kind === 'd') {
    if (side) px(ctx, direction === 'right' ? 3 : 12, 7, 1, 2)
    else if (facingUp) px(ctx, 8, 12, 1, 2)
    else px(ctx, 8, 6, 1, 2)
  }

  // head
  ctx.fillStyle = light
  if (side) blob(ctx, direction === 'right' ? 11 : 5, 8, 3 + grow, 3 + grow)
  else blob(ctx, 8, facingUp ? 6 : 7, 3 + grow, 3 + grow)

  // ears, or a beak for the bird
  ctx.fillStyle = dark
  const headX = side ? (direction === 'right' ? 11 : 5) : 8
  const headY = side ? 8 : facingUp ? 6 : 7
  if (kind === 'c') {
    px(ctx, headX - 2, headY - 4, 1, 2)
    px(ctx, headX + 2, headY - 4, 1, 2)
  } else if (kind === 'd') {
    px(ctx, headX - 3, headY - 3, 1, 3)
    px(ctx, headX + 3, headY - 3, 1, 3)
  } else {
    ctx.fillStyle = '#e8a33d'
    if (side) px(ctx, direction === 'right' ? headX + 3 : headX - 3, headY, 1, 1)
    else if (!facingUp) px(ctx, headX, headY + 2, 1, 1)
  }

  // eyes, only where they would actually be visible, and never on the outline
  if (!facingUp && grow === 0) {
    ctx.fillStyle = '#1a1a22'
    if (side) px(ctx, direction === 'right' ? headX + 1 : headX - 1, headY - 1, 1, 1)
    else {
      px(ctx, headX - 1, headY - 1, 1, 1)
      px(ctx, headX + 1, headY - 1, 1, 1)
    }
  }
}

/**
 * Draws a single facing-forward frame, so the picker can show the pet somebody
 * is choosing. Shares the drawing with the spritesheet, so a preview can never
 * disagree with what actually walks around the office.
 */
export function drawPetPreview(canvas: HTMLCanvasElement, kind: string, coatIndex: number) {
  const chosen = COATS[COATS[coatIndex] ? coatIndex : 0]
  const context = canvas.getContext('2d')
  if (!context) return

  canvas.width = FRAME
  canvas.height = FRAME
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, FRAME, FRAME)
  drawFrame(context, kind, 'down', 0, [chosen.light, chosen.dark])
}

/** builds the pet's spritesheet and animations if they do not exist yet */
export function ensurePetTexture(scene: Phaser.Scene, pet: PetDescriptor) {
  const textureKey = petTextureKey(pet)
  if (scene.textures.exists(textureKey)) return textureKey

  const kind = petKindOf(pet)
  const chosen = COATS[petCoatOf(pet)]
  const coat = [chosen.light, chosen.dark]

  const canvas = document.createElement('canvas')
  canvas.width = FRAME * DIRECTIONS.length * FRAMES_PER_DIRECTION
  canvas.height = FRAME
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = false

  DIRECTIONS.forEach((direction, d) => {
    for (let frame = 0; frame < FRAMES_PER_DIRECTION; frame++) {
      context.save()
      context.translate((d * FRAMES_PER_DIRECTION + frame) * FRAME, 0)
      drawFrame(context, kind, direction, frame, coat)
      context.restore()
    }
  })

  scene.textures.addSpriteSheet(textureKey, canvas as unknown as HTMLImageElement, {
    frameWidth: FRAME,
    frameHeight: FRAME,
  })

  DIRECTIONS.forEach((direction, d) => {
    const start = d * FRAMES_PER_DIRECTION
    scene.anims.create({
      key: `${textureKey}_walk_${direction}`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start, end: start + 1 }),
      repeat: -1,
      frameRate: 6,
    })
    scene.anims.create({
      key: `${textureKey}_idle_${direction}`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start, end: start }),
      repeat: 0,
      frameRate: 1,
    })
  })

  return textureKey
}
