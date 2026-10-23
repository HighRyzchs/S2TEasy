import { useMemo, useState } from 'react'
import { analyze } from '@shared/analytics'
import { useApp } from '../context'
import { AppsCard, ModelsCard, OutcomesLine, RecognizedCard } from '../usage/Breakdowns'
import { formatDelay, formatMoney, formatTalkTime, monthSpend } from '../usage/chart'
import { Legend, SpendChart, SpendTable } from '../usage/SpendChart'
import '../usage/usage.css'

const RANGES = [7, 30, 90]
const TYPING_WPM = 40

export function Usage() {
  const { history, usage, settings, run, navigate } = useApp()
  const [days, setDays] = useState(30)
  const [table, setTable] = useState(false)
  const data = useMemo(
    () => analyze({ history, records: usage.records, vocabulary: settings.vocabulary, days }),
    [history, usage.records, settings.vocabulary, days]
  )
  const weeks = useMemo(
    () =>
      analyze({ history, records: usage.records, vocabulary: settings.vocabulary, days: 56 }).recognized,
    [history, usage.records, settings.vocabulary]
  )
  const month = useMemo(() => monthSpend(usage.records), [usage.records])
  const unit = data.range.bucket === 'week' ? 'week' : 'day'
  const savedMin = Math.round(data.words / TYPING_WPM)
  const hasWords = settings.vocabulary.some((entry) => entry.enabled)
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })

  return (
    <div className="page usage">
      <header className="page-head">
        <div>
          <h1>Usage</h1>
          <p>
            What S2Teasy did for you and what it cost. Worked out on this PC from your own history;
            nothing is sent anywhere.
          </p>
        </div>
        <div className="actions">
          <div className="seg" role="group" aria-label="Time range">
            {RANGES.map((n) => (
              <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>
                {n} days
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!usage.records.length}
            onClick={() => void run(() => window.s2t.exportUsage())}
          >
            Export CSV
          </button>
        </div>
      </header>

      {usage.warning && (
        <p className="usage-warning" role="alert">
          {usage.warning}
        </p>
      )}

      <section className="grid-tiles usage-tiles" aria-label="Totals">
        <div className="tile">
          <span className="label">Spend</span>
          <strong>{formatMoney(data.spend)}</strong>
          <small>
            {data.unknownPrice > 0
              ? `${data.unknownPrice.toLocaleString()} ${data.unknownPrice === 1 ? 'request' : 'requests'} without a reported price`
              : `last ${days} days`}
          </small>
        </div>
        <div className="tile">
          <span className="label">Time talking</span>
          <strong>{formatTalkTime(data.talkMs)}</strong>
          <small>{data.sessions.toLocaleString()} {data.sessions === 1 ? 'session' : 'sessions'}</small>
        </div>
        <div className="tile">
          <span className="label">Words</span>
          <strong>{data.words.toLocaleString()}</strong>
          <small>
            {savedMin > 0 ? `about ${formatTalkTime(savedMin * 60_000)} of typing saved at ${TYPING_WPM} wpm` : 'typed for you'}
          </small>
        </div>
        <div className="tile">
          <span className="label">Fixed by your voice</span>
          <strong>{data.fixed.toLocaleString()}</strong>
          <small>words corrected before typing</small>
        </div>
        <div className="tile">
          <span className="label">Median delay</span>
          <strong>{formatDelay(data.medianLatencyMs)}</strong>
          <small>speech to words on screen</small>
        </div>
      </section>

      <section className="card" aria-labelledby="spend-h">
        <div className="card-head spend-head">
          <div className="spend-title">
            <h2 id="spend-h">Spend per {unit}</h2>
            <Legend />
          </div>
          <div className="seg" role="group" aria-label="Chart or table">
            <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>
              Chart
            </button>
            <button type="button" aria-pressed={table} onClick={() => setTable(true)}>
              Table
            </button>
          </div>
        </div>
        {table ? (
          <SpendTable rows={data.series} unit={unit === 'week' ? 'Week' : 'Day'} />
        ) : (
          <SpendChart rows={data.series} />
        )}
      </section>

      <div className="columns usage-pair">
        <AppsCard apps={data.apps} />
        <RecognizedCard weeks={weeks} hasWords={hasWords} onOpenVoice={() => navigate('voice')} />
      </div>

      <ModelsCard models={data.models} />
      <OutcomesLine outcomes={data.outcomes} />

      <section className="card month" aria-labelledby="month-h">
        <div>
          <h2 id="month-h">This month</h2>
          <span className="hint">{monthName}, all requests with a reported price</span>
        </div>
        <strong className="mono month-value">{formatMoney(month)}</strong>
      </section>

      <p className="hint usage-foot">
        This is what this app recorded, not your provider’s invoice. Missing prices are unknown, not
        free. History deletion does not delete this usage log.{' '}
        {usage.truncated
          ? 'The log keeps the latest 10,000 requests; older ones were trimmed.'
          : 'The log keeps up to 10,000 requests.'}
      </p>
    </div>
  )
}
