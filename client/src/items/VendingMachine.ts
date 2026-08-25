import Item from './Item'
import { openURL } from '../utils/helpers'

export default class VendingMachine extends Item {
  use() {
    // hacky and hard-coded, but leaving it as is for now
    openURL('https://www.buymeacoffee.com/skyoffice')
  }
}
