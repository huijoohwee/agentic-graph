import assert from 'node:assert/strict'
import fs from 'node:fs'
import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export function testSharedPanelBordersForbidLegacyVariants() {
  const read = (name: string) => fs.readFileSync(`src/${name}`, 'utf8')
  const chrome = read('index.css')
  const responsive = read('styles/responsive-toolbar.css')
  const borders = read('styles/shared-borders.css')
  const timeline = read('components/timeline/TimelineTransportControls.css')
  const gantt = read('components/timeline/TimelineTransportControlsMermaidGantt.css')
  const player = read('components/timeline/TimelineTransportPlayer.css')
  assert.match(read('features/document-versioning/DocumentVersionGitGraphPanel.tsx'), /h-full max-h-full min-h-0 min-w-0/)
  assert.match(read('features/document-versioning/DocumentVersionGitGraphPanel.tsx'), /min-h-0 min-w-0 flex-1 overflow-auto border-t/)
  assert.match(timeline, /@import '.\/TimelineTransportPlayer.css'/)
  assert.doesNotMatch(timeline, /\.timeline-transport-chrome--mermaid-gantt/)
  assert.match(gantt, /border: var\(--kg-surface-border\)/)
  assert.doesNotMatch(gantt, /inset 0|border[^;]+solid color-mix\(in srgb, var\(--kg-border/)
  assert.doesNotMatch(player, /(?:min-height|height): (?:20|22|26)px/)
  assert.doesNotMatch(read('features/agent-ready/WorkspaceActivityPanel.tsx'), /min-h-11|<div|aria-hidden/)
  assert.doesNotMatch(read('features/gitgraph/GanttTimelineTransportHeaderTools.tsx'), /aria-hidden/)
  assert.match(read('components/timeline/VideoSequenceTimelineDenseFbf.css'), /:not\(\[data-kg-timeline-clip-select-surface="1"\]\)/)
  for (const name of ['WarehouseTimelinePanel', 'WarehouseInspectionFeed', 'LearningCanvasStatus']) {
    const source = read(`features/python-learning/${name}.tsx`)
    assert.doesNotMatch(source, /min-h-11|<div|aria-hidden|pointer-events-none absolute/)
    assert.match(source, /UI_THEME_TOKENS.control.singleLine/)
    assert.match(source, /UI_THEME_TOKENS.border.outline/)
  }
  assert.match(read('features/python-learning/WarehouseInspectionFeed.tsx'), /<fieldset aria-label="Simulated camera source"/)
  const python = read('features/python-learning/pythonLearning.css')
  assert.doesNotMatch(python, /min-height:(?:30|36|44)px|#667/)
  assert.match(python, /height:var\(--kg-control-height\)/)
  assert.match(python, /text-overflow:ellipsis/)
  const semantic = read('features/xr-v2/SemanticSpacePanel.tsx')
  assert.doesNotMatch(semantic, /min-h-11|border-current|<div|aria-hidden|pointer-events-none/)
  assert.match(semantic, /<PanelTextInput/)
  assert.match(semantic, /aria-label=\{`Select region/)
  const diagram = read('lib/diagram/InteractiveMermaidDiagram.tsx')
  assert.doesNotMatch(diagram, /rounded border|UI_THEME_TOKENS.panel.border/)
  assert.match(diagram, /svg.setAttribute\('aria-label', ariaLabel\)/)
  const separator = read('components/ui/VerticalResizeSeparatorHr.tsx')
  const toolbar = read('components/Toolbar.tsx')
  assert.equal(UI_THEME_TOKENS.panel.divider, UI_THEME_TOKENS.input.border)
  assert.equal(UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.border.color)
  assert.match(borders, /--kg-surface-border-width: 1px/)
  assert.match(borders, /\[data-kg-workspace-left-pane\]:has\(\+ \.kg-resize-separator\) \.kg-markdown-workspace-shell\s*\{\s*border-right-width: 0/)
  assert.match(borders, /background-image: linear-gradient\(var\(--kg-border\), var\(--kg-border\)\)/)
  assert.match(borders, /\.kg-workspace-section-header\s*\{\s*border-bottom: var\(--kg-surface-border\)/)
  assert.doesNotMatch(borders, /--kg-workspace-divider/)
  assert.match(read('features/markdown-workspace/MarkdownExplorerSection.tsx'), /kg-workspace-section-header/)
  assert.match(read('features/markdown-workspace/MarkdownExplorerSection.tsx'), /collapsed \|\| resizeAfter/)
  assert.match(read('features/markdown-workspace/MarkdownWorkspaceExplorer.tsx'), /resizeAfter=\{!sourceFilesCollapsed && !tocCollapsed\}/)
  assert.match(read('features/markdown-workspace/MarkdownWorkspaceExplorer.tsx'), /resizeAfter=\{!tocCollapsed && !backlinksCollapsed\}/)
  assert.doesNotMatch(read('features/panels/views/SettingsView.tsx'), /<WorkspaceTableModeControl className=.*border-b/)
  assert.match(read('lib/markdown-workspace-runtime/MarkdownWorkspaceRuntime.impl.tsx'), /ariaLabel="Resize explorer"\s+visualStyle="line"/)
  assert.match(chrome, /\.kg-monaco-editor-host \.monaco-editor \.margin\s*\{\s*border-right: var\(--kg-surface-border\)/)
  assert.match(chrome, /\.App-toolbar__divider\s*\{\s*width: var\(--kg-resize-separator-thickness\)/)
  assert.equal([...toolbar.matchAll(/<hr className="App-toolbar__divider" role="separator" aria-orientation="vertical" aria-label="[^"]+"/g)].length, 4)
  assert.doesNotMatch(toolbar, /<(?:section|div) className="App-toolbar__divider"|<hr className="App-toolbar__divider" aria-hidden/)
  assert.doesNotMatch(chrome, /border(?:-\w+)?: (?:1px|var\(--kg-surface-border-width\)) solid var\(--(?:kg-border|kg-divider|island-border-color)\)/)
  assert.doesNotMatch(responsive, /box-shadow: inset 1px 0 0 var\(--kg-divider\)/)
  assert.doesNotMatch(separator, /aria-hidden|<div|bg-\[color:var\(--kg-(?:border|divider)\)\]/)
  assert.match(separator, /tabIndex=\{0\}/)
  assert.match(read('lib/ui/panelFormControls.tsx'), /UI_THEME_TOKENS.border.outline/)
  assert.match(read('lib/ui/dropdownMenu.tsx'), /UI_THEME_TOKENS.border.outline/)
  assert.match(read('features/panels/ui/MainPanelContainer.tsx'), /UI_THEME_TOKENS.border.outline/)
}

export function testResizeSeparatorKeyboardUsesBoundedDragOwner() {
  const listeners = new Map<string, EventListener>()
  const handle = {
    addEventListener: (name: string, callback: EventListener) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
  } as unknown as HTMLElement
  let value = 100
  let axis: 'col-resize' | 'row-resize' = 'col-resize'
  let committed = 0
  const unbind = bindResizeSeparatorDragRuntime({
    resizeHandleEl: handle, cursor: () => axis, readCurrentValue: () => value,
    setPreviewValue: next => { value = next },
    commitValue: () => { committed++ },
    resolveNextValueFromPointerDrag: ({ startValue, deltaX, deltaY }) => Math.max(80, Math.min(120, startValue + deltaX + deltaY)),
  })
  const key = (key: string, extra = {}) => {
    let prevented = false
    listeners.get('keydown')?.({ key, preventDefault: () => { prevented = true }, stopPropagation() {}, ...extra } as unknown as KeyboardEvent)
    return prevented
  }
  assert.equal(key('ArrowRight'), true)
  assert.equal(value, 108)
  key('ArrowRight', { shiftKey: true })
  assert.equal(value, 120)
  assert.equal(key('ArrowDown'), false)
  assert.equal(key('ArrowLeft', { ctrlKey: true }), false)
  axis = 'row-resize'
  key('ArrowUp', { shiftKey: true })
  assert.equal(value, 88)
  key('ArrowUp', { shiftKey: true })
  assert.equal(value, 80)
  assert.equal(committed, 4)
  unbind()
  assert.equal(listeners.size, 0)
}
