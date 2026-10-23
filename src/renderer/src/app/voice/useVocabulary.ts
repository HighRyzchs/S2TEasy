import { useCallback } from 'react'
import { learnFix, type VocabularyEntry, type WordKind } from '@shared/vocabulary'
import { useApp } from '../context'
import type { EditResult } from './voice-logic'

/** Saves vocabulary edits. Resolves to an error message (also kept by the caller) or null on success. */
export function useVocabulary() {
  const { settings, save } = useApp()
  const vocabulary = settings.vocabulary

  const commit = useCallback(
    async (result: EditResult): Promise<string | null> => {
      if (!result.ok) return result.error
      try {
        await save({ vocabulary: result.vocabulary })
        return null
      } catch {
        // save() already showed the reason as a toast.
        return 'Could not save. Your change was not applied.'
      }
    },
    [save]
  )

  const learn = useCallback(
    async (heard: string, meant: string, kind: WordKind): Promise<boolean> => {
      const next: VocabularyEntry[] = learnFix(vocabulary, { heard, meant, kind }, () => crypto.randomUUID())
      if (next === vocabulary) return false
      try {
        await save({ vocabulary: next })
        return true
      } catch {
        return false
      }
    },
    [save, vocabulary]
  )

  return { vocabulary, commit, learn }
}
