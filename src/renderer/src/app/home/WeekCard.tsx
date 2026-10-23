import { useMemo } from 'react'
import { analyze } from '@shared/analytics'
import { useApp } from '../context'
import { formatMoney } from '../usage/chart'

export function WeekCard() {
  const { history, usage, settings, navigate } = useApp()
  const week = useMemo(
    () => analyze({ history, records: usage.records, vocabulary: settings.vocabulary, days: 7 }),
    [history, usage.records, settings.vocabulary]
  )
  const rows: [string, string][] = [
    ['Words dictated', week.words.toLocaleString()],
    ['Fixed by your words', week.fixed.toLocaleString()],
    ['Spend', formatMoney(week.spend)]
  ]
  return (
    <section className="card" aria-labelledby="week-h">
      <div className="card-head">
        <h2 id="week-h">This week</h2>
        <button type="button" className="link" onClick={() => navigate('usage')}>
          Usage
        </button>
      </div>
      <dl className="week-rows">
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt className="dim">{name}</dt>
            <dd className="mono">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
