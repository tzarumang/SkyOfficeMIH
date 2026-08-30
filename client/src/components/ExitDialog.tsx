import React from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

import { useAppDispatch, useAppSelector } from '../hooks'
import { closeExitDialog, failedLeaving, startLeaving } from '../stores/ExitStore'
import { bootstrapScene } from '../gameHandle'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0000008f;
`

const Wrapper = styled.div`
  background: #222639;
  border-radius: 16px;
  padding: 28px 36px;
  box-shadow: 0px 0px 5px #0000006f;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  h3 {
    font-size: 20px;
    color: #eee;
    margin: 0;
    text-align: center;
  }

  p {
    font-size: 15px;
    color: #c2c2c2;
    margin: 0;
    text-align: center;
    overflow-wrap: anywhere;
  }
`

const Buttons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
`

/**
 * Asked at the top of the stairs, before anybody is taken anywhere.
 *
 * Where "out" leads depends on where the player is standing. An office of
 * somebody's own opens onto the lobby, which is the building everyone shares.
 * The lobby has nowhere further out to go, so its stairs lead back to the list
 * of offices - which until now was reachable only by reloading the page.
 */
export default function ExitDialog() {
  const dispatch = useAppDispatch()
  const leaving = useAppSelector((state) => state.exit.leaving)
  const error = useAppSelector((state) => state.exit.error)
  const roomName = useAppSelector((state) => state.room.roomName)
  const inLobby = useAppSelector((state) => state.room.publicLobby)

  const leave = () => {
    const bootstrap = bootstrapScene()
    if (!bootstrap) return

    dispatch(startLeaving())
    const walk = inLobby ? bootstrap.returnToRoomSelection() : bootstrap.returnToLobby()
    walk.catch((error) => {
      console.error(error)
      dispatch(failedLeaving('Could not leave. Please try again.'))
    })
  }

  return (
    <Backdrop>
      <Wrapper>
        <h3>{inLobby ? 'Leave the lobby?' : `Leave ${roomName}?`}</h3>
        <p>
          {inLobby
            ? 'You will be taken back to the list of offices.'
            : 'You will be taken back to the lobby, and everyone here will see you go.'}
        </p>
        {error && <Alert severity="error">{error}</Alert>}
        <Buttons>
          <Button
            variant="outlined"
            color="secondary"
            disabled={leaving}
            onClick={() => dispatch(closeExitDialog())}
          >
            Stay
          </Button>
          <Button
            variant="contained"
            color="secondary"
            disabled={leaving}
            onClick={leave}
            startIcon={leaving ? <CircularProgress color="inherit" size={16} /> : undefined}
          >
            {leaving ? 'Leaving' : 'Leave'}
          </Button>
        </Buttons>
      </Wrapper>
    </Backdrop>
  )
}
