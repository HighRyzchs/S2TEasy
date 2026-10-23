import { segmentText } from './format'
import type { HistoryItem } from '@shared/types'

/** Session text with cue tags as .tag and words fixed by your voice marked (hover shows what was heard). */
export function Highlighted({ item, text }: { item: Pick<HistoryItem, 'fixes'>; text: string }) {
  return (
    <>
      {segmentText(text, item.fixes).map((part, i) =>
        part.kind === 'tag' ? (
          <span key={i} className="tag">
            {part.text}
          </span>
        ) : part.kind === 'fix' ? (
          <span key={i} className="fixed-word" title={`Heard “${part.heard}”`}>
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}
