/** How a file left the app: through the share sheet, as a download, or not at all (the sheet was closed). */
export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled'

type Candidate = { name: string; type: string }

/**
 * Hand `text` to the person as a file: the share sheet where the browser will
 * share a file (a phone: Files, Drive, mail), a download everywhere else.
 *
 * `candidates` are the names and types to offer the share sheet, best first.
 * Chrome on Android shares only a short list of file types and JSON is not on
 * it, so a JSON export is offered a second time as plain text before giving up
 * on sharing. The download always takes the first.
 *
 * Call it inside the press: `navigator.share` needs the user's gesture, which
 * is why nothing is awaited before it.
 */
export async function shareOrDownload(text: string, candidates: Candidate[]): Promise<SaveOutcome> {
  for (const c of candidates) {
    let file: File
    try {
      file = new File([text], c.name, { type: c.type })
      if (!navigator.canShare?.({ files: [file] })) continue
    } catch {
      continue
    }
    try {
      await navigator.share({ files: [file], title: c.name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Anything else (a denied permission, a sheet that failed to open): download it.
      break
    }
  }
  const first = candidates[0]
  const url = URL.createObjectURL(new Blob([text], { type: `${first.type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = first.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
