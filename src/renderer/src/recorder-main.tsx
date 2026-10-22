import { ensureApi } from './lib/api'
import { MicSession } from './lib/mic'

ensureApi()
let session: MicSession | null = null
let commands: Promise<void> = Promise.resolve()

window.s2t.onCommand((command) => {
  // getUserMedia and AudioWorklet initialization are asynchronous. Serialize stop/start
  // so releasing a hotkey during permission initialization cannot leave a hidden mic.
  commands = commands
    .then(async () => {
      const sessionId = command.sessionId ?? 0
      try {
        if (command.action === 'start') {
          await session?.stop()
          session = new MicSession({
            onLevel: (level) => window.s2t.sendLevel(level, sessionId),
            onUtterance: (wav, durationMs) => window.s2t.sendUtterance(wav, durationMs, sessionId),
            onPcm: (bytes) => window.s2t.sendPcm(bytes, sessionId)
          })
          await session.start(command)
        } else if (command.action === 'cancel') {
          await session?.stop()
          session = null
        } else if (session) {
          const result = await session.finish()
          session = null
          window.s2t.sendFinished({ ...result, sessionId })
        }
      } catch (error) {
        await session?.stop()
        session = null
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
      /* A subsequent command must still be able to start a new session. */
    })
})
