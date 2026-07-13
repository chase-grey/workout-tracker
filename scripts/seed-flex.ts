/**
 * One-off: seed historical flexibility measurements. Run AFTER redeploying the
 * backend with the multi-angle flexibility schema:
 *   npx tsx scripts/seed-flex.ts
 */
const URL =
  process.env.VITE_API_URL ||
  'https://script.google.com/macros/s/AKfycbxKDeDE9cRmW8eA5TjShq9dmRvJoVxVE4nsx0l43WLpyXBv_TvheDsYLpBCVuZHLL89xA/exec'

type FlexRow = {
  date: string
  splitDeg: number | null
  tailorsLeftDeg: number | null
  tailorsRightDeg: number | null
  note?: string
}

const ROWS: FlexRow[] = [
  { date: '2025-11-26', splitDeg: 84.42, tailorsLeftDeg: 50.69, tailorsRightDeg: 48.19, note: 'historical' },
  { date: '2026-02-25', splitDeg: 91.72, tailorsLeftDeg: 51.79, tailorsRightDeg: 51.81, note: 'historical' },
  { date: '2026-05-19', splitDeg: null, tailorsLeftDeg: 57.68, tailorsRightDeg: 54.9, note: 'historical' },
]

async function post(body: unknown) {
  const res = await fetch(`${URL}?route=flexibility`, {
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
  for (const row of ROWS) {
    console.log(`posting ${row.date}…`, await post(row))
  }
  const check = (await (await fetch(`${URL}?route=flexibility`)).json()) as unknown[]
  console.log(`flexibility now has ${check.length} rows.`)
  console.log(check)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
