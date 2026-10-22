import { ensureApi } from './lib/api'
import { MicSession } from './lib/mic'

ensureApi()
let session: MicSession | null = null
let cancelledThrough = -1
let commands: Promise<void> = Promise.resolve()

window.s2t.onCommand((command) => {
  const sessionId = command.sessionId ?? 0
  if (command.action === 'cancel') {
    cancelledThrough = Math.max(cancelledThrough, sessionId)
    const pending = session
    session = null
    // An unresolved permission prompt must not block cancellation or the next session.
    commands = Promise.resolve()
    void pending?.stop().catch(() => undefined)
    return
  }
  commands = commands
    .then(async () => {
      if (sessionId <= cancelledThrough) return
      let active = session
      try {
        if (command.action === 'start') {
          await active?.stop()
          if (sessionId <= cancelledThrough) return
          active = new MicSession({
            onLevel: (level) => window.s2t.sendLevel(level, sessionId),
            onUtterance: (wav, durationMs, startMs) =>
              window.s2t.sendUtterance(wav, durationMs, sessionId, startMs),
            onPcm: (bytes) => window.s2t.sendPcm(bytes, sessionId)
          })
          session = active
          await active.start(command)
        } else if (active) {
          const result = await active.finish()
          if (session === active) session = null
          if (sessionId > cancelledThrough) window.s2t.sendFinished({ ...result, sessionId })
        }
      } catch (error) {
        await active?.stop()
        if (session === active) session = null
        if (sessionId <= cancelledThrough) return
        const message =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Microphone permission denied. Allow it in Windows Settings → Privacy → Microphone.'
            : error instanceof Error
              ? error.message
              : 'Could not access the microphone.'
        window.s2t.sendRecordingError(message, sessionId)
      }
    })
    .catch(() => {
      /* Keep the command queue usable after a failed device operation. */
    })
})
