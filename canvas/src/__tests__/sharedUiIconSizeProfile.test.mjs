import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const styles = new URL('../styles/', import.meta.url)
const pin = JSON.parse(fs.readFileSync(new URL('shared-ui-profile.pin.json', styles), 'utf8'))
const profileCss = fs.readFileSync(new URL('shared-ui-profile.css', styles))
const toolbarCss = fs.readFileSync(new URL('responsive-toolbar.css', styles), 'utf8')
const centralGraphCss = fs.readFileSync(new URL('kgTokens.generated.css', styles), 'utf8')
const applicationCss = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`

test('static Graph surfaces ship the pinned offline fact-label stylesheet', () => {
  const typography = fs.readFileSync(fileURLToPath(import.meta.resolve('agentic-design-system/typography.css')))
  for (const [directory, page, servedAt] of [
    ['canvas/public', 'travel-commerce-demo-offline.html', '/__demo__/travel-commerce'],
    ['cloudflare/workers/miaoxyz/public', 'index.html', '/'],
    ['cloudflare/pages/pitch/agentic-drone-as-a-service', 'index.html', '/pitch/agentic-drone-as-a-service/'],
  ]) {
    const root = new URL('../../../' + directory + '/', import.meta.url)
    assert.deepEqual(fs.readFileSync(new URL('typography.css', root)), typography)
    const html = fs.readFileSync(new URL(page, root), 'utf8')
    const href = html.match(/<link rel="stylesheet" href="([^"]*typography\.css)"/u)?.[1]
    assert.ok(href)
    const asset = new URL(href, 'https://example.test' + servedAt)
    const expected = servedAt.startsWith('/__demo__/') ? '/typography.css' : servedAt + 'typography.css'
    assert.equal(asset.pathname, expected)
  }
})

test('Graph glyph roles consume the pinned Design System icon-size projection', () => {
  assert.equal(pin.schema, 'agentic-design-system/consumer-pin/v1')
  assert.equal(pin.profile.id, 'shared-ui')
  assert.match(pin.profile.sourceRevision, /^[a-f0-9]{40}$/u)
  assert.match(pin.profile.registryRevision, /^[a-f0-9]{40}$/u)
  assert.equal(sha256(profileCss), pin.profile.projectionSha256)
  assert.ok(profileCss.toString('utf8').includes(`agentic-design-system@${pin.profile.sourceRevision}`))
  assert.equal(pin.metrics.toolbarOverlayLayer, 6000)
  assert.match(profileCss.toString('utf8'), /--agentic-toolbar-overlay-layer:\s*6000;/u)
  const panelBundle = fs.readFileSync(fileURLToPath(import.meta.resolve('agentic-design-system/panels.css')), 'utf8')
  assert.equal((applicationCss.match(/@import 'agentic-design-system\/panels\.css';/gu) ?? []).length, 1)
  assert.equal((panelBundle.match(/@import "\.\/toolbar\.css";/gu) ?? []).length, 1)
  assert.equal((panelBundle.match(/@import "\.\/vendor\/shared-ui-profile\.css";/gu) ?? []).length, 1)
  assert.doesNotMatch(applicationCss, /@agentic-base\/views-react\/toolbar\.css/u)
  assert.match(profileCss.toString('utf8'), /--agentic-control-hover-background: light-dark\(#fffbeb, rgb\(251 191 36 \/ 0\.16\)\);/u)
  assert.match(profileCss.toString('utf8'), /\.agentic-icon \{[^}]*inline-size: var\(--agentic-icon-size-default\); block-size: var\(--agentic-icon-size-default\);/s)
  assert.equal(pin.metrics.floatingPanelRadius, 8)
  assert.match(profileCss.toString('utf8'), /--agentic-floating-panel-radius:\s*var\(--agentic-panel-radius\);/)
  assert.match(profileCss.toString('utf8'), /--agentic-panel-radius:\s*8px;/)
  assert.doesNotMatch(applicationCss, /@import[^;]*shared-ui-profile/)
  for (const file of ['main.tsx', 'observability.tsx']) {
    const entry = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    assert.ok(entry.includes("import './index.css'"), file)
    assert.doesNotMatch(entry, /import ['"][^'"]*(?:toolbar|panels|profile)\.css['"]/u, file)
  }
  const table = fs.readFileSync(new URL('../features/markdown/ui/GraphTableHost.tsx', import.meta.url), 'utf8')
  assert.ok(table.includes("import '@agentic-base/views-react/browser-components.css'"))
  assert.match(centralGraphCss, /--kg-compact-glyph-size:\s*var\(--agentic-icon-size-compact\);/)
  assert.match(centralGraphCss, /--kg-default-glyph-size:\s*var\(--agentic-icon-size-default\);/)
  assert.match(toolbarCss, /\.kg-compact-glyph\s*\{[^}]*width:\s*var\(--kg-compact-glyph-size\);/s)
  assert.match(toolbarCss, /\.kg-default-glyph\s*\{[^}]*width:\s*var\(--kg-default-glyph-size\);/s)
  assert.match(applicationCss, /\.kg-panel-icon-btn svg\s*\{[^}]*width:\s*var\(--agentic-icon-size-default\);[^}]*height:\s*var\(--agentic-icon-size-default\);/s)
  assert.doesNotMatch(applicationCss, /\.kg-panel-icon-btn svg\s*\{[^}]*\b(?:width|height):\s*16px/s)
  assert.doesNotMatch(toolbarCss, /@import '\.\/shared-ui-profile\.css';/)
  assert.doesNotMatch(toolbarCss, /var\(--kg-(?:compact|default)-glyph-size,\s*(?:0\.75rem|1rem)\)/)
})

test('Graph FloatingPanel consumes the pinned Design System shell without a local theme bridge', () => {
  const designSystemEntry = fileURLToPath(import.meta.resolve('agentic-design-system/react/panels'))
  const designSystemPackage = path.resolve(path.dirname(designSystemEntry), '../../..')
  const panelCss = fs.readFileSync(path.join(designSystemPackage, 'site/floating-panel.css'), 'utf8')
  const designSystem = JSON.parse(fs.readFileSync(path.join(designSystemPackage, 'package.json'), 'utf8'))
  const appManifest = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(new URL('../../../package-lock.json', import.meta.url), 'utf8'))
  const dependency = appManifest.dependencies['agentic-design-system']
  assert.match(dependency, /^github:huijoohwee\/agentic-design-system#[a-f0-9]{40}$/u)
  assert.ok(lock.packages?.['node_modules/agentic-design-system']?.resolved?.endsWith(dependency.slice(-40)))
  assert.match(panelCss, /\.agentic-base-floating-panel-header/)
  assert.match(panelCss, /border-radius:\s*var\(--agentic-panel-radius\)/)
  assert.match(panelCss, /:is\(\.agentic-floating-panel-tab, \.agentic-base-floating-panel-close\):has\(> \.agentic-icon:only-child\)/)
  assert.match(panelCss, /\.agentic-base-floating-panel-close:hover \{ background: var\(--agentic-control-hover-background\); \}/)
  const toolbarCss = fs.readFileSync(path.join(designSystemPackage, 'site/toolbar.css'), 'utf8')
  assert.match(toolbarCss, /\.agentic-toolbar-item\[data-icon-only\][\s\S]*inline-size: var\(--agentic-control-height\)/)
  assert.match(toolbarCss, /\.agentic-toolbar-item:is\(\[aria-current\], \[aria-expanded=true\], \[aria-pressed=true\]\)/)
  assert.match(panelCss, /inline-size: max\(var\(--agentic-control-height\), var\(--agentic-icon-size-default\)\)/)
  assert.match(panelCss, /inline-size: max\(var\(--agentic-control-height-touch\), var\(--agentic-icon-size-default\)\)/)
  assert.doesNotMatch(panelCss, /(?:inline-size|block-size|width|height):\s*(?:16|28|38|48)px\b/)
  const sharedControl = fs.readFileSync(path.join(designSystemPackage, 'packages/react-panels/src/PanelControlButton.tsx'), 'utf8')
  assert.match(sharedControl, /updatePanelControlButton\(buttonRef\.current, control/)
  assert.doesNotMatch(sharedControl, /PANEL_CONTROL_(?:ICONS|LABELS|ORDER)/)
  const sharedGroup = fs.readFileSync(path.join(designSystemPackage, 'packages/react-panels/src/PanelControlGroup.tsx'), 'utf8')
  assert.match(sharedGroup, /updatePanelControlGroup\(groupRef\.current/)
  assert.doesNotMatch(sharedGroup, /PANEL_CONTROL_ORDER|control === 'minimize'|control === 'restore'/)
  assert.doesNotMatch(sharedGroup, /className\?: string/)
  const controlRuntime = fs.readFileSync(path.join(designSystemPackage, 'site/toolbar-icons.js'))
  assert.match(controlRuntime.toString('utf8'), /const roles = Object\.keys\(definitions\)/)
  assert.match(controlRuntime.toString('utf8'), /return roles\.filter\(control =>/)
  assert.match(controlRuntime.toString('utf8'), /if \(typeof actions\[control\] !== 'function'\) return false/)
  assert.match(controlRuntime.toString('utf8'), /cannot apply consumer visual overrides/)
  const adapter = fs.readFileSync(new URL('../components/ui/FloatingPanel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(adapter, /FloatingPanelShell|FloatingPanelCloseButton|@agentic-base\/views-react\/panels/)
  assert.equal(designSystem.name, 'agentic-design-system')
  assert.equal(fs.existsSync(new URL('../lib/ui/floatingPanelTheme.ts', import.meta.url)), false)
  assert.doesNotMatch(adapter, /readFloatingPanelThemeStyle|--base-(?:accent|text-primary|text-secondary|border|panel|shadow-overlay|toolbar-compact-padding)/)
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
  assert.ok(rows.includes('KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME = KTV_ROW_CLASS'))
  assert.match(profileCss.toString(), /\.agentic-ktv-row\s*\{[^}]*grid-template-columns:\s*var\(--agentic-ktv-columns\)/s)
  assert.ok(!rows.includes('minmax('), 'Column geometry must have one central owner')
})


test('legacy renderer fields reuse the KTV adapter and palette and renderer sections reuse the selected inset', () => {
  const rows = fs.readFileSync(new URL('../lib/ui/responsiveControlRows.tsx', import.meta.url), 'utf8')
  assert.ok(rows.includes('<CanvasKeyTypeValueStaticRow'))
  assert.ok(!rows.includes('responsiveControlWidthClassName'))
  assert.ok(rows.includes("'aria-labelledby': labelId"), 'Original accessible control names must survive the adapter')
  const palette = fs.readFileSync(new URL('../features/toolbar/ui/RendererPaletteSettings.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(palette, /uiToolbarSettingsPanelBodyClassName|agentic-panel-section-body/)
  assert.ok(palette.includes('CanvasKeyTypeValueStaticRow as KeyTypeValueStaticRow'))
  assert.ok(!palette.includes('densityClassName='), 'Palette and legacy controls must use the same row runtime')
  const toolbarStyles = fs.readFileSync(new URL('../features/toolbar/ui/toolbarStyles.ts', import.meta.url), 'utf8')
  assert.ok(toolbarStyles.includes("uiToolbarSettingsPanelBodyClassName = 'agentic-panel-section-body'"))
  assert.doesNotMatch(toolbarCss, /--kg-toolbar-settings-panel-body-padding-(?:inline|block)\s*:/)
})


test('sequence inspector body and spacing consume the same shared roles', () => {
  const inspectorCss = fs.readFileSync(new URL('../features/sequence/SequenceFlow.css', import.meta.url), 'utf8')
  assert.doesNotMatch(inspectorCss, /\.sequence-inspector > (?:h2|p)\s*\{/)
  assert.doesNotMatch(inspectorCss, /\.sequence-inspector[^{}]*\{[^}]*font-size: (?:12|13)px/)
  const inspector = fs.readFileSync(new URL('../features/sequence/SequenceInspectorView.tsx', import.meta.url), 'utf8')
  assert.ok(inspector.includes("import 'agentic-design-system/panel-tab-layout.css'"))
  assert.match(inspector, /<section className="agentic-panel-tab-layout sequence-flow sequence-inspector"/)
  assert.match(inspector, /<header className="agentic-panel-tab-header"><h2 className="agentic-panel-section-title"/)
  assert.match(inspector, /<section className="agentic-panel-tab-body">/)
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

test('Preview and the Media library share the Design System layout picker and immersive controls use Base toggles', () => {
  const source = path => fs.readFileSync(new URL('../features/' + path, import.meta.url), 'utf8')
  for (const file of ['command-menu/MediaCatalogPanelView.tsx', 'panels/views/preview-context/PreviewMediaCatalog.tsx']) {
    const consumer = source(file)
    assert.match(consumer, /<MediaCatalogLayoutControls\b/, file)
    assert.doesNotMatch(consumer, /aria-label="(?:Preview )?(?:list|card|grid) layout"/i, file)
  }
  const skills = source('toolbar/FloatingPanelSkillsCommandsView.tsx')
  assert.match(skills, /import .*mountSkillsCommandsHeader.* from 'agentic-design-system\/skills-commands'/)
  assert.doesNotMatch(skills, /<ToggleButtonGroup|function ToggleButton|className="agentic-toggle-group"/)
  const picker = source('command-menu/MediaCatalogLayoutControls.tsx')
  assert.ok(picker.includes("from 'agentic-design-system/collection-layout'"))
  assert.match(picker, /mountCollectionLayoutPicker\(host\.current/)
  assert.doesNotMatch(picker, /<ToggleButtonGroup|className="agentic-toggle-group"/)
  const immersive = source('immersive-media/ImmersiveMediaPanelProjection.tsx')
  assert.ok(immersive.includes("from '@agentic-base/views-react/controls'"))
  assert.match(immersive, /<ToggleButtonGroup\b/)
  assert.doesNotMatch(immersive, /function ToggleButton\b|className="agentic-toggle-group"/)
})

test('Mission uses the Design System dashboard renderer and Base widget board', () => {
  const source = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  for (const [file, name] of [
    ['components/DashboardCanvas/index.tsx', 'DashboardCanvasLayout'],
    ['features/agent-ready/AgentMissionDashboardView.tsx', 'DashboardCanvasLayout'],
    ['features/agent-ready/AgentMissionDashboardView.tsx', 'DashboardPrimitive'],
    ['features/agent-ready/AgentMissionDashboardView.tsx', 'DashboardCardGrid'],
  ]) {
    assert.ok(source(file).includes("from 'agentic-design-system/react/dashboard'"), file)
    assert.ok(source(file).includes('<' + name), file)
  }
  assert.match(source('components/DashboardCanvas/DashboardWidgetBoard.tsx'), /<BaseWidgetBoard/)
  const missionView = source('features/agent-ready/AgentMissionDashboardView.tsx')
  assert.match(missionView, /className="agentic-dashboard-header"/)
  assert.match(missionView, /<details data-dashboard-primitive="disclosure"/)
  const missionOverview = source('features/agent-ready/AgentMissionOverview.tsx')
  assert.ok(missionOverview.includes("from 'agentic-design-system/react/dashboard'"))
  assert.match(missionOverview, /<DashboardPrimitive kind="text">Native mission source/)
  assert.match(missionOverview, /<pre data-dashboard-primitive="text"/)
  assert.match(source('components/DashboardCanvas/dashboardWidgetLayout.ts'), /export \{ dashboardWidgetRows, dashboardColumnStyle \} from '@agentic-base\/views-react\/dashboard'/)
})
