import { useMemo, useState } from 'react'
import { summarizeUsage, type UsageState } from '@shared/usage'
import './usage.css'
const money = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 4
  }).format(value)
export function UsagePanel({ usage, onExport }: { usage: UsageState; onExport: () => void }) {
  const [days, setDays] = useState(30)
  const [hover, setHover] = useState<number | null>(null)
  const data = useMemo(() => summarizeUsage(usage.records, days), [usage.records, days])
  const max = Math.max(...data.daily.map((d) => d.cost), 0.001)
  const points = data.daily.map((d, i) => [32 + (i / (days - 1)) * 836, 190 - (d.cost / max) * 142])
  const line = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x!.toFixed(2)},${y!.toFixed(2)}`)
    .join(' ')
  const displayed = hover === null ? null : data.daily[hover]
  return (
    <div className="usage-page">
      <div className="panel-head">
        <div>
          <span className="eyebrow">A clearer picture</span>
          <h2>Every word, accounted for.</h2>
          <p>Your dictation usage, kept on this device.</p>
        </div>
        <button className="ghost" onClick={onExport} disabled={!usage.records.length}>
          Export CSV ↗
        </button>
      </div>
      {usage.warning && (
        <p className="notice" role="alert">
          {usage.warning}
        </p>
      )}
      <div className="usage-toolbar">
        <div className="usage-period" aria-label="Usage period">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              aria-pressed={days === n}
              className={days === n ? 'on' : ''}
              onClick={() => {
                setDays(n)
                setHover(null)
              }}
            >
              {n} days
            </button>
          ))}
        </div>
        <span className="micro">USD · provider-reported costs</span>
      </div>
      <div className="usage-stats">
        <article>
          <span>Reported API spend</span>
          <strong>{money(data.cost)}</strong>
          <small>
            {data.unknown
              ? `${data.unknown} calls have no cost data`
              : 'From recorded provider responses'}
          </small>
        </article>
        <article>
          <span>Audio processed</span>
          <strong>
            {(data.durationMs / 60000).toFixed(1)}
            <em> min</em>
          </strong>
          <small>Retry attempts counted once for audio</small>
        </article>
        <article>
          <span>Transcription calls</span>
          <strong>{data.requests}</strong>
          <small>{data.errors} unsuccessful or cancelled attempts</small>
        </article>
      </div>
      <section className="usage-chart-card" aria-label="Daily recorded API spend">
        <div className="usage-chart-heading">
          <div>
            <span className="eyebrow">THE RHYTHM OF YOUR USAGE</span>
            <h3>
              {displayed
                ? `${new Date(displayed.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${money(displayed.cost)}`
                : 'A little perspective.'}
            </h3>
          </div>
          <span className="usage-legend">
            <i /> Recorded spend
          </span>
        </div>
        <svg
          viewBox="0 0 900 230"
          role="img"
          aria-label={`Daily reported spend over ${days} days. Total ${money(data.cost)}.`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a5e6ce" stopOpacity=".36" />
              <stop offset="100%" stopColor="#a5e6ce" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[48, 95, 142, 190].map((y) => (
            <line key={y} x1="32" x2="868" y1={y} y2={y} className="usage-grid-line" />
          ))}
          <path d={`${line} L868,190 L32,190 Z`} fill="url(#usage-fill)" />
          <path d={line} fill="none" stroke="#91ceb6" strokeWidth="2.5" strokeLinejoin="round" />
          {data.daily.map((d, i) => (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect
                x={points[i]![0]! - 14}
                y="35"
                width={Math.max(8, 836 / days)}
                height="170"
                fill="transparent"
              >
                <title>
                  {d.date}: {money(d.cost)}, {d.requests} requests
                </title>
              </rect>
              {(d.requests > 0 || hover === i) && (
                <circle
                  cx={points[i]![0]}
                  cy={points[i]![1]}
                  r={hover === i ? 4 : 2.5}
                  fill="#a5e6ce"
                />
              )}
            </g>
          ))}
          {[0, Math.floor(days / 2), days - 1].map((i) => (
            <text
              key={i}
              x={points[i]![0]}
              y="220"
              textAnchor={i === 0 ? 'start' : i === days - 1 ? 'end' : 'middle'}
            >
              {new Date(data.daily[i]!.at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric'
              })}
            </text>
          ))}
        </svg>
        {!data.requests && (
          <p className="usage-empty">
            Your first dictation will start the chart. Older history has no billing metadata.
          </p>
        )}
      </section>
      <section className="usage-models">
        <div className="section-heading">
          <h3>Where it went</h3>
          <span className="micro">Model breakdown</span>
        </div>
        {!data.models.length ? (
          <p className="micro">No usage recorded in this period.</p>
        ) : (
          data.models.map((model) => (
            <div className="usage-model" key={model.model}>
              <div>
                <strong>{model.model}</strong>
                <small>
                  {model.requests} calls
                  {model.unknown ? ` · ${model.unknown} without cost data` : ''}
                </small>
              </div>
              <div className="usage-model-track">
                <i style={{ width: `${data.cost ? (model.cost / data.cost) * 100 : 0}%` }} />
              </div>
              <strong>{money(model.cost)}</strong>
            </div>
          ))
        )}
      </section>
      <details className="usage-details">
        <summary>Daily figures</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Calls</th>
              <th>Reported USD</th>
            </tr>
          </thead>
          <tbody>
            {data.daily
              .filter((d) => d.requests)
              .reverse()
              .map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.requests}</td>
                  <td>{money(d.cost)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
      <p className="usage-footnote">
        This is this app’s recorded usage, not your complete provider invoice or account balance.
        Missing costs are unknown, not free. Local speech has no API charge recorded; router.audio
        costs are unavailable unless reported by that service. Retries and recovery calls can incur
        additional charges. History deletion does not delete this separate usage log.
        {usage.truncated
          ? ' The log retains the latest 10,000 calls; older records have been trimmed.'
          : ' The log retains up to 10,000 calls.'}
      </p>
    </div>
  )
}
