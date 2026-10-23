/** How much of a paused session's finish countdown is left, 0 to 1. */
export function countdownFraction(finishAt: number, now: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, (finishAt - now) / total))
}

/** The 8-bit HP bar drains in whole steps. */
export function stepped(fraction: number, steps = 12): number {
  return Math.ceil(fraction * steps) / steps
}

/** Green above half, yellow above a fifth, red below. */
export function hpColor(fraction: number): string {
  if (fraction > 0.5) return '#38b848'
  if (fraction > 0.2) return '#f8c800'
  return '#e83030'
}

export function finishLabel(finishAt: number | undefined, now: number): string {
  if (finishAt === undefined) return "On hold while you're here"
  return `Finishes in ${Math.max(0, Math.ceil((finishAt - now) / 1000))}s`
}
