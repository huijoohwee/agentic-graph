import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertMonacoSettingsRegistryKeys } from './lazyLoadingGatesRegression.monaco'

export function testHeavyFeatureSurfacesUseTargetedLazyLoadingGates() {
  const root = process.cwd()
  const mainText = readFileSync(resolve(root, 'src', 'main.tsx'), 'utf8')
  if (mainText.includes("import 'monaco-editor/dev/vs/style.css'")) {
    throw new Error('expected monaco styles to be lazy-loaded instead of eagerly imported in main.tsx')
  }
  if (mainText.includes("import 'maplibre-gl/dist/maplibre-gl.css'")) {
    throw new Error('expected maplibre styles to be lazy-loaded instead of eagerly imported in main.tsx')
  }

  const appText = readFileSync(resolve(root, 'src', 'App.tsx'), 'utf8')
  if (appText.includes("import { PerformanceAutomationReadout }")) {
    throw new Error('expected App to avoid eagerly importing PerformanceAutomationReadout on every boot')
  }
  if (!appText.includes("const PerformanceAutomationReadoutLazy = lazy")) {
    throw new Error('expected App to lazy-load PerformanceAutomationReadout behind a route-level query gate')
  }
  if (!appText.includes("performanceAutomationReadoutEnabled ? (")) {
    throw new Error('expected App to gate PerformanceAutomationReadout behind the kgAutomationPerf query flag before importing it')
  }

  const monacoTextEditorText = readFileSync(resolve(root, 'src', 'lib', 'monaco', 'MonacoTextEditor.impl.tsx'), 'utf8')
  if (!monacoTextEditorText.includes('ensureMonacoStyles')) {
    throw new Error('expected MonacoTextEditor to gate style loading via ensureMonacoStyles')
  }
  if (monacoTextEditorText.includes("stickyScrollContribution")) {
    throw new Error('expected MonacoTextEditor to avoid eagerly importing sticky scroll contrib')
  }
  if (monacoTextEditorText.includes('stickyScroll: { enabled: true }')) {
    throw new Error('expected MonacoTextEditor to avoid enabling sticky scroll unconditionally on the slim Monaco path')
  }
  if (!monacoTextEditorText.includes("const resolvedLanguage = resolveConfiguredMonacoLanguage(language, monacoSettings)")) {
    throw new Error('expected MonacoTextEditor to resolve Monaco language support from MainPanel Monaco capability settings')
  }
  if (!monacoTextEditorText.includes("await loadMonacoLanguageContribution(resolvedLanguage)")) {
    throw new Error('expected MonacoTextEditor to lazy-load Monaco language contributions per active language')
  }
  if (!monacoTextEditorText.includes("await import('monaco-editor/esm/vs/language/json/monaco.contribution')")) {
    throw new Error('expected MonacoTextEditor to lazy-load JSON language support only when needed')
  }
  if (!monacoTextEditorText.includes("await import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution')")) {
    throw new Error('expected MonacoTextEditor to lazy-load SQL language support only when needed')
  }

  const monacoEnvironmentText = readFileSync(resolve(root, 'src', 'features', 'monaco', 'monacoEnvironment.ts'), 'utf8')
  if (monacoEnvironmentText.includes("html.worker?worker")) {
    throw new Error('expected Monaco environment to avoid bundling the unused HTML worker')
  }
  if (monacoEnvironmentText.includes("label === 'html'")) {
    throw new Error('expected Monaco environment to avoid routing unused HTML-family labels to a dedicated worker')
  }
  if (!monacoEnvironmentText.includes("import('monaco-editor/esm/vs/language/json/json.worker?worker')")) {
    throw new Error('expected Monaco environment to lazy-load the JSON worker module')
  }

  const monacoSettingsRegistryText = readFileSync(resolve(root, 'src', 'features', 'settings', 'registry-ui.monaco.ts'), 'utf8')
  assertMonacoSettingsRegistryKeys(monacoSettingsRegistryText)
  if (!monacoTextEditorText.includes('links: settings.monacoLinksEnabled')) {
    throw new Error('expected MonacoTextEditor to wire Monaco links through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('suggestOnTriggerCharacters: settings.monacoSuggestOnTriggerCharactersEnabled')) {
    throw new Error('expected MonacoTextEditor to wire suggestOnTriggerCharacters through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('selectionHighlight: settings.monacoSelectionHighlightEnabled')) {
    throw new Error('expected MonacoTextEditor to wire selection highlight through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("occurrencesHighlight: settings.monacoOccurrencesHighlightEnabled ? 'singleFile' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire occurrences highlight through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('indentation: settings.monacoGuidesEnabled')) {
    throw new Error('expected MonacoTextEditor to wire Monaco guides through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('bracketPairColorization: { enabled: settings.monacoBracketPairColorizationEnabled }')) {
    throw new Error('expected MonacoTextEditor to wire bracket pair colorization through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("import('monaco-editor/esm/vs/editor/contrib/codelens/browser/codelensController')")) {
    throw new Error('expected MonacoTextEditor to lazy-load code lens contrib only when enabled')
  }
  if (!monacoTextEditorText.includes("import('monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions')")) {
    throw new Error('expected MonacoTextEditor to lazy-load lightbulb contrib only when enabled')
  }
  if (!monacoTextEditorText.includes("import('monaco-editor/esm/vs/editor/contrib/inlayHints/browser/inlayHintsContribution')")) {
    throw new Error('expected MonacoTextEditor to lazy-load inlay hints contrib only when enabled')
  }
  if (!monacoTextEditorText.includes('codeLens: settings.monacoCodeLensEnabled')) {
    throw new Error('expected MonacoTextEditor to wire code lens through MainPanel capability settings')
  }
  if (
    !monacoTextEditorText.includes("lightbulb: { enabled: settings.monacoLightbulbEnabled ? 'onCode' : 'off' }") &&
    !monacoTextEditorText.includes("enabled: (settings.monacoLightbulbEnabled ? 'onCode' : 'off') as Monaco.editor.IEditorLightbulbOptions['enabled']")
  ) {
    throw new Error('expected MonacoTextEditor to wire lightbulb through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("inlayHints: { enabled: settings.monacoInlayHintsEnabled ? 'on' : 'off' }")) {
    throw new Error('expected MonacoTextEditor to wire inlay hints through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("wordBasedSuggestions: settings.monacoWordBasedSuggestionsEnabled ? 'currentDocument' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire word-based suggestions through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('inlineSuggest: { enabled: settings.monacoInlineSuggestEnabled }')) {
    throw new Error('expected MonacoTextEditor to wire inline suggest through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("acceptSuggestionOnEnter: settings.monacoAcceptSuggestionOnEnterEnabled ? 'on' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire acceptSuggestionOnEnter through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('dragAndDrop: settings.monacoDragAndDropEnabled')) {
    throw new Error('expected MonacoTextEditor to wire dragAndDrop through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('dropIntoEditor: { enabled: settings.monacoDropIntoEditorEnabled }')) {
    throw new Error('expected MonacoTextEditor to wire dropIntoEditor through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('colorDecorators: settings.monacoColorDecoratorsEnabled')) {
    throw new Error('expected MonacoTextEditor to wire color decorators through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('unicodeHighlight: settings.monacoUnicodeHighlightEnabled ? {} : { nonBasicASCII: false, invisibleCharacters: false, ambiguousCharacters: false }')) {
    throw new Error('expected MonacoTextEditor to wire unicode highlight through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("matchBrackets: settings.monacoMatchBracketsEnabled ? 'always' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire matchBrackets through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("renderLineHighlight: settings.monacoRenderLineHighlightEnabled ? 'line' : 'none'")) {
    throw new Error('expected MonacoTextEditor to wire renderLineHighlight through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('glyphMargin: args.forceLineNumberColumn || settings.monacoGlyphMarginEnabled')) {
    throw new Error('expected MonacoTextEditor to wire glyphMargin through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('overviewRulerLanes: settings.monacoOverviewRulerLanesEnabled ? 2 : 0')) {
    throw new Error('expected MonacoTextEditor to wire overviewRulerLanes through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('lineDecorationsWidth: args.forceLineNumberColumn ? 10 : (settings.monacoLineDecorationsWidthEnabled ? 10 : 0)')) {
    throw new Error('expected MonacoTextEditor to wire lineDecorationsWidth through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("renderWhitespace: settings.monacoRenderWhitespaceEnabled ? 'selection' : 'none'")) {
    throw new Error('expected MonacoTextEditor to wire renderWhitespace through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('renderControlCharacters: settings.monacoRenderControlCharactersEnabled')) {
    throw new Error('expected MonacoTextEditor to wire renderControlCharacters through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('smoothScrolling: settings.monacoSmoothScrollingEnabled')) {
    throw new Error('expected MonacoTextEditor to wire smoothScrolling through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('scrollBeyondLastLine: settings.monacoScrollBeyondLastLineEnabled')) {
    throw new Error('expected MonacoTextEditor to wire scrollBeyondLastLine through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('mouseWheelZoom: settings.monacoMouseWheelZoomEnabled')) {
    throw new Error('expected MonacoTextEditor to wire mouseWheelZoom through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("cursorBlinking: settings.monacoCursorBlinkingEnabled ? 'blink' : 'solid'")) {
    throw new Error('expected MonacoTextEditor to wire cursorBlinking through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("cursorSmoothCaretAnimation: settings.monacoCursorSmoothCaretAnimationEnabled ? 'on' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire cursorSmoothCaretAnimation through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("wordWrap: settings.monacoWordWrapEnabled || args.wordWrap ? 'on' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire wordWrap override through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("wrappingIndent: settings.monacoWrappingIndentEnabled ? 'indent' : 'none'")) {
    throw new Error('expected MonacoTextEditor to wire wrappingIndent through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("wrappingStrategy: settings.monacoWrappingStrategyEnabled ? 'advanced' : 'simple'")) {
    throw new Error('expected MonacoTextEditor to wire wrappingStrategy through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('cursorWidth: settings.monacoCursorWidthEnabled ? 2 : 1')) {
    throw new Error('expected MonacoTextEditor to wire cursorWidth through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("cursorStyle: settings.monacoCursorStyleEnabled ? 'block' : 'line'")) {
    throw new Error('expected MonacoTextEditor to wire cursorStyle through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('cursorSurroundingLines: settings.monacoCursorSurroundingLinesEnabled ? 3 : 0')) {
    throw new Error('expected MonacoTextEditor to wire cursorSurroundingLines through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("cursorSurroundingLinesStyle: settings.monacoCursorSurroundingLinesStyleEnabled ? 'all' : 'default'")) {
    throw new Error('expected MonacoTextEditor to wire cursorSurroundingLinesStyle through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('cursorHeight: settings.monacoCursorHeightEnabled ? 1.2 : 1')) {
    throw new Error('expected MonacoTextEditor to wire cursorHeight through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('stickyScroll: { enabled: settings.monacoStickyScrollEnabled }')) {
    throw new Error('expected MonacoTextEditor to wire stickyScroll through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('selectionClipboard: settings.monacoSelectionClipboardEnabled')) {
    throw new Error('expected MonacoTextEditor to wire selectionClipboard through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('copyWithSyntaxHighlighting: settings.monacoCopyWithSyntaxHighlightingEnabled')) {
    throw new Error('expected MonacoTextEditor to wire copyWithSyntaxHighlighting through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('occurrencesHighlightDelay: settings.monacoOccurrencesHighlightDelayEnabled ? 400 : 250')) {
    throw new Error('expected MonacoTextEditor to wire occurrencesHighlightDelay through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('formatOnPaste: settings.monacoFormatOnPasteEnabled')) {
    throw new Error('expected MonacoTextEditor to wire formatOnPaste through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('formatOnType: settings.monacoFormatOnTypeEnabled')) {
    throw new Error('expected MonacoTextEditor to wire formatOnType through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoClosingBrackets: settings.monacoAutoClosingBracketsEnabled ? 'always' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire autoClosingBrackets through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoClosingQuotes: settings.monacoAutoClosingQuotesEnabled ? 'always' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire autoClosingQuotes through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoIndent: settings.monacoAutoIndentEnabled ? 'full' : 'none'")) {
    throw new Error('expected MonacoTextEditor to wire autoIndent through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoSurround: settings.monacoAutoSurroundEnabled ? 'languageDefined' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire autoSurround through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('matchOnWordStartOnly: settings.monacoMatchOnWordStartOnlyEnabled')) {
    throw new Error('expected MonacoTextEditor to wire matchOnWordStartOnly through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("seedSearchStringFromSelection: settings.monacoFindSeedSearchStringFromSelectionEnabled ? 'selection' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire find.seedSearchStringFromSelection through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('cursorMoveOnType: settings.monacoFindCursorMoveOnTypeEnabled')) {
    throw new Error('expected MonacoTextEditor to wire find.cursorMoveOnType through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('findOnType: settings.monacoFindFindOnTypeEnabled')) {
    throw new Error('expected MonacoTextEditor to wire find.findOnType through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('loop: settings.monacoFindLoopEnabled')) {
    throw new Error('expected MonacoTextEditor to wire find.loop through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoClosingDelete: settings.monacoAutoClosingDeleteEnabled ? 'always' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire autoClosingDelete through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoClosingComments: settings.monacoAutoClosingCommentsEnabled ? 'always' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire autoClosingComments through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('emptySelectionClipboard: settings.monacoEmptySelectionClipboardEnabled')) {
    throw new Error('expected MonacoTextEditor to wire emptySelectionClipboard through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('columnSelection: settings.monacoColumnSelectionEnabled')) {
    throw new Error('expected MonacoTextEditor to wire columnSelection through MainPanel capability settings')
  }
  if (
    !monacoTextEditorText.includes('wordSeparators: settings.monacoWordSeparatorsEnabled ?') ||
    !monacoTextEditorText.includes("`~!@#$%^&*()-=+[{]}\\\\|;:\\'\",.<>/?'")
  ) {
    throw new Error('expected MonacoTextEditor to wire wordSeparators through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("multiCursorModifier: settings.monacoMultiCursorModifierEnabled ? 'ctrlCmd' : 'alt'")) {
    throw new Error('expected MonacoTextEditor to wire multiCursorModifier through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('multiCursorMergeOverlapping: settings.monacoMultiCursorMergeOverlappingEnabled')) {
    throw new Error('expected MonacoTextEditor to wire multiCursorMergeOverlapping through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("multiCursorPaste: settings.monacoMultiCursorPasteEnabled ? 'spread' : 'full'")) {
    throw new Error('expected MonacoTextEditor to wire multiCursorPaste through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("autoClosingOvertype: settings.monacoAutoClosingOvertypeEnabled ? 'always' : 'never'")) {
    throw new Error('expected MonacoTextEditor to wire autoClosingOvertype through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("mouseStyle: settings.monacoMouseStyleEnabled ? 'default' : 'text'")) {
    throw new Error('expected MonacoTextEditor to wire mouseStyle through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("renderFinalNewline: settings.monacoRenderFinalNewlineEnabled ? 'dimmed' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire renderFinalNewline through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes("accessibilitySupport: settings.monacoAccessibilitySupportEnabled ? 'on' : 'off'")) {
    throw new Error('expected MonacoTextEditor to wire accessibilitySupport through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('useShadows: settings.monacoScrollbarUseShadowsEnabled')) {
    throw new Error('expected MonacoTextEditor to wire scrollbar.useShadows through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('alwaysConsumeMouseWheel: settings.monacoScrollbarAlwaysConsumeMouseWheelEnabled')) {
    throw new Error('expected MonacoTextEditor to wire scrollbar.alwaysConsumeMouseWheel through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('horizontalScrollbarSize: settings.monacoHorizontalScrollbarSizeEnabled ? 16 : 12')) {
    throw new Error('expected MonacoTextEditor to wire horizontalScrollbarSize through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('verticalScrollbarSize: settings.monacoVerticalScrollbarSizeEnabled ? 18 : 14')) {
    throw new Error('expected MonacoTextEditor to wire verticalScrollbarSize through MainPanel capability settings')
  }
  if (!monacoTextEditorText.includes('mouseWheelScrollSensitivity: settings.monacoMouseWheelScrollSensitivityEnabled ? 1.5 : 1')) {
    throw new Error('expected MonacoTextEditor to wire mouseWheelScrollSensitivity through MainPanel capability settings')
  }

  const markdownCodeBlockText = readFileSync(resolve(root, 'src', 'features', 'markdown', 'ui', 'MarkdownCodeBlock.tsx'), 'utf8')
  if (!markdownCodeBlockText.includes('MermaidDiagramLazy') || !markdownCodeBlockText.includes('React.Suspense')) {
    throw new Error('expected MarkdownCodeBlock to lazy-load MermaidDiagram behind suspense')
  }

  const mdxComponentsText = readFileSync(resolve(root, 'src', 'features', 'markdown', 'ui', 'mdxComponents.tsx'), 'utf8')
  if (!mdxComponentsText.includes('MermaidDiagramLazy') || !mdxComponentsText.includes('React.Suspense')) {
    throw new Error('expected mdxComponents Mermaid renderer to lazy-load MermaidDiagram')
  }

  const canvasViewportText = readFileSync(resolve(root, 'src', 'components', 'CanvasViewport.tsx'), 'utf8')
  if (canvasViewportText.includes("import StoryboardWidgetCanvas from '@/components/StoryboardWidgetCanvas'")) {
    throw new Error('expected CanvasViewport to avoid eagerly importing StoryboardWidgetCanvas on non-storyboard-widget surfaces')
  }
  if (!canvasViewportText.includes('const StoryboardWidgetCanvasLazy = React.lazy')) {
    throw new Error('expected CanvasViewport to lazy-load StoryboardWidgetCanvas behind the storyboard-widget surface gate')
  }
  if (!canvasViewportText.includes('const StoryboardWidgetDropBridgeLazy = React.lazy')) {
    throw new Error('expected CanvasViewport to lazy-load the hidden geospatial Storyboard Widget-drop bridge separately from the full StoryboardWidgetCanvas runtime')
  }
  if (!canvasViewportText.includes('<StoryboardWidgetDropBridgeLazy active={false} widgetDropCaptureEnabled geospatialWidgetPanelMode />')) {
    throw new Error('expected CanvasViewport geospatial widget-drop path to mount the dedicated bridge component instead of the full StoryboardWidgetCanvas runtime')
  }
  if (canvasViewportText.includes("import { PaywallOverlay } from '@/features/payments/PaywallOverlay'")) {
    throw new Error('expected CanvasViewport to avoid eagerly importing PaywallOverlay on every workspace boot')
  }
  if (!canvasViewportText.includes('const PaywallOverlayLazy = React.lazy')) {
    throw new Error('expected CanvasViewport to lazy-load PaywallOverlay behind paywall-open state')
  }
  if (!canvasViewportText.includes("const paywallOverlayActive = paywallEnabled && floatingPanelOpen && floatingPanelView === 'chat'")) {
    throw new Error('expected CanvasViewport to compute paywall overlay activity before importing the overlay')
  }
  if (canvasViewportText.includes("import { buildGeospatialOverlayGraphData } from '@/features/geospatial/geospatialOverlayGraphData'")) {
    throw new Error('expected CanvasViewport to avoid eagerly importing geospatial overlay graph derivation into the default viewport shell')
  }
  if (canvasViewportText.includes("import {\n  buildGrabMapsPoiRichMediaSrcDoc,")) {
    throw new Error('expected CanvasViewport to avoid eagerly importing geospatial POI rich-media helpers into the default viewport shell')
  }
  if (!canvasViewportText.includes('const CanvasViewportGeospatialOverlayLazy = React.lazy')) {
    throw new Error('expected CanvasViewport to lazy-load the geospatial overlay owner behind viewport ownership gating')
  }
  if (!canvasViewportText.includes('<CanvasViewportGeospatialOverlayLazy')) {
    throw new Error('expected CanvasViewport to mount the geospatial overlay through the lazy boundary')
  }
  if (canvasViewportText.includes("import { subscribeMarkdownPanelMetric } from '@/features/metrics/uiMetrics'")) {
    throw new Error('expected CanvasViewport to avoid eagerly importing markdown metric subscriptions into the default viewport shell')
  }
  if (!canvasViewportText.includes('const MarkdownMetricsDevOverlayLazy = React.lazy')) {
    throw new Error('expected CanvasViewport to lazy-load the dev-only markdown metrics overlay')
  }
  if (!canvasViewportText.includes('const MARKDOWN_METRICS_DEV_ENABLED = Boolean')) {
    throw new Error('expected CanvasViewport to gate markdown metrics overlay imports behind a cheap DEV constant')
  }
  if (!canvasViewportText.includes('{!documentSwitchOwnsViewport && !liveCanvasHeroVisible && MARKDOWN_METRICS_DEV_ENABLED ? <MarkdownMetricsDevOverlayLazy layout={layout} /> : null}')) {
    throw new Error('expected CanvasViewport to mount the dev metrics overlay only through the DEV-gated lazy boundary')
  }

  const canvasViewportGeospatialOverlayText = readFileSync(resolve(root, 'src', 'components', 'CanvasViewportGeospatialOverlay.tsx'), 'utf8')
  if (!canvasViewportGeospatialOverlayText.includes("import { buildGeospatialOverlayGraphData } from '@/features/geospatial/geospatialOverlayGraphData'")) {
    throw new Error('expected CanvasViewportGeospatialOverlay to own geospatial overlay graph derivation after the split')
  }
  if (!canvasViewportGeospatialOverlayText.includes('buildGrabMapsPoiRichMediaSrcDoc(normalizedDetail)')) {
    throw new Error('expected CanvasViewportGeospatialOverlay to own POI rich-media srcdoc construction after the split')
  }
  if (!canvasViewportGeospatialOverlayText.includes('requestGeospatialFitToSelection')) {
    throw new Error('expected CanvasViewportGeospatialOverlay to own geospatial selection-fit wiring after the split')
  }

  const canvasViewportMarkdownMetricsDevOverlayText = readFileSync(resolve(root, 'src', 'components', 'CanvasViewportMarkdownMetricsDevOverlay.tsx'), 'utf8')
  if (!canvasViewportMarkdownMetricsDevOverlayText.includes("import { subscribeMarkdownPanelMetric } from '@/features/metrics/uiMetrics'")) {
    throw new Error('expected CanvasViewportMarkdownMetricsDevOverlay to own shared markdown metric subscriptions after the split')
  }
  if (!canvasViewportMarkdownMetricsDevOverlayText.includes("if (!anyImportMeta.env?.DEV) return null")) {
    throw new Error('expected CanvasViewportMarkdownMetricsDevOverlay to stay DEV-only even after the lazy split')
  }

  const canvasWorkspacePaneRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'useCanvasWorkspacePaneRuntime.ts'), 'utf8')
  if (canvasWorkspacePaneRuntimeText.includes("import { startPointerDrag } from 'grph-shared/dom/pointerDrag'")) {
    throw new Error('expected useCanvasWorkspacePaneRuntime to avoid eagerly importing shared pointer-drag runtime into the always-mounted canvas shell')
  }
  if (canvasWorkspacePaneRuntimeText.includes("import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'")) {
    throw new Error('expected useCanvasWorkspacePaneRuntime to avoid eagerly importing RAF value scheduling into the always-mounted canvas shell')
  }
  if (!canvasWorkspacePaneRuntimeText.includes('const loadCanvasWorkspacePaneResizeHandleRuntime = (): Promise')) {
    throw new Error('expected useCanvasWorkspacePaneRuntime to lazy-load the resize-handle drag runtime after the handle mounts')
  }
  if (!canvasWorkspacePaneRuntimeText.includes('void loadCanvasWorkspacePaneResizeHandleRuntime()')) {
    throw new Error('expected useCanvasWorkspacePaneRuntime to bind the resize handle through the deferred runtime loader')
  }

  const canvasWorkspacePaneResizeHandleRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasWorkspacePaneResizeHandleRuntime.ts'), 'utf8')
  if (!canvasWorkspacePaneResizeHandleRuntimeText.includes("import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'")) {
    throw new Error('expected canvasWorkspacePaneResizeHandleRuntime to reuse the shared resize-separator drag owner after the split')
  }
  if (canvasWorkspacePaneResizeHandleRuntimeText.includes("from 'grph-shared/dom/pointerDrag'") || canvasWorkspacePaneResizeHandleRuntimeText.includes("from '@/lib/react/rafValueScheduler'")) {
    throw new Error('expected canvasWorkspacePaneResizeHandleRuntime to avoid duplicating shared pointer-drag and RAF scheduling')
  }
  if (!canvasWorkspacePaneResizeHandleRuntimeText.includes('bindCanvasWorkspacePaneResizeHandleRuntime') || !canvasWorkspacePaneResizeHandleRuntimeText.includes('return bindResizeSeparatorDragRuntime<number>({')) {
    throw new Error('expected canvasWorkspacePaneResizeHandleRuntime to expose the shared resize-handle binder after the split')
  }

  const storyboardWidgetDropBridgeText = readFileSync(resolve(root, 'src', 'components', 'StoryboardWidgetDropBridge.tsx'), 'utf8')
  if (!storyboardWidgetDropBridgeText.includes('useStoryboardWidgetDropBridge({')) {
    throw new Error('expected StoryboardWidgetDropBridge to reuse the shared widget-drop bridge hook instead of reimplementing drag wiring')
  }
  if (!storyboardWidgetDropBridgeText.includes('widgetDropBridgeOnly: true')) {
    throw new Error('expected StoryboardWidgetDropBridge to stay bridge-only and avoid the full Storyboard Widget runtime surface')
  }
  if (!storyboardWidgetDropBridgeText.includes('buildDataflowWidgetRegistry({ documentWidgetRegistry, effectiveWidgetRegistry, widgetRegistry: baseWidgetRegistry })')) {
    throw new Error('expected StoryboardWidgetDropBridge to reuse the shared dataflow widget registry composition')
  }

  const sourceFilesBootstrapText = readFileSync(resolve(root, 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx'), 'utf8')
  if (sourceFilesBootstrapText.includes("import { notifyKnowgrphStorageConflictUx } from '@/lib/storage/knowgrphStorageConflictUx'")) {
    throw new Error('expected SourceFilesPersistenceBootstrap to avoid eagerly importing knowgrph storage conflict UX into the bootstrap module graph')
  }
  if (sourceFilesBootstrapText.includes("import { applyPulledKnowgrphStorageChangesToSourceFiles } from '@/features/source-files/sourceFilesInboundStorageApply'")) {
    throw new Error('expected SourceFilesPersistenceBootstrap to avoid eagerly importing inbound knowgrph storage apply logic into the bootstrap module graph')
  }
  if (sourceFilesBootstrapText.includes("import {\n  cancelKnowgrphStorageSync,\n  scheduleKnowgrphStorageSync,\n  startKnowgrphStorageSyncLoop,\n} from '@/lib/storage/knowgrphStorageClientSync'")) {
    throw new Error('expected SourceFilesPersistenceBootstrap to avoid eagerly importing knowgrph storage client runtime into the bootstrap module graph')
  }
  if (!sourceFilesBootstrapText.includes('createKnowgrphStorageWorkspaceLifecycle')) {
    throw new Error('expected SourceFilesPersistenceBootstrap to delegate lazy storage dependency loading to its workspace lifecycle owner')
  }
  if (
    !sourceFilesBootstrapText.includes('ensureKnowgrphStorageRuntimeDependencies(capturedOwnership)')
    || !sourceFilesBootstrapText.includes('runWorkspaceSeedSyncTask(capturedOwnership.signal, () => (') || !sourceFilesBootstrapText.includes('deps.syncSourceFilesToKnowgrphStorage({')
  ) {
    throw new Error('expected SourceFilesPersistenceBootstrap to enqueue knowgrph storage sync through the deferred runtime loader and Flight suspension barrier')
  }

  const canvasPageText = readFileSync(resolve(root, 'src', 'pages', 'Canvas.tsx'), 'utf8')
  if (canvasPageText.includes("import { CanvasDocDeepLinkRuntime } from '@/features/canvas/CanvasDocDeepLinkRuntime'")) {
    throw new Error('expected Canvas page to avoid eagerly importing CanvasDocDeepLinkRuntime into the default route-shell boot path')
  }
  if (!canvasPageText.includes("import { buildDocDeepLinkIntentKey } from '@/features/canvas/canvasDocDeepLink'")) {
    throw new Error('expected Canvas page doc deep-link mount gate to reuse the canonical keyed intent helper')
  }
  if (canvasPageText.includes("import { CanvasQueryBootstrapRuntime, shouldOpenEditorWorkspaceFromSearch } from '@/features/canvas/CanvasQueryBootstrapRuntime'")) {
    throw new Error('expected Canvas page to avoid eagerly importing CanvasQueryBootstrapRuntime into the default route-shell boot path')
  }
  if (canvasPageText.includes("from '@/features/canvas/CanvasQueryBootstrapRuntime'")) {
    throw new Error('expected Canvas page query helpers to stay split from the lazy CanvasQueryBootstrapRuntime module graph')
  }
  if (!canvasPageText.includes("import { shouldOpenEditorWorkspaceFromSearch } from '@/features/canvas/canvasQueryBootstrapSearch'")) {
    throw new Error('expected Canvas page to import query helper from the small canvasQueryBootstrapSearch module')
  }
  if (canvasPageText.includes("import { CanvasViewport } from '@/components/CanvasViewport'")) {
    throw new Error('expected Canvas page to lazy-load CanvasViewport instead of carrying renderer-selection imports in the route entry')
  }
  if (!canvasPageText.includes('const CanvasViewportLazy = React.lazy')) {
    throw new Error('expected Canvas page to lazy-load CanvasViewport from the route shell')
  }
  if (canvasPageText.includes("import { runGlobalInteractionCleanup } from '@/lib/canvas/interaction-recovery'")) {
    throw new Error('expected Canvas page to load interaction recovery only when the workspace overlay opens')
  }
  if (!canvasPageText.includes("import('@/lib/canvas/interaction-recovery')")) {
    throw new Error('expected Canvas page workspace-overlay cleanup to use a deferred interaction recovery import')
  }
  if (!canvasPageText.includes('const CanvasQueryBootstrapRuntimeLazy = React.lazy')) {
    throw new Error('expected Canvas page to lazy-load CanvasQueryBootstrapRuntime only when URL search params are present')
  }
  if (!canvasPageText.includes('const CanvasDocDeepLinkRuntimeLazy = React.lazy')) {
    throw new Error('expected Canvas page to lazy-load CanvasDocDeepLinkRuntime only when deep-link params are present')
  }
  if (!canvasPageText.includes('const hasSearchParams = React.useMemo')) {
    throw new Error('expected Canvas page to compute whether query bootstrap runtime is needed before importing it')
  }
  if (!canvasPageText.includes('const documentIntentKey = React.useMemo')) {
    throw new Error('expected Canvas page to compute a stable document intent before importing the deep-link runtime')
  }
  if (!canvasPageText.includes("buildDocDeepLinkIntentKey(String(location.search || ''))") || !canvasPageText.includes('const hasDocDeepLinkParams = Boolean(documentIntentKey)')) {
    throw new Error('expected Canvas page doc deep-link mount gate to derive from the canonical keyed document intent')
  }
  if (
    canvasPageText.includes("search.includes('doc=')")
    || canvasPageText.includes("search.includes('path=')")
    || canvasPageText.includes("search.includes('kgShare=')")
  ) {
    throw new Error('expected Canvas page doc deep-link mount gate to forbid stale string-sniff aliases')
  }
  if (canvasPageText.includes("import { CanvasFrontmatterRuntime } from '@/features/canvas/CanvasFrontmatterRuntime'")) {
    throw new Error('expected Canvas page to avoid eagerly importing CanvasFrontmatterRuntime into the default route-shell boot path')
  }
  if (!canvasPageText.includes('const CanvasFrontmatterRuntimeLazy = React.lazy')) {
    throw new Error('expected Canvas page to lazy-load CanvasFrontmatterRuntime behind cheap frontmatter eligibility checks')
  }
  if (!canvasPageText.includes('const shouldMountCanvasFrontmatterRuntime = React.useMemo')) {
    throw new Error('expected Canvas page to compute frontmatter runtime eligibility before importing CanvasFrontmatterRuntime')
  }
  if (!canvasPageText.includes("if (markdownDocumentApplyViewPreset === false) return false")) {
    throw new Error('expected Canvas page frontmatter eligibility gate to preserve applyViewPreset=false short-circuit before importing CanvasFrontmatterRuntime')
  }
  if (!canvasPageText.includes("if (!frontmatterModeEnabled) return false")) {
    throw new Error('expected Canvas page frontmatter eligibility gate to skip frontmatter runtime imports when frontmatter mode is disabled')
  }
  if (!canvasPageText.includes('<CanvasFrontmatterRuntimeLazy />')) {
    throw new Error('expected Canvas page to mount CanvasFrontmatterRuntime through the lazy boundary once frontmatter eligibility is met')
  }

  const graphStoreBootstrapRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'GraphStoreBootstrapRuntime.tsx'), 'utf8')
  if (graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/canvasSlice'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to avoid eagerly importing the full canvas slice for one-shot storage migrations')
  }
  if (graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/storyboardWidgetManagerSlice'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to avoid eagerly importing the full storyboard widget manager slice for default registry seeding')
  }
  if (graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/graphViewSlice'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to avoid eagerly importing the full graph view slice for pinned semantics migration')
  }
  if (graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/uiSettingsSlice'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to avoid eagerly importing the full ui settings slice for session tab initialization')
  }
  if (!graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/canvasSliceStorageMigrations'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to import canvas storage migrations through the narrow bootstrap helper module')
  }
  if (!graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/storyboardWidgetManagerRegistryPersistence'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to import storyboard widget registry seeding through the narrow registry persistence helper module')
  }
  if (!graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/graphViewPinnedSemanticsMigration'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to import graph view pinned semantics migration through the narrow bootstrap helper module')
  }
  if (!graphStoreBootstrapRuntimeText.includes("from '@/hooks/store/uiSettingsSliceSession'")) {
    throw new Error('expected GraphStoreBootstrapRuntime to import session tab initialization through the narrow ui settings session helper module')
  }
  if (graphStoreBootstrapRuntimeText.includes('kg:debug:markdownEmptyTrace')) {
    throw new Error('expected GraphStoreBootstrapRuntime to avoid owning the markdown-empty debug trace subscription after the split')
  }
  if (graphStoreBootstrapRuntimeText.includes('__KG_MARKDOWN_EMPTY_TRACE__')) {
    throw new Error('expected GraphStoreBootstrapRuntime to avoid owning the debug trace buffer after the split')
  }

  const graphStoreRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'GraphStoreRuntime.tsx'), 'utf8')
  if (!graphStoreRuntimeText.includes('<GraphStoreMarkdownEmptyTraceDebugRuntime />')) {
    throw new Error('expected GraphStoreRuntime to compose the markdown-empty debug runtime separately from the eager bootstrap runtime')
  }

  const graphStoreMarkdownEmptyTraceDebugRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'GraphStoreMarkdownEmptyTraceDebugRuntime.tsx'), 'utf8')
  if (!graphStoreMarkdownEmptyTraceDebugRuntimeText.includes("kg:debug:markdownEmptyTrace")) {
    throw new Error('expected GraphStoreMarkdownEmptyTraceDebugRuntime to own the markdown-empty debug localStorage gate after the split')
  }
  if (!graphStoreMarkdownEmptyTraceDebugRuntimeText.includes('__KG_MARKDOWN_EMPTY_TRACE__')) {
    throw new Error('expected GraphStoreMarkdownEmptyTraceDebugRuntime to own the shared debug trace buffer after the split')
  }
  if (!graphStoreMarkdownEmptyTraceDebugRuntimeText.includes("new Error('markdownDocumentText emptied')")) {
    throw new Error('expected GraphStoreMarkdownEmptyTraceDebugRuntime to keep the markdown-empty stack trace capture after the split')
  }

  const canvasSliceStorageMigrationsText = readFileSync(resolve(root, 'src', 'hooks', 'store', 'canvasSliceStorageMigrations.ts'), 'utf8')
  if (!canvasSliceStorageMigrationsText.includes('export const planCanvasSliceStorageMigrations')) {
    throw new Error('expected canvasSliceStorageMigrations to own the canvas storage migration plan after the bootstrap import slimming pass')
  }
  if (!canvasSliceStorageMigrationsText.includes('export const applyCanvasSliceStorageMigrations')) {
    throw new Error('expected canvasSliceStorageMigrations to own the one-shot canvas storage migration apply helper after the bootstrap import slimming pass')
  }

  const storyboardWidgetManagerRegistryPersistenceText = readFileSync(resolve(root, 'src', 'hooks', 'store', 'storyboardWidgetManagerRegistryPersistence.ts'), 'utf8')
  if (!storyboardWidgetManagerRegistryPersistenceText.includes('export const planStoryboardWidgetManagerDefaultRegistrySeed')) {
    throw new Error('expected storyboardWidgetManagerRegistryPersistence to own the default widget registry seed plan after the bootstrap import slimming pass')
  }
  if (!storyboardWidgetManagerRegistryPersistenceText.includes('export const applyStoryboardWidgetManagerDefaultRegistrySeed')) {
    throw new Error('expected storyboardWidgetManagerRegistryPersistence to own the one-shot widget registry seed apply helper after the bootstrap import slimming pass')
  }

  const graphViewPinnedSemanticsMigrationText = readFileSync(resolve(root, 'src', 'hooks', 'store', 'graphViewPinnedSemanticsMigration.ts'), 'utf8')
  if (!graphViewPinnedSemanticsMigrationText.includes('export const planGraphViewPinnedSemanticsMigration')) {
    throw new Error('expected graphViewPinnedSemanticsMigration to own the pinned semantics migration plan after the bootstrap import slimming pass')
  }
  if (!graphViewPinnedSemanticsMigrationText.includes('export const applyGraphViewPinnedSemanticsMigration')) {
    throw new Error('expected graphViewPinnedSemanticsMigration to own the one-shot pinned semantics migration apply helper after the bootstrap import slimming pass')
  }

  const graphStoreDocumentUiRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'GraphStoreDocumentUiRuntime.tsx'), 'utf8')
  if (!graphStoreDocumentUiRuntimeText.includes('<GraphStoreDocumentUiRestoreRuntime />')) {
    throw new Error('expected GraphStoreDocumentUiRuntime to keep per-document UI restore eager after the persist split')
  }
  if (!graphStoreDocumentUiRuntimeText.includes('const GraphStoreDocumentUiPersistRuntimeLazy = React.lazy')) {
    throw new Error('expected GraphStoreDocumentUiRuntime to lazy-load the per-document UI persistence runtime')
  }
  if (!graphStoreDocumentUiRuntimeText.includes("import('@/features/canvas/GraphStoreDocumentUiPersistRuntime')")) {
    throw new Error('expected GraphStoreDocumentUiRuntime to import the persistence runtime only through the lazy boundary')
  }

  const graphStoreDocumentUiPersistRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'GraphStoreDocumentUiPersistRuntime.tsx'), 'utf8')
  if (!graphStoreDocumentUiPersistRuntimeText.includes("from '@/features/canvas/graphStoreDocumentUiPersistLifecycle'")) {
    throw new Error('expected GraphStoreDocumentUiPersistRuntime to delegate persist lifecycle mounting through the dedicated lifecycle helper after the cleanup split')
  }
  if (!graphStoreDocumentUiPersistRuntimeText.includes('return mountGraphStoreDocumentUiPersistLifecycle()')) {
    throw new Error('expected GraphStoreDocumentUiPersistRuntime to remain a thin lazy shell that delegates lifecycle mounting after the cleanup split')
  }

  const graphStoreDocumentUiPersistStateText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiPersistState.ts'), 'utf8')
  if (!graphStoreDocumentUiPersistStateText.includes('export const selectGraphStoreDocumentUiPersistSnapshot')) {
    throw new Error('expected graphStoreDocumentUiPersistState to own store snapshot shaping after the cleanup split')
  }
  if (!graphStoreDocumentUiPersistStateText.includes('export const buildPendingDocumentUiPersistStateFromSnapshot')) {
    throw new Error('expected graphStoreDocumentUiPersistState to own pending-state construction from snapshots after the cleanup split')
  }
  if (!graphStoreDocumentUiPersistStateText.includes('export const buildPendingDocumentUiPersistSignature')) {
    throw new Error('expected graphStoreDocumentUiPersistState to own pending-state signature derivation after the cleanup split')
  }

  const graphStoreDocumentUiPersistLifecycleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiPersistLifecycle.ts'), 'utf8')
  if (!graphStoreDocumentUiPersistLifecycleText.includes('scheduleWorkspaceSyncTask(')) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to own deferred per-document UI persistence scheduling after the cleanup split')
  }
  if (!graphStoreDocumentUiPersistLifecycleText.includes('graphStoreDocumentUiRuntimeShared.restoring')) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to honor the shared restore guard after the cleanup split')
  }
  if (!graphStoreDocumentUiPersistLifecycleText.includes('graphStoreDocumentUiRuntimeShared.scheduleCurrentStatePersist = scheduleCurrentStatePersist')) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to publish the shared post-restore persistence callback after the cleanup split')
  }
  if (!graphStoreDocumentUiPersistLifecycleText.includes("from '@/features/canvas/graphStoreDocumentUiPersistState'")) {
    throw new Error('expected graphStoreDocumentUiPersistLifecycle to delegate persist snapshot/build logic through the shared persist-state helper after the cleanup split')
  }

  const graphStoreDocumentUiRestoreRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'GraphStoreDocumentUiRestoreRuntime.tsx'), 'utf8')
  if (!graphStoreDocumentUiRestoreRuntimeText.includes("from '@/features/canvas/graphStoreDocumentUiRestoreLifecycle'")) {
    throw new Error('expected GraphStoreDocumentUiRestoreRuntime to delegate restore lifecycle mounting through the dedicated lifecycle helper after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreRuntimeText.includes('return mountGraphStoreDocumentUiRestoreLifecycle()')) {
    throw new Error('expected GraphStoreDocumentUiRestoreRuntime to remain a thin eager shell that delegates lifecycle mounting after the cleanup split')
  }

  const graphStoreDocumentUiRestoreLifecycleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreLifecycle.ts'), 'utf8')
  if (!graphStoreDocumentUiRestoreLifecycleText.includes('applySavedDocumentUiPresentationState(api, saved)')) {
    throw new Error('expected graphStoreDocumentUiRestoreLifecycle to delegate presentation restore through the shared restore helper after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreLifecycleText.includes('applySavedDocumentUiSelectionState(api, saved)')) {
    throw new Error('expected graphStoreDocumentUiRestoreLifecycle to delegate selection replay through the shared restore helper after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreLifecycleText.includes('graphStoreDocumentUiRuntimeShared.scheduleCurrentStatePersist?.()')) {
    throw new Error('expected graphStoreDocumentUiRestoreLifecycle to own the post-restore persistence handoff after the cleanup split')
  }

  const canvasStartupRuntimesText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasStartupRuntimes.tsx'), 'utf8')
  if (!canvasStartupRuntimesText.includes('<SourceFilesPersistenceBootstrap />')) {
    throw new Error('expected CanvasStartupRuntimes to keep SourceFilesPersistenceBootstrap mounted eagerly in the startup shell after the cleanup split')
  }
  if (!canvasStartupRuntimesText.includes('<CanvasStartupSsotBridgeRuntime />')) {
    throw new Error('expected CanvasStartupRuntimes to delegate deferred SSOT bridge loading through the dedicated startup bridge runtime after the cleanup split')
  }

  const canvasStartupSsotBridgeRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasStartupSsotBridgeRuntime.tsx'), 'utf8')
  if (!canvasStartupSsotBridgeRuntimeText.includes("import('@/features/ssot/SsotEventBridge')")) {
    throw new Error('expected CanvasStartupSsotBridgeRuntime to preserve the deferred SSOT bridge import after the cleanup split')
  }

  const graphStoreDocumentUiRestoreHelpersText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreHelpers.ts'), 'utf8')
  if (!graphStoreDocumentUiRestoreHelpersText.includes('export function applySavedDocumentUiPresentationState')) {
    throw new Error('expected graphStoreDocumentUiRestoreHelpers to own presentation restore behavior after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreHelpersText.includes('export function applySavedDocumentUiSelectionState')) {
    throw new Error('expected graphStoreDocumentUiRestoreHelpers to own selection replay behavior after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreHelpersText.includes("from '@/features/canvas/graphStoreDocumentUiRestoreState'")) {
    throw new Error('expected graphStoreDocumentUiRestoreHelpers to consume normalized restore state through the dedicated restore-state helper module')
  }
  if (!graphStoreDocumentUiRestoreHelpersText.includes("from '@/features/canvas/graphStoreDocumentUiRestorePlan'")) {
    throw new Error('expected graphStoreDocumentUiRestoreHelpers to consume a dedicated presentation restore plan through the restore-plan helper module')
  }
  if (!graphStoreDocumentUiRestoreHelpersText.includes("from '@/features/canvas/graphStoreDocumentUiRestoreWrites'")) {
    throw new Error('expected graphStoreDocumentUiRestoreHelpers to consume dedicated restore write helpers through the restore-writes module')
  }

  const graphStoreDocumentUiRestorePlanText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiRestorePlan.ts'), 'utf8')
  if (!graphStoreDocumentUiRestorePlanText.includes('export function buildSavedDocumentUiPresentationPlan')) {
    throw new Error('expected graphStoreDocumentUiRestorePlan to own presentation restore planning after the cleanup split')
  }
  if (!graphStoreDocumentUiRestorePlanText.includes('export function buildSavedDocumentUiModeState')) {
    throw new Error('expected graphStoreDocumentUiRestorePlan to own normalized mode-state derivation after the cleanup split')
  }

  const graphStoreDocumentUiRestoreWritesText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreWrites.ts'), 'utf8')
  if (!graphStoreDocumentUiRestoreWritesText.includes('export function applySavedDocumentUiModeStateWrites')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own saved mode-state writes after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreWritesText.includes('export function applySavedDocumentUiViewStateWrites')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own view-state writes after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreWritesText.includes('export function applySavedDocumentUiSelectionStateWrites')) {
    throw new Error('expected graphStoreDocumentUiRestoreWrites to own selection replay writes after the cleanup split')
  }

  const graphStoreDocumentUiRestoreStateText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'graphStoreDocumentUiRestoreState.ts'), 'utf8')
  if (!graphStoreDocumentUiRestoreStateText.includes('export function buildSavedDocumentUiViewState')) {
    throw new Error('expected graphStoreDocumentUiRestoreState to own normalized view-state derivation after the cleanup split')
  }
  if (!graphStoreDocumentUiRestoreStateText.includes('export function buildSavedDocumentUiSelectionState')) {
    throw new Error('expected graphStoreDocumentUiRestoreState to own normalized selection-state derivation after the cleanup split')
  }

  const canvasSyncRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasSyncRuntime.tsx'), 'utf8')
  if (canvasSyncRuntimeText.includes("import { createTabSync, buildEnvelope } from '@/lib/tabSync'")) {
    throw new Error('expected CanvasSyncRuntime shell to avoid eagerly importing tab-sync transport helpers into the default boot path')
  }
  if (canvasSyncRuntimeText.includes("import { dispatchRuntimeFitIntentSoon, dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'")) {
    throw new Error('expected CanvasSyncRuntime shell to avoid eagerly importing embedded-preview zoom runtime helpers into the default boot path')
  }
  if (!canvasSyncRuntimeText.includes('const CanvasTabSyncRuntimeLazy = React.lazy')) {
    throw new Error('expected CanvasSyncRuntime to lazy-load CanvasTabSyncRuntime behind deferred sync readiness and tab-sync enablement')
  }
  if (!canvasSyncRuntimeText.includes('const CanvasEmbeddedPreviewRuntimeLazy = React.lazy')) {
    throw new Error('expected CanvasSyncRuntime to lazy-load CanvasEmbeddedPreviewRuntime behind deferred sync readiness and embedded preview activation')
  }
  if (!canvasSyncRuntimeText.includes("if (msg.kind !== 'kg-preview-sync') return")) {
    throw new Error('expected CanvasSyncRuntime shell to keep the first embedded-preview activation listener for inbound kg-preview-sync messages')
  }
  if (!canvasSyncRuntimeText.includes("from '@/features/canvas/canvasPreviewSyncInbound'")) {
    throw new Error('expected CanvasSyncRuntime shell to delegate inbound preview payload application through the shared preview-sync helper after the cleanup split')
  }

  const canvasTabSyncRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasTabSyncRuntime.tsx'), 'utf8')
  if (canvasTabSyncRuntimeText.includes("from '@/lib/tabSync'")) {
    throw new Error('expected CanvasTabSyncRuntime to delegate tab-sync transport mount details through the shared transport lifecycle helper after the cleanup split')
  }
  if (canvasTabSyncRuntimeText.includes('scheduleWorkspaceSyncTask(')) {
    throw new Error('expected CanvasTabSyncRuntime to delegate outbound scheduler glue through the shared tab-sync schedule helper after the cleanup split')
  }
  if (canvasTabSyncRuntimeText.includes('cancelWorkspaceSyncTask(')) {
    throw new Error('expected CanvasTabSyncRuntime to delegate publish task cancellation through the shared publish effect lifecycle helper after the cleanup split')
  }
  if (canvasTabSyncRuntimeText.includes('React.useRef(')) {
    throw new Error('expected CanvasTabSyncRuntime to delegate tab-sync local ref initialization through the shared ref hook after the cleanup split')
  }
  if (canvasTabSyncRuntimeText.includes('React.useEffect(')) {
    throw new Error('expected CanvasTabSyncRuntime to delegate effect composition through the shared CanvasTabSyncEffects helper after the cleanup split')
  }
  if (!canvasTabSyncRuntimeText.includes("from '@/features/canvas/canvasTabSyncStoreSelector'")) {
    throw new Error('expected CanvasTabSyncRuntime to delegate its store selector bundle through the shared tab-sync store selector helper after the cleanup split')
  }
  if (!canvasTabSyncRuntimeText.includes("from '@/features/canvas/useCanvasTabSyncRefs'")) {
    throw new Error('expected CanvasTabSyncRuntime to delegate local ref initialization through the shared tab-sync ref hook after the cleanup split')
  }
  if (!canvasTabSyncRuntimeText.includes("from '@/features/canvas/CanvasTabSyncEffects'")) {
    throw new Error('expected CanvasTabSyncRuntime to delegate effect composition through the shared CanvasTabSyncEffects helper after the cleanup split')
  }
  if (!canvasTabSyncRuntimeText.includes("from '@/features/canvas/canvasTabSyncRuntimeContract'")) {
    throw new Error('expected CanvasTabSyncRuntime to delegate the shared runtime/effects prop contract through the tab-sync runtime contract helper after the cleanup split')
  }

  const canvasTabSyncEffectsText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasTabSyncEffects.tsx'), 'utf8')
  if (!canvasTabSyncEffectsText.includes('export function CanvasTabSyncEffects')) {
    throw new Error('expected CanvasTabSyncEffects to own the tab-sync effect composition after the cleanup split')
  }
  if (!canvasTabSyncEffectsText.includes("from '@/features/canvas/canvasTabSyncTransportLifecycle'")) {
    throw new Error('expected CanvasTabSyncEffects to delegate transport mount through the shared transport lifecycle helper after the cleanup split')
  }
  if (!canvasTabSyncEffectsText.includes("from '@/features/canvas/canvasTabSyncPublishEffectLifecycle'")) {
    throw new Error('expected CanvasTabSyncEffects to delegate publish effect wiring through the shared publish effect lifecycle helper after the cleanup split')
  }
  if (!canvasTabSyncEffectsText.includes("from '@/features/canvas/canvasTabSyncRuntimeContract'")) {
    throw new Error('expected CanvasTabSyncEffects to reuse the shared tab-sync runtime/effects prop contract after the cleanup split')
  }
  if (!canvasTabSyncEffectsText.includes("from '@/features/canvas/canvasTabSyncEffectSelectors'")) {
    throw new Error('expected CanvasTabSyncEffects to delegate effect prop shaping through the shared tab-sync effect selector helper after the cleanup split')
  }

  const canvasTabSyncEffectSelectorsText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncEffectSelectors.ts'), 'utf8')
  if (!canvasTabSyncEffectSelectorsText.includes('export function selectCanvasTabSyncTransportEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to own transport effect prop shaping after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('export function selectCanvasTabSelectionPublishEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to own selection publish effect prop shaping after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('export function selectCanvasTabSchemaPublishEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to own schema publish effect prop shaping after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('export function selectCanvasTabSyncTransportEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to own transport effect dependency shaping after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('export function selectCanvasTabSelectionPublishEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to own selection publish effect dependency shaping after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('export function selectCanvasTabSchemaPublishEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to own schema publish effect dependency shaping after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSharedPublishEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize shared selection/schema publish prop shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSharedPublishEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize shared selection/schema publish dependency shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSharedTransportEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize shared transport prop shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSharedBaseEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize shared base-field object assembly through a single local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabTransportEffectSpecificProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize transport-specific prop shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSelectionPublishEffectSpecificProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize selection publish-specific prop shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSchemaPublishEffectSpecificProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize schema publish-specific prop shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabTransportEffectSpecificDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize transport-specific dependency shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSelectionPublishEffectSpecificDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize selection publish-specific dependency shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('function selectCanvasTabSchemaPublishEffectSpecificDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize schema publish-specific dependency shaping through a local builder after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSharedBaseEffectProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize shared transport/publish base-field typing through a single local base type after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncTransportEffectSpecificProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize transport-specific prop typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSelectionPublishEffectSpecificProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize selection publish-specific prop typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSchemaPublishEffectSpecificProps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize schema publish-specific prop typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncTransportEffectSpecificDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize transport-specific dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSelectionPublishEffectSpecificDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize selection publish-specific dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSchemaPublishEffectSpecificDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize schema publish-specific dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncTransportEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize transport dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSelectionPublishEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize selection publish dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSchemaPublishEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize schema publish dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes('type CanvasTabSyncSharedPublishEffectDeps')) {
    throw new Error('expected canvasTabSyncEffectSelectors to centralize shared selection/schema publish dependency tuple typing through a local alias after the cleanup split')
  }
  if (!canvasTabSyncEffectSelectorsText.includes("from '@/features/canvas/canvasTabSyncRuntimeContract'")) {
    throw new Error('expected canvasTabSyncEffectSelectors to reuse the shared tab-sync runtime/effects prop contract after the cleanup split')
  }

  const canvasTabSyncRuntimeContractText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncRuntimeContract.ts'), 'utf8')
  if (!canvasTabSyncRuntimeContractText.includes('export type CanvasTabSyncRuntimeProps')) {
    throw new Error('expected canvasTabSyncRuntimeContract to own the shared tab-sync runtime/effects prop type after the cleanup split')
  }
  if (!canvasTabSyncRuntimeContractText.includes('export function buildCanvasTabSyncRuntimeProps')) {
    throw new Error('expected canvasTabSyncRuntimeContract to own building the shared tab-sync runtime/effects prop bundle after the cleanup split')
  }
  if (!canvasTabSyncRuntimeContractText.includes("from '@/features/canvas/canvasTabSyncStoreSelector'")) {
    throw new Error('expected canvasTabSyncRuntimeContract to reuse the shared tab-sync store snapshot contract after the cleanup split')
  }
  if (!canvasTabSyncRuntimeContractText.includes("from '@/features/canvas/useCanvasTabSyncRefs'")) {
    throw new Error('expected canvasTabSyncRuntimeContract to reuse the shared tab-sync ref bundle contract after the cleanup split')
  }

  const canvasTabSyncPublishPlanText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncPublishPlan.ts'), 'utf8')
  if (!canvasTabSyncPublishPlanText.includes('export const buildCanvasTabSelectionPublishPlan')) {
    throw new Error('expected canvasTabSyncPublishPlan to own selection publish planning after the cleanup split')
  }
  if (!canvasTabSyncPublishPlanText.includes('export const buildCanvasTabSchemaPublishPlan')) {
    throw new Error('expected canvasTabSyncPublishPlan to own schema publish planning after the cleanup split')
  }
  if (!canvasTabSyncPublishPlanText.includes('export const canPublishCanvasTabSync')) {
    throw new Error('expected canvasTabSyncPublishPlan to own shared tab-sync publish gating after the cleanup split')
  }

  const canvasTabSyncStoreSelectorText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncStoreSelector.ts'), 'utf8')
  if (!canvasTabSyncStoreSelectorText.includes('export function selectCanvasTabSyncStoreSnapshot')) {
    throw new Error('expected canvasTabSyncStoreSelector to own the tab-sync store selector bundle after the cleanup split')
  }
  if (!canvasTabSyncStoreSelectorText.includes('export type CanvasTabSyncStoreSnapshot')) {
    throw new Error('expected canvasTabSyncStoreSelector to own the shared tab-sync store snapshot type after the cleanup split')
  }

  const useCanvasTabSyncRefsText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'useCanvasTabSyncRefs.ts'), 'utf8')
  if (!useCanvasTabSyncRefsText.includes('export function useCanvasTabSyncRefs')) {
    throw new Error('expected useCanvasTabSyncRefs to own the tab-sync local ref initialization after the cleanup split')
  }
  if (!useCanvasTabSyncRefsText.includes('export type CanvasTabSyncRuntimeRefs')) {
    throw new Error('expected useCanvasTabSyncRefs to own the shared tab-sync ref bundle type after the cleanup split')
  }
  if (!useCanvasTabSyncRefsText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected useCanvasTabSyncRefs to reuse the shared tab-sync ref contracts after the cleanup split')
  }

  const canvasTabSyncInboundText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncInbound.ts'), 'utf8')
  if (!canvasTabSyncInboundText.includes('export const canApplyCanvasTabSyncInboundMessage')) {
    throw new Error('expected canvasTabSyncInbound to own inbound graph/tab message gating after the cleanup split')
  }
  if (!canvasTabSyncInboundText.includes('export function applyCanvasTabSyncInboundMessage')) {
    throw new Error('expected canvasTabSyncInbound to own inbound selection/schema application after the cleanup split')
  }
  if (!canvasTabSyncInboundText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected canvasTabSyncInbound to reuse the shared tab-sync ref contract after the cleanup split')
  }

  const canvasTabSyncInboundLifecycleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncInboundLifecycle.ts'), 'utf8')
  if (!canvasTabSyncInboundLifecycleText.includes('export function mountCanvasTabSyncInboundSubscription')) {
    throw new Error('expected canvasTabSyncInboundLifecycle to own inbound subscription boilerplate after the cleanup split')
  }
  if (!canvasTabSyncInboundLifecycleText.includes("from '@/features/canvas/canvasTabSyncInbound'")) {
    throw new Error('expected canvasTabSyncInboundLifecycle to delegate inbound gating and apply through the shared tab-sync inbound helper after the cleanup split')
  }
  if (!canvasTabSyncInboundLifecycleText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected canvasTabSyncInboundLifecycle to reuse the shared tab-sync ref contract after the cleanup split')
  }

  const canvasTabSyncTransportLifecycleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncTransportLifecycle.ts'), 'utf8')
  if (!canvasTabSyncTransportLifecycleText.includes('export function mountCanvasTabSyncTransportLifecycle')) {
    throw new Error('expected canvasTabSyncTransportLifecycle to own transport mount and teardown after the cleanup split')
  }
  if (!canvasTabSyncTransportLifecycleText.includes("import { createTabSync } from '@/lib/tabSync'")) {
    throw new Error('expected canvasTabSyncTransportLifecycle to own createTabSync mount details after the cleanup split')
  }
  if (!canvasTabSyncTransportLifecycleText.includes("from '@/features/canvas/canvasTabSyncInboundLifecycle'")) {
    throw new Error('expected canvasTabSyncTransportLifecycle to delegate inbound subscription wiring through the shared inbound lifecycle helper after the cleanup split')
  }
  if (!canvasTabSyncTransportLifecycleText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected canvasTabSyncTransportLifecycle to reuse the shared tab-sync ref contract after the cleanup split')
  }

  const canvasTabSyncOutboundText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncOutbound.ts'), 'utf8')
  if (!canvasTabSyncOutboundText.includes('export function publishCanvasTabSelectionMessage')) {
    throw new Error('expected canvasTabSyncOutbound to own outbound selection message publishing after the cleanup split')
  }
  if (!canvasTabSyncOutboundText.includes('export function publishCanvasTabSchemaMessage')) {
    throw new Error('expected canvasTabSyncOutbound to own outbound schema message publishing after the cleanup split')
  }

  const canvasTabSyncScheduleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncSchedule.ts'), 'utf8')
  if (!canvasTabSyncScheduleText.includes('export function scheduleCanvasTabSyncPublish')) {
    throw new Error('expected canvasTabSyncSchedule to own outbound scheduler glue after the cleanup split')
  }
  if (!canvasTabSyncScheduleText.includes('WORKSPACE_SYNC_SCOPE_CANVAS_TAB_SYNC_RUNTIME_PERSISTENCE')) {
    throw new Error('expected canvasTabSyncSchedule to own the shared tab-sync runtime-persistence scope key after the cleanup split')
  }

  const canvasTabSyncPublishLifecycleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncPublishLifecycle.ts'), 'utf8')
  if (!canvasTabSyncPublishLifecycleText.includes('export function runCanvasTabSelectionPublishLifecycle')) {
    throw new Error('expected canvasTabSyncPublishLifecycle to own selection effect boilerplate after the cleanup split')
  }
  if (!canvasTabSyncPublishLifecycleText.includes('export function runCanvasTabSchemaPublishLifecycle')) {
    throw new Error('expected canvasTabSyncPublishLifecycle to own schema effect boilerplate after the cleanup split')
  }
  if (!canvasTabSyncPublishLifecycleText.includes("from '@/features/canvas/canvasTabSyncPublishPlan'")) {
    throw new Error('expected canvasTabSyncPublishLifecycle to own selection/schema publish planning after the cleanup split')
  }
  if (!canvasTabSyncPublishLifecycleText.includes("from '@/features/canvas/canvasTabSyncOutbound'")) {
    throw new Error('expected canvasTabSyncPublishLifecycle to delegate outbound message assembly through the shared tab-sync outbound helper after the cleanup split')
  }
  if (!canvasTabSyncPublishLifecycleText.includes("from '@/features/canvas/canvasTabSyncSchedule'")) {
    throw new Error('expected canvasTabSyncPublishLifecycle to delegate scheduler glue through the shared tab-sync schedule helper after the cleanup split')
  }
  if (!canvasTabSyncPublishLifecycleText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected canvasTabSyncPublishLifecycle to reuse the shared tab-sync ref contract after the cleanup split')
  }

  const canvasTabSyncPublishEffectLifecycleText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncPublishEffectLifecycle.ts'), 'utf8')
  if (!canvasTabSyncPublishEffectLifecycleText.includes('export function mountCanvasTabSelectionPublishEffect')) {
    throw new Error('expected canvasTabSyncPublishEffectLifecycle to own selection publish effect cleanup after the cleanup split')
  }
  if (!canvasTabSyncPublishEffectLifecycleText.includes('export function mountCanvasTabSchemaPublishEffect')) {
    throw new Error('expected canvasTabSyncPublishEffectLifecycle to own schema publish effect cleanup after the cleanup split')
  }
  if (!canvasTabSyncPublishEffectLifecycleText.includes("from '@/features/canvas/canvasTabSyncPublishLifecycle'")) {
    throw new Error('expected canvasTabSyncPublishEffectLifecycle to delegate publish scheduling logic through the shared publish lifecycle helper after the cleanup split')
  }
  if (!canvasTabSyncPublishEffectLifecycleText.includes("from '@/lib/async/workspaceSyncScheduler'")) {
    throw new Error('expected canvasTabSyncPublishEffectLifecycle to own publish task cancellation after the cleanup split')
  }
  if (!canvasTabSyncPublishEffectLifecycleText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected canvasTabSyncPublishEffectLifecycle to reuse the shared tab-sync ref contract after the cleanup split')
  }

  if (!canvasTabSyncPublishPlanText.includes("from '@/features/canvas/canvasTabSyncShared'")) {
    throw new Error('expected canvasTabSyncPublishPlan to reuse the shared tab-sync selection snapshot contract after the cleanup split')
  }

  const canvasTabSyncSharedText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasTabSyncShared.ts'), 'utf8')
  if (!canvasTabSyncSharedText.includes('export type CanvasTabSyncSelectionSnapshot')) {
    throw new Error('expected canvasTabSyncShared to own the shared selection snapshot contract after the cleanup split')
  }
  if (!canvasTabSyncSharedText.includes('export type CanvasTabSyncRef')) {
    throw new Error('expected canvasTabSyncShared to own the shared sync ref contract after the cleanup split')
  }

  const canvasEmbeddedPreviewRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasEmbeddedPreviewRuntime.tsx'), 'utf8')
  if (!canvasEmbeddedPreviewRuntimeText.includes("import { dispatchRuntimeFitIntentSoon, dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'")) {
    throw new Error('expected CanvasEmbeddedPreviewRuntime to own the embedded-preview zoom runtime helpers after the split')
  }
  if (!canvasEmbeddedPreviewRuntimeText.includes('WORKSPACE_SYNC_SCOPE_CANVAS_PREVIEW_WRITEBACK_RUNTIME_PERSISTENCE')) {
    throw new Error('expected CanvasEmbeddedPreviewRuntime to own the shared preview writeback runtime-persistence scope key after the split')
  }

  const canvasPreviewSyncInboundText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasPreviewSyncInbound.ts'), 'utf8')
  if (!canvasPreviewSyncInboundText.includes('export function applyCanvasPreviewSyncPayload')) {
    throw new Error('expected canvasPreviewSyncInbound to own inbound preview payload application after the cleanup split')
  }
  if (!canvasPreviewSyncInboundText.includes('selectionSource: \'editor\'')) {
    throw new Error('expected canvasPreviewSyncInbound to own inbound preview selection replay after the cleanup split')
  }

  const canvasHotkeysRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasHotkeysRuntime.tsx'), 'utf8')
  if (canvasHotkeysRuntimeText.includes("import usePersistedBoolean from '@/features/hooks/usePersistedBoolean'")) {
    throw new Error('expected CanvasHotkeysRuntime to avoid eagerly importing persisted spotlight state into the default boot path')
  }
  if (canvasHotkeysRuntimeText.includes("import { LS_KEYS } from '@/lib/config'")) {
    throw new Error('expected CanvasHotkeysRuntime to avoid eagerly importing spotlight local-storage config into the default boot path')
  }
  if (!canvasHotkeysRuntimeText.includes('const CanvasLaunchSpotlightHotkeyRuntimeLazy = React.lazy')) {
    throw new Error('expected CanvasHotkeysRuntime to lazy-load spotlight hotkeys only when the shortcut is enabled')
  }
  if (!canvasHotkeysRuntimeText.includes("from '@/features/canvas/canvasHotkeyHandlers'")) {
    throw new Error('expected CanvasHotkeysRuntime to delegate shared hotkey domains through dedicated canvas hotkey handlers after the cleanup split')
  }
  if (!canvasHotkeysRuntimeText.includes('handleCanvasPointerModeHotkey(e)')) {
    throw new Error('expected CanvasHotkeysRuntime to delegate shared design-surface pointer hotkeys through the hotkey handler module')
  }
  if (!canvasHotkeysRuntimeText.includes('handleCanvasZoomHotkey(e)')) {
    throw new Error('expected CanvasHotkeysRuntime to delegate shared zoom shortcuts through the hotkey handler module')
  }

  const canvasLaunchSpotlightHotkeyRuntimeText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'CanvasLaunchSpotlightHotkeyRuntime.tsx'), 'utf8')
  if (!canvasLaunchSpotlightHotkeyRuntimeText.includes("import usePersistedBoolean from '@/features/hooks/usePersistedBoolean'")) {
    throw new Error('expected CanvasLaunchSpotlightHotkeyRuntime to own persisted spotlight state after the split')
  }
  if (!canvasLaunchSpotlightHotkeyRuntimeText.includes('setEnableLaunchSpotlight(true)')) {
    throw new Error('expected CanvasLaunchSpotlightHotkeyRuntime to own the spotlight activation shortcut after the split')
  }

  const canvasHotkeyHandlersText = readFileSync(resolve(root, 'src', 'features', 'canvas', 'canvasHotkeyHandlers.ts'), 'utf8')
  if (!canvasHotkeyHandlersText.includes("lowerKey !== 'v' && lowerKey !== 'h'")) {
    throw new Error('expected canvasHotkeyHandlers to own shared design-surface pointer hotkey matching after the cleanup split')
  }
  if (!canvasHotkeyHandlersText.includes("void dispatchRuntimeZoomAction(type)")) {
    throw new Error('expected canvasHotkeyHandlers to own shared zoom shortcut dispatch after the cleanup split')
  }

  const mermaidRuntimeText = readFileSync(resolve(root, 'src', 'lib', 'mermaid', 'mermaidRuntime.ts'), 'utf8')
  if (mermaidRuntimeText.includes("import('@/lib/mermaid/mermaidElkRuntime')") || mermaidRuntimeText.includes('@mermaid-js/layout-elk')) {
    throw new Error('expected Mermaid runtime to exclude the oversized ELK renderer bundle')
  }
  if (!mermaidRuntimeText.includes("return 'standard'")) {
    throw new Error('expected Mermaid runtime to use the standard renderer branch')
  }

  const threeGraphSnapshotsText = readFileSync(resolve(root, 'src', 'lib', 'three', 'ThreeGraphSnapshots.ts'), 'utf8')
  if (!threeGraphSnapshotsText.includes("await import('three/examples/jsm/exporters/GLTFExporter.js')")) {
    throw new Error('expected ThreeGraph GLTF export path to lazy-load GLTFExporter')
  }

  const activeGraphDataText = readFileSync(resolve(root, 'src', 'hooks', 'active-graph-data', 'useActiveGraphRenderData.impl.ts'), 'utf8')
  if (activeGraphDataText.includes("from '@/lib/mermaid/mermaidFrontmatterGeometry'")) {
    throw new Error('expected useActiveGraphData to avoid static mermaidFrontmatterGeometry import on startup path')
  }
  if (!activeGraphDataText.includes("import('@/lib/mermaid/mermaidFrontmatterGeometry')")) {
    throw new Error('expected useActiveGraphData to lazy-load mermaidFrontmatterGeometry for frontmatter geometry application')
  }

  const inlineMarkdownGeoJsonText = readFileSync(resolve(root, 'src', 'features', 'geospatial', 'InlineMarkdownGeoJsonLayerMap.tsx'), 'utf8')
  if (!inlineMarkdownGeoJsonText.includes("from 'gympgrph/map-preview'")) {
    throw new Error('expected inline markdown GeoJSON preview to import the narrow gympgrph map-preview entry')
  }
  if (
    inlineMarkdownGeoJsonText.includes("colorForDataset, useMapLibreBasemap } from '@/lib/gympgrph/api'") ||
    inlineMarkdownGeoJsonText.includes("computeBoundsFromCollections, useMapLibreBasemap } from '@/lib/gympgrph/api'")
  ) {
    throw new Error('expected inline markdown GeoJSON preview to avoid routing preview helpers through the heavy gympgrph root entry')
  }

  const viteConfigText = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
  if (!viteConfigText.includes("nodeRequire.resolve('three/src/Three.js')")) {
    throw new Error('expected vite config to resolve three through its source barrel so coarse subchunks can split cleanly')
  }
  if (!viteConfigText.includes("nodeRequire.resolve('maplibre-gl/src/index.ts')")) {
    throw new Error('expected vite config to resolve maplibre through its source entry so subchunks can split cleanly')
  }
  if (!viteConfigText.includes("if (moduleId.includes('/node_modules/three/examples/')) return 'three-examples'")) {
    throw new Error('expected vite config to split three examples into a separate coarse lazy chunk')
  }
  if (!viteConfigText.includes("if (moduleId.includes('/node_modules/@react-three/fiber/')) return 'three-fiber'")) {
    throw new Error('expected vite config to split react-three-fiber from three core')
  }
  if (!viteConfigText.includes("if (moduleId.includes('/node_modules/three/')) return 'three-core'")) {
    throw new Error('expected vite config to keep three internals isolated in one coarse chunk')
  }
  if (
    viteConfigText.includes("return 'three-math'") ||
    viteConfigText.includes("return 'three-materials'") ||
    viteConfigText.includes("return 'three-geometries'") ||
    viteConfigText.includes("return 'three-scene-core'") ||
    viteConfigText.includes("return 'three-foundation'") ||
    viteConfigText.includes("return 'three-renderers'") ||
    viteConfigText.includes("return 'three-barrel'") ||
    viteConfigText.includes("return 'three-animation'") ||
    viteConfigText.includes("return 'three-loaders'") ||
    viteConfigText.includes("return 'three-audio'") ||
    viteConfigText.includes("return 'three-helpers'")
  ) {
    throw new Error('expected vite config to forbid fine-grained three internal subchunks because they can break evaluation order in production')
  }
  if (!viteConfigText.includes("if (moduleId.includes('/node_modules/maplibre-gl/')) return 'maplibre'")) {
    throw new Error('expected vite config to keep maplibre internals in one evaluation-safe coarse chunk')
  }
  if (/return 'maplibre-(?:render|source|shaders|core|ui|style|geo|util|data)'/.test(viteConfigText)) {
    throw new Error('expected vite config to forbid order-sensitive maplibre internal subchunks')
  }
  const genericSrcFallbackIndex = viteConfigText.indexOf("if (moduleId.includes('/src/')) return undefined")
  if (!viteConfigText.includes('chunkSizeWarningLimit: 3000')) {
    throw new Error('expected vite config chunk warning limit to match the intentional evaluation-safe coarse runtime budget')
  }
  if (genericSrcFallbackIndex < 0) {
    throw new Error('expected vite config to retain a generic src fallback so local app modules stay on Rollup defaults unless a safer source chunking strategy is reintroduced')
  }
  if (
    viteConfigText.includes("return 'graph-store'") ||
    viteConfigText.includes("return 'canvas-shell'") ||
    viteConfigText.includes("return 'panel-core'") ||
    viteConfigText.includes("return 'workspace-runtime'") ||
    viteConfigText.includes("return 'workspace-ui'") ||
    viteConfigText.includes("return 'toolbar'")
  ) {
    throw new Error('expected vite config to avoid fine-grained local src manual chunks because production evaluation order can break across circular app imports')
  }
  if (!viteConfigText.includes("if (moduleId.includes('/node_modules/monaco-editor/')) return 'monaco'")) {
    throw new Error('expected vite config to keep Monaco editor internals in one coarse chunk')
  }
  if (
    viteConfigText.includes("return 'monaco-language'") ||
    viteConfigText.includes("return 'monaco-standalone'") ||
    viteConfigText.includes("return 'monaco-contrib'") ||
    viteConfigText.includes("return 'monaco-editor-widget'") ||
    viteConfigText.includes("return 'monaco-editor-viewparts'") ||
    viteConfigText.includes("return 'monaco-editor-view'") ||
    viteConfigText.includes("return 'monaco-editor-controller'") ||
    viteConfigText.includes("return 'monaco-editor-browser-services'") ||
    viteConfigText.includes("return 'monaco-editor-browser'") ||
    viteConfigText.includes("return 'monaco-editor-model'") ||
    viteConfigText.includes("return 'monaco-editor-languages'") ||
    viteConfigText.includes("return 'monaco-editor-services'") ||
    viteConfigText.includes("return 'monaco-editor-common'") ||
    viteConfigText.includes("return 'monaco-platform'") ||
    viteConfigText.includes("return 'monaco-base-browser'") ||
    viteConfigText.includes("return 'monaco-base-common'") ||
    viteConfigText.includes("return 'monaco-editor-core'") ||
    viteConfigText.includes("return 'monaco-base'")
  ) {
    throw new Error('expected vite config to forbid fine-grained Monaco internal subchunks because they can break evaluation order in production')
  }
  if (!viteConfigText.includes("if (moduleId.includes('/node_modules/mermaid/')) return 'mermaid'")) {
    throw new Error('expected vite config to keep the Mermaid standard runtime in one coarse lazy chunk')
  }
  if (!viteConfigText.includes("name: 'knowgrph-strip-mermaid-architecture-detector'")) {
    throw new Error('expected vite config to strip the stock mermaid architecture detector from the standard runtime path')
  }
  if (!viteConfigText.includes("registerLazyLoadedDiagrams(detector_default, detector_default3);")) {
    throw new Error('expected vite config to patch mermaid core so architecture is not registered by default')
  }
  if (!viteConfigText.includes("(?:assets\\/)?mermaid-[^/]+\\.(?:js|css)$")) {
    throw new Error('expected vite modulePreload filtering to exclude relative and assets-prefixed mermaid chunk deps')
  }
  if (viteConfigText.includes('@mermaid-js/layout-elk') || viteConfigText.includes("return 'mermaid-elk-core'")) {
    throw new Error('expected vite config to exclude Mermaid ELK chunks from production output')
  }
}
