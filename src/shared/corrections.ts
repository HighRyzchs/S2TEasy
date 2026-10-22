export type Correction = { heard: string; meant: string }
const tokens = (text: string) =>
  text.match(/[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu) ?? []
/** Bounded word alignment, grouping adjacent substitutions and ignoring punctuation-only edits. */
export function suggestCorrections(before: string, after: string): Correction[] {
  const a = tokens(before),
    b = tokens(after)
  let prefix = 0
  while (
    prefix < a.length &&
    prefix < b.length &&
    a[prefix]!.toLocaleLowerCase() === b[prefix]!.toLocaleLowerCase()
  )
    prefix++
  a.splice(0, prefix)
  b.splice(0, prefix)
  while (a.length && b.length && a.at(-1)!.toLocaleLowerCase() === b.at(-1)!.toLocaleLowerCase()) {
    a.pop()
    b.pop()
  }
  if (a.length > 900 || b.length > 900) return []
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  const same = (i: number, j: number) => a[i]!.toLocaleLowerCase() === b[j]!.toLocaleLowerCase()
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] = same(i, j)
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
  let i = 0,
    j = 0
  const result: Correction[] = [],
    removed: string[] = [],
    added: string[] = []
  const flush = () => {
    if (removed.length && added.length && removed.length <= 6 && added.length <= 6) {
      const heard = removed.join(' '),
        meant = added.join(' ')
      if (
        heard.toLocaleLowerCase() !== meant.toLocaleLowerCase() &&
        !result.some((r) => r.heard === heard && r.meant === meant)
      )
        result.push({ heard, meant })
    }
    removed.length = 0
    added.length = 0
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(i, j)) {
      flush()
      i++
      j++
    } else if (i < a.length && (j === b.length || table[i + 1]![j]! >= table[i]![j + 1]!))
      removed.push(a[i++]!)
    else added.push(b[j++]!)
  }
  flush()
  return result.slice(0, 20)
}
