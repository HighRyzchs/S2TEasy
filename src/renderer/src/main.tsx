import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureApi } from './lib/api'
import { App } from './App'
import './overlay-theme.css'
import './styles.css'

ensureApi()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
