import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  resolveFloatingPanelRightClearanceCss,
  resolveFloatingPanelWidthCss,
} from '@/lib/ui/floatingPanelGeometry'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('floating-panel geometry clamps one shared responsive width expression', () => {
  assert.match(resolveFloatingPanelWidthCss(Number.NaN), /30vw/)
  assert.match(resolveFloatingPanelWidthCss(0.01), /15vw/)
  assert.match(resolveFloatingPanelWidthCss(0.9), /60vw/)
  assert.match(resolveFloatingPanelRightClearanceCss(0.3), /30vw/)
  assert.match(resolveFloatingPanelRightClearanceCss(0.3), /kg-safe-right/)
})

test('Flight HUD yields default floating-panel space without lowering touch controls', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'canvas/src/features/game-flight-sim/FlightSimHud.tsx'),
    'utf8',
  )
  assert.match(source, /state => state\.floatingPanelOpen === true/)
  assert.match(source, /resolveFloatingPanelRightClearanceCss\(floatingPanelWidthRatio\)/)
  assert.match(source, /data-kg-flight-sim-panel-clearance=/)
  assert.match(source, /style=\{floatingPanelClearanceVariables\}/)
  assert.match(source, /z-\[230\]/)
  assert.doesNotMatch(source, /z-\[80\]/)
  assert.equal((source.match(/sm:right-\[var\(--kg-flight-sim-panel-clearance\)\]/g) || []).length, 3)
})

test('Flight HUD announces only objective transitions as one polite status', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'canvas/src/features/game-flight-sim/FlightSimHud.tsx'),
    'utf8',
  )
  const objectiveStatus = source.match(
    /<p\s+className="mt-1 text-sm font-semibold"[\s\S]*?<\/p>/,
  )?.[0]

  assert.ok(objectiveStatus)
  assert.match(objectiveStatus, /role="status"/)
  assert.match(objectiveStatus, /aria-live="polite"/)
  assert.match(objectiveStatus, /aria-atomic="true"/)
  assert.match(objectiveStatus, /\{projection\.objective\}/)

  const courseDirector = source.match(
    /<p\s+className="mt-1 text-\[11px\] font-semibold text-amber-200"[\s\S]*?<\/p>/,
  )?.[0]
  assert.ok(courseDirector)
  assert.match(
    courseDirector,
    /aria-label=\{`Course director: \$\{courseDirector\.label\}`\}/,
  )
  assert.doesNotMatch(courseDirector, /aria-live=/)
  assert.doesNotMatch(courseDirector, /role="status"/)
})
