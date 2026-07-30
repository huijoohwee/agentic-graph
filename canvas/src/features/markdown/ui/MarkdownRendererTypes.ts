import type { MermaidInitConfig } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import type {
  MarkdownGeoDatasetIntegration,
} from '@/features/geospatial/markdownGeoDatasetContract'

export type HighlightedLineRange = { start: number; end: number } | null
export type MarkdownInlineDraftTextChangeOptions = {
  reflectInViewer?: boolean
}

export type MarkdownViewerMediaMode = 'chip' | 'image'
export type MarkdownVariablePreview = {
  value: string | null
  source?: 'frontmatter' | 'inline' | 'unresolved'
  line?: number | null
}

export type InlineRenderOpts = {
  activeDocumentPath: string
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  markdownPresentationMode: boolean
  markdownVariablePreviewByKey?: Record<string, MarkdownVariablePreview>
  markdownLargeDocumentMode?: boolean
  markdownCardPreviewMode?: boolean
  markdownViewerMediaMode?: MarkdownViewerMediaMode
  fragmentOptions?: {
    enabled: boolean
    currentStep: number
    classNames: string[]
    tags: string[]
  } | null
}

export type {
  MarkdownGeoDatasetIntegration,
  MarkdownGeoDatasetRegistrationRequest,
  MarkdownGeoDatasetRegistrationResult,
} from '@/features/geospatial/markdownGeoDatasetContract'

export type RenderOpts = InlineRenderOpts & {
  highlightedLineRange: HighlightedLineRange
  markdownWordWrap: boolean
  stickyHeadingTopClass?: string
  stickyHeadingTopPx?: number
  stickyHeadingCascadeBaseDepth?: number
  codeAnnotations?: Record<string, string> | null
  mermaidFrontmatterConfig: MermaidInitConfig | null
  rootThemeMode: 'light' | 'dark'
  previewOverlayScope: 'viewport' | 'container'
  previewOverlayPortalTarget?: HTMLElement | null
  collapsedIds?: Set<string>
  onToggleCollapse?: (id: string) => void
  viewerBlockEditingEnabled?: boolean
  onMoveHeadingSection?: (id: string, direction: 'up' | 'down') => void
  onReorderHeadingSection?: (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => void
  onReorderLineBlock?: (
    source: { startLine: number; endLine: number },
    target: { startLine: number; endLine: number },
    position: 'before' | 'after',
  ) => void
  onInsertLineAfter?: (afterLine: number) => void
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  onInlineEditStateChange?: (active: boolean) => void
  onInlineDraftTextChange?: (nextText: string, options?: MarkdownInlineDraftTextChangeOptions) => void
  geoDatasetIntegration?: MarkdownGeoDatasetIntegration
  markdownBlockControlsEnabled?: boolean
  markdownBlockGutterEnabled?: boolean
  markdownCardPreviewMode?: boolean
  markdownViewerMediaMode?: MarkdownViewerMediaMode
  markdownForcePlainTables?: boolean
  webpageLayoutWireframeAscii?: string | null
  markdownSourceLines?: string[]
  markdownParagraphEditStripLinePrefix?: (line: string) => { prefix: string; content: string }
  markdownParagraphEditDefaultLinePrefix?: string
  standaloneMediaRenderLineSet?: ReadonlySet<number> | null
  forbidCopy?: boolean
  deferMermaidRender?: boolean
}
