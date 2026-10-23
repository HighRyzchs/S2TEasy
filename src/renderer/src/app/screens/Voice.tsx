import { useEffect, useState } from 'react'
import { useApp } from '../context'
import { ExpressionTab } from '../voice/ExpressionTab'
import { PracticeTab } from '../voice/PracticeTab'
import { WordsTab } from '../voice/WordsTab'
import '../voice/voice.css'

type Tab = 'words' | 'practice' | 'expression'
const TABS: { id: Tab; label: string }[] = [
  { id: 'words', label: 'Words' },
  { id: 'practice', label: 'Practice' },
  { id: 'expression', label: 'Expression' }
]
const isTab = (value: string | undefined): value is Tab => value === 'words' || value === 'practice' || value === 'expression'

export function Voice() {
  const { target, settings } = useApp()
  const [tab, setTab] = useState<Tab>(isTab(target.tab) ? target.tab : target.practice ? 'practice' : 'words')
  const [selected, setSelected] = useState('')
  const [practice, setPractice] = useState(target.practice ?? '')

  useEffect(() => {
    if (isTab(target.tab)) setTab(target.tab)
    else if (target.practice) setTab('practice')
    if (target.practice) setPractice(target.practice)
    if (target.word) {
      const hit = settings.vocabulary.find((w) => w.meant.toLowerCase() === target.word!.toLowerCase())
      if (hit) setSelected(hit.id)
    }
    // Only a new navigation request should move the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return (
    <div className="page voice-page">
      <div className="page-head">
        <div>
          <h1>Your voice</h1>
          <p>The words it should know, how you say them, and how your voice sounds. All of it stays on this PC.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Your voice">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'words' && (
        <WordsTab
          selected={selected}
          onSelect={setSelected}
          onPractice={(word) => {
            setPractice(word)
            setTab('practice')
          }}
        />
      )}
      {tab === 'practice' && <PracticeTab requested={practice} onPick={setPractice} />}
      {tab === 'expression' && <ExpressionTab />}
    </div>
  )
}
