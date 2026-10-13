import { describe, expect, it } from 'vitest'
import { REPORT_EVERY_MS, dueReports, type SaveErrorReport } from './saveErrorReport'

const report = (writeId: string, message: string): SaveErrorReport => ({
  build: 'abc1234',
  route: 'session',
  writeId,
  message,
  pending: 1,
  payload: null,
})

describe('dueReports', () => {
  it('reports a failure once, then stays quiet while it keeps failing the same way', () => {
    const first = dueReports([report('w1', 'Backend busy')], {}, 1000)
    expect(first.due).toHaveLength(1)
    const again = dueReports([report('w1', 'Backend busy')], first.log, 2000)
    expect(again.due).toHaveLength(0)
  })

  it('reports again once the window has passed', () => {
    const first = dueReports([report('w1', 'Backend busy')], {}, 0)
    const later = dueReports([report('w1', 'Backend busy')], first.log, REPORT_EVERY_MS)
    expect(later.due).toHaveLength(1)
  })

  it('treats a new error on the same write, or a new write, as news', () => {
    const { log } = dueReports([report('w1', 'Backend busy')], {}, 0)
    const next = dueReports([report('w1', 'Unknown route'), report('w2', 'Backend busy')], log, 1)
    expect(next.due.map((r) => `${r.writeId} ${r.message}`)).toEqual([
      'w1 Unknown route',
      'w2 Backend busy',
    ])
  })

  it('drops expired entries from the log', () => {
    const { log } = dueReports([report('w1', 'x')], {}, 0)
    expect(dueReports([], log, REPORT_EVERY_MS).log).toEqual({})
  })
})
