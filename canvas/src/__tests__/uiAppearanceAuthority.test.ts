import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { UI_ICON_DEFAULTS, UI_ICON_APPEARANCE, assertCentralIconAppearance, UI_THEME_TOKENS, normalizeUiIconStrokeWidth } from '@/lib/ui/theme-tokens'

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
  assert.ok(Number.isFinite(UI_ICON_DEFAULTS.strokeWidth) && UI_ICON_DEFAULTS.strokeWidth > 0)
  for (const value of [NaN, Infinity, -Infinity, 0, 8, 2.25]) {
    assert.equal(normalizeUiIconStrokeWidth(value), UI_ICON_DEFAULTS.strokeWidth, 'Legacy values cannot replace the shared owner')
  }
  for (const [key, value] of Object.entries(UI_ICON_APPEARANCE)) {
    const ownedKey = key as keyof typeof UI_ICON_APPEARANCE
    assert.equal(assertCentralIconAppearance(ownedKey, value), value)
    assert.throws(() => assertCentralIconAppearance(ownedKey, 'p-20'), /read-only/)
  }
  assert.doesNotMatch(read('features/canvas/CanvasRootRuntime.tsx'), /kg-icon-stroke-width/)
  assert.match(read('styles/application-typography.css'), /stroke-width: var\(--agentic-icon-stroke-width\)/)
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
  assert.equal(UI_THEME_TOKENS.button.selectedIcon, 'agentic-control-selected')
  const panel = read('components/ui/FloatingPanel.tsx')
  assert.match(panel, /FloatingPanelShell as BaseFloatingPanelShell/)
  assert.match(panel, /export \{ FloatingPanelCloseButton \} from '@agentic-base\/views-react\/panels'/)
  assert.match(panel, /export type \{ FloatingPanelCloseButtonProps \} from '@agentic-base\/views-react\/panels'/)
  assert.doesNotMatch(panel, /iconClassName|strokeWidth|IconButton|LucideX/)
  assert.match(read('features/panels/ui/HeaderActions.tsx'), /<FloatingPanelCloseButton label=\{UI_LABELS\.close\} onClose=\{onClose!\} \/>/)
  assert.equal(fs.existsSync(path.join('src', 'lib/ui/floatingPanelTheme.ts')), false)
  assert.doesNotMatch(panel, /readFloatingPanelThemeStyle|--base-(?:accent|text-primary|text-secondary|border|panel|shadow-overlay|toolbar-compact-padding)/)
  assert.doesNotMatch(panel, /data-kg-floating-panel-root|ModalContainer/)
  assert.match(read('features/markdown/ui/codeblock/CodeAnnotationRows.tsx'), /aria-pressed=\{mode === 'render'\}/)
  assert.match(UI_THEME_TOKENS.border.outline, /--kg-surface-border-width,1px/)
  assert.match(read('styles/shared-borders.css'), /var\(--kg-surface-border-width\)/)
  assert.doesNotMatch(read('styles/shared-borders.css'), /--kg-surface-border-width\s*:/)
  assert.match(read('lib/ui/surfaceClasses.ts'), /UI_THEME_TOKENS.shadow.flat/)
  for (const file of ['components/ui/TypeMenu.tsx', 'components/ui/ToastHost.tsx', 'components/ui/ColumnHeaderMenu.tsx', 'components/ui/CollapsibleToolbar.tsx', 'features/markdown-workspace/main/viewer/floatingMenuStyles.ts', 'lib/ui/PanelColorPicker.tsx']) {
    assert.match(read(file), /--kg-shadow-overlay/)
    assert.doesNotMatch(read(file), /shadow-(?:sm|md|lg|xl)/)
  }
  assert.match(read('lib/ui/menuClasses.ts'), /import \{ MENU_CLASS_NAME, menuOptionClassName \} from '@agentic-base\/views-react\/controls'/)
  assert.match(read('styles/shared-ui-profile.css'), /box-shadow: var\(--kg-shadow-overlay,/)
  assert.doesNotMatch(read('features/markdown/ui/MarkdownCodeBlock.tsx'), /documentCodeFrameClassName[^\n]*shadow-sm/)
  assert.doesNotMatch(read('features/markdown/ui/MarkdownTableBlock.tsx'), /documentTableFrameClassName[^\n]*shadow-sm/)
  assert.match(read('lib/ui/dataViewToolbarButton.tsx'), /UI_FOCUS_RING/, 'Flat controls retain keyboard focus')
}
