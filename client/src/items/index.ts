import { ItemType } from '../../../types/Items'
import Item from './Item'
import Chair from './Chair'
import Computer from './Computer'
import Whiteboard from './Whiteboard'
import VendingMachine from './VendingMachine'

/**
 * Which class runs each kind of item. The shared manifest cannot name these,
 * because the server reads it too and has no Phaser, so the wiring lives here.
 * A type with no entry is placed as a plain Item, which is all an item that
 * only shows a prompt needs.
 */
const ITEM_CLASSES: Partial<Record<ItemType, typeof Item>> = {
  [ItemType.CHAIR]: Chair,
  [ItemType.COMPUTER]: Computer,
  [ItemType.WHITEBOARD]: Whiteboard,
  [ItemType.VENDINGMACHINE]: VendingMachine,
}

export function itemClass(type: ItemType) {
  return ITEM_CLASSES[type] ?? Item
}
