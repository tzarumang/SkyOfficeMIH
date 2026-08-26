import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import UploadIcon from '@mui/icons-material/Upload'

import { decodeLogo, NO_LOGO } from '../../../types/Logo'
import { logoFromFile, paintLogo } from '../logo/logoFactory'

/**
 * Picks a company logo and shows what the office will actually hang on the
 * wall - not the file that was chosen, but the handful of colours it comes
 * down to. Somebody uploading a photograph should see straight away that it
 * will not read at this size, rather than find out once they are inside.
 */
const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;

  .heading {
    font-size: 14px;
    font-weight: 600;
  }

  .hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }

  .problem {
    font-size: 12px;
    color: #ff9c9c;
  }

  .preview {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  canvas {
    /* the checks show through the see-through parts, so a logo cut out of its
       background is obviously cut out rather than looking like it has a black
       square behind it */
    background-image:
      linear-gradient(45deg, #33374d 25%, transparent 25%),
      linear-gradient(-45deg, #33374d 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #33374d 75%),
      linear-gradient(-45deg, transparent 75%, #33374d 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0px;
    border-radius: 4px;
    image-rendering: pixelated;
  }

  input[type='file'] {
    display: none;
  }
`

interface Props {
  value: string
  onChange: (logo: string) => void
}

export default function LogoPicker({ value, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const canvas = preview.current
    if (!canvas) return

    const logo = decodeLogo(value)
    if (!logo) return

    // four screen pixels a logo pixel, which is about what it looks like in the
    // office once it is on the wall
    paintLogo(canvas, logo, 4)
  }, [value])

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // the same file can be picked again after being removed
    event.target.value = ''
    if (!file) return

    try {
      setProblem('')
      onChange(await logoFromFile(file))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That image could not be used.')
    }
  }

  return (
    <Wrapper>
      <div className="heading">Company logo</div>
      <div className="hint">
        Hung in the hallway, redrawn in the colours of the room. A flat logo on a see-through
        background comes out best.
      </div>

      {value !== NO_LOGO && (
        <div className="preview">
          <canvas ref={preview} />
          <Button size="small" color="secondary" onClick={() => onChange(NO_LOGO)}>
            Remove
          </Button>
        </div>
      )}

      <Button
        variant="outlined"
        color="secondary"
        size="small"
        startIcon={<UploadIcon />}
        onClick={() => fileInput.current?.click()}
      >
        {value === NO_LOGO ? 'Upload a logo' : 'Choose another'}
      </Button>

      {problem && <div className="problem">{problem}</div>}

      <input ref={fileInput} type="file" accept="image/*" onChange={choose} />
    </Wrapper>
  )
}
