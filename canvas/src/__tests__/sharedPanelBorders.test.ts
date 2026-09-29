import assert from 'node:assert/strict'
import fs from 'node:fs'
import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export function testSharedPanelBordersForbidLegacyVariants() {
  const read = (name: string) => fs.readFileSync(`src/${name}`, 'utf8')
  const chrome = read('index.css')
  const responsive = read('styles/responsive-toolbar.css')
  const borders = read('styles/shared-borders.css')
  const separator = read('components/ui/VerticalResizeSeparatorHr.tsx')
  assert.equal(UI_THEME_TOKENS.panel.divider, UI_THEME_TOKENS.input.border)
  assert.equal(UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.border.color)
  assert.match(borders, /--kg-surface-border-width: 1px/)
  assert.match(borders, /--kg-workspace-divider-color: color-mix\(in srgb, var\(--kg-text-secondary\) 55%, var\(--kg-panel-bg\)\)/)
  assert.match(borders, /background-image: linear-gradient\(var\(--kg-workspace-divider-color\), var\(--kg-workspace-divider-color\)\)/)
  assert.match(borders, /\.kg-workspace-section-header\s*\{\s*border-bottom: var\(--kg-workspace-divider\)/)
  assert.match(read('features/markdown-workspace/MarkdownExplorerSection.tsx'), /kg-workspace-section-header/)
  assert.match(read('lib/markdown-workspace-runtime/MarkdownWorkspaceRuntime.impl.tsx'), /ariaLabel="Resize explorer"\s+visualStyle="line"/)
  assert.match(chrome, /\.kg-monaco-editor-host \.monaco-editor \.margin\s*\{\s*border-right: var\(--kg-workspace-divider\)/)
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
