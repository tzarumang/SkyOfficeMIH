import { useEffect, useRef } from 'react'
import data from '@emoji-mart/data'
import { Picker } from 'emoji-mart'

/**
 * The emoji picker, kept in its own module so it can be loaded when it is
 * opened rather than when the app starts. It is a fifth of what the client
 * ships to draw a panel most people never open, and nobody opens before they
 * have joined an office - so both it and its data sit behind this boundary,
 * and Vite splits them into a chunk of their own.
 *
 * Mounted by hand rather than through @emoji-mart/react, which is a thin
 * wrapper around exactly this and whose peer range stops at React 18. Picker
 * is a custom element in 5.x: it takes its options up front and renders
 * itself into whatever it is appended to, styles included, so there is no
 * stylesheet to import any more either.
 */

/** everything except flags, which is what the old `exclude` said */
const CATEGORIES = ['people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols']

export default function EmojiPicker({ onSelect }: { onSelect: (native: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  /**
   * The picker is built once and keeps the callback it was given, but Chat
   * passes a fresh arrow every render. Reading the latest through a ref means
   * a re-render does not cost a rebuilt picker - which would lose the search
   * box and scroll position mid-use.
   */
  const latest = useRef(onSelect)
  useEffect(() => {
    latest.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const node = host.current
    if (!node) return

    const picker = new Picker({
      data,
      theme: 'dark',
      categories: CATEGORIES,
      previewPosition: 'none',
      skinTonePosition: 'none',
      onEmojiSelect: (emoji: { native: string }) => latest.current(emoji.native),
    }) as unknown as Node

    node.appendChild(picker)
    return () => {
      node.removeChild(picker)
    }
  }, [])

  return <div ref={host} />
}
