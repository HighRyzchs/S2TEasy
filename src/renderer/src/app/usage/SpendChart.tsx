import { useState } from 'react'
import type { Analytics } from '@shared/analytics'
import { formatMoney, niceMax, percentOf } from './chart'

type Row = Analytics['series'][number]
const total = (row: Row) => row.speech + row.cues + row.recovery

export const SERIES = [
  { key: 'speech', label: 'Speech', color: 'var(--series-1)' },
  { key: 'cues', label: 'Emotion cues', color: 'var(--series-2)' },
  { key: 'recovery', label: 'Recovery', color: 'var(--series-3)' }
] as const

export function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      {SERIES.map((s) => (
        <span key={s.key} className="key">
          <i style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Stacked bars, baseline at the bottom. Segments are drawn top (recovery) to bottom (speech). */
export function SpendChart({ rows }: { rows: Row[] }) {
  const [active, setActive] = useState<number | null>(null)
  const top = niceMax(Math.max(0, ...rows.map(total)))
  const hover = active === null ? undefined : rows[active]
  const flip = active !== null && active / Math.max(1, rows.length) > 0.55
  const anyData = rows.some((row) => total(row) > 0)
  const first = rows[0]?.label
  const last = rows[rows.length - 1]?.label
  return (
    <div className="chart">
      <div className="axis-y mono" aria-hidden="true">
        <span>{formatMoney(top)}</span>
        <span>{formatMoney(top / 2)}</span>
        <span>$0</span>
      </div>
      <div className="plot-wrap">
        <div className="plot" onMouseLeave={() => setActive(null)}>
          <div className="bars" style={{ gap: rows.length > 40 ? 2 : rows.length > 12 ? 4 : 10 }}>
            {rows.map((row, i) => {
              const parts = [...SERIES].reverse().filter((s) => row[s.key] > 0)
              return (
                <button
                  key={row.at}
                  type="button"
                  className="bar"
                  aria-label={`${row.label}: ${formatMoney(total(row))}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  {parts.map((s, n) => (
                    <i
                      key={s.key}
                      className={n === 0 ? 'seg-top' : undefined}
                      style={{ height: `${percentOf(row[s.key], top)}%`, background: s.color }}
                    />
                  ))}
                </button>
              )
            })}
          </div>
          {hover && (
            <div
              role="status"
              className="tooltip"
              style={flip ? { right: `${(1 - (active! + 0.5) / rows.length) * 100}%`, marginRight: 14 } : { left: `${((active! + 0.5) / rows.length) * 100}%`, marginLeft: 14 }}
            >
              <b>{hover.label}</b>
              {SERIES.map((s) => (
                <span key={s.key} className="tip-row">
                  <span className="key">
                    <i style={{ background: s.color }} aria-hidden="true" />
                    {s.label}
                  </span>
                  <span className="mono">{formatMoney(hover[s.key])}</span>
                </span>
              ))}
              <span className="tip-row tip-total">
                <span>Total</span>
                <span className="mono">{formatMoney(total(hover))}</span>
              </span>
            </div>
          )}
          {!anyData && <p className="chart-empty dim">No spend recorded in this period.</p>}
        </div>
        <div className="axis-x mono" aria-hidden="true">
          <span>{first}</span>
          <span>{last}</span>
        </div>
      </div>
    </div>
  )
}

export function SpendTable({ rows, unit }: { rows: Row[]; unit: string }) {
  const sum = rows.reduce((n, row) => n + total(row), 0)
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">{unit}</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" className="n">
                {s.label}
              </th>
            ))}
            <th scope="col" className="n">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => (
            <tr key={row.at}>
              <th scope="row">{row.label}</th>
              {SERIES.map((s) => (
                <td key={s.key} className="n">
                  {formatMoney(row[s.key])}
                </td>
              ))}
              <td className="n">{formatMoney(total(row))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All</th>
            <td colSpan={3} />
            <td className="n">{formatMoney(sum)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
