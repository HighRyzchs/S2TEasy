import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureApi } from './lib/api'
import { OverlayApp } from './OverlayApp'
import './hud/hud.css'

ensureApi()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>
)
