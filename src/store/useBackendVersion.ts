import { useEffect, useState } from 'react'
import { REQUIRED_BACKEND_VERSION } from '../config/backendVersion'
import { api } from '../services/api'
import { storage } from '../services/storage'
import { useData } from './DataContext'

/**
 * The deployed backend's version against the one this build needs.
 *
 * Asked once on mount and again after every sync (`lastSync` moves on startup,
 * reconnect, foregrounding and Retry), so a redeploy clears the banner on the
 * next sync without a reload. The last answer is kept on the device so the
 * banner is there from the first paint rather than after a round trip. A fetch
 * that fails outright leaves the last answer standing: offline is not behind.
 */
export function useBackendVersion(): { live: number | null; required: number } {
  const { lastSync } = useData()
  const [live, setLive] = useState<number | null>(() => storage.loadBackendVersion())
  useEffect(() => {
    let current = true
    api.fetchBackendVersion().then((v) => {
      if (!current) return
      storage.saveBackendVersion(v)
      setLive(v)
    }).catch(() => undefined)
    return () => {
      current = false
    }
  }, [lastSync])
  return { live, required: REQUIRED_BACKEND_VERSION }
}
