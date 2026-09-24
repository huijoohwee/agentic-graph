import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'
import type { DarkThemeVariant } from '@/lib/ui/theme'

type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api')
const BLACK_THEME_ID = 'kg-dark-black'
let installedColors = ''

export function setNativeMonacoTheme(
  monaco: MonacoApi,
  mode: 'light' | 'dark',
  variant: DarkThemeVariant,
): void {
  if (mode === 'light') {
    monaco.editor.setTheme('vs')
    return
  }
  if (variant === 'dark-blue') {
    monaco.editor.setTheme('vs-dark')
    return
  }
  const token = (name: `--kg-${string}`) => resolveCssVarWithKgFallback(name, 'black')
  const accent = token('--kg-accent')
  const colors: Monaco.editor.IStandaloneThemeData['colors'] = {
    'editor.background': token('--kg-code-bg'),
    'editor.foreground': token('--kg-code-text'),
    'editorGutter.background': token('--kg-code-bg'),
    'editorLineNumber.foreground': token('--kg-text-secondary'),
    'editorLineNumber.activeForeground': token('--kg-text-primary'),
    'editorCursor.foreground': accent,
    'editor.selectionBackground': `${accent}44`,
    'editor.inactiveSelectionBackground': `${accent}28`,
    'editor.selectionHighlightBackground': `${accent}20`,
    'editor.lineHighlightBackground': token('--kg-surface-bg'),
    'editorWidget.background': token('--kg-panel-bg'),
    'editorSuggestWidget.background': token('--kg-panel-bg'),
    'editorHoverWidget.background': token('--kg-panel-bg'),
    'editorOverviewRuler.border': token('--kg-border'),
    'editorIndentGuide.background1': token('--kg-border'),
  }
  const fingerprint = JSON.stringify(colors)
  if (fingerprint !== installedColors) {
    monaco.editor.defineTheme(BLACK_THEME_ID, { base: 'vs-dark', inherit: true, rules: [], colors })
    installedColors = fingerprint
  }
  monaco.editor.setTheme(BLACK_THEME_ID)
}
