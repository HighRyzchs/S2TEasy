import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureApi } from './lib/api'
import { OverlayApp } from './OverlayApp'
import './hud/hud.css'
import './hud/overlay-root.css'

ensureApi()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>
)
