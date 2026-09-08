import { readFileSync } from 'node:fs'

const readUtf8 = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

export function testCardInlineTextEditorViewerSurfaceReusesMarkdownViewerWysiwygOwner() {
  const cardInlineEditor = readUtf8('../lib/cards/CardInlineTextEditor.tsx')
  const cardInlineEditingSurface = readUtf8('../lib/cards/CardInlineTextEditingSurface.tsx')
  const cardInlineEditorSupport = readUtf8('../lib/cards/CardInlineTextEditorSupport.ts')
  const viewerSurface = readUtf8('../lib/markdown-core/ui/MarkdownInlineTextEditSurface.tsx')
  const viewerModel = readUtf8('../lib/markdown-core/ui/markdownInlineTextEditModel.tsx')
  const contentEditableCore = readUtf8('../lib/markdown-core/ui/MarkdownContentEditableCore.tsx')
  const sharedContentEditableSurface = readUtf8('../lib/markdown-core/ui/markdownContentEditableSurface.ts')
  const markdownBlockEditSurface = readUtf8('../lib/markdown-core/ui/markdownBlockContainerCore.editSurfaceView.tsx')
  const markdownCaretProbe = readUtf8('../lib/markdown-core/ui/markdownBlockContainerCore.editOpenCaretProbe.ts')
  const markdownInlineEditHtml = readUtf8('../lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml.ts')
  const invocationTokens = readUtf8('../lib/markdown/invocationTokens.ts')
  const storyboardOverlay = readUtf8('../components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx')
  const storyboardTextSurface = readUtf8('../components/StoryboardWidgetCanvas/StoryboardCardTextEditSurface.tsx')
  if (!storyboardOverlay.includes('<StoryboardCardTextEditSurface')) throw new Error('expected overlay to delegate to the shared storyboard text surface')
  const storyboardValueEditor = readUtf8('../components/StoryboardWidget/StoryboardWidgetInlineValueEditor.tsx')
  const richMediaTextSurface = readUtf8('../components/RichMediaPanelTextSurface.tsx')
  const cardTextSurfaceFrame = readUtf8('../lib/cards/cardTextSurfaceFrame.ts')
  for (const snippet of [
    'MarkdownInlineTextEditSurface',
    'displaySourceValue',
    'editorSurface = \'viewer\'',
    "const useViewerEditSurface = editorSurface === 'viewer'",
    'focusMarkdownInlineTextSelectionSoon',
  ]) {
    if (!cardInlineEditor.includes(snippet)) {
      throw new Error(`expected CardInlineTextEditor to route the shared default edit path through the Viewer WYSIWYG surface: ${snippet}`)
    }
  }
  for (const [surfaceName, sourceText] of [
    ['MarkdownInlineTextEditSurface', viewerSurface],
    ['Editor Workspace Viewer', markdownBlockEditSurface],
  ] as const) {
    if (!sourceText.includes('MarkdownContentEditableCore')) {
      throw new Error(`expected ${surfaceName} to reuse the canonical Markdown contenteditable core`)
    }
  }
  for (const snippet of [
    'data-kg-markdown-contenteditable-core="1"',
    "aria-multiline={ariaMultiline ? 'true' : 'false'}",
    'MARKDOWN_EDIT_SURFACE_INTERACTION_PARITY_CLASS',
    'MARKDOWN_CONTENT_EDITABLE_PLACEHOLDER_CLASS',
    'preventInlineTokenSecondMouseDown',
    'stopInlineTextEditorDoubleClick',
  ]) {
    if (!contentEditableCore.includes(snippet)) {
      throw new Error(`expected canonical Markdown contenteditable core to own ${snippet}`)
    }
  }
  if (!cardInlineEditingSurface.includes('useViewerEditSurface ? draft : projectedEditorDisplayValue')) {
    throw new Error('expected CardInlineTextEditingSurface to preserve Viewer draft vs textarea display command-menu routing')
  }
  for (const snippet of [
    "editorSurface?: 'control' | 'viewer'",
    'displayValue?: string',
    'export const isElementEventTarget',
  ]) {
    if (!cardInlineEditorSupport.includes(snippet)) {
      throw new Error(`expected CardInlineTextEditorSupport to own shared Viewer WYSIWYG support snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    'rewriteRenderedInlineMediaForEditorHtml',
    'readFastInlineMarkdownDraft',
    'readInlineMediaEditorMarkdownText',
    'data-kg-card-inline-wysiwyg-virtual-media-chip',
    'data-kg-card-inline-wysiwyg-media-markdown',
    'data-kg-card-inline-wysiwyg-media-thumbnail',
    'INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_ATTR',
    'pendingViewerSelections',
  ]) {
    if (!viewerModel.includes(snippet)) {
      throw new Error(`expected markdownInlineTextEditModel to reuse Viewer edit initialization/serialization helpers: ${snippet}`)
    }
  }
  for (const snippet of ['MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS', 'MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS', "from './markdownInlineTextEditModel'"]) {
    if (!viewerSurface.includes(snippet)) throw new Error(`expected inline surface to reuse shared model and layout: ${snippet}`)
  }
  if (!markdownInlineEditHtml.includes('if (!segments.some(segment => segment.kind === \'token\')) return')) {
    throw new Error('expected shared Viewer inline-edit token rewriting to chip valid /, #, and @ tokens without requiring local card renderers')
  }
  if (!invocationTokens.includes('normalizeInvocationTokenSpacing') || !invocationTokens.includes('startsAfterAcceptedToken')) {
    throw new Error('expected shared invocation grammar to accept compact adjacent token runs while serializing canonical / # @ spacing')
  }
  for (const [surfaceName, sourceText] of [
    ['Storyboard card summary', storyboardTextSurface],
    ['Storyboard Widget value', storyboardValueEditor],
    ['Rich Media text', richMediaTextSurface],
  ] as const) {
    if (!sourceText.includes('editorSurface="viewer"')) {
      throw new Error(`expected ${surfaceName} editing to reuse the shared Viewer WYSIWYG surface`)
    }
  }
  for (const snippet of [
    'readMarkdownContentEditableCaretRangeFromPoint',
    'applyMarkdownContentEditableSelection',
    'MARKDOWN_EDIT_SURFACE_INTERACTION_PARITY_CLASS',
    'MARKDOWN_CONTENT_EDITABLE_PLACEHOLDER_CLASS',
  ]) {
    if (!sharedContentEditableSurface.includes(snippet)) {
      throw new Error(`expected neutral Markdown contenteditable owner to expose ${snippet}`)
    }
  }
  if (!markdownBlockEditSurface.includes("from './MarkdownContentEditableCore'")) {
    throw new Error('expected Editor Workspace Viewer blocks to reuse the canonical contenteditable core')
  }
  if (!markdownCaretProbe.includes('readMarkdownContentEditableCaretRangeFromPoint')) {
    throw new Error('expected Editor Workspace caret placement to reuse the neutral point-selection helper')
  }
  if (!storyboardTextSurface.includes('value={textModel.primaryRaw || card.slugline || \'\'}') || !storyboardTextSurface.includes('displayValue={textModel.primaryDisplay || card.slugline || \'\'}')) {
    throw new Error('expected Storyboard card summary edit mode to retain source-backed inline chips while read view remains media-free')
  }
  if (!cardTextSurfaceFrame.includes("export const CARD_TEXT_SURFACE_TEXT_CLASS_NAME") || !cardTextSurfaceFrame.includes('text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]') || !cardTextSurfaceFrame.includes('CARD_TEXT_SURFACE_VIEW_CLASS_NAME') || !cardTextSurfaceFrame.includes('UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME')) {
    throw new Error('expected shared Card text frame owner to define read-view typography')
  }
  if (!storyboardTextSurface.includes('displayLineClamp="none"') || !storyboardTextSurface.includes('editorClassName={cn(CARD_TEXT_SURFACE_EDIT_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}')) {
    throw new Error('expected Storyboard card summary edit mode to reuse shared read-view typography and inherit Viewer WYSIWYG chrome')
  }
  if (!richMediaTextSurface.includes("from '@/lib/cards/cardTextSurfaceFrame'") || !richMediaTextSurface.includes('data-kg-rich-media-card-text-frame="1"')) {
    throw new Error('expected Rich Media text mode to reuse the shared Card text frame chrome')
  }
  if (richMediaTextSurface.includes("from '@/lib/cards/CardMarkdownPreview'") || (richMediaTextSurface.match(/<CardInlineTextEditor/g) || []).length !== 1) {
    throw new Error('expected Rich Media read/edit rendering to use one CardInlineTextEditor path without a parallel markdown preview variant')
  }
  if (!richMediaTextSurface.includes('canEdit={model.panelTextEditable}') || !richMediaTextSurface.includes('displayLineClamp="none"') || !richMediaTextSurface.includes('markdownDocumentPath={model.panelMarkdownDocumentPath}') || !richMediaTextSurface.includes('inlineChipDensity="compact"') || !richMediaTextSurface.includes('showCommandLaunchers={false}')) {
    throw new Error('expected Rich Media view/edit state and document context to flow through the shared Card inline surface')
  }
  if (richMediaTextSurface.includes('CARD_MARKDOWN_PREVIEW_EMBEDDED_SURFACE_CLASS_NAME') || !richMediaTextSurface.includes("className={props.panel?.markdownWorkspaceViewerSurface === true ? 'flex min-h-0 flex-1 overflow-hidden' : CARD_TEXT_SURFACE_SCROLL_CLASS_NAME}")) {
    throw new Error('expected Rich Media and Card text surfaces to reuse one vertical scroll owner without nested markdown overflow chrome')
  }
  if (/editorClassName=\{cn\('h-full min-h-\[3rem\] overflow-auto (?:border|bg-)/.test(storyboardTextSurface)) {
    throw new Error('expected Storyboard card summary edit mode not to add local textarea border/background styling')
  }
}
