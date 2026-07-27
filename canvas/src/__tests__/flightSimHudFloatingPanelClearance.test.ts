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
