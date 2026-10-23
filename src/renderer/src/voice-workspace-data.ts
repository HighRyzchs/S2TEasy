import type { ExpressionKind, ExpressionSegment } from '@shared/expressive-transcript'
export const scenes = [
  { id: 'shifting', name: 'A change in tone', subtitle: 'Calm → excited → uncertain' },
  { id: 'excited', name: 'Same words, excited', subtitle: 'Bouncy pitch, faster delivery' },
  { id: 'upset', name: 'Same words, upset', subtitle: 'Tense delivery, longer pauses' },
  { id: 'neutral', name: 'Low & steady', subtitle: 'Even delivery ≠ sadness' }
] as const
export type Scene = (typeof scenes)[number]['id']
export function sampleSegments(scene: Scene): ExpressionSegment[] {
  const tag = (
    id: string,
    kind: ExpressionKind,
    label: string,
    strength: 'clear' | 'tentative' = 'clear'
  ) => ({ id, kind, label, strength, source: 'sample-model' as const })
  if (scene === 'shifting')
    return [
      { id: 'one', text: 'Hey shiv on. ', tags: [tag('a', 'emotion', 'calm')] },
      {
        id: 'two',
        text: 'Wait, s two t easy actually got it! ',
        tags: [
          tag('b', 'emotion', 'excited'),
          tag('c', 'pacing', 'speaking quickly'),
          tag('d', 'event', 'laughs')
        ]
      },
      {
        id: 'three',
        text: 'Are you sure that’s the final result?',
        tags: [tag('e', 'emotion', 'uncertain', 'tentative'), tag('f', 'delivery', 'soft')]
      }
    ]
  const words = ['I didn’t expect that. ', 'Tell me what happened. ', 'Okay, I’m listening.']
  const labels =
    scene === 'excited'
      ? ['excited', 'happy', 'excited']
      : scene === 'upset'
        ? ['upset', 'frustrated', 'upset']
        : ['neutral', 'neutral', 'neutral']
  return words.map((text, i) => ({
    id: `line-${i}`,
    text,
    tags: [
      tag(`emotion-${i}`, 'emotion', labels[i]!),
      ...(i === 1
        ? [
            tag(
              'delivery',
              'delivery',
              scene === 'neutral' ? 'monotone' : scene === 'upset' ? 'trembling' : 'animated'
            )
          ]
        : [])
    ]
  }))
}
