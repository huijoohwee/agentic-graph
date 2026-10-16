import assert from 'node:assert/strict'
import test from 'node:test'
import { LAYOUT_MODE_OPTIONS, normalizeLayoutModeChoice } from '../features/toolbar/ui/LayoutModeSelect'

test('read-only inspection and FloatingPanel share the canonical Radial and Block choices', () => {
  assert.deepEqual(LAYOUT_MODE_OPTIONS, [
    { value: 'radial', label: 'Radial (default)' },
    { value: 'block', label: 'Block' },
  ])
  assert.equal(normalizeLayoutModeChoice('radial'), 'radial')
  assert.equal(normalizeLayoutModeChoice(' Block '), 'block')
  assert.equal(normalizeLayoutModeChoice(''), 'radial')
})
