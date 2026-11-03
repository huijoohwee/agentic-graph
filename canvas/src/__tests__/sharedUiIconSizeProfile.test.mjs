import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

const styles = new URL('../styles/', import.meta.url)
const pin = JSON.parse(fs.readFileSync(new URL('shared-ui-profile.pin.json', styles), 'utf8'))
const profileCss = fs.readFileSync(new URL('shared-ui-profile.css', styles))
const toolbarCss = fs.readFileSync(new URL('responsive-toolbar.css', styles), 'utf8')
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`

test('Graph glyph roles consume the pinned Design System icon-size projection', () => {
  assert.equal(pin.schema, 'agentic-design-system/consumer-pin/v1')
  assert.equal(pin.profile.id, 'shared-ui')
  assert.equal(sha256(profileCss), pin.profile.projectionSha256)
  assert.ok(profileCss.toString('utf8').includes(`agentic-design-system@${pin.profile.sourceRevision}`))
  assert.match(toolbarCss, /^@import '\.\/shared-ui-profile\.css';/)
  assert.match(toolbarCss, /--kg-compact-glyph-size:\s*var\(--agentic-icon-size-compact\);/)
  assert.match(toolbarCss, /--kg-default-glyph-size:\s*var\(--agentic-icon-size-default\);/)
  assert.doesNotMatch(toolbarCss, /var\(--kg-(?:compact|default)-glyph-size,\s*(?:0\.75rem|1rem)\)/)
})
