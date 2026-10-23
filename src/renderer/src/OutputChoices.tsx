import type { OutputPreferences } from '@shared/output'
import type { CueKind } from '@shared/speech-cues'
import './output-choices.css'

export function OutputChoices({
  value,
  onChange,
  disabled = false,
  compact = false
}: {
  value: OutputPreferences
  onChange: (value: OutputPreferences) => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div className={`output-choices ${compact ? 'compact' : ''}`}>
      <div className="output-choice-row" role="group" aria-label="Tag placement">
        <span>Place tags</span>
        {(
          [
            ['before', 'Before words'],
            ['after', 'After words'],
            ['context', 'Context below']
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            disabled={disabled}
            aria-pressed={value.placement === id}
            onClick={() => onChange({ ...value, placement: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="output-choice-row" role="group" aria-label="Included voice cues">
        <span>Include</span>
        {(
          [
            ['emotion', 'Emotion'],
            ['delivery', 'Delivery'],
            ['pacing', 'Pace'],
            ['event', 'Sounds']
          ] as [CueKind, string][]
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            disabled={disabled}
            aria-pressed={value.kinds[id]}
            onClick={() =>
              onChange({ ...value, kinds: { ...value.kinds, [id]: !value.kinds[id] } })
            }
          >
            {value.kinds[id] ? '✓ ' : '+ '}
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value.clearOnly}
          onClick={() => onChange({ ...value, clearOnly: !value.clearOnly })}
        >
          Clear cues only
        </button>
      </div>
      {!compact && (
        <p className="hint">
          Word corrections stay in every format. Copy choices use saved cues and never start a paid
          call. “Clear” is the model’s assessment; your own labels are kept.
        </p>
      )}
    </div>
  )
}
