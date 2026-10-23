import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureApi } from './lib/api'
import { App } from './App'
import './app/theme.css'
import './app/components.css'

ensureApi()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
