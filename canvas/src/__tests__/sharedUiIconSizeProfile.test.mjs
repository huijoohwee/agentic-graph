import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
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
  assert.equal(pin.profile.sourceRevision, '267cdb31047b02d4f54ea6708fb2518a8a2a57f4')
  assert.equal(pin.profile.registryRevision, 'f9e058d7b3be3acc411634ad84695d6d642f1cd2')
  assert.equal(sha256(profileCss), pin.profile.projectionSha256)
  assert.ok(profileCss.toString('utf8').includes(`agentic-design-system@${pin.profile.sourceRevision}`))
  assert.equal(pin.metrics.floatingPanelRadius, 8)
  assert.match(profileCss.toString('utf8'), /--agentic-floating-panel-radius:\s*8px;/)
  assert.match(applicationCss, /@import '\.\/styles\/shared-ui-profile\.css';/)
  assert.match(centralGraphCss, /--kg-compact-glyph-size:\s*var\(--agentic-icon-size-compact\);/)
  assert.match(centralGraphCss, /--kg-default-glyph-size:\s*var\(--agentic-icon-size-default\);/)
  assert.match(toolbarCss, /\.kg-compact-glyph\s*\{[^}]*width:\s*var\(--kg-compact-glyph-size\);/s)
  assert.match(toolbarCss, /\.kg-default-glyph\s*\{[^}]*width:\s*var\(--kg-default-glyph-size\);/s)
  assert.doesNotMatch(toolbarCss, /@import '\.\/shared-ui-profile\.css';/)
  assert.doesNotMatch(toolbarCss, /var\(--kg-(?:compact|default)-glyph-size,\s*(?:0\.75rem|1rem)\)/)
})

test('Graph FloatingPanel consumes Base structure and the single pinned Design System radius', () => {
  const require = createRequire(import.meta.url)
  const baseCssExport = require.resolve('@agentic-base/views-react/browser.css')
  const basePackage = path.resolve(path.dirname(baseCssExport), '..')
  const panelCss = fs.readFileSync(path.join(basePackage, 'src/panels/floatingPanelShell.css'), 'utf8')
  const panelPin = JSON.parse(fs.readFileSync(path.join(basePackage, 'src/panels/floatingPanelShell.pin.json'), 'utf8'))
  assert.equal(panelPin.revision, 'f9e058d7b3be3acc411634ad84695d6d642f1cd2')
  assert.equal(panelPin.sha256, 'aa9b616350de6e532ce708262ae6674aa21af3096d25bb29ab6c243d7b281594')
  assert.match(panelCss, /border-radius:\s*var\(--agentic-floating-panel-radius\)/)
  const adapter = fs.readFileSync(new URL('../components/ui/FloatingPanel.tsx', import.meta.url), 'utf8')
  assert.match(adapter, /FloatingPanelShell as BaseFloatingPanelShell/)
  const theme = fs.readFileSync(new URL('../lib/ui/floatingPanelTheme.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(theme, /(?:borderRadius|--agentic-floating-panel-radius)\s*:/)
  const sourceDirectory = new URL('../styles/', import.meta.url)
  for (const file of fs.readdirSync(sourceDirectory, { recursive: true })) {
    if (!file.endsWith('.css') || file === 'shared-ui-profile.css') continue
    assert.doesNotMatch(fs.readFileSync(new URL(file, sourceDirectory), 'utf8'), /--agentic-floating-panel-radius\s*:/, file)
  }
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

test('Graph styles cannot redeclare the shared control or dashboard styles', () => {
  const src = new URL('../', import.meta.url)
  const shared = 'styles/shared-ui-profile.css'
  for (const file of fs.readdirSync(src, { recursive: true })) {
    if (!file.endsWith('.css') || file === shared) continue
    const css = fs.readFileSync(new URL(file, src), 'utf8')
    assert.doesNotMatch(css, /--agentic-(?:control-selected-|base-dashboard-|dashboard-(?!top-inset\b))[\w-]+\s*:|\.agentic-(?:control-selected|toggle-group|dashboard-[\w-]+)\b/, file)
    if (css.includes('--agentic-dashboard-top-inset')) assert.equal(file, 'styles/responsive-canvas-toolbar.css', 'only the canvas safe-area integration may supply the shared shell inset')
  }
  const canvasToolbar = fs.readFileSync(new URL('../styles/responsive-canvas-toolbar.css', import.meta.url), 'utf8')
  assert.match(canvasToolbar, /--agentic-dashboard-top-inset: calc\(var\(--kg-safe-top\) \+ var\(--kg-canvas-viewport-edge-gap\) \+ var\(--kg-toolbar-compact-surface-height, 38px\) \+ 0\.5rem\)/)
  assert.match(canvasToolbar, /\.kg-canvas-page-surface \.kg-dashboard-content \{ --agentic-dashboard-top-inset: 0px; \}/)
})

test('Preview and the Media library share the layout picker and the panel toggles use Base controls', () => {
  const source = path => fs.readFileSync(new URL('../features/' + path, import.meta.url), 'utf8')
  for (const file of ['command-menu/MediaCatalogPanelView.tsx', 'panels/views/preview-context/PreviewMediaCatalog.tsx']) {
    const consumer = source(file)
    assert.match(consumer, /<MediaCatalogLayoutControls\b/, file)
    assert.doesNotMatch(consumer, /aria-label="(?:Preview )?(?:list|card|grid) layout"/i, file)
  }
  for (const file of ['command-menu/MediaCatalogLayoutControls.tsx', 'toolbar/FloatingPanelSkillsCommandsView.tsx', 'immersive-media/ImmersiveMediaPanelProjection.tsx']) {
    const consumer = source(file)
    assert.match(consumer, /from '@agentic-base\/views-react\/controls'/, file)
    assert.match(consumer, /<ToggleButtonGroup\b/, file)
    assert.doesNotMatch(consumer, /function ToggleButton\b|className="agentic-toggle-group"/, file)
  }
})

test('Mission dashboard composition uses the Base shell, card grid, primitives, board and layout helpers', () => {
  const source = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  for (const [file, name] of [
    ['components/DashboardCanvas/index.tsx', 'DashboardCanvasLayout'],
    ['features/agent-ready/AgentMissionDashboardView.tsx', 'DashboardCanvasLayout'],
    ['features/agent-ready/AgentMissionDashboardView.tsx', 'DashboardPrimitive'],
    ['features/agent-ready/AgentMissionDashboardView.tsx', 'DashboardCardGrid'],
    ['components/DashboardCanvas/DashboardWidgetBoard.tsx', 'BaseWidgetBoard'],
  ]) {
    assert.match(source(file), /from '@agentic-base\/views-react\/dashboard'/, file)
    assert.ok(source(file).includes('<' + name), file)
  }
  const missionView = source('features/agent-ready/AgentMissionDashboardView.tsx')
  assert.match(missionView, /className="agentic-dashboard-header"/)
  assert.match(missionView, /<details data-dashboard-primitive="disclosure"/)
  const missionOverview = source('features/agent-ready/AgentMissionOverview.tsx')
  assert.match(missionOverview, /from '@agentic-base\/views-react\/dashboard'/)
  assert.match(missionOverview, /<DashboardPrimitive kind="text">Native mission source/)
  assert.match(missionOverview, /<pre data-dashboard-primitive="text"/)
  assert.match(source('components/DashboardCanvas/dashboardWidgetLayout.ts'), /export \{ dashboardWidgetRows, dashboardColumnStyle \} from '@agentic-base\/views-react\/dashboard'/)
})
