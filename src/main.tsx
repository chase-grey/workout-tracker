import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CrashScreen } from './components/CrashScreen'
import { onKeyboardTrace, trackVisualViewport } from './lib/viewport'
import { initTheme } from './lib/themeStore'
import { initInstallPrompt } from './lib/useInstallPrompt'
import { watchForUpdates } from './lib/version'
import { watchScreen } from './services/screenWatch'
import { reportDeviceFailure } from './services/saveErrors'

// First, so a throw in anything below is seen and reported.
watchScreen()
trackVisualViewport()
// How the keyboard really came up on this phone, onto the save_errors tab: the
// composer's slide can only be judged against the timings of the device that
// showed it (see CLAUDE.md, "When the keyboard and the composer fall out of step").
onKeyboardTrace((t) => {
  void reportDeviceFailure('keyboard_trace', t.overlay ? 'keyboard over the page' : 'keyboard resizing the page', {
    ...t,
    userAgent: navigator.userAgent,
    standalone: matchMedia('(display-mode: standalone)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    screen: [window.innerWidth, window.innerHeight],
  })
})
initTheme()
initInstallPrompt()
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
)
