import { useEffect, useState } from 'react'

/** Name of the selected input device, or a plain fallback while the browser does not share labels. */
export function useMicrophoneName(microphoneId: string): string {
  const isDefault = !microphoneId || microphoneId === 'default'
  const [name, setName] = useState('')
  useEffect(() => {
    let alive = true
    setName('')
    if (isDefault || !navigator.mediaDevices?.enumerateDevices) return
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const match = devices.find((d) => d.kind === 'audioinput' && d.deviceId === microphoneId)
        if (alive && match?.label) setName(match.label)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [microphoneId, isDefault])
  if (isDefault) return 'Default microphone'
  return name || 'Selected microphone'
}
