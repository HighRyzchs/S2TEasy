import type { GroupedHistory } from '../history-groups'
import { AppIcon } from '../AppIcon'
import { appName, previewText, statusInfo } from './format'

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function SessionList({
  groups,
  selectedId,
  onSelect
}: {
  groups: GroupedHistory
  selectedId?: string
  onSelect: (id: string) => void
}) {
  return (
    <section className="card session-list-card" aria-label="Sessions">
      {groups.map((group) => (
        <div key={group.label} className="day-group">
          <span className="label day-label">{group.label}</span>
          {group.items.map((item) => {
            const status = statusInfo(item)
            return (
              <button
                key={item.id}
                type="button"
                className="srow"
                aria-pressed={item.id === selectedId}
                onClick={() => onSelect(item.id)}
              >
                <span className="srow-top hint">
                  <span className="srow-who">
                    <AppIcon app={item.app} small />
                    {appName(item)} · {timeOf(item.createdAt)}
                  </span>
                  <span className={`srow-status ${status.tone}`}>{status.label}</span>
                </span>
                <span className="srow-text">{previewText(item)}</span>
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )
}
