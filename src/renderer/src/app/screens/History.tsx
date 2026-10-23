import { useEffect, useMemo, useState } from 'react'
import type { HistoryItem } from '@shared/types'
import { useApp } from '../context'
import { SearchIcon } from '../icons'
import { groupHistory } from '../history-groups'
import { SessionDetail } from '../history/SessionDetail'
import { SessionList } from '../history/SessionList'
import { appName, needsRecovery } from '../history/format'
import '../history/history.css'

type Filter = 'all' | 'fixed' | 'edited' | 'recovery' | 'cues'

const FILTERS: { id: Filter; label: string; test: (item: HistoryItem) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'fixed', label: 'Fixed by your voice', test: (i) => !!i.fixes?.length },
  { id: 'edited', label: 'Edited', test: (i) => !!i.edits?.length },
  { id: 'recovery', label: 'Needs recovery', test: needsRecovery },
  { id: 'cues', label: 'With cues', test: (i) => !!i.cueAnalysis }
]

export function History() {
  const { history, target, run, setHistory, active } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pickedId, setPickedId] = useState<string | undefined>(target.section)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (target.section) setPickedId(target.section)
  }, [target])

  const recoveryCount = useMemo(() => history.filter(needsRecovery).length, [history])
  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test
    const needle = query.trim().toLocaleLowerCase()
    return history.filter(
      (item) =>
        test(item) &&
        (!needle ||
          item.text.toLocaleLowerCase().includes(needle) ||
          appName(item).toLocaleLowerCase().includes(needle))
    )
  }, [history, filter, query])
  const groups = useMemo(() => groupHistory(visible), [visible])
  const selected = visible.find((item) => item.id === pickedId) ?? visible[0]

  return (
    <div className="page history">
      <header className="page-head">
        <div>
          <h1>History</h1>
          <p>
            Every session is saved here first, before anything is typed. The newest 400 are kept, on
            this PC.
          </p>
        </div>
        <div className="actions">
          <label className="search">
            <SearchIcon size={15} />
            <input
              type="search"
              placeholder="Search what you said"
              aria-label="Search history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn danger"
            disabled={!history.length || active}
            onClick={() => setConfirmClear(true)}
          >
            Clear all history
          </button>
        </div>
      </header>

      {confirmClear && (
        <div className="confirm-bar" role="alert">
          <span>Delete all {history.length} sessions and their saved audio? This cannot be undone.</span>
          <span className="actions">
            <button
              type="button"
              className="btn small danger"
              onClick={() => {
                setConfirmClear(false)
                void run(async () => setHistory(await window.s2t.clearHistory()))
              }}
            >
              Delete everything
            </button>
            <button type="button" className="btn small" onClick={() => setConfirmClear(false)}>
              Keep history
            </button>
          </span>
        </div>
      )}

      <div className="filters" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="filter"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === 'recovery' && recoveryCount > 0 && <span className="mono"> · {recoveryCount}</span>}
          </button>
        ))}
      </div>

      {!history.length ? (
        <div className="empty">
          <b>No sessions yet</b>
          <span>Click into any text field, press your shortcut and say a sentence. It will show up here.</span>
        </div>
      ) : !visible.length ? (
        <div className="empty">
          <b>No matching sessions</b>
          <span>Try a different search or filter.</span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setQuery('')
              setFilter('all')
            }}
          >
            Show everything
          </button>
        </div>
      ) : (
        <div className="columns history-columns">
          <SessionList groups={groups} selectedId={selected?.id} onSelect={setPickedId} />
          {selected && <SessionDetail item={selected} />}
        </div>
      )}
    </div>
  )
}
