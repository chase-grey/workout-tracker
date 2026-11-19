import { useEffect, useState } from 'react'
import { copyText } from '../../lib/clipboard'
import { PressButton, SETTINGS_BUTTON, SETTINGS_LABEL } from './PressButton'
import { useDataExport } from './useDataExport'

/**
 * Everything you've logged, out of the app: the complete file through the
 * share sheet (or a download), and the text a chat AI can read, analysis
 * prompt in front, on the clipboard. See lib/dataExport for what each holds.
 */
export function DataExportSection() {
  const { analysisText, saveFile } = useDataExport()
  const [done, setDone] = useState<'file' | 'copy' | null>(null)

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 2000)
    return () => clearTimeout(t)
  }, [done])

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>your data</label>
      <PressButton
        onPress={() => void saveFile().then((how) => how === 'downloaded' && setDone('file'))}
        className={SETTINGS_BUTTON}
      >
        {done === 'file' ? 'downloaded' : 'export all my data'}
      </PressButton>
      <PressButton
        onPress={() => void copyText(analysisText()).then((ok) => ok && setDone('copy'))}
        className={SETTINGS_BUTTON}
      >
        {done === 'copy' ? 'copied' : 'copy my data for an AI'}
      </PressButton>
    </section>
  )
}
