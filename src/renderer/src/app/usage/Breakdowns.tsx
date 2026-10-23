import type { Analytics } from '@shared/analytics'
import { AppIcon } from '../AppIcon'
import { formatDelay, formatMoney, percentOf, SOURCE_LABEL } from './chart'

export function AppsCard({ apps }: { apps: Analytics['apps'] }) {
  const max = Math.max(0, ...apps.map((a) => a.words))
  return (
    <section className="card" aria-labelledby="apps-h">
      <h2 id="apps-h">Where you dictate</h2>
      {!apps.length ? (
        <p className="dim">No words were typed in this period.</p>
      ) : (
        <ul className="hbars">
          {apps.map((app) => (
            <li key={app.name}>
              <AppIcon app={app.exe ? { name: app.name, exe: app.exe } : undefined} />
              <span className="hbar-name">{app.name}</span>
              <span className="hbar-track" aria-hidden="true">
                <i style={{ width: `${percentOf(app.words, max)}%` }} />
              </span>
              <span className="mono hbar-value">{app.words.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="hint">Words typed into each app</span>
    </section>
  )
}

export function RecognizedCard({
  weeks,
  hasWords,
  onOpenVoice
}: {
  weeks: Analytics['recognized']
  hasWords: boolean
  onOpenVoice: () => void
}) {
  return (
    <section className="card" aria-labelledby="acc-h">
      <div className="card-head">
        <h2 id="acc-h">Your words recognized</h2>
        <span className="hint">last 8 weeks</span>
      </div>
      {!weeks.length ? (
        <div className="empty">
          <span>
            {hasWords
              ? 'None of your personal words came up in this time.'
              : 'Add personal words in Your voice and this chart will show how often they come out right.'}
          </span>
          {!hasWords && (
            <button type="button" className="btn small" onClick={onOpenVoice}>
              Open Your voice
            </button>
          )}
        </div>
      ) : (
        <div className="chart small">
          <div className="axis-y mono" aria-hidden="true">
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>
          <div className="plot-wrap">
            <div className="plot">
              <div className="bars wide">
                {weeks.map((week, i) => {
                  const pct = week.total ? Math.round((week.right / week.total) * 100) : 0
                  const edge = i === 0 || i === weeks.length - 1
                  return (
                    <div
                      key={week.at}
                      className="wbar"
                      role="img"
                      aria-label={`${week.label}: ${week.right} of ${week.total} came out right (${pct}%)`}
                      title={`${week.label}: ${week.right} of ${week.total} (${pct}%)`}
                    >
                      <span className="mono wbar-label">{edge ? `${pct}%` : ''}</span>
                      <i className="seg-top" style={{ height: `calc((var(--plot-h) - 20px) * ${pct / 100})` }} />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="axis-x mono" aria-hidden="true">
              <span>{weeks[0]!.label.replace('Week of ', '')}</span>
              <span>latest</span>
            </div>
          </div>
        </div>
      )}
      <span className="hint">
        Times one of your words came out right, first try or fixed before typing
      </span>
    </section>
  )
}

export function ModelsCard({ models }: { models: Analytics['models'] }) {
  return (
    <section className="card" aria-labelledby="models-h">
      <h2 id="models-h">By model</h2>
      {!models.length ? (
        <p className="dim">No requests were recorded in this period.</p>
      ) : (
        <div className="table-wrap tall">
          <table className="tbl wide-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Used for</th>
                <th scope="col" className="n">Requests</th>
                <th scope="col" className="n">Median delay</th>
                <th scope="col" className="n">Failed</th>
                <th scope="col" className="n">Cost</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={`${m.model}-${m.source}`}>
                  <th scope="row" className="mono model-name">{m.model}</th>
                  <td>{SOURCE_LABEL[m.source]}</td>
                  <td className="n">{m.requests.toLocaleString()}</td>
                  <td className="n">{formatDelay(m.medianLatencyMs)}</td>
                  <td className="n">{m.failed.toLocaleString()}</td>
                  <td className="n">{m.cost === null ? 'unknown' : formatMoney(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span className="hint">
        Prices come from what each provider reports. Requests without a reported price are counted as
        unknown, so the total can be lower than your bill.
      </span>
    </section>
  )
}

export function OutcomesLine({ outcomes }: { outcomes: Analytics['outcomes'] }) {
  const parts: [string, number][] = [
    ['complete', outcomes.complete],
    ['recovered', outcomes.recovered],
    ['failed', outcomes.failed],
    ['cancelled', outcomes.cancelled]
  ]
  return (
    <p className="outcomes dim">
      Sessions:{' '}
      {parts.map(([name, n], i) => (
        <span key={name}>
          {i > 0 && ' · '}
          <span className="mono">{n.toLocaleString()}</span> {name}
        </span>
      ))}
    </p>
  )
}

