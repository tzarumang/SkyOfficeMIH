import React, { useEffect, useRef } from 'react'
import { drawPetPreview } from './petFactory'

/**
 * Shows the pet being chosen, drawn by the same code that builds the sprite, so
 * the picker can never promise a pet the office does not deliver.
 */
export function PetPreview({ kind, coat, size = 48 }: { kind: string; coat: number; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvas.current) drawPetPreview(canvas.current, kind, coat)
  }, [kind, coat])

  return (
    <canvas
      ref={canvas}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      aria-label="pet preview"
    />
  )
}
