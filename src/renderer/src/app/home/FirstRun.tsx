import { hasEngineKey, useApp } from '../context'
import { CheckIcon } from '../icons'

export function FirstRun() {
  const { settings, navigate, replayTour } = useApp()
  const ready = hasEngineKey(settings)
  const steps = [
    {
      title: 'Set up a speech engine',
      text: 'Add a provider key or point to a local server.',
      done: ready,
      action: ready ? 'Change engine' : 'Set up engine',
      go: () => navigate('settings', { section: 'engine' })
    },
    {
      title: 'Test your microphone',
      text: 'Check the level meter and pick the input you want.',
      done: false,
      action: 'Test microphone',
      go: () => navigate('settings', { section: 'mic' })
    },
    {
      title: 'Try it in a text field',
      text: 'Click into any app, press your shortcut and say a sentence.',
      done: false,
      action: 'Take the quick tour',
      go: replayTour
    }
  ]
  return (
    <section className="card recent" aria-labelledby="first-h">
      <h2 id="first-h">Three steps to your first session</h2>
      <ol className="steps">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span className={step.done ? 'step-no done' : 'step-no'} aria-hidden="true">
              {step.done ? <CheckIcon size={14} /> : i + 1}
            </span>
            <span className="step-text">
              <b>{step.title}</b>
              <span className="dim">{step.text}</span>
            </span>
            <button type="button" className="btn small" onClick={step.go}>
              {step.action}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
