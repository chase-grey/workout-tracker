import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportCrash } from '../services/saveErrors'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../lib/shell'

/**
 * What's left when a render throws. Without it React unmounts the whole tree
 * and the phone shows bare ground — a blank screen with no way out but closing
 * the app, and nothing to say what went wrong. This says what, offers the
 * reload, and reports it to the save_errors tab, since the phone has no console.
 */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    void reportCrash(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className={`app-shell flex flex-col justify-center gap-4 ${SHELL_WIDTH} ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}>
        <h1 className="text-xl font-bold">something broke</h1>
        <p className="break-words font-mono text-sm text-neutral-400">{error.message || error.name}</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[52px] rounded-lg bg-accent text-base font-bold text-on-accent active:opacity-80"
        >
          reload
        </button>
      </div>
    )
  }
}
