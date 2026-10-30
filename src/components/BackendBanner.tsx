import { backendBehind, backendBehindText } from '../lib/backendVersion'
import { useBackendVersion } from '../store/useBackendVersion'

/**
 * Says, by version number, that the deployed SimpleBackend.gs is older than
 * this build. Shown on the home screen and in Settings and never dismissed:
 * unlike a flaky save, this does not heal on its own, and the stuck writes
 * behind it stay stuck until someone redeploys.
 */
export function BackendBanner() {
  const { live, required } = useBackendVersion()
  if (live === null || !backendBehind(live, required)) return null
  return (
    <aside role="alert" className="rounded-2xl bg-amber-500/15 p-3 text-sm text-amber-200">
      <p className="font-semibold">Backend is behind</p>
      <p className="mt-1 text-xs">{backendBehindText(live, required)}</p>
    </aside>
  )
}
