import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

const styles = new URL('../styles/', import.meta.url)
const pin = JSON.parse(fs.readFileSync(new URL('shared-ui-profile.pin.json', styles), 'utf8'))
const profileCss = fs.readFileSync(new URL('shared-ui-profile.css', styles))
const toolbarCss = fs.readFileSync(new URL('responsive-toolbar.css', styles), 'utf8')
const centralGraphCss = fs.readFileSync(new URL('kgTokens.generated.css', styles), 'utf8')
const applicationCss = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`

test('Graph glyph roles consume the pinned Design System icon-size projection', () => {
  assert.equal(pin.schema, 'agentic-design-system/consumer-pin/v1')
  assert.equal(pin.profile.id, 'shared-ui')
  assert.equal(sha256(profileCss), pin.profile.projectionSha256)
  assert.ok(profileCss.toString('utf8').includes(`agentic-design-system@${pin.profile.sourceRevision}`))
  assert.match(applicationCss, /@import '\.\/styles\/shared-ui-profile\.css';/)
  assert.match(centralGraphCss, /--kg-compact-glyph-size:\s*var\(--agentic-icon-size-compact\);/)
  assert.match(centralGraphCss, /--kg-default-glyph-size:\s*var\(--agentic-icon-size-default\);/)
  assert.match(toolbarCss, /\.kg-compact-glyph\s*\{[^}]*width:\s*var\(--kg-compact-glyph-size\);/s)
  assert.match(toolbarCss, /\.kg-default-glyph\s*\{[^}]*width:\s*var\(--kg-default-glyph-size\);/s)
  assert.doesNotMatch(toolbarCss, /@import '\.\/shared-ui-profile\.css';/)
  assert.doesNotMatch(toolbarCss, /var\(--kg-(?:compact|default)-glyph-size,\s*(?:0\.75rem|1rem)\)/)
})

test('Graph toolbar, table and virtualized row metrics share the Base and Design System owner', () => {
  assert.match(centralGraphCss, /--kg-toolbar-compact-surface-height: var\(--agentic-row-height\);/)
  assert.match(centralGraphCss, /--kg-table-row-height: var\(--agentic-row-height\);/)
  for (const [key, cssName] of [['rowHeight', 'row-height'], ['rowHeightTouch', 'row-height-touch']]) {
    assert.ok(profileCss.toString().includes(`--agentic-${cssName}: ${pin.metrics[key]}px;`))
  }
  const density = fs.readFileSync(new URL('../lib/ui/dataViewDensity.ts', import.meta.url), 'utf8')
  assert.match(density, /return readBaseDataViewRowHeightPx\(preset\)/)
  assert.doesNotMatch(density, /preset === 'compact' \? 22 : 28/)
  const host = fs.readFileSync(new URL('../features/markdown/ui/GraphTableHost.tsx', import.meta.url), 'utf8')
  assert.match(host, /readHeaderPaddingClassName: baseTableHost.helpers.readHeaderPaddingClassName/)
  assert.match(host, /readTablePaddingClassName: baseTableHost.helpers.readTablePaddingClassName/)
})


test('headless typography metadata and KTV layout are projections of the pinned profile', async () => {
  const fonts = await import('../../../grph-shared/src/ui/fontStacks.js')
  assert.equal(fonts.UI_BODY_FONT_SIZE, pin.metrics.bodyFontSize)
  assert.equal(fonts.UI_BODY_LINE_HEIGHT, pin.metrics.bodyLineHeight)
  for (const [name, value] of [['sans', fonts.UI_FONT_SANS], ['mono', fonts.UI_FONT_MONO]]) {
    assert.ok(profileCss.toString().includes(`--agentic-font-${name}: ${value};`))
  }
  assert.match(toolbarCss, /font-size: var\(--agentic-font-size-body\)/)
  const rows = fs.readFileSync(new URL('../../../grph-shared/src/ui/keyTypeValueRows.ts', import.meta.url), 'utf8')
  assert.ok(rows.includes('grid-cols-[var(--agentic-ktv-columns)]'))
  assert.ok(!rows.includes('minmax('), 'Column geometry must have one central owner')
})


test('legacy renderer fields reuse the KTV adapter and palette and renderer sections reuse the selected inset', () => {
  const rows = fs.readFileSync(new URL('../lib/ui/responsiveControlRows.tsx', import.meta.url), 'utf8')
  assert.ok(rows.includes('<CanvasKeyTypeValueStaticRow'))
  assert.ok(!rows.includes('responsiveControlWidthClassName'))
  assert.ok(rows.includes("'aria-labelledby': labelId"), 'Original accessible control names must survive the adapter')
  const palette = fs.readFileSync(new URL('../features/toolbar/ui/RendererPaletteSettings.tsx', import.meta.url), 'utf8')
  assert.ok(palette.includes('className={uiToolbarSettingsPanelBodyClassName}'))
  assert.ok(palette.includes('CanvasKeyTypeValueStaticRow as KeyTypeValueStaticRow'))
  assert.ok(!palette.includes('densityClassName='), 'Palette and legacy controls must use the same row runtime')
  const toolbarStyles = fs.readFileSync(new URL('../features/toolbar/ui/toolbarStyles.ts', import.meta.url), 'utf8')
  assert.ok(toolbarStyles.includes("uiToolbarSettingsPanelBodyClassName = 'agentic-panel-section-body'"))
  assert.doesNotMatch(toolbarCss, /--kg-toolbar-settings-panel-body-padding-(?:inline|block)\s*:/)
})


test('sequence inspector body and spacing consume the same shared roles', () => {
  const inspectorCss = fs.readFileSync(new URL('../features/sequence/SequenceFlow.css', import.meta.url), 'utf8')
  assert.match(inspectorCss, /\.sequence-inspector > p \{[^}]*font-size: var\(--agentic-font-size-body\); line-height: var\(--agentic-line-height-body\)/)
  assert.doesNotMatch(inspectorCss, /\.sequence-inspector[^{}]*\{[^}]*font-size: (?:12|13)px/)
  const inspector = fs.readFileSync(new URL('../features/sequence/SequenceInspectorView.tsx', import.meta.url), 'utf8')
  assert.ok(inspector.includes('sequence-inspector ${uiToolbarSettingsPanelBodyClassName}'))
})

test('Graph styles cannot redeclare the shared selected control palette or selectors', () => {
  const src = new URL('../', import.meta.url)
  const shared = 'styles/shared-ui-profile.css'
  for (const file of fs.readdirSync(src, { recursive: true })) {
    if (!file.endsWith('.css') || file === shared) continue
    const css = fs.readFileSync(new URL(file, src), 'utf8')
    assert.doesNotMatch(css, /--agentic-control-selected-[\w-]+\s*:|\.agentic-(?:control-selected|toggle-group)\b/, file)
  }
})
