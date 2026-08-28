import 'emoji-mart/css/emoji-mart.css'
import { Picker } from 'emoji-mart'

/**
 * The emoji picker, kept in its own module so it can be loaded when it is
 * opened rather than when the app starts.
 *
 * emoji-mart carries its whole dataset in the bundle - 558 kB of the 2.7 MB
 * the client used to ship, a fifth of the download - to draw a panel that most
 * people never open, and nobody opens before they have joined an office. Both
 * the picker and its stylesheet are behind this boundary, so Vite splits them
 * into a chunk of their own.
 */
export default function EmojiPicker({ onSelect }: { onSelect: (native: string) => void }) {
  return (
    <Picker
      theme="dark"
      showSkinTones={false}
      showPreview={false}
      onSelect={(emoji: any) => onSelect(emoji.native)}
      exclude={['recent', 'flags']}
    />
  )
}
