import { OfficeSpec } from './Office'

/** the office someone drew by hand, or one grown from a seed */
export type OfficeLayout = 'classic' | 'generated'

export const OFFICE_LAYOUTS: Array<{ value: OfficeLayout; label: string; hint: string }> = [
  { value: 'classic', label: 'The original office', hint: 'The floor plan everyone knows' },
  { value: 'generated', label: 'A new floor plan', hint: 'Built for this office alone' },
]

export enum RoomType {
  LOBBY = 'lobby',
  PUBLIC = 'skyoffice',
  CUSTOM = 'custom',
}

export interface IRoomData {
  name: string
  description: string
  password: string | null
  /** keep the room out of the lobby listing; joinable by id only */
  unlisted: boolean
  /**
   * Stable id for an office meant to outlive the room. Absent for a disposable
   * office, which lives only while someone is inside it.
   */
  slug?: string
  /** how long the slug keeps working; ignored without a slug */
  lifetimeDays?: number
  /**
   * Give the office a cleaning robot. Only ever honoured for a custom office -
   * the public lobby is the server's own, and nobody creating a room gets to
   * redecorate it.
   */
  roomba?: boolean
  /** draw a fresh office, or use the one that ships with the client */
  layout?: OfficeLayout
  /** how much of everything a generated office holds */
  office?: OfficeSpec
}

/** offered when creating an office */
export const OFFICE_LIFETIMES = [
  { days: 0, label: 'Until everyone leaves' },
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
]
