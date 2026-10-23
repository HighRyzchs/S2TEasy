import { useEffect, useRef, useState } from 'react'

/** Playback of an already completed take; never opens a microphone. */
export function VoiceClipPreview({ blob }: { blob: Blob }) {
  const player = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  useEffect(() => {
    const element = player.current
    return () => {
      element?.pause()
      element?.removeAttribute('src')
      element?.load()
    }
  }, [url])
  return url ? (
    <audio className="vw-clip" ref={player} src={url} controls aria-label="Saved voice example" />
  ) : null
}
