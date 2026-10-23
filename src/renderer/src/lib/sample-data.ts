import type { HistoryItem } from '@shared/types'
import type { UsageRecord } from '@shared/usage'
import type { VocabularyEntry } from '@shared/vocabulary'

/**
 * Sample data for the browser preview and README screenshots. Clearly fictional: no real people,
 * accounts or costs. Times are relative to when the preview loads.
 */
const MIN = 60_000
const DAY = 86_400_000

export const sampleVocabulary: VocabularyEntry[] = [
  {
    id: 'w-ryzchs',
    heard: 'risks',
    meant: 'Ryzchs',
    enabled: true,
    kind: 'name',
    variants: ['rizz kiss', "rich's"],
    engineHint: true,
    hint: 'rizz-kss',
    stats: { fixed: 14, heardRight: 9, missed: 1 }
  },
  {
    id: 'w-s2teasy',
    heard: 'as two teasy',
    meant: 'S2Teasy',
    enabled: true,
    kind: 'name',
    variants: ['s two t easy'],
    engineHint: true,
    hint: 'es-two-teasy',
    stats: { fixed: 21, heardRight: 4, missed: 0 }
  },
  {
    id: 'w-bite',
    heard: 'bike',
    meant: 'bite',
    enabled: true,
    kind: 'accent',
    engineHint: false,
    stats: { fixed: 4, heardRight: 2, missed: 1 }
  },
  {
    id: 'w-kube',
    heard: 'cooper netties',
    meant: 'Kubernetes',
    enabled: true,
    kind: 'keyword',
    variants: ['cube a net ease'],
    engineHint: true,
    stats: { fixed: 5, heardRight: 7, missed: 3 }
  },
  {
    id: 'w-notion',
    heard: 'motion',
    meant: 'Notion',
    enabled: true,
    kind: 'keyword',
    engineHint: true,
    stats: { fixed: 6, heardRight: 11, missed: 0 }
  },
  {
    id: 'w-gg',
    heard: 'gee gee no ray',
    meant: 'GG, no re',
    enabled: true,
    kind: 'phrase',
    engineHint: false,
    stats: { fixed: 3, heardRight: 0, missed: 1 }
  }
]

const apps = {
  discord: { name: 'Discord', exe: 'C:\\Users\\sample\\AppData\\Local\\Discord\\Discord.exe' },
  notion: { name: 'Notion', exe: 'C:\\Users\\sample\\AppData\\Local\\Programs\\Notion\\Notion.exe' },
  code: { name: 'VS Code', exe: 'C:\\Program Files\\Microsoft VS Code\\Code.exe' },
  slack: { name: 'Slack', exe: 'C:\\Users\\sample\\AppData\\Local\\slack\\slack.exe' },
  gmail: { name: 'Chrome', exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
}

type Seed = Omit<HistoryItem, 'id' | 'createdAt' | 'model' | 'source'> & {
  ago: number
  source?: HistoryItem['source']
}

const seeds: Seed[] = [
  {
    ago: 12 * MIN,
    app: apps.discord,
    text: 'Yeah, I just talked to Ryzchs about the stream tonight. He wants to demo the new S2Teasy overlay live. So Ryzchs joins at nine, and I will grab a quick bite before.',
    rawText:
      'Yeah, I just talked to risks about the stream tonight. He wants to demo the new as two teasy overlay live. So risks joins at nine, and I will grab a quick bike before.',
    durationMs: 38_000,
    status: 'complete',
    hasAudio: true,
    fixes: [
      { entryId: 'w-ryzchs', from: 'risks', to: 'Ryzchs' },
      { entryId: 'w-s2teasy', from: 'as two teasy', to: 'S2Teasy' },
      { entryId: 'w-ryzchs', from: 'risks', to: 'Ryzchs' },
      { entryId: 'w-bite', from: 'bike', to: 'bite' }
    ]
  },
  {
    ago: 74 * MIN,
    app: apps.notion,
    text: 'Launch checklist: installer smoke test, update recovery on a cold machine, and every HUD style on two monitors. Put the results in Notion before Friday.',
    rawText:
      'Launch checklist: installer smoke test, update recovery on a cold machine, and every hud style on two monitors. Put the results in motion before Friday.',
    durationMs: 72_000,
    status: 'complete',
    fixes: [{ entryId: 'w-notion', from: 'motion', to: 'Notion' }],
    edits: [{ from: 'hud', to: 'HUD' }]
  },
  {
    ago: 3 * 60 * MIN,
    app: apps.code,
    source: 'final',
    text: 'Rename the overlay helper and keep the topmost pin when the display changes. Add a test for the Kubernetes deploy script.',
    rawText:
      'Rename the overlay helper and keep the topmost pin when the display changes. Add a test for the cooper netties deploy script.',
    durationMs: 31_000,
    status: 'complete',
    fixes: [{ entryId: 'w-kube', from: 'cooper netties', to: 'Kubernetes' }]
  },
  {
    ago: 21 * 60 * MIN,
    app: apps.slack,
    text: 'Can you send the overlay build to the testers and ask them to try hold mode on a laptop with a',
    durationMs: 52_000,
    status: 'error',
    hasAudio: true,
    error: 'The connection dropped after 0:41. The words so far and the audio are saved.'
  },
  {
    ago: 26 * 60 * MIN,
    app: apps.gmail,
    text: 'Hi Sam, thanks for the notes on Thursday. I moved the review to Monday so Ryzchs can join, and I attached the new screenshots.',
    rawText:
      'Hi Sam, thanks for the notes on Thursday. I moved the review to Monday so risks can join, and I attached the new screenshots.',
    durationMs: 44_000,
    status: 'complete',
    fixes: [{ entryId: 'w-ryzchs', from: 'risks', to: 'Ryzchs' }]
  },
  {
    ago: 2 * DAY + 40 * MIN,
    app: apps.discord,
    text: 'GG, no re. That last round was wild, Kubernetes jokes aside.',
    rawText: 'gee gee no ray. That last round was wild, cube a net ease jokes aside.',
    durationMs: 9_000,
    status: 'complete',
    fixes: [
      { entryId: 'w-gg', from: 'gee gee no ray', to: 'GG, no re' },
      { entryId: 'w-kube', from: 'cube a net ease', to: 'Kubernetes' }
    ]
  },
  {
    ago: 3 * DAY,
    app: apps.notion,
    text: 'Meeting notes. Ship the Your voice redesign first, then the usage analytics. Ask Priya about the font licenses.',
    rawText:
      'Meeting notes. Ship the Your voice redesign first, then the usage analytics. Ask Priya about the font licenses.',
    durationMs: 61_000,
    status: 'complete',
    edits: [{ from: 'pria', to: 'Priya' }]
  },
  {
    ago: 4 * DAY,
    app: apps.code,
    text: 'The streaming client should keep the socket open while paused and reconnect on resume.',
    durationMs: 18_000,
    status: 'complete'
  },
  {
    ago: 5 * DAY,
    app: apps.discord,
    text: 'Pria said the S2Teasy beta is ready for testers this weekend.',
    rawText: 'Pria said the as two teasy beta is ready for testers this weekend.',
    durationMs: 12_000,
    status: 'complete',
    fixes: [{ entryId: 'w-s2teasy', from: 'as two teasy', to: 'S2Teasy' }],
    edits: [{ from: 'Pria', to: 'Priya' }]
  },
  {
    ago: 8 * DAY,
    app: apps.slack,
    text: 'Quick update: recovery audio now expires after seven days by default.',
    durationMs: 14_000,
    status: 'complete'
  },
  {
    ago: 11 * DAY,
    app: apps.gmail,
    text: 'Thanks for the invite. I can do Tuesday afternoon, otherwise Thursday morning works.',
    durationMs: 16_000,
    status: 'cancelled',
    error: 'Cancelled. Any saved text and recovery audio are kept until you delete them.'
  },
  {
    ago: 2 * DAY + 3 * MIN,
    source: 'practice',
    practiceTarget: 'Kubernetes',
    text: 'Kubernetes',
    rawText: 'cube a net ease',
    durationMs: 1_400,
    status: 'complete',
    hasAudio: true
  },
  {
    ago: 2 * DAY + 2 * MIN,
    source: 'practice',
    practiceTarget: 'Kubernetes',
    text: 'Kubernetes',
    rawText: 'Kubernetes',
    durationMs: 1_200,
    status: 'complete',
    hasAudio: true
  }
]

export function sampleHistory(now = Date.now()): HistoryItem[] {
  return seeds.map(({ ago, source, ...item }, i) => ({
    ...item,
    id: `sample-${i + 1}`,
    createdAt: now - ago,
    model: 'router.audio/deepgram',
    source: source ?? 'live'
  }))
}

/** About three weeks of requests: live speech every day, cue analysis on some, two recoveries. */
export function sampleUsage(now = Date.now()): UsageRecord[] {
  const rows: UsageRecord[] = []
  for (let day = 0; day < 24; day++) {
    const weekend = new Date(now - day * DAY).getDay() % 6 === 0
    const sessions = weekend ? 3 + (day % 3) : 6 + ((day * 7) % 5)
    for (let n = 0; n < sessions; n++) {
      const at = now - day * DAY - n * 47 * MIN
      const id = `sample-usage-${day}-${n}`
      rows.push({
        id,
        operationId: id,
        sessionId: `sample-session-${day}-${n}`,
        source: 'dictation',
        createdAt: at,
        engine: 'router-audio',
        model: 'router.audio · deepgram nova-3',
        costUsd: 0.006 + ((day + n) % 5) * 0.0025,
        durationMs: 30_000 + ((day * 13 + n * 7) % 40) * 1000,
        latencyMs: 120 + ((day * 31 + n * 17) % 60),
        attempt: 1,
        outcome: (day * 11 + n) % 37 === 0 ? 'error' : 'success'
      })
      if (weekend || n % 3 === 0)
        rows.push({
          id: `${id}-cues`,
          operationId: `${id}-cues`,
          sessionId: `sample-session-${day}-${n}`,
          source: 'speech-cues',
          createdAt: at + 5000,
          engine: 'openrouter',
          model: 'google/gemini-2.5-flash-lite',
          costUsd: 0.0009 + (n % 3) * 0.0004,
          durationMs: 30_000,
          latencyMs: 560 + (n % 4) * 40,
          attempt: 1,
          outcome: 'success'
        })
    }
  }
  for (const day of [1, 9])
    rows.push({
      id: `sample-recovery-${day}`,
      operationId: `sample-recovery-${day}`,
      sessionId: 'sample-4',
      source: 'recovery',
      createdAt: now - day * DAY,
      engine: 'openrouter',
      model: 'qwen/qwen3-asr-1.7b',
      costUsd: day === 1 ? null : 0.004,
      durationMs: 52_000,
      latencyMs: 1900,
      attempt: 1,
      outcome: 'success'
    })
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}
