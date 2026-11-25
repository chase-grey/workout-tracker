/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// The bottom of the app meets Android's navigation bar: ~/.claude/patterns/android-nav-bar.md.
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

it('holds the page still at its ends, so the bottom nav never drags with it', () => {
  const page = /^html,\s*body \{[^}]*\}/m.exec(css)?.[0] ?? ''
  expect(page).toMatch(/overscroll-behavior(-y)?:\s*none/)
  expect(css).not.toMatch(/overscroll-behavior(-y)?:\s*(contain|auto)/)
})
