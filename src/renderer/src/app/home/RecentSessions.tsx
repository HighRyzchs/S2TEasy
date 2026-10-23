import { useEffect, useRef, useState } from 'react'
import type { HistoryItem } from '@shared/types'
import { AppIcon } from '../AppIcon'
import { CheckIcon, CopyIcon } from '../icons'
import { useApp } from '../context'
import { Highlighted } from '../history/Highlighted'
import { appName, countWords, formatWhen, plural, previewText, statusInfo } from '../history/format'

function metaLine(item: HistoryItem): string {
  const parts = [appName(item), formatWhen(item.createdAt)]
  if (item.text.trim()) parts.push(plural(countWords(item.text), 'word'))
  const fixed = item.fixes?.length ?? 0
  if (fixed) parts.push(`${plural(fixed, 'word')} fixed by your voice`)
  if (item.source === 'final') parts.push('draft first')
  return parts.join(' · ')
}

function SessionRow({ item }: { item: HistoryItem }) {
  const { navigate, run, toast } = useApp()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const status = statusInfo(item)
  const copy = () =>
    run(async () => {
      await window.s2t.copyHistory(item.text)
      setCopied(true)
      toast('Copied')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    })
  return (
    <li className="session-row">
      <button
        type="button"
        className="row-open"
        aria-label={`Open ${appName(item)} session from ${formatWhen(item.createdAt)} in History`}
        onClick={() => navigate('history', { section: item.id })}
      />
      <AppIcon app={item.app} />
      <span className="row-body">
        <span className="row-text">
          {item.text.trim() ? <Highlighted item={item} text={item.text} /> : previewText(item)}
        </span>
        <span className="hint">{metaLine(item)}</span>
      </span>
      <button
        type="button"
        className="btn icon row-copy"
        aria-label={copied ? 'Copied' : `Copy text from ${appName(item)} session`}
        title="Copy"
        disabled={!item.text.trim()}
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
      </button>
      <span className={status.tone === 'bad' ? 'pill bad' : status.tone === 'off' ? 'pill off' : 'pill'}>
        {status.label}
      </span>
    </li>
  )
}

export function RecentSessions({ items }: { items: HistoryItem[] }) {
  const { navigate } = useApp()
  return (
    <section className="card recent" aria-labelledby="recent-h">
      <div className="card-head">
        <h2 id="recent-h">Recent sessions</h2>
        <button type="button" className="link" onClick={() => navigate('history')}>
          All history
        </button>
      </div>
      <ul className="session-list">
        {items.map((item) => (
          <SessionRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}
