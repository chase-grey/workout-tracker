/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// The stretch session lost its core block on 2026-09-22 (office abs became its
// own session), so nothing on screen calls it "stretch + core" any more. The one
// place the words stay is the note stamped on core rows in the sheet.
const KEPT = ['src/lib/session.ts']

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) return sources(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

it('calls the stretch session "stretch", never "stretch + core"', () => {
  const named = sources('src').filter((p) => {
    if (KEPT.includes(p)) return false
    const code = readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    return /stretch\s*(\+|&|and)\s*core/i.test(code)
  })
  expect(named).toEqual([])
})
