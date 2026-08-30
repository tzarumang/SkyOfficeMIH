import { createAction } from '@reduxjs/toolkit'

/**
 * Dispatched once an office has been left, before the next one is joined.
 *
 * Every slice holding something about the office just left - who was in it,
 * what was said in it, which board was on which wall - clears itself on this,
 * so walking out of one office and into another does not carry the first
 * one's people and conversation across. It lives in its own module rather
 * than in any one slice because all of them listen for it and none of them
 * owns it.
 */
export const leftOffice = createAction('leftOffice')
