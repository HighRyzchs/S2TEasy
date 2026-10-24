/**
 * Dynamic time warping over feature frames. `matchIn` finds where a short template best occurs
 * inside a longer search span (subsequence DTW); costs are averaged per step of the warping path,
 * so short and long matches are comparable.
 */

function distance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum / a.length)
}

export type Match = {
  /** Average frame distance along the best path; lower is closer. */
  cost: number
  /** Frame range [start, end) of the match inside the search span. */
  start: number
  end: number
  /** Median cost over every place the template could end: how well it fits this audio in general. */
  typical: number
}

/**
 * Best occurrence of `template` anywhere in `search`. The match may stretch or squeeze time, but
 * its length must stay between half and double the template's, so one syllable cannot stand in
 * for a phrase. Null when the search span is too short.
 */
export function matchIn(template: Float32Array[], search: Float32Array[]): Match | null {
  const m = template.length
  const n = search.length
  if (!m || n < Math.ceil(m / 2)) return null
  // Symmetric DTW: a diagonal step costs twice the frame distance, so every path between the same
  // end points has total weight m + its length, and the sum is minimised exactly. Rows roll.
  // A path may not take two non-diagonal steps in a row, which keeps the speed ratio within 2x.
  let cost = new Float64Array(n)
  let origin = new Int32Array(n)
  let lastMove = new Uint8Array(n) // 0 diagonal, 1 template advanced alone, 2 search advanced alone
  for (let j = 0; j < n; j++) {
    cost[j] = 2 * distance(template[0], search[j])
    origin[j] = j
  }
  for (let i = 1; i < m; i++) {
    const nextCost = new Float64Array(n).fill(Infinity)
    const nextOrigin = new Int32Array(n)
    const nextMove = new Uint8Array(n)
    for (let j = 0; j < n; j++) {
      const d = distance(template[i], search[j])
      let best = Infinity
      let from = 0
      let move = 0
      if (lastMove[j] !== 1 && cost[j] + d < best) {
        best = cost[j] + d
        from = origin[j]
        move = 1
      }
      if (j > 0) {
        if (cost[j - 1] + 2 * d <= best) {
          best = cost[j - 1] + 2 * d
          from = origin[j - 1]
          move = 0
        }
        if (nextMove[j - 1] !== 2 && nextCost[j - 1] + d < best) {
          best = nextCost[j - 1] + d
          from = nextOrigin[j - 1]
          move = 2
        }
      }
      nextCost[j] = best
      nextOrigin[j] = from
      nextMove[j] = move
    }
    cost = nextCost
    origin = nextOrigin
    lastMove = nextMove
  }
  let found: Omit<Match, 'typical'> | null = null
  const all: number[] = []
  for (let j = 0; j < n; j++) {
    const length = j + 1 - origin[j]
    if (length < m / 2 || length > m * 2 || !Number.isFinite(cost[j])) continue
    const average = cost[j] / (m + length)
    all.push(average)
    if (!found || average < found.cost) found = { cost: average, start: origin[j], end: j + 1 }
  }
  if (!found) return null
  all.sort((a, b) => a - b)
  return { ...found, typical: all[Math.floor(all.length / 2)] }
}

/** Whole-sequence DTW distance between two examples (for calibrating a word's own spread). */
export function between(a: Float32Array[], b: Float32Array[]): number {
  if (!a.length || !b.length) return Infinity
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (long.length > short.length * 2) return Infinity
  const rows = short.length
  const cols = long.length
  let prevCost = new Float64Array(cols).fill(Infinity)
  let prevSteps = new Float64Array(cols).fill(1)
  for (let i = 0; i < rows; i++) {
    const cost = new Float64Array(cols).fill(Infinity)
    const steps = new Float64Array(cols).fill(1)
    for (let j = 0; j < cols; j++) {
      const d = distance(short[i], long[j])
      if (i === 0 && j === 0) {
        cost[j] = d
        continue
      }
      let bc = Infinity
      let bs = 1
      const options: [number, number][] = []
      if (i > 0) options.push([prevCost[j], prevSteps[j]])
      if (j > 0) options.push([cost[j - 1], steps[j - 1]])
      if (i > 0 && j > 0) options.push([prevCost[j - 1], prevSteps[j - 1]])
      for (const [c, s] of options)
        if (c / s < bc / bs || bc === Infinity) {
          bc = c
          bs = s
        }
      cost[j] = bc + d
      steps[j] = bs + 1
    }
    prevCost = cost
    prevSteps = steps
  }
  return prevCost[cols - 1] / prevSteps[cols - 1]
}
