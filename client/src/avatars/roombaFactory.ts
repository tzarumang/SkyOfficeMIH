import Phaser from 'phaser'
import { ROOMBA_RADIUS } from '../../../types/Roomba'

/**
 * The cleaning robot is drawn rather than loaded, like the pets, so there is
 * nothing to ship and nothing to fetch. It is a disc seen from above, which
 * needs only one heading: the sprite is turned to face wherever the server
 * says it is going, so the frames are spent on the side brush going round
 * instead of on four directions that would all look the same.
 */
export const ROOMBA_TEXTURE = 'roomba'

const FRAME = 26
const FRAMES = 4
const CENTRE = FRAME / 2

const SHELL = '#4a515e'
const PLATE = '#5f6878'
const BUMPER = '#2f343d'
const BRUSH = '#d8c46a'
const LED = '#7fe6a0'

/** the same dark edge the characters carry, so it reads against any floor */
const OUTLINE = '#3a3040'

type Ctx = CanvasRenderingContext2D

function disc(ctx: Ctx, radius: number, colour: string) {
  ctx.fillStyle = colour
  // drawn row by row rather than with arc(), so the edge stays chunky and
  // matches everything else on screen
  for (let y = -radius; y <= radius; y++) {
    const span = Math.round(radius * Math.sqrt(Math.max(0, 1 - (y * y) / (radius * radius))))
    if (span <= 0) continue
    ctx.fillRect(CENTRE - span, CENTRE + y, span * 2 + 1, 1)
  }
}

function drawFrame(ctx: Ctx, frame: number) {
  const spin = (frame / FRAMES) * Math.PI * 2

  // the side brush pokes out past the shell, so it goes down first
  ctx.fillStyle = BRUSH
  for (let arm = 0; arm < 3; arm++) {
    const at = spin + (arm / 3) * Math.PI * 2
    for (let along = ROOMBA_RADIUS - 2; along <= ROOMBA_RADIUS + 3; along++) {
      // the brush sits on the leading right of the robot
      const x = CENTRE + ROOMBA_RADIUS * 0.55 + Math.cos(at) * along * 0.5
      const y = CENTRE + ROOMBA_RADIUS * 0.55 + Math.sin(at) * along * 0.5
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
    }
  }

  disc(ctx, ROOMBA_RADIUS + 1, OUTLINE)
  disc(ctx, ROOMBA_RADIUS, SHELL)

  // the top plate, offset back from the bumper
  ctx.fillStyle = PLATE
  for (let y = -4; y <= 4; y++) {
    const span = Math.round(5 * Math.sqrt(Math.max(0, 1 - (y * y) / 25)))
    if (span <= 0) continue
    ctx.fillRect(CENTRE - span - 1, CENTRE + y, span * 2 + 1, 1)
  }

  // the bumper: a band across the front, which is where it is heading
  ctx.fillStyle = BUMPER
  for (let y = -ROOMBA_RADIUS; y <= ROOMBA_RADIUS; y++) {
    const span = Math.round(
      ROOMBA_RADIUS * Math.sqrt(Math.max(0, 1 - (y * y) / (ROOMBA_RADIUS * ROOMBA_RADIUS)))
    )
    if (span <= 2) continue
    ctx.fillRect(CENTRE + span - 2, CENTRE + y, 2, 1)
  }

  // a light that blinks while it works
  ctx.fillStyle = frame % 2 === 0 ? LED : BUMPER
  ctx.fillRect(CENTRE - 4, CENTRE - 1, 2, 2)
}

export function ensureRoombaTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(ROOMBA_TEXTURE)) return ROOMBA_TEXTURE

  const canvas = document.createElement('canvas')
  canvas.width = FRAME * FRAMES
  canvas.height = FRAME
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = false

  for (let frame = 0; frame < FRAMES; frame++) {
    context.save()
    context.translate(frame * FRAME, 0)
    drawFrame(context, frame)
    context.restore()
  }

  scene.textures.addSpriteSheet(ROOMBA_TEXTURE, canvas as unknown as HTMLImageElement, {
    frameWidth: FRAME,
    frameHeight: FRAME,
  })

  scene.anims.create({
    key: `${ROOMBA_TEXTURE}_clean`,
    frames: scene.anims.generateFrameNumbers(ROOMBA_TEXTURE, { start: 0, end: FRAMES - 1 }),
    repeat: -1,
    frameRate: 10,
  })

  return ROOMBA_TEXTURE
}
