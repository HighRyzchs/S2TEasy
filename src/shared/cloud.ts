/** S2Teasy Cloud, as the app sees it. Credits are seconds of audio. */
export type CloudPack = { id: string; name: string; hours: number; cents: number }
export type CloudCharge = { kind: string; seconds: number; audioSeconds: number | null; amountCents: number | null; at: number }
export type CloudStatus = {
  signedIn: boolean
  email: string
  balanceSeconds: number
  recent: CloudCharge[]
  packs: CloudPack[]
  maxRequestSeconds: number
}

/** "12 h 05 min", "4 min", "40 s". */
export function formatCredit(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h} h ${String(m).padStart(2, '0')} min`
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min`
  return `${Math.max(0, Math.floor(seconds))} s`
}

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
