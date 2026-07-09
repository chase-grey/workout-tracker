/**
 * One-off: parse Chase's pasted training history with the app's own parser and
 * POST it to the Apps Script backend. Run once:
 *   npx tsx scripts/seed-history.ts
 * Safe to read VITE_API_URL from env; falls back to the known deployment.
 */
import {
  parseImport,
  buildWorkoutRows,
  buildBodyWeightEntries,
} from '../src/lib/parseImport'

const URL =
  process.env.VITE_API_URL ||
  'https://script.google.com/macros/s/AKfycbxKDeDE9cRmW8eA5TjShq9dmRvJoVxVE4nsx0l43WLpyXBv_TvheDsYLpBCVuZHLL89xA/exec'

const RAW = `
leg raises
| date | reps |
| --- | --- |
| 4/27 | 13x4 |
| 5/1 | 13x3 14 |
| 5/6 | 14x4 |
| 5/7 | 14 8 |
| 5/15 | 15x2 |
| 5/18 | 5 8 10 10 |

cable crunches
| date | weight | reps |
| --- | --- | --- |
| 4/27 | 72.5 | 10x4 |
| 5/1 | 75 | 10x4 |
| 5/6 | 75 | 10x3 11 |
| 5/7 | 80 | 10x2 7x2 |
| 5/15 | 80 | 10x4 |
| 5/18 | 80 | 10x4 |
| 5/23 | 80 | 10x3 11 7 |
| 5/25 | 80 + 85 | 10x3 8 |

flat bench
| date | weight | reps |
| --- | --- | --- |
| 12/25/25 | 135 | 2 |
| 1/14/26 | 120 dumb | 5 4 4 3 |
| 1/28/26 | 121. 132 143 | 5 3 1 1 |
| 2/8/26 | 120 dumb | 5 4 3 2 |
| 3/26 | 120 dumb | 4 5 5 5 |
| 4/11 | 100 dumb | 10x4 |
| 6/20 | 150 barbell | 1! |

incline bench
| date  | weight | reps  |
| --- | --- | --- |
| 12/25/25 | 115 | 4x4 |
| 12/29/25 | 80 dumb | 10x4 |
| 1/5/26 | 100 dumb | 5x4 |
| 1/19/26 | 110 dumb | 4x4 |
| 2/27/26 | 100 + 110 dumb | 5 6 3 3 |
| 3/4/26 | 110 + 115 machine | 6 6 5 4 |
| 3/6/26 | 115  + 120 machine | 5 5 5 5 |
| 3/11 | 115 | 6 5 3 |
| 3/18 | 120 + 130 machine | 6 5 5 5 |
| 3/28 | 100 dumb | 7 7 7 5 |
| 4/2 | 90 | 11 8 8 6 |
| 4/5 | 90 | 10 10 8 8 |
| 4/8 | 90 | 10 10 10 10 |
| 4/13 | 95 dumb | 10 10 10 10 |
| 4/18 | 95 dumb | 10 10 10 11 |
| 4/21 | 105 + 110 + 115 machine | 10 10 10 10 |
| 4/27 | 100 dumb | 10 10 9 6 |
| 5/1 | 100 dumb  | 8 9 9 9 |
| 5/6 | 100 dumb | 10x4 |
| 5/15 | 100 dumb | 10x4 |
| 5/18 | 117.5 + 110 machine | 10 7 4 10 |
| 5/23 | 110 dumb | 8x3 7 |

overhead press
| date | weight  | reps |
| --- | --- | --- |
| 12/25/25 | 55 | 10 |
| 12/29/25 | 65 | 6 |
| 1/5/26 | 80 | 4 |
| 1/14/26 | 80 | 5 5 4 4 |
| 1/19/26 | 80 | 5x4 |
| 1/28/26 | 62 71 dumb | 10 4 5 5 |
| 2/8/26 | 80 | 5x3 |
| 2/27/26 | 80 | 5x4 |
| 3/4/26 | 85 | 5 4 3 |
| 3/6/26 | 85 | 5x4 |
| 3/18 | 90 + 95 machine | 5 4 4 4 |
| 3/26 | 95 machine | 5 5 4 4 |
| 3/28 | 70 | 7 5 |
| 4/2 | 82 machine | 8 6 7 6 |
| 4/5 | 80 machine | 8 7 7 4 |
| 4/7 | 80 machine | 5 7 7 6 |
| 4/11 | 75 machine | 8 9 10 9 |
| 4/18 | 72 + 77 machine | 12 12 11 10 |
| 4/21 | 75 | 10 7 7 7 |
| 4/27 | 82 machine | 10x4 |
| 5/1 | 85 + 80 machine | 6 5 5 7 |
| 5/6 | 82.5 machine | 9x3 7 |
| 5/15 | 82.5 machine | 6 7 |
| 5/18 | 80 machine | 10 8 |
| 5/23 | 85 + 87.5 machine  | 10x3 8 |

iso chest
| date | weight | reps |
| --- | --- | --- |
| 2/8/26 | 130 | 10 9 |
| 2/27/26 | 130 | 10x3 5 |
| 3/4/26 | 130 | 10 8 7 5 |
| 3/6/26 | 130 | 10x4 |
| 3/18 | 135 | 10x4 |
| 3/26 | 140 | 6 6 6 |
| 4/2 | 140 | 8 6 6 7 |
| 4/5 | 135 | 12 9 10 |
| 4/8 | 135 + 140 | 12 10 10 12 |
| 4/11 | 140 + 145 | 12 12 10 10 |
| 4/18 | 147.5 + 145 + 140 | 10~ 7 7 7 |
| 4/21 | 145 + 150 + 155 | 10 10 10 10 |
| 4/27 | 160 | 8 7 6 6 |
| 5/1 | 155 + 160 | 11 10 10 10 |
| 5/6 | 160 + 165 + 170 | 10 10 10 8 |
| 5/15 | 170 | 10 |
| 5/18 | 175 | 10 7 6 7 |
| 5/23 | 175 | 9 6 6 6 |

weight (morning after restroom)
| date | weight (lbs) |
| --- | --- |
| 3/4 | 167 |
| 3/28 | 170 |
| 4/16 | 170.8 |
| 4/20 | 170.2 |
| 4/21 | 173  |
| 4/22 | 172.6 |
| 4/25 | 170.4 |
| 4/28 | 171.4 |
| 4/29 | 171.4 |
| 5/1 | 173.2 |
| 5/3 | 171.6 |
| 5/5 | 172 |
| 5/6 | 173.8 |
| 5/7 | 175.6 |
| 5/8 | 172.8 |
| 5/10 | 167.8 (sick yesterday) |
| 5/12 | 170.8 |
| 5/19 | 172.4 |
| 5/24 | 172.6 |
| 5/25 | 171.0 |
| 5/26 | 169.8 |
| 5/27 | 170.8 |
| 5/29 | 172.4 |
| 5/30 | 173.8 |
| 5/31 | 171.6 |
| 6/22 | 172.6 |
| 6/24 | 172.6 |
| 7/1 | 167.0 |
`

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

async function post(route: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${URL}?route=${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { status: res.status, snippet: text.slice(0, 120) }
  }
}

async function main() {
  const result = parseImport(RAW, new Date(2026, 6, 8))

  const keyByRawName: Record<string, string> = {}
  for (const ex of result.exercises) {
    keyByRawName[ex.rawName] = ex.match.isNew ? slug(ex.match.name || ex.rawName) : ex.match.key!
  }

  const rows = buildWorkoutRows(result.exercises, keyByRawName)
  const bws = buildBodyWeightEntries(result.bodyWeights)

  console.log('Parsed exercises:')
  for (const ex of result.exercises) {
    console.log(`  ${ex.rawName} -> ${keyByRawName[ex.rawName]} (${ex.entries.length} sessions)`)
  }
  console.log(`Total workout rows: ${rows.length}, body-weight entries: ${bws.length}`)

  console.log('POSTing workouts…', await post('import', { rows }))
  console.log('POSTing body weights…', await post('bodyweight', { entries: bws }))

  // verify
  const w = (await (await fetch(`${URL}?route=workouts`)).json()) as unknown[]
  const b = (await (await fetch(`${URL}?route=bodyweight`)).json()) as unknown[]
  console.log(`Sheet now has ${w.length} workout rows and ${b.length} body-weight rows.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
