import Item from './Item'

/**
 * The vending machine, which is furniture for the moment.
 *
 * It used to open a buy-me-a-coffee page for the upstream project. That is
 * turned off rather than torn out: the manifest gives this item no key, so
 * nothing can select it and nothing can press anything at it. Restoring it
 * means giving it `key: 'R'` again in ITEM_SPECS and putting the call back
 * here.
 */
export default class VendingMachine extends Item {}
