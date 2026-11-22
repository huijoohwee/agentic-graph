// Verifies Graph derives generic intent/state presentation from the pinned central Design System
// palette (single owner), preserves the exact prior values, and re-authors no local class literals.
// The derivation/source checks run standalone; owner-byte equality runs when a sibling workspace is given.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const TARGET = 'd60b569179c23a14418616abc265d22f2da00e30'
const OWNER = 'github.com/huijoohwee/agentic-design-system'

const palette = JSON.parse(read('grph-shared/src/ui/ui-intent-palette.json'))
const pin = JSON.parse(read('grph-shared/src/ui/ui-intent-palette.pin.json'))
assert.equal(pin.owner, OWNER, 'palette pin owner')
assert.equal(pin.sourceRevision, TARGET, 'palette must pin the alignment target revision')
assert.equal(pin.sourcePath, 'site/ui-intent-palette.json', 'palette source path')
assert.equal(pin.sourceSha256, `sha256:${sha(fs.readFileSync(path.join(root, 'grph-shared/src/ui/ui-intent-palette.json')))}`, 'vendored palette digest drift')

// Single-owner derivation: adapters import the palette and re-author no generic class literals.
const intent = read('grph-shared/src/ui/intentTokens.ts')
const theme = read('grph-shared/src/ui/themeTokens.ts')
assert.match(intent, /from '\.\/ui-intent-palette\.json'/u, 'intentTokens must import the central palette')
assert.match(intent, /palette\.intents/u, 'intentTokens must derive from palette.intents')
assert.match(theme, /from '\.\/ui-intent-palette\.json'/u, 'themeTokens must import the central palette')
const forbidden = ['text-blue-600', 'ring-blue-500', '#3b82f6', 'bg-gray-50 dark:bg-gray-800', 'text-green-700', 'focus-visible:ring-blue-500', 'bg-black/5 dark:bg-white/5']
for (const literal of forbidden) {
  assert.ok(!intent.includes(literal), `intentTokens re-authors central value: ${literal}`)
  assert.ok(!theme.includes(literal), `themeTokens re-authors central value: ${literal}`)
}

// Appearance preservation: the row-selection class derives exactly to the pre-consolidation value.
const paint = palette.interaction.rowSelection
const percent = `${Math.round(paint.alpha * 100)}%`
const derived = `!bg-[color-mix(in_srgb,${paint.accent}_${percent},var(--kg-panel-bg,white))] hover:!bg-[color-mix(in_srgb,${paint.accent}_${percent},var(--kg-panel-bg,white))] !shadow-[inset_${paint.accentWidthPx}px_0_0_${paint.accent}] [&>td:first-child]:!shadow-[inset_${paint.accentWidthPx}px_0_0_${paint.accent}] [&>th:first-child]:!shadow-[inset_${paint.accentWidthPx}px_0_0_${paint.accent}] [&>td]:!bg-inherit [&>th]:!bg-inherit`
const prior = '!bg-[color-mix(in_srgb,#3b82f6_22%,var(--kg-panel-bg,white))] hover:!bg-[color-mix(in_srgb,#3b82f6_22%,var(--kg-panel-bg,white))] !shadow-[inset_4px_0_0_#3b82f6] [&>td:first-child]:!shadow-[inset_4px_0_0_#3b82f6] [&>th:first-child]:!shadow-[inset_4px_0_0_#3b82f6] [&>td]:!bg-inherit [&>th]:!bg-inherit'
assert.equal(derived, prior, 'row-selection derivation must preserve the exact prior class')
assert.equal(paint.accent, '#3b82f6', 'selection accent preserved')
assert.equal(paint.alpha, 0.22, 'selection alpha preserved')
assert.equal(paint.accentWidthPx, 4, 'selection width preserved')
assert.equal(palette.intents.primary.text, 'text-blue-600 dark:text-blue-400', 'primary intent preserved')
console.log('PASS graph-design-intent-palette · single-owner derivation; no local re-authoring; exact prior values preserved.')

// Owner-byte equality requires the sibling Design System checkout (fleet workspace).
const workspace = process.argv[2]
if (workspace) {
  const owner = path.resolve(workspace, 'agentic-design-system')
  const ownerBytes = execFileSync('git', ['-C', owner, 'show', `${pin.sourceRevision}:${pin.sourcePath}`], { maxBuffer: 500000 })
  assert.ok(ownerBytes.equals(fs.readFileSync(path.join(root, 'grph-shared/src/ui/ui-intent-palette.json'))), 'vendored palette differs from authentic owner bytes')
  console.log('PASS graph-design-intent-palette-upstream · vendored palette equals owner bytes at the pinned revision.')
}