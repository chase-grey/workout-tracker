import { describe, expect, it } from 'vitest'
import { expectedProgress } from './sessionPace'
import { closeSet, skipSpan, startSetClock } from './setClock'
import {
  NO_PHOTO_TIME,
  closePhotoTime,
  openPhotoSec,
  openPhotoTime,
  photoSecAt,
  resumePhotoTime,
  sessionElapsedSec,
} from './photoTime'

describe('photo time', () => {
  it('banks each photo screen when it closes', () => {
    let tally = openPhotoTime(NO_PHOTO_TIME, 10_000)
    tally = closePhotoTime(tally, 70_000)
    tally = closePhotoTime(openPhotoTime(tally, 200_000), 230_000)
    expect(tally).toEqual({ takenSec: 90, since: 0 })
  })

  it('counts a screen still open', () => {
    const tally = openPhotoTime({ takenSec: 30, since: 0 }, 100_000)
    expect(openPhotoSec(tally, 145_000)).toBe(45)
    expect(photoSecAt(tally, 145_000)).toBe(75)
  })

  it('keeps the start of a screen already open, and closing with none open adds nothing', () => {
    const open = openPhotoTime(openPhotoTime(NO_PHOTO_TIME, 5_000), 50_000)
    expect(open.since).toBe(5_000)
    expect(closePhotoTime({ takenSec: 12, since: 0 }, 99_000)).toEqual({ takenSec: 12, since: 0 })
  })

  it('stands the session clock still while a photo screen is up', () => {
    // Two minutes of stretching, then the camera.
    const tally = openPhotoTime(NO_PHOTO_TIME, 120_000)
    expect(sessionElapsedSec(0, 120_000, tally)).toBe(120)
    expect(sessionElapsedSec(0, 300_000, tally)).toBe(120)
    // Three minutes at the camera, then one more of stretching.
    expect(sessionElapsedSec(0, 360_000, closePhotoTime(tally, 300_000))).toBe(180)
  })

  it('leaves the mark on the progress bar where it was when the camera opened', () => {
    const flow = Array.from({ length: 4 }, () => ({ activeSec: 60, restSec: 30 }))
    const tally = openPhotoTime(NO_PHOTO_TIME, 70_000)
    const before = expectedProgress(flow, sessionElapsedSec(0, 70_000, tally))
    // Five minutes on the photo screen: on the wall clock the whole flow is over.
    expect(expectedProgress(flow, 370)).toBe(1)
    expect(expectedProgress(flow, sessionElapsedSec(0, 370_000, tally))).toBe(before)
    expect(before).toBe(0.25)
  })

  it('goes on from a reopened screen, and drops one the session does not reopen', () => {
    const saved = { takenSec: 20, since: 40_000 }
    expect(resumePhotoTime(saved, true, 100_000)).toEqual(saved)
    expect(resumePhotoTime(saved, false, 100_000)).toEqual({ takenSec: 20, since: 0 })
    expect(resumePhotoTime(undefined, true, 100_000)).toEqual({ takenSec: 0, since: 100_000 })
    expect(resumePhotoTime(null, false, 100_000)).toEqual(NO_PHOTO_TIME)
  })

  it('keeps the camera off the set that finished in front of it', () => {
    let clock = startSetClock('s', 0)
    // The set took 40s, then 90s of photos before its span was closed.
    clock = skipSpan(clock, 90)
    clock = closeSet(clock, 'fold:0', 130_000)
    expect(clock.spentSec).toEqual({ 'fold:0': 40 })
  })
})
