import Item from './Item'

export default class Chair extends Item {
  /** which way a player faces once sat down, from the map object's properties */
  itemDirection?: string
}
