import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { readFloatFromStorage, writeFloatToStorage } from '@/lib/persistence'
import { UI_ICON_DEFAULTS, UI_THEME_TOKENS, normalizeUiIconStrokeWidth } from '@/lib/ui/theme-tokens'

/** Traverse actual UI sources; SVG data strokes are distinct from component glyphs. */
export function testUiAppearanceSharedAuthority() {
  const read = (file: string) => fs.readFileSync(path.join('src', file), 'utf8')
  const violations: string[] = []
  for (const file of fs.readdirSync('src', { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(file) || file.includes('__tests__') || file.startsWith('tests/')) continue
    const text = read(file)
    // Named SVG filters belong to authored canvas output, not application elevation.
    const uiText = text.replace(/id="shadow-(?:sm|md)"|url\(#shadow-(?:sm|md)\)/g, '')
    assert.doesNotMatch(uiText, /\bshadow-(?:sm|md|lg|xl|2xl)\b/, `${file}: use flat, raised or overlay elevation`)
    if (!file.endsWith('.tsx') || !/strokeWidth\s*=/.test(text)) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^[A-Z]/.test(node.tagName.getText(source))) {
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || attr.name.getText(source) !== 'strokeWidth') continue
          const value = attr.initializer
          const literal = value && (ts.isStringLiteral(value) || ts.isJsxExpression(value) && value.expression && ts.isNumericLiteral(value.expression))
          if (literal) violations.push(`${file}:${source.getLineAndCharacterOfPosition(attr.pos).line + 1}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(violations, [], 'UI glyphs must inherit global stroke; do not reintroduce literal overrides')
  assert.equal(UI_ICON_DEFAULTS.strokeWidth, 1.5)
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(normalizeUiIconStrokeWidth(value), 1.5)
  assert.equal(normalizeUiIconStrokeWidth(0), 0.5)
  assert.equal(normalizeUiIconStrokeWidth(8), 4)
  assert.equal(normalizeUiIconStrokeWidth(2.25), 2.25, 'Preserve explicit valid preferences')
  const entries = new Map<string, string>()
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) } as unknown as Storage
  for (const width of [1.5, 2.25, 4]) {
    assert.equal(writeFloatToStorage(storage, 'icon-stroke-test', normalizeUiIconStrokeWidth(width)), width)
    assert.equal(readFloatFromStorage(storage, 'icon-stroke-test', UI_ICON_DEFAULTS.strokeWidth), width)
  }
  assert.match(read('hooks/store/uiSliceInitialState.ts'), /normalizeUiIconStrokeWidth\(lsFloat\(LS_KEYS.iconStrokeWidth, UI_ICON_DEFAULTS.strokeWidth\)\)/)
  assert.match(read('hooks/store/uiSliceCoreActions.ts'), /lsSetFloat\(LS_KEYS.iconStrokeWidth, normalizeUiIconStrokeWidth\(width\)\)/)
  assert.match(read('features/settings/registry-ui.ui.ts'), /docKey: 'uiIconStrokeWidth',\s+default: \(\) => UI_ICON_DEFAULTS.strokeWidth/)
  assert.match(read('features/canvas/CanvasRootRuntime.tsx'), /setProperty\('--kg-icon-stroke-width', String\(iconStrokeWidth\)\)/)
  assert.match(read('styles/application-typography.css'), /\.lucide,\s+\[data-kg-ui-icon\] \{\s+stroke-width: var\(--kg-icon-stroke-width, 1.5\)/)
  assert.match(read('features/graph-fields/ui/graphFieldIcons.tsx'), /data-kg-ui-icon="true"/)
  assert.doesNotMatch(read('features/graph-fields/ui/graphFieldIcons.tsx'), /strokeWidth = \d/)

  // Control selection uses the same owner, independent of record-row selection.
  for (const file of ['lib/ui/pinToggle.ts', 'features/toolbar/ui/toolbarStyles.ts', 'features/markdown/ui/codeblock/CodeAnnotationRows.tsx', 'lib/ui/dataViewToolbarButton.tsx']) {
    assert.match(read(file), /UI_THEME_TOKENS.button.selectedIcon/)
  }
  for (const file of ['components/IconButton.tsx', 'features/markdown/ui/codeblock/CodeAnnotationRows.tsx', 'features/markdown/ui/codeblock/ClipboardCopyButton.tsx', 'lib/ui/dataViewToolbarButton.tsx']) {
    assert.match(read(file), /UI_THEME_TOKENS.button.iconControl/)
    assert.doesNotMatch(read(file), /shadow-(?:sm|md|lg|xl)/)
  }
  assert.match(UI_THEME_TOKENS.button.selectedIcon, /bg-blue-50/)
  assert.match(UI_THEME_TOKENS.button.selectedIcon, /dark:bg-blue-900\/20/)
  const panel = read('components/ui/FloatingPanel.tsx')
  assert.match(panel, /strokeWidth = UI_ICON_DEFAULTS.strokeWidth/)
  assert.doesNotMatch(panel, /min-h-11|min-w-11/)
  assert.match(panel, /padding: 'var\(--kg-toolbar-compact-padding\)'/)
  assert.match(panel, /'--kg-responsive-panel-header-row-min-height': 'var\(--kg-control-height\)'/)
  assert.match(read('features/markdown/ui/codeblock/CodeAnnotationRows.tsx'), /aria-pressed=\{mode === 'render'\}/)
  assert.match(UI_THEME_TOKENS.border.outline, /--kg-surface-border-width,1px/)
  assert.match(read('styles/shared-borders.css'), /--kg-surface-border-width: 1px/)
  assert.match(read('lib/ui/surfaceClasses.ts'), /UI_THEME_TOKENS.shadow.flat/)
  for (const file of ['components/ui/TypeMenu.tsx', 'components/ui/ToastHost.tsx', 'components/ui/ColumnHeaderMenu.tsx', 'components/ui/CollapsibleToolbar.tsx', 'lib/ui/menuClasses.ts', 'features/markdown-workspace/main/viewer/floatingMenuStyles.ts', 'lib/ui/PanelColorPicker.tsx']) {
    assert.match(read(file), /--kg-shadow-overlay/)
    assert.doesNotMatch(read(file), /shadow-(?:sm|md|lg|xl)/)
  }
  assert.doesNotMatch(read('features/markdown/ui/MarkdownCodeBlock.tsx'), /documentCodeFrameClassName[^\n]*shadow-sm/)
  assert.doesNotMatch(read('features/markdown/ui/MarkdownTableBlock.tsx'), /documentTableFrameClassName[^\n]*shadow-sm/)
  assert.match(read('lib/ui/dataViewToolbarButton.tsx'), /UI_FOCUS_RING/, 'Flat controls retain keyboard focus')
}
