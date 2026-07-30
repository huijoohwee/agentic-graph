import React from 'react'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { ensureMonacoStyles } from '@/lib/ui/lazyStyles'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useShallow } from 'zustand/react/shallow'
import { applyExternalMonacoValue } from './monacoExternalValueApply'
import { resolveMonacoRuntimeMode } from './monacoRuntimeMode'

const FLASH_STYLE_ID = 'monaco-flash-style'
const FLASH_CSS = `
@keyframes monaco-flash-fade {
  0% { background-color: rgba(255, 215, 0, 0.4); }
  100% { background-color: transparent; }
}
.monaco-flash-line {
  animation: monaco-flash-fade var(--monaco-flash-duration, 1000ms) ease-out forwards;
}
`

const LONG_LINE_STYLE_ID = 'monaco-long-line-style'
const LONG_LINE_CSS = `
.monaco-editor .kg-monaco-ellipsis-long-html-line {
  display: inline-block;
  max-width: min(920px, 65vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: top;
}
.monaco-editor .kg-monaco-long-line-placeholder::before {
  content: "⟪long HTML line⟫ ";
  color: rgba(120, 120, 120, 0.95);
  font-size: 12px;
  font-style: italic;
}
.monaco-editor .kg-monaco-html-block-placeholder {
  color: rgba(120, 120, 120, 0.95);
  font-size: 12px;
  font-style: italic;
}
`
const MONACO_TOUCH_VIEWPORT_QUERY = '(max-width: 768px), (pointer: coarse)'
const MONACO_TOUCH_INTENT_COPY = {
  eyebrow: 'Rich editor runtime',
  title: 'Load Monaco editor on this device',
  body: 'Phone sessions stay on the lightweight editor first so the workspace opens faster. Load Monaco only when you need the heavier editing runtime.',
  action: 'Load rich editor',
} as const

export type MonacoTextEditorHandle = {
  focus: () => void
  layout: () => void
  revealLine: (line: number) => void
  revealOffsetInCenter: (offset: number) => void
  setSelection: (startLine: number, startColumn: number, endLine: number, endColumn: number) => void
  setSelectionOffsets: (startOffset: number, endOffset: number) => void
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  getValue: () => string
  setScrollTop: (scrollTop: number) => void
  getScrollTop: () => number
  getScrollHeight: () => number
  getClientHeight: () => number
  getLineHeight: () => number
  getContentWidth: () => number
  getVisibleRange: () => { startLine: number; endLine: number }
  getTopForLineNumber: (line: number) => number
  onDidScrollChange: (listener: (e: Monaco.IScrollEvent) => void) => Monaco.IDisposable
  onDidLayoutChange: (listener: (e: Monaco.editor.EditorLayoutInfo) => void) => Monaco.IDisposable
}

export type MonacoTextEditorProps = {
  value: string
  onChange: (next: string) => void
  language: string
  uri: string
  themeMode: 'light' | 'dark'
  wordWrap?: boolean
  readOnly?: boolean
  hideLongHtmlBlocks?: boolean
  paddingTopPx?: number
  paddingBottomPx?: number
  forceLineNumberColumn?: boolean
  className?: string
  textareaClassName?: string
  ariaLabel?: string
  onContextMenuSelection?: (args: { startLine: number; endLine: number; text: string; event: Monaco.editor.IEditorMouseEvent }) => void
  onContextMenu?: (args: { startLine: number; endLine: number; text?: string; event: Monaco.editor.IEditorMouseEvent }) => void
  onDoubleClickSelection?: (args: { startLine: number; endLine: number; text: string; event: Monaco.editor.IEditorMouseEvent }) => void
  onDoubleClickLine?: (line: number) => void
  onSelectionChangeOffsets?: (args: { startOffset: number; endOffset: number }) => void
  onDoubleClickSelectionOffsets?: (args: { startOffset: number; endOffset: number; text: string }) => void
  onScroll?: (scrollTop: number, scrollLeft: number) => void
  onBlur?: () => void
  onFocus?: () => void
  editorRef?: React.MutableRefObject<MonacoTextEditorHandle | null>
  onHandle?: (handle: MonacoTextEditorHandle | null) => void
  flashLine?: number | null
  flashDurationMs?: number
  deferMonacoOnTouchViewport?: boolean
}

type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api')

export type MonacoCapabilitySettings = {
  monacoLanguageJsonEnabled: boolean
  monacoLanguageJsonLoadMode: 'lazy' | 'eager'
  monacoLanguageSqlEnabled: boolean
  monacoLanguageSqlLoadMode: 'lazy' | 'eager'
  monacoLanguageYamlEnabled: boolean
  monacoLanguageYamlLoadMode: 'lazy' | 'eager'
  monacoHoverEnabled: boolean
  monacoLinksEnabled: boolean
  monacoQuickSuggestionsEnabled: boolean
  monacoSuggestOnTriggerCharactersEnabled: boolean
  monacoParameterHintsEnabled: boolean
  monacoLineNumbersEnabled: boolean
  monacoFoldingEnabled: boolean
  monacoMinimapEnabled: boolean
  monacoSelectionHighlightEnabled: boolean
  monacoOccurrencesHighlightEnabled: boolean
  monacoGuidesEnabled: boolean
  monacoBracketPairColorizationEnabled: boolean
  monacoCodeLensEnabled: boolean
  monacoLightbulbEnabled: boolean
  monacoInlayHintsEnabled: boolean
  monacoWordBasedSuggestionsEnabled: boolean
  monacoInlineSuggestEnabled: boolean
  monacoAcceptSuggestionOnEnterEnabled: boolean
  monacoDragAndDropEnabled: boolean
  monacoDropIntoEditorEnabled: boolean
  monacoColorDecoratorsEnabled: boolean
  monacoUnicodeHighlightEnabled: boolean
  monacoMatchBracketsEnabled: boolean
  monacoRenderLineHighlightEnabled: boolean
  monacoGlyphMarginEnabled: boolean
  monacoOverviewRulerLanesEnabled: boolean
  monacoLineDecorationsWidthEnabled: boolean
  monacoRenderWhitespaceEnabled: boolean
  monacoRenderControlCharactersEnabled: boolean
  monacoSmoothScrollingEnabled: boolean
  monacoScrollBeyondLastLineEnabled: boolean
  monacoMouseWheelZoomEnabled: boolean
  monacoCursorBlinkingEnabled: boolean
  monacoCursorSmoothCaretAnimationEnabled: boolean
  monacoWordWrapEnabled: boolean
  monacoWrappingIndentEnabled: boolean
  monacoWrappingStrategyEnabled: boolean
  monacoCursorWidthEnabled: boolean
  monacoCursorStyleEnabled: boolean
  monacoCursorSurroundingLinesEnabled: boolean
  monacoCursorSurroundingLinesStyleEnabled: boolean
  monacoCursorHeightEnabled: boolean
  monacoStickyScrollEnabled: boolean
  monacoSelectionClipboardEnabled: boolean
  monacoCopyWithSyntaxHighlightingEnabled: boolean
  monacoOccurrencesHighlightDelayEnabled: boolean
  monacoFormatOnPasteEnabled: boolean
  monacoFormatOnTypeEnabled: boolean
  monacoAutoClosingBracketsEnabled: boolean
  monacoAutoClosingQuotesEnabled: boolean
  monacoAutoIndentEnabled: boolean
  monacoAutoSurroundEnabled: boolean
  monacoMatchOnWordStartOnlyEnabled: boolean
  monacoFindSeedSearchStringFromSelectionEnabled: boolean
  monacoFindCursorMoveOnTypeEnabled: boolean
  monacoFindFindOnTypeEnabled: boolean
  monacoFindLoopEnabled: boolean
  monacoAutoClosingDeleteEnabled: boolean
  monacoAutoClosingCommentsEnabled: boolean
  monacoEmptySelectionClipboardEnabled: boolean
  monacoColumnSelectionEnabled: boolean
  monacoWordSeparatorsEnabled: boolean
  monacoMultiCursorModifierEnabled: boolean
  monacoMultiCursorMergeOverlappingEnabled: boolean
  monacoMultiCursorPasteEnabled: boolean
  monacoAutoClosingOvertypeEnabled: boolean
  monacoMouseStyleEnabled: boolean
  monacoRenderFinalNewlineEnabled: boolean
  monacoAccessibilitySupportEnabled: boolean
  monacoScrollbarUseShadowsEnabled: boolean
  monacoScrollbarAlwaysConsumeMouseWheelEnabled: boolean
  monacoHorizontalScrollbarSizeEnabled: boolean
  monacoVerticalScrollbarSizeEnabled: boolean
  monacoMouseWheelScrollSensitivityEnabled: boolean
}

export const resolveConfiguredMonacoLanguage = (language: string, settings: MonacoCapabilitySettings): string => {
  const normalized = String(language || '').trim().toLowerCase()
  if (!normalized) return 'plaintext'
  if (normalized === 'json' && !settings.monacoLanguageJsonEnabled) return 'plaintext'
  if (normalized === 'sql' && !settings.monacoLanguageSqlEnabled) return 'plaintext'
  if ((normalized === 'yaml' || normalized === 'yml') && !settings.monacoLanguageYamlEnabled) return 'plaintext'
  return normalized
}

export const loadMonacoLanguageContribution = async (language: string): Promise<void> => {
  const normalized = String(language || '').trim().toLowerCase()
  if (normalized === 'markdown') {
    await import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution')
    return
  }
  if (normalized === 'json') {
    await import('monaco-editor/esm/vs/language/json/monaco.contribution')
    return
  }
  if (normalized === 'sql') {
    await import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution')
    return
  }
  if (normalized === 'yaml') {
    await import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution')
  }
}

export const preloadEagerMonacoLanguageContributions = async (settings: MonacoCapabilitySettings): Promise<void> => {
  const tasks: Promise<void>[] = []
  if (settings.monacoLanguageJsonEnabled && settings.monacoLanguageJsonLoadMode === 'eager') tasks.push(loadMonacoLanguageContribution('json'))
  if (settings.monacoLanguageSqlEnabled && settings.monacoLanguageSqlLoadMode === 'eager') tasks.push(loadMonacoLanguageContribution('sql'))
  if (settings.monacoLanguageYamlEnabled && settings.monacoLanguageYamlLoadMode === 'eager') tasks.push(loadMonacoLanguageContribution('yaml'))
  if (!tasks.length) return
  await Promise.all(tasks)
}

export const loadOptionalMonacoContributions = async (settings: MonacoCapabilitySettings): Promise<void> => {
  const tasks: Promise<unknown>[] = []
  if (settings.monacoCodeLensEnabled) {
    tasks.push(import('monaco-editor/esm/vs/editor/contrib/codelens/browser/codelensController'))
  }
  if (settings.monacoLightbulbEnabled) {
    tasks.push(import('monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions'))
  }
  if (settings.monacoInlayHintsEnabled) {
    tasks.push(import('monaco-editor/esm/vs/editor/contrib/inlayHints/browser/inlayHintsContribution'))
  }
  if (!tasks.length) return
  await Promise.all(tasks)
}

export const buildMonacoEditorOptions = (
  settings: MonacoCapabilitySettings,
  args: {
    readOnly: boolean
    wordWrap: boolean
    paddingTopPx?: number
    paddingBottomPx?: number
    forceLineNumberColumn?: boolean
  },
): Monaco.editor.IStandaloneEditorConstructionOptions => ({
  readOnly: !!args.readOnly,
  editContext: false,
  minimap: { enabled: settings.monacoMinimapEnabled },
  scrollbar: {
    useShadows: settings.monacoScrollbarUseShadowsEnabled,
    alwaysConsumeMouseWheel: settings.monacoScrollbarAlwaysConsumeMouseWheelEnabled,
    horizontalScrollbarSize: settings.monacoHorizontalScrollbarSizeEnabled ? 16 : 12,
    verticalScrollbarSize: settings.monacoVerticalScrollbarSizeEnabled ? 18 : 14,
  },
  scrollBeyondLastLine: settings.monacoScrollBeyondLastLineEnabled,
  wordWrap: settings.monacoWordWrapEnabled || args.wordWrap ? 'on' : 'off',
  fontLigatures: false,
  automaticLayout: true,
  contextmenu: false,
  accessibilitySupport: settings.monacoAccessibilitySupportEnabled ? 'on' : 'off',
  mouseStyle: settings.monacoMouseStyleEnabled ? 'default' : 'text',
  mouseWheelScrollSensitivity: settings.monacoMouseWheelScrollSensitivityEnabled ? 1.5 : 1,
  mouseWheelZoom: settings.monacoMouseWheelZoomEnabled,
  cursorBlinking: settings.monacoCursorBlinkingEnabled ? 'blink' : 'solid',
  cursorSmoothCaretAnimation: settings.monacoCursorSmoothCaretAnimationEnabled ? 'on' : 'off',
  cursorWidth: settings.monacoCursorWidthEnabled ? 2 : 1,
  cursorHeight: settings.monacoCursorHeightEnabled ? 1.2 : 1,
  cursorStyle: settings.monacoCursorStyleEnabled ? 'block' : 'line',
  cursorSurroundingLines: settings.monacoCursorSurroundingLinesEnabled ? 3 : 0,
  cursorSurroundingLinesStyle: settings.monacoCursorSurroundingLinesStyleEnabled ? 'all' : 'default',
  stickyScroll: { enabled: settings.monacoStickyScrollEnabled },
  selectionClipboard: settings.monacoSelectionClipboardEnabled,
  copyWithSyntaxHighlighting: settings.monacoCopyWithSyntaxHighlightingEnabled,
  occurrencesHighlightDelay: settings.monacoOccurrencesHighlightDelayEnabled ? 400 : 250,
  formatOnPaste: settings.monacoFormatOnPasteEnabled,
  formatOnType: settings.monacoFormatOnTypeEnabled,
  autoClosingBrackets: settings.monacoAutoClosingBracketsEnabled ? 'always' : 'never',
  autoClosingQuotes: settings.monacoAutoClosingQuotesEnabled ? 'always' : 'never',
  autoIndent: settings.monacoAutoIndentEnabled ? 'full' : 'none',
  autoSurround: settings.monacoAutoSurroundEnabled ? 'languageDefined' : 'never',
  matchOnWordStartOnly: settings.monacoMatchOnWordStartOnlyEnabled,
  find: {
    seedSearchStringFromSelection: settings.monacoFindSeedSearchStringFromSelectionEnabled ? 'selection' : 'never',
    cursorMoveOnType: settings.monacoFindCursorMoveOnTypeEnabled,
    findOnType: settings.monacoFindFindOnTypeEnabled,
    loop: settings.monacoFindLoopEnabled,
  },
  autoClosingDelete: settings.monacoAutoClosingDeleteEnabled ? 'always' : 'never',
  autoClosingComments: settings.monacoAutoClosingCommentsEnabled ? 'always' : 'never',
  autoClosingOvertype: settings.monacoAutoClosingOvertypeEnabled ? 'always' : 'never',
  renderFinalNewline: settings.monacoRenderFinalNewlineEnabled ? 'dimmed' : 'off',
  emptySelectionClipboard: settings.monacoEmptySelectionClipboardEnabled,
  columnSelection: settings.monacoColumnSelectionEnabled,
  wordSeparators: settings.monacoWordSeparatorsEnabled ? '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?' : '',
  multiCursorModifier: settings.monacoMultiCursorModifierEnabled ? 'ctrlCmd' : 'alt',
  multiCursorMergeOverlapping: settings.monacoMultiCursorMergeOverlappingEnabled,
  multiCursorPaste: settings.monacoMultiCursorPasteEnabled ? 'spread' : 'full',
  wrappingIndent: settings.monacoWrappingIndentEnabled ? 'indent' : 'none',
  wrappingStrategy: settings.monacoWrappingStrategyEnabled ? 'advanced' : 'simple',
  hover: { enabled: settings.monacoHoverEnabled },
  links: settings.monacoLinksEnabled,
  quickSuggestions: settings.monacoQuickSuggestionsEnabled,
  suggestOnTriggerCharacters: settings.monacoSuggestOnTriggerCharactersEnabled,
  wordBasedSuggestions: settings.monacoWordBasedSuggestionsEnabled ? 'currentDocument' : 'off',
  inlineSuggest: { enabled: settings.monacoInlineSuggestEnabled },
  acceptSuggestionOnEnter: settings.monacoAcceptSuggestionOnEnterEnabled ? 'on' : 'off',
  dragAndDrop: settings.monacoDragAndDropEnabled,
  dropIntoEditor: { enabled: settings.monacoDropIntoEditorEnabled },
  colorDecorators: settings.monacoColorDecoratorsEnabled,
  unicodeHighlight: settings.monacoUnicodeHighlightEnabled ? {} : { nonBasicASCII: false, invisibleCharacters: false, ambiguousCharacters: false },
  matchBrackets: settings.monacoMatchBracketsEnabled ? 'always' : 'never',
  renderLineHighlight: settings.monacoRenderLineHighlightEnabled ? 'line' : 'none',
  glyphMargin: args.forceLineNumberColumn || settings.monacoGlyphMarginEnabled,
  overviewRulerLanes: settings.monacoOverviewRulerLanesEnabled ? 2 : 0,
  lineDecorationsWidth: args.forceLineNumberColumn ? 10 : (settings.monacoLineDecorationsWidthEnabled ? 10 : 0),
  renderWhitespace: settings.monacoRenderWhitespaceEnabled ? 'selection' : 'none',
  renderControlCharacters: settings.monacoRenderControlCharactersEnabled,
  smoothScrolling: settings.monacoSmoothScrollingEnabled,
  parameterHints: { enabled: settings.monacoParameterHintsEnabled },
  lineNumbers: args.forceLineNumberColumn || settings.monacoLineNumbersEnabled ? 'on' : 'off',
  lineNumbersMinChars: args.forceLineNumberColumn ? 4 : 3,
  folding: settings.monacoFoldingEnabled,
  selectionHighlight: settings.monacoSelectionHighlightEnabled,
  occurrencesHighlight: settings.monacoOccurrencesHighlightEnabled ? 'singleFile' : 'off',
  guides: {
    indentation: settings.monacoGuidesEnabled,
    bracketPairs: settings.monacoGuidesEnabled,
  },
  bracketPairColorization: { enabled: settings.monacoBracketPairColorizationEnabled },
  codeLens: settings.monacoCodeLensEnabled,
  lightbulb: {
    enabled: (settings.monacoLightbulbEnabled ? 'onCode' : 'off') as Monaco.editor.IEditorLightbulbOptions['enabled'],
  },
  inlayHints: { enabled: settings.monacoInlayHintsEnabled ? 'on' : 'off' },
  padding: {
    top:
      typeof args.paddingTopPx === 'number' && Number.isFinite(args.paddingTopPx) && args.paddingTopPx > 0
        ? Math.floor(args.paddingTopPx)
        : 0,
    bottom:
      typeof args.paddingBottomPx === 'number' && Number.isFinite(args.paddingBottomPx) && args.paddingBottomPx > 0
        ? Math.floor(args.paddingBottomPx)
        : 0,
  },
})

export function useMonacoCapabilitySettings(): MonacoCapabilitySettings {
  return useGraphStore(
    useShallow(s => ({
      monacoLanguageJsonEnabled: s.monacoLanguageJsonEnabled,
      monacoLanguageJsonLoadMode: s.monacoLanguageJsonLoadMode,
      monacoLanguageSqlEnabled: s.monacoLanguageSqlEnabled,
      monacoLanguageSqlLoadMode: s.monacoLanguageSqlLoadMode,
      monacoLanguageYamlEnabled: s.monacoLanguageYamlEnabled,
      monacoLanguageYamlLoadMode: s.monacoLanguageYamlLoadMode,
      monacoHoverEnabled: s.monacoHoverEnabled,
      monacoLinksEnabled: s.monacoLinksEnabled,
      monacoQuickSuggestionsEnabled: s.monacoQuickSuggestionsEnabled,
      monacoSuggestOnTriggerCharactersEnabled: s.monacoSuggestOnTriggerCharactersEnabled,
      monacoParameterHintsEnabled: s.monacoParameterHintsEnabled,
      monacoLineNumbersEnabled: s.monacoLineNumbersEnabled,
      monacoFoldingEnabled: s.monacoFoldingEnabled,
      monacoMinimapEnabled: s.monacoMinimapEnabled,
      monacoSelectionHighlightEnabled: s.monacoSelectionHighlightEnabled,
      monacoOccurrencesHighlightEnabled: s.monacoOccurrencesHighlightEnabled,
      monacoGuidesEnabled: s.monacoGuidesEnabled,
      monacoBracketPairColorizationEnabled: s.monacoBracketPairColorizationEnabled,
      monacoCodeLensEnabled: s.monacoCodeLensEnabled,
      monacoLightbulbEnabled: s.monacoLightbulbEnabled,
      monacoInlayHintsEnabled: s.monacoInlayHintsEnabled,
      monacoWordBasedSuggestionsEnabled: s.monacoWordBasedSuggestionsEnabled,
      monacoInlineSuggestEnabled: s.monacoInlineSuggestEnabled,
      monacoAcceptSuggestionOnEnterEnabled: s.monacoAcceptSuggestionOnEnterEnabled,
      monacoDragAndDropEnabled: s.monacoDragAndDropEnabled,
      monacoDropIntoEditorEnabled: s.monacoDropIntoEditorEnabled,
      monacoColorDecoratorsEnabled: s.monacoColorDecoratorsEnabled,
      monacoUnicodeHighlightEnabled: s.monacoUnicodeHighlightEnabled,
      monacoMatchBracketsEnabled: s.monacoMatchBracketsEnabled,
      monacoRenderLineHighlightEnabled: s.monacoRenderLineHighlightEnabled,
      monacoGlyphMarginEnabled: s.monacoGlyphMarginEnabled,
      monacoOverviewRulerLanesEnabled: s.monacoOverviewRulerLanesEnabled,
      monacoLineDecorationsWidthEnabled: s.monacoLineDecorationsWidthEnabled,
      monacoRenderWhitespaceEnabled: s.monacoRenderWhitespaceEnabled,
      monacoRenderControlCharactersEnabled: s.monacoRenderControlCharactersEnabled,
      monacoSmoothScrollingEnabled: s.monacoSmoothScrollingEnabled,
      monacoScrollBeyondLastLineEnabled: s.monacoScrollBeyondLastLineEnabled,
      monacoMouseWheelZoomEnabled: s.monacoMouseWheelZoomEnabled,
      monacoCursorBlinkingEnabled: s.monacoCursorBlinkingEnabled,
      monacoCursorSmoothCaretAnimationEnabled: s.monacoCursorSmoothCaretAnimationEnabled,
      monacoWordWrapEnabled: s.monacoWordWrapEnabled,
      monacoWrappingIndentEnabled: s.monacoWrappingIndentEnabled,
      monacoWrappingStrategyEnabled: s.monacoWrappingStrategyEnabled,
      monacoCursorWidthEnabled: s.monacoCursorWidthEnabled,
      monacoCursorStyleEnabled: s.monacoCursorStyleEnabled,
      monacoCursorSurroundingLinesEnabled: s.monacoCursorSurroundingLinesEnabled,
      monacoCursorSurroundingLinesStyleEnabled: s.monacoCursorSurroundingLinesStyleEnabled,
      monacoCursorHeightEnabled: s.monacoCursorHeightEnabled,
      monacoStickyScrollEnabled: s.monacoStickyScrollEnabled,
      monacoSelectionClipboardEnabled: s.monacoSelectionClipboardEnabled,
      monacoCopyWithSyntaxHighlightingEnabled: s.monacoCopyWithSyntaxHighlightingEnabled,
      monacoOccurrencesHighlightDelayEnabled: s.monacoOccurrencesHighlightDelayEnabled,
      monacoFormatOnPasteEnabled: s.monacoFormatOnPasteEnabled,
      monacoFormatOnTypeEnabled: s.monacoFormatOnTypeEnabled,
      monacoAutoClosingBracketsEnabled: s.monacoAutoClosingBracketsEnabled,
      monacoAutoClosingQuotesEnabled: s.monacoAutoClosingQuotesEnabled,
      monacoAutoIndentEnabled: s.monacoAutoIndentEnabled,
      monacoAutoSurroundEnabled: s.monacoAutoSurroundEnabled,
      monacoMatchOnWordStartOnlyEnabled: s.monacoMatchOnWordStartOnlyEnabled,
      monacoFindSeedSearchStringFromSelectionEnabled: s.monacoFindSeedSearchStringFromSelectionEnabled,
      monacoFindCursorMoveOnTypeEnabled: s.monacoFindCursorMoveOnTypeEnabled,
      monacoFindFindOnTypeEnabled: s.monacoFindFindOnTypeEnabled,
      monacoFindLoopEnabled: s.monacoFindLoopEnabled,
      monacoAutoClosingDeleteEnabled: s.monacoAutoClosingDeleteEnabled,
      monacoAutoClosingCommentsEnabled: s.monacoAutoClosingCommentsEnabled,
      monacoEmptySelectionClipboardEnabled: s.monacoEmptySelectionClipboardEnabled,
      monacoColumnSelectionEnabled: s.monacoColumnSelectionEnabled,
      monacoWordSeparatorsEnabled: s.monacoWordSeparatorsEnabled,
      monacoMultiCursorModifierEnabled: s.monacoMultiCursorModifierEnabled,
      monacoMultiCursorMergeOverlappingEnabled: s.monacoMultiCursorMergeOverlappingEnabled,
      monacoMultiCursorPasteEnabled: s.monacoMultiCursorPasteEnabled,
      monacoAutoClosingOvertypeEnabled: s.monacoAutoClosingOvertypeEnabled,
      monacoMouseStyleEnabled: s.monacoMouseStyleEnabled,
      monacoRenderFinalNewlineEnabled: s.monacoRenderFinalNewlineEnabled,
      monacoAccessibilitySupportEnabled: s.monacoAccessibilitySupportEnabled,
      monacoScrollbarUseShadowsEnabled: s.monacoScrollbarUseShadowsEnabled,
      monacoScrollbarAlwaysConsumeMouseWheelEnabled: s.monacoScrollbarAlwaysConsumeMouseWheelEnabled,
      monacoHorizontalScrollbarSizeEnabled: s.monacoHorizontalScrollbarSizeEnabled,
      monacoVerticalScrollbarSizeEnabled: s.monacoVerticalScrollbarSizeEnabled,
      monacoMouseWheelScrollSensitivityEnabled: s.monacoMouseWheelScrollSensitivityEnabled,
    })),
  )
}

export function MonacoTextEditor(props: MonacoTextEditorProps) {
  const {
    value,
    onChange,
    language,
    uri,
    themeMode,
    wordWrap,
    readOnly,
    hideLongHtmlBlocks,
    paddingTopPx,
    paddingBottomPx,
    forceLineNumberColumn,
    className,
    textareaClassName,
    ariaLabel,
    onContextMenuSelection,
    onContextMenu,
    onDoubleClickSelection,
    onDoubleClickLine,
    onDoubleClickSelectionOffsets,
    onSelectionChangeOffsets,
    onScroll,
    editorRef,
    onBlur,
    onFocus,
    onHandle,
    flashLine,
    flashDurationMs = 1000,
  } = props
  const monacoSettings = useMonacoCapabilitySettings()
  const touchViewportMatches = useMediaQuery(MONACO_TOUCH_VIEWPORT_QUERY)

  const hostRef = React.useRef<HTMLElement | null>(null)
  const textareaElRef = React.useRef<HTMLTextAreaElement | null>(null)
  const monacoRef = React.useRef<MonacoApi | null>(null)
  const editorInstanceRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = React.useRef<string[]>([])
  const hiddenLongLineDecorationsRef = React.useRef<string[]>([])
  const hiddenLongBlockDecorationsRef = React.useRef<string[]>([])
  const lastHiddenAreasKeyRef = React.useRef<string>('')
  const htmlBlockToggleByLineRef = React.useRef<Map<number, string>>(new Map())
  const expandedHtmlBlockKeysRef = React.useRef<Set<string>>(new Set())
  const latestValueRef = React.useRef<string>(value)
  latestValueRef.current = value
  const lastAppliedValueRef = React.useRef<string>(value)
  const editorRefRef = React.useRef(editorRef)
  const onChangeRef = React.useRef(onChange)
  const onContextMenuSelectionRef = React.useRef(onContextMenuSelection)
  const onContextMenuRef = React.useRef(onContextMenu)
  const onDoubleClickSelectionRef = React.useRef(onDoubleClickSelection)
  const onDoubleClickLineRef = React.useRef(onDoubleClickLine)
  const onDoubleClickSelectionOffsetsRef = React.useRef(onDoubleClickSelectionOffsets)
  const onSelectionChangeOffsetsRef = React.useRef(onSelectionChangeOffsets)
  const lastTextareaSelectionOffsetsRef = React.useRef<{ startOffset: number; endOffset: number } | null>(null)
  const onScrollRef = React.useRef(onScroll)
  const onBlurRef = React.useRef(onBlur)
  const onFocusRef = React.useRef(onFocus)
  const onHandleRef = React.useRef(onHandle)
  const themeModeRef = React.useRef<'light' | 'dark'>(themeMode)
  const textareaHandleRef = React.useRef<MonacoTextEditorHandle | null>(null)
  const [touchViewportIntentActivated, setTouchViewportIntentActivated] = React.useState(false)

  React.useEffect(() => {
    themeModeRef.current = themeMode
  }, [themeMode])

  React.useEffect(() => {
    editorRefRef.current = editorRef
    onChangeRef.current = onChange
    onContextMenuSelectionRef.current = onContextMenuSelection
    onContextMenuRef.current = onContextMenu
    onDoubleClickSelectionRef.current = onDoubleClickSelection
    onDoubleClickLineRef.current = onDoubleClickLine
    onDoubleClickSelectionOffsetsRef.current = onDoubleClickSelectionOffsets
    onSelectionChangeOffsetsRef.current = onSelectionChangeOffsets
    onScrollRef.current = onScroll
    onBlurRef.current = onBlur
    onFocusRef.current = onFocus
    onHandleRef.current = onHandle
  }, [editorRef, onChange, onContextMenuSelection, onContextMenu, onDoubleClickSelection, onDoubleClickLine, onDoubleClickSelectionOffsets, onSelectionChangeOffsets, onScroll, onBlur, onFocus, onHandle])

  React.useEffect(() => {
    if (editorInstanceRef.current) return
    if (typeof document === 'undefined') return
    if (document.getElementById(FLASH_STYLE_ID)) return
    const styleEl = document.createElement('style')
    styleEl.id = FLASH_STYLE_ID
    styleEl.textContent = FLASH_CSS
    document.head.appendChild(styleEl)
  }, [])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById(LONG_LINE_STYLE_ID)) return
    const styleEl = document.createElement('style')
    styleEl.id = LONG_LINE_STYLE_ID
    styleEl.textContent = LONG_LINE_CSS
    document.head.appendChild(styleEl)
  }, [])

  React.useEffect(() => {
    const editor = editorInstanceRef.current
    const monaco = monacoRef.current
    const host = hostRef.current
    if (!editor || !monaco || !flashLine || !host) return

    host.style.setProperty('--monaco-flash-duration', `${flashDurationMs}ms`)

    editor.revealLineInCenter(flashLine)
    
    const newDecorations: Monaco.editor.IModelDeltaDecoration[] = [
      {
        range: new monaco.Range(flashLine, 1, flashLine, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-flash-line',
        },
      },
    ]

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations)

    const timer = setTimeout(() => {
        // Fade out or remove? Monaco doesn't support CSS transitions on decorations easily unless class changes.
        // We can just remove it after a delay.
        if (editorInstanceRef.current) {
            decorationsRef.current = editorInstanceRef.current.deltaDecorations(decorationsRef.current, [])
        }
    }, flashDurationMs) // Dynamic flash

    return () => clearTimeout(timer)
  }, [flashLine, flashDurationMs])

  React.useEffect(() => {
    if (editorInstanceRef.current && monacoRef.current) {
        monacoRef.current.editor.setTheme(themeMode === 'dark' ? 'vs-dark' : 'vs')
    }
  }, [themeMode])

  const isJsdom =
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    /jsdom/i.test(String(window.navigator.userAgent || ''))

  const monacoPlatformSupported =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof (window as unknown as { Worker?: unknown }).Worker !== 'undefined'
  const initialTouchViewport = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia(MONACO_TOUCH_VIEWPORT_QUERY).matches
  }, [])
  const touchViewportActive = touchViewportMatches || initialTouchViewport
  const runtimeMode = resolveMonacoRuntimeMode({
    monacoPlatformSupported,
    isJsdom,
    deferMonacoOnTouchViewport: !!props.deferMonacoOnTouchViewport,
    touchViewportActive,
    touchViewportIntentActivated,
  })
  const canUseMonaco = runtimeMode === 'monaco'

  const shouldHideLongHtmlBlocks = hideLongHtmlBlocks ?? String(language || '').toLowerCase() === 'markdown'

  const recomputeHiddenLongHtmlLines = React.useCallback(() => {
    const editor = editorInstanceRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return
    try {
      if (!shouldHideLongHtmlBlocks) {
        hiddenLongLineDecorationsRef.current = editor.deltaDecorations(hiddenLongLineDecorationsRef.current, [])
        hiddenLongBlockDecorationsRef.current = editor.deltaDecorations(hiddenLongBlockDecorationsRef.current, [])
        htmlBlockToggleByLineRef.current = new Map()
        expandedHtmlBlockKeysRef.current = new Set()
        const anyEditor = editor as unknown as { setHiddenAreas?: (ranges: Monaco.IRange[]) => void }
        if (typeof anyEditor.setHiddenAreas === 'function') {
          anyEditor.setHiddenAreas([])
        }
        return
      }
      const text = model.getValue()
      const lines = text.split(/\r?\n/)
      const maxLen = 1400
      const decs: Monaco.editor.IModelDeltaDecoration[] = []
      for (let i = 0; i < lines.length; i += 1) {
        const lineText = lines[i] || ''
        if (lineText.length <= maxLen) continue
        const trimmed = lineText.trimStart()
        const isHtmlish = trimmed.startsWith('<') && trimmed.includes('>') && trimmed.includes('</')
        if (!isHtmlish) continue
        const lineNumber = i + 1
        const lineMax = model.getLineMaxColumn(lineNumber)
        decs.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, lineMax),
          options: {
            isWholeLine: true,
            inlineClassName: 'kg-monaco-ellipsis-long-html-line',
            beforeContentClassName: 'kg-monaco-long-line-placeholder',
            hoverMessage: { value: `Long HTML line (${lineText.length} chars)` },
          },
        })
      }
      hiddenLongLineDecorationsRef.current = editor.deltaDecorations(hiddenLongLineDecorationsRef.current, decs)

      const maxDocChars = 600_000
      if (text.length > maxDocChars) {
        hiddenLongBlockDecorationsRef.current = editor.deltaDecorations(hiddenLongBlockDecorationsRef.current, [])
        const anyEditor = editor as unknown as { setHiddenAreas?: (ranges: Monaco.IRange[]) => void }
        if (typeof anyEditor.setHiddenAreas === 'function') {
          anyEditor.setHiddenAreas([])
        }
        lastHiddenAreasKeyRef.current = ''
        return
      }

      const hideRanges: Monaco.IRange[] = []
      const blockDecs: Monaco.editor.IModelDeltaDecoration[] = []
      const togglesByLine = new Map<number, string>()
      htmlBlockToggleByLineRef.current = togglesByLine

      const addHiddenArea = (startLine: number, endLineExclusive: number) => {
        if (endLineExclusive <= startLine) return
        hideRanges.push(new monaco.Range(startLine, 1, endLineExclusive, 1))
      }

      const addPlaceholderDecoration = (lineNumber: number, placeholder: string, hover: string, key: string) => {
        const lineMax = model.getLineMaxColumn(lineNumber)
        if (key) togglesByLine.set(lineNumber, key)
        blockDecs.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, lineMax),
          options: {
            isWholeLine: true,
            inlineClassName: 'kg-monaco-ellipsis-long-html-line',
            before: {
              content: `${placeholder} `,
              inlineClassName: 'kg-monaco-html-block-placeholder',
            },
            hoverMessage: { value: hover },
          },
        })
      }

      const looksLikeHtmlish = (s: string): boolean => {
        const t = String(s || '').trim()
        if (!t.startsWith('<')) return false
        if (t.startsWith('</')) return false
        if (!/[>]/.test(t)) return false
        if (/^<!--/.test(t)) return true
        return /^<\s*[a-zA-Z][a-zA-Z0-9:-]*/.test(t)
      }

      const tagNameFromLine = (s: string): string => {
        const t = String(s || '').trim()
        const m = t.match(/^<\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/)
        return String(m?.[1] || '').toLowerCase()
      }

      const allowedTags = new Set([
        'svg',
        'div',
        'section',
        'article',
        'main',
        'nav',
        'header',
        'footer',
        'table',
        'picture',
        'iframe',
        'video',
        'style',
        'script',
      ])

      const isFenceLine = (s: string): { marker: string; info: string } | null => {
        const m = String(s || '').trim().match(/^(```+|~~~+)\s*(.*)$/)
        if (!m) return null
        return { marker: m[1] || '', info: String(m[2] || '') }
      }

      let i = 0
      while (i < lines.length) {
        const line = lines[i] || ''
        const fence = isFenceLine(line)
        if (fence) {
          const marker = fence.marker
          const info = fence.info.trim()
          const lang = (info.split(/\s+/)[0] || '').trim().toLowerCase()
          let j = i + 1
          let charCount = 0
          let htmlishCount = 0
          while (j < lines.length) {
            const cur = lines[j] || ''
            const f2 = isFenceLine(cur)
            if (f2 && f2.marker === marker) break
            charCount += cur.length + 1
            if (cur.includes('<') && cur.includes('>')) htmlishCount += 1
            j += 1
          }
          const end = j < lines.length ? j : -1
          if (end > i) {
            const startLine = i + 1
            const endLine = end + 1
            const lineCount = endLine - startLine + 1
            const looksHtmlFence = lang === 'html' || lang === 'svg' || (lang === '' && htmlishCount >= 3)
            const shouldCollapse = looksHtmlFence && (lineCount >= 60 || charCount >= 40_000)
            if (shouldCollapse) {
              const blockKey = `fence:${startLine}:${endLine}`
              const isExpanded = expandedHtmlBlockKeysRef.current.has(blockKey)
              const headLines = 3
              const tailLines = 1
              const hideStart = Math.min(endLine, startLine + 1 + headLines)
              const hideEnd = Math.max(startLine, endLine - tailLines)
              addPlaceholderDecoration(
                startLine,
                `${isExpanded ? '⟪expanded' : '⟪collapsed'} fenced HTML block · ${lineCount} lines · ${Math.round(charCount / 1024)}KB⟫`,
                `${isExpanded ? 'Expanded' : 'Collapsed'} fenced HTML block (${lineCount} lines, ${charCount} chars).`,
                blockKey,
              )
              if (!isExpanded && hideEnd >= hideStart) addHiddenArea(hideStart, hideEnd + 1)
              i = endLine
              continue
            }
          }
          i = end >= 0 ? end + 1 : j + 1
          continue
        }

        const trimmed = line.trim()
        if (!looksLikeHtmlish(trimmed)) {
          i += 1
          continue
        }
        const tag = tagNameFromLine(trimmed)
        if (!tag || !allowedTags.has(tag)) {
          i += 1
          continue
        }
        const closeRe = new RegExp(`</\\s*${tag}\\s*>`, 'i')
        let j = i
        let charCount = 0
        while (j < lines.length) {
          const cur = lines[j] || ''
          charCount += cur.length + 1
          if (j > i && closeRe.test(cur)) break
          if (j - i > 1200) break
          j += 1
        }
        if (j >= lines.length) {
          i += 1
          continue
        }
        if (!closeRe.test(lines[j] || '')) {
          i += 1
          continue
        }
        const startLine = i + 1
        const endLine = j + 1
        const lineCount = endLine - startLine + 1
        const shouldCollapse = lineCount >= 40 || charCount >= 20_000 || tag === 'script' || tag === 'style'
        if (!shouldCollapse) {
          i = j + 1
          continue
        }
        const blockKey = `tag:${tag}:${startLine}:${endLine}`
        const isExpanded = expandedHtmlBlockKeysRef.current.has(blockKey)
        const headLines = 3
        const tailLines = 1
        const hideStart = Math.min(endLine, startLine + headLines)
        const hideEnd = Math.max(startLine, endLine - tailLines)
        addPlaceholderDecoration(
          startLine,
          `${isExpanded ? '⟪expanded' : '⟪collapsed'} <${tag}> block · ${lineCount} lines · ${Math.round(charCount / 1024)}KB⟫`,
          `${isExpanded ? 'Expanded' : 'Collapsed'} <${tag}> block (${lineCount} lines, ${charCount} chars).`,
          blockKey,
        )
        if (!isExpanded && hideEnd >= hideStart) addHiddenArea(hideStart, hideEnd + 1)
        i = j + 1
      }

      hiddenLongBlockDecorationsRef.current = editor.deltaDecorations(hiddenLongBlockDecorationsRef.current, blockDecs)
      const anyEditor = editor as unknown as { setHiddenAreas?: (ranges: Monaco.IRange[]) => void }
      if (typeof anyEditor.setHiddenAreas === 'function') {
        const key = hideRanges.map(r => `${r.startLineNumber}:${r.endLineNumber}`).join('|')
        if (key !== lastHiddenAreasKeyRef.current) {
          lastHiddenAreasKeyRef.current = key
          anyEditor.setHiddenAreas(hideRanges)
        }
      }
    } catch {
      void 0
    }
  }, [shouldHideLongHtmlBlocks])

  React.useEffect(() => {
    if (canUseMonaco) return
    const editorRefNow = editorRefRef.current
    const onHandleNow = onHandleRef.current
    if (!textareaElRef.current) {
      if (editorRefNow) editorRefNow.current = null
      textareaHandleRef.current = null
      if (onHandleNow) onHandleNow(null)
      return
    }
    if (editorRefNow) editorRefNow.current = textareaHandleRef.current
    if (onHandleNow) onHandleNow(textareaHandleRef.current)
    return () => {
      const current = editorRefRef.current
      if (current) current.current = null
      textareaHandleRef.current = null
      const onHandleCleanup = onHandleRef.current
      if (onHandleCleanup) onHandleCleanup(null)
    }
  }, [canUseMonaco])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (!canUseMonaco) return

    let cancelled = false
    let cleanup: (() => void) | null = null

    const start = async () => {
      await ensureMonacoStyles()
      const monaco = await import('monaco-editor/esm/vs/editor/editor.api')
      const resolvedLanguage = resolveConfiguredMonacoLanguage(language, monacoSettings)
      await preloadEagerMonacoLanguageContributions(monacoSettings)
      await loadOptionalMonacoContributions(monacoSettings)
      await loadMonacoLanguageContribution(resolvedLanguage)
      const { ensureMonacoEnvironment } = await import('./monacoEnvironment')
      const { acquireTextModel } = await import('./monacoModelRegistry')
      if (cancelled) return

      ensureMonacoEnvironment()
      monacoRef.current = monaco

      const src = String(uri || '').trim()
      const monacoUri = (() => {
        if (!src) return monaco.Uri.parse('inmemory://model/empty')
        if (src.startsWith('inmemory://') || src.startsWith('file://')) return monaco.Uri.parse(src)
        return monaco.Uri.parse(`file://${src.replace(/^\/+/, '/')}`)
      })()

      const initialValue = latestValueRef.current
      const { model, release } = acquireTextModel(monaco, {
        uri: monacoUri,
        language: resolvedLanguage,
        value: initialValue,
      })

      const editor = monaco.editor.create(host, {
        model,
        ...buildMonacoEditorOptions(monacoSettings, {
          readOnly: !!readOnly,
          wordWrap: !!wordWrap,
          paddingTopPx,
          paddingBottomPx,
          forceLineNumberColumn,
        }),
      })

      monaco.editor.setTheme(themeModeRef.current === 'dark' ? 'vs-dark' : 'vs')

      editorInstanceRef.current = editor
      const nextValue = latestValueRef.current
      if (nextValue !== model.getValue()) {
        model.setValue(nextValue)
      }
      lastAppliedValueRef.current = model.getValue()
      recomputeHiddenLongHtmlLines()

      const handle = {
        focus: () => editor.focus(),
        layout: () => editor.layout(),
        revealLine: (line: number) => {
          const safe = Math.max(1, Math.floor(line || 1))
          editor.revealLineInCenter(safe)
        },
        revealOffsetInCenter: (offset: number) => {
          const model = editor.getModel()
          if (!model) return
          const safe = Math.max(0, Math.floor(offset || 0))
          const pos = model.getPositionAt(safe)
          editor.revealPositionInCenter(pos)
        },
        setSelection: (startLine: number, startColumn: number, endLine: number, endColumn: number) => {
          editor.setSelection(
            new monaco.Range(
              Math.max(1, startLine),
              Math.max(1, startColumn),
              Math.max(1, endLine),
              Math.max(1, endColumn),
            ),
          )
        },
        setSelectionOffsets: (startOffset: number, endOffset: number) => {
          const model = editor.getModel()
          if (!model) return
          const start = Math.max(0, Math.floor(startOffset || 0))
          const end = Math.max(0, Math.floor(endOffset || 0))
          const startPos = model.getPositionAt(start)
          const endPos = model.getPositionAt(end)
          editor.setSelection(new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column))
        },
        getSelectionOffsets: () => {
          const model = editor.getModel()
          if (!model) return null
          const sel = editor.getSelection()
          if (!sel) return null
          const startOffset = model.getOffsetAt({ lineNumber: sel.startLineNumber, column: sel.startColumn })
          const endOffset = model.getOffsetAt({ lineNumber: sel.endLineNumber, column: sel.endColumn })
          return { startOffset, endOffset }
        },
        getValue: () => editor.getModel()?.getValue() || '',
        setScrollTop: (scrollTop: number) => editor.setScrollTop(scrollTop),
        getScrollTop: () => editor.getScrollTop(),
        getScrollHeight: () => editor.getScrollHeight(),
        getClientHeight: () => editor.getLayoutInfo().height,
        getLineHeight: () => editor.getOption(monaco.editor.EditorOption.lineHeight),
        getContentWidth: () => editor.getLayoutInfo().contentWidth,
        getVisibleRange: () => {
          const ranges = editor.getVisibleRanges()
          if (!ranges.length) return { startLine: 1, endLine: 1 }
          return {
            startLine: ranges[0].startLineNumber,
            endLine: ranges[ranges.length - 1].endLineNumber,
          }
        },
        getTopForLineNumber: (line) => {
          const safe = Math.max(1, Math.min(line, editor.getModel()?.getLineCount() || 1))
          return editor.getTopForLineNumber(safe)
        },
        onDidScrollChange: (listener) => editor.onDidScrollChange(listener),
        onDidLayoutChange: (listener) => editor.onDidLayoutChange(listener),
      } satisfies MonacoTextEditorHandle

      const editorRefNow = editorRefRef.current
      if (editorRefNow) editorRefNow.current = handle
      const onHandleNow = onHandleRef.current
      if (onHandleNow) onHandleNow(handle)

      const contentSub = model.onDidChangeContent(() => {
        const next = model.getValue()
        lastAppliedValueRef.current = next
        onChangeRef.current(next)
        recomputeHiddenLongHtmlLines()
      })

      const contextSub =
        editor.onContextMenu((e) => {
            const model = editor.getModel()
            if (!model) return
            
            // Try to get selection first
            const sel = editor.getSelection()
            let startLine = 0
            let endLine = 0
            let text = ''
            
            if (sel && !sel.isEmpty()) {
                startLine = Math.min(sel.startLineNumber, sel.endLineNumber)
                endLine = Math.max(sel.startLineNumber, sel.endLineNumber)
                text = model.getValueInRange(sel)
                
                if (onContextMenuSelectionRef.current) {
                  onContextMenuSelectionRef.current({ startLine, endLine, text, event: e })
                }
            } else if (e.target && e.target.position) {
                // No selection, use cursor position from event
                startLine = e.target.position.lineNumber
                endLine = e.target.position.lineNumber
            }

            if (onContextMenuRef.current) {
                onContextMenuRef.current({ startLine, endLine, text: text || undefined, event: e })
            }
          })

      const toggleSub =
        editor.onMouseDown(e => {
          if (e.event.detail !== 1) return
          const p = e.target.position
          if (!p) return
          const key = htmlBlockToggleByLineRef.current.get(p.lineNumber)
          if (!key) return
          if (expandedHtmlBlockKeysRef.current.has(key)) expandedHtmlBlockKeysRef.current.delete(key)
          else expandedHtmlBlockKeysRef.current.add(key)
          recomputeHiddenLongHtmlLines()
        })

      const dblSub =
        editor.onMouseDown(e => {
          // Standard Monaco behavior for double click is selecting a word.
          // We don't want to prevent that, but we want to hook into it.
          // However, if we are having issues with selection, let's be careful.
          if (e.event.detail !== 2) return
          
          const p = e.target.position
          if (!p) return
          
          if (onDoubleClickLineRef.current) {
            onDoubleClickLineRef.current(p.lineNumber)
          }

          if (onDoubleClickSelectionRef.current) {
            // Queue to let Monaco finish its internal selection logic
            setTimeout(() => {
                if (!editorInstanceRef.current) return
                const model = editor.getModel()
                if (!model) return
                const sel = editor.getSelection()
                if (!sel) return
                const startLine = Math.min(sel.startLineNumber, sel.endLineNumber)
                const endLine = Math.max(sel.startLineNumber, sel.endLineNumber)
                const text = model.getValueInRange(sel)
                // Only trigger if we actually have a selection
                if (text && text.length > 0 && onDoubleClickSelectionRef.current) {
                    onDoubleClickSelectionRef.current({ startLine, endLine, text, event: e })
                }
            }, 0)
          }
        })
      
      const dblSelSub =
        editor.onMouseDown(e => {
            if (e.event.detail !== 2) return
            queueMicrotask(() => {
              const offsets = handle.getSelectionOffsets()
              if (!offsets) return
              if (onDoubleClickSelectionOffsetsRef.current) {
                onDoubleClickSelectionOffsetsRef.current({ ...offsets, text: handle.getValue() })
              }
            })
          })

      const selSub =
        editor.onDidChangeCursorSelection(() => {
          const offsets = handle.getSelectionOffsets()
          if (!offsets) return
          if (onSelectionChangeOffsetsRef.current) {
            onSelectionChangeOffsetsRef.current(offsets)
          }
        })
      
      const blurSub = editor.onDidBlurEditorWidget(() => {
        if (onBlurRef.current) onBlurRef.current()
      })

      const focusSub = editor.onDidFocusEditorText(() => {
        if (onFocusRef.current) onFocusRef.current()
      })

      cleanup = () => {
        contentSub.dispose()
        if (contextSub) contextSub.dispose()
        if (toggleSub) toggleSub.dispose()
        if (dblSub) dblSub.dispose()
        if (dblSelSub) dblSelSub.dispose()
        if (selSub) selSub.dispose()
        if (blurSub) blurSub.dispose()
        if (focusSub) focusSub.dispose()
        try {
          hiddenLongLineDecorationsRef.current = editor.deltaDecorations(hiddenLongLineDecorationsRef.current, [])
        } catch {
          void 0
        }
        try {
          hiddenLongBlockDecorationsRef.current = editor.deltaDecorations(hiddenLongBlockDecorationsRef.current, [])
        } catch {
          void 0
        }
        try {
          const anyEditor = editor as unknown as { setHiddenAreas?: (ranges: Monaco.IRange[]) => void }
          if (typeof anyEditor.setHiddenAreas === 'function') anyEditor.setHiddenAreas([])
        } catch {
          void 0
        }
        const editorRefNow = editorRefRef.current
        if (editorRefNow) editorRefNow.current = null
        const onHandleNow = onHandleRef.current
        if (onHandleNow) onHandleNow(null)
        editorInstanceRef.current = null
        editor.dispose()
        release()
      }
    }

    void start()

    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [
    canUseMonaco,
    language,
    monacoSettings,
    readOnly,
    uri,
    wordWrap,
    paddingTopPx,
    paddingBottomPx,
    forceLineNumberColumn,
  ])

  React.useEffect(() => {
    if (!canUseMonaco) return
    const editor = editorInstanceRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    applyExternalMonacoValue({
      editor,
      model,
      rangeCtor: monacoRef.current!.Range,
      value,
      lastAppliedValueRef,
      recomputeHiddenLongHtmlLines,
    })
  }, [canUseMonaco, value, recomputeHiddenLongHtmlLines])

  React.useEffect(() => {
    if (!canUseMonaco) return
    recomputeHiddenLongHtmlLines()
  }, [canUseMonaco, recomputeHiddenLongHtmlLines])

  React.useEffect(() => {
    if (!canUseMonaco) return
    const monaco = monacoRef.current
    if (!monaco) return
    monaco.editor.setTheme(themeMode === 'dark' ? 'vs-dark' : 'vs')
  }, [canUseMonaco, themeMode])

  const setTextareaRef = React.useCallback((el: HTMLTextAreaElement | null) => {
    if (textareaElRef.current === el) return
    textareaElRef.current = el

    if (!el) {
      const editorRefNow = editorRefRef.current
      if (editorRefNow) editorRefNow.current = null
      textareaHandleRef.current = null
      const onHandleNow = onHandleRef.current
      if (onHandleNow) onHandleNow(null)
      return
    }

    if (textareaHandleRef.current) {
      const editorRefNow = editorRefRef.current
      if (editorRefNow) editorRefNow.current = textareaHandleRef.current
      const onHandleNow = onHandleRef.current
      if (onHandleNow) onHandleNow(textareaHandleRef.current)
      return
    }

    const readLineHeight = () => {
      try {
        const cs = window.getComputedStyle(el)
        const raw = cs.lineHeight ? Number.parseFloat(cs.lineHeight) : NaN
        return Number.isFinite(raw) && raw > 0 ? raw : 16
      } catch {
        return 16
      }
    }

    const splitLines = () => String(el.value || '').split('\n')

    const getOffsetAt = (line: number, column: number) => {
      const lines = splitLines()
      const safeLine = Math.max(1, Math.min(Math.floor(line || 1), lines.length || 1))
      const safeCol = Math.max(1, Math.floor(column || 1))
      let offset = 0
      for (let i = 0; i < safeLine - 1; i += 1) {
        offset += lines[i].length + 1
      }
      const lineText = lines[safeLine - 1] ?? ''
      const colZeroBased = Math.min(safeCol - 1, lineText.length)
      return offset + colZeroBased
    }

    const getLineForOffset = (offset: number) => {
      const safeOffset = Math.max(0, Math.floor(offset || 0))
      const lines = splitLines()
      let cursor = 0
      for (let i = 0; i < lines.length; i += 1) {
        const len = lines[i].length
        const end = cursor + len
        if (safeOffset <= end) return i + 1
        cursor = end + 1
      }
      return Math.max(1, lines.length)
    }

    const getTopForLineNumber = (line: number) => {
      const lh = readLineHeight()
      const safe = Math.max(1, Math.floor(line || 1))
      return (safe - 1) * lh
    }

    const handle: MonacoTextEditorHandle = {
      focus: () => el.focus(),
      layout: () => void 0,
      revealLine: (line: number) => {
        const top = getTopForLineNumber(line)
        el.scrollTop = top
      },
      revealOffsetInCenter: (offset: number) => {
        const line = getLineForOffset(offset)
        const top = getTopForLineNumber(line)
        el.scrollTop = Math.max(0, top - el.clientHeight / 2)
      },
      setSelection: (startLine, startColumn, endLine, endColumn) => {
        const start = getOffsetAt(startLine, startColumn)
        const end = getOffsetAt(endLine, endColumn)
        el.selectionStart = Math.min(start, end)
        el.selectionEnd = Math.max(start, end)
      },
      setSelectionOffsets: (startOffset: number, endOffset: number) => {
        const start = Math.max(0, Math.floor(startOffset || 0))
        const end = Math.max(0, Math.floor(endOffset || 0))
        el.selectionStart = Math.min(start, end)
        el.selectionEnd = Math.max(start, end)
      },
      getSelectionOffsets: () => {
        const startOffset = typeof el.selectionStart === 'number' ? el.selectionStart : null
        const endOffset = typeof el.selectionEnd === 'number' ? el.selectionEnd : null
        if (startOffset == null || endOffset == null) return null
        return { startOffset, endOffset }
      },
      getValue: () => String(el.value || ''),
      setScrollTop: (scrollTop: number) => {
        el.scrollTop = Math.max(0, Math.floor(scrollTop || 0))
      },
      getScrollTop: () => el.scrollTop,
      getScrollHeight: () => el.scrollHeight,
      getClientHeight: () => el.clientHeight,
      getLineHeight: () => readLineHeight(),
      getContentWidth: () => el.clientWidth,
      getVisibleRange: () => {
        const lh = readLineHeight()
        const totalLines = splitLines().length || 1
        const startLine = Math.max(1, Math.min(totalLines, Math.floor(el.scrollTop / lh) + 1))
        const endLine = Math.max(startLine, Math.min(totalLines, Math.floor((el.scrollTop + el.clientHeight) / lh) + 1))
        return { startLine, endLine }
      },
      getTopForLineNumber,
      onDidScrollChange: (listener) => {
        const handler = () => {
          const ev = {
            scrollTop: el.scrollTop,
            scrollLeft: el.scrollLeft,
            scrollHeight: el.scrollHeight,
            scrollWidth: el.scrollWidth,
            scrollTopChanged: true,
            scrollLeftChanged: false,
            scrollWidthChanged: false,
            scrollHeightChanged: false,
          } as unknown as Monaco.IScrollEvent
          listener(ev)
        }
        el.addEventListener('scroll', handler)
        return {
          dispose: () => el.removeEventListener('scroll', handler),
        }
      },
      onDidLayoutChange: (listener) => {
        const handler = () => {
          const info = {
            width: el.clientWidth,
            height: el.clientHeight,
          } as unknown as Monaco.editor.EditorLayoutInfo
          listener(info)
        }
        let ro: ResizeObserver | null = null
        if (
          typeof window !== 'undefined' &&
          typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver !== 'undefined'
        ) {
          ro = new ResizeObserver(() => handler())
          ro.observe(el)
        } else {
          window.addEventListener('resize', handler)
        }
        return {
          dispose: () => {
            if (ro) ro.disconnect()
            window.removeEventListener('resize', handler)
          },
        }
      },
    }

    textareaHandleRef.current = handle
    const editorRefNow = editorRefRef.current
    if (editorRefNow) editorRefNow.current = handle
    const onHandleNow = onHandleRef.current
    if (onHandleNow) onHandleNow(handle)
  }, [])

  return (
    <section
      className={`kg-monaco-editor-root flex min-h-0 flex-col ${className || ''}`.trim()}
      data-kg-monaco-runtime-mode={runtimeMode}
    >
      {runtimeMode === 'deferred-touch' ? (
        <section
          className="border-b border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-3 py-3"
          data-kg-monaco-touch-intent="true"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--kg-text-secondary)]">
            {MONACO_TOUCH_INTENT_COPY.eyebrow}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--kg-text-primary)]">
            {MONACO_TOUCH_INTENT_COPY.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--kg-text-secondary)]">
            {MONACO_TOUCH_INTENT_COPY.body}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="App-toolbar__btn min-h-11 px-4 text-sm font-medium"
              data-kg-monaco-touch-intent-activate="true"
              onClick={() => setTouchViewportIntentActivated(true)}
            >
              {MONACO_TOUCH_INTENT_COPY.action}
            </button>
          </div>
        </section>
      ) : null}
      {canUseMonaco ? (
        <section
          ref={el => {
            hostRef.current = el
          }}
          className={['kg-monaco-editor-host min-h-0 flex-1 w-full', UI_THEME_TOKENS.input.bg].join(' ')}
        />
      ) : (
        <PlainTextInputEditor
          ref={setTextareaRef}
          multiline
          value={value}
          readOnly={!!readOnly}
          spellCheck={false}
          ariaLabel={ariaLabel}
          onChange={onChange}
          onSelect={e => {
            const el = e.currentTarget
            const startOffset = typeof el.selectionStart === 'number' ? el.selectionStart : 0
            const endOffset = typeof el.selectionEnd === 'number' ? el.selectionEnd : startOffset
            lastTextareaSelectionOffsetsRef.current = { startOffset, endOffset }
            if (onSelectionChangeOffsetsRef.current) {
              onSelectionChangeOffsetsRef.current({ startOffset, endOffset })
            }
          }}
          onDoubleClick={e => {
            const el = e.currentTarget
            const startOffset = typeof el.selectionStart === 'number' ? el.selectionStart : 0
            const endOffset = typeof el.selectionEnd === 'number' ? el.selectionEnd : startOffset
            const stable = lastTextareaSelectionOffsetsRef.current
            const stableStartOffset = stable ? stable.startOffset : startOffset
            const stableEndOffset = stable ? stable.endOffset : endOffset
            if (onDoubleClickLineRef.current) {
              const text = String(el.value || '')
              const rawOffset = Math.min(stableStartOffset, stableEndOffset)
              const clampedOffset = Math.max(0, Math.min(text.length, rawOffset))
              const offsetForLine = clampedOffset > 0 && text[clampedOffset - 1] === '\n' ? clampedOffset - 1 : clampedOffset
              const prefix = text.slice(0, offsetForLine)
              const rawLine = (prefix.match(/\n/g) || []).length + 1
              const lines = text.split('\n')
              let idx = Math.min(Math.max(rawLine - 1, 0), Math.max(lines.length - 1, 0))
              while (idx > 0 && String(lines[idx] || '').trim() === '') idx -= 1
              onDoubleClickLineRef.current(idx + 1)
            }
            if (onDoubleClickSelectionOffsetsRef.current) {
              onDoubleClickSelectionOffsetsRef.current({
                startOffset: stableStartOffset,
                endOffset: stableEndOffset,
                text: String(el.value || ''),
              })
            }
          }}
          onBlur={onBlur}
          className={[
            'min-h-0 flex-1 w-full resize-none outline-none p-2',
            UI_THEME_TOKENS.input.bg,
            UI_THEME_TOKENS.input.text,
            textareaClassName || className || '',
          ].join(' ')}
        />
      )}
    </section>
  )
}
