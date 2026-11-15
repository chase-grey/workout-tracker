import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { trackVisualViewport } from './lib/viewport'
import { initTheme } from './lib/themeStore'
import { initInstallPrompt } from './lib/useInstallPrompt'

trackVisualViewport()
initTheme()
initInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
