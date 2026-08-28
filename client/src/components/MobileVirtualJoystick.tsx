import { useEffect, useState } from 'react'
import styled from 'styled-components'
import JoystickItem from './Joystick'

import { gameScene } from '../gameHandle'

import { useAppSelector } from '../hooks'
import { JoystickMovement } from './Joystick'

const Backdrop = styled.div`
  position: fixed;
  bottom: 100px;
  right: 32px;
  max-height: 50%;
  max-width: 100%;
`

const Wrapper = styled.div`
  position: relative;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
`

const JoystickWrapper = styled.div`
  margin-top: auto;
  align-self: flex-end;
`
export const minimumScreenWidthSize = 650 //px

/**
 * Named `use` because it is one: it holds state and subscribes to resize.
 * React tells a hook from an ordinary function by that prefix alone, and
 * without it nothing stops a later caller putting this behind a condition
 * and breaking the hook order.
 */
const useIsSmallScreen = (smallScreenSize: number) => {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width <= smallScreenSize
}

export default function MobileVirtualJoystick() {
  const showJoystick = useAppSelector((state) => state.user.showJoystick)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const hasSmallScreen = useIsSmallScreen(minimumScreenWidthSize)
  const game = gameScene()

  useEffect(() => {}, [showJoystick, showChat])

  const handleMovement = (movement: JoystickMovement) => {
    game?.myPlayer?.handleJoystickMovement(movement)
  }

  return (
    <Backdrop>
      <Wrapper>
        {!(showChat && hasSmallScreen) && showJoystick && (
          <JoystickWrapper>
            <JoystickItem onDirectionChange={handleMovement}></JoystickItem>
          </JoystickWrapper>
        )}
      </Wrapper>
    </Backdrop>
  )
}
