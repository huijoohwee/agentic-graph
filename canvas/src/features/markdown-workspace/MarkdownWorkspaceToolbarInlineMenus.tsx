import React from 'react'
import type { MarkdownPresentationApi } from './markdownWorkspaceTypes'
import { uiToolbarRowScrollListClassName } from '@/features/toolbar/ui/toolbarStyles'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { extractMarkdownAnnotationsFromText } from '@/lib/markdown/markdownSigil'
import { countMarkdownTextHighlightLineMatches } from '@/lib/markdown/markdownTextHighlights'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_TOOLBAR_HIGHLIGHT_BADGE_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  buildSemanticHighlightChipStyle,
  getSemanticHighlightSurfaceAttributes,
  getSemanticHighlightSurfaceClassName,
  SEMANTIC_HIGHLIGHT_SURFACES,
} from '@/lib/ui/semanticHighlight'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  WrapText,
} from 'lucide-react'

export const readMarkdownToolbarHighlightCount = (markdown: string): number => {
  return extractMarkdownAnnotationsFromText(markdown, 100, 120_000).length
}

const markdownWorkspaceToolbarGlyphClassName = UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME

const readSelectedHighlightLabel = (
  graphData: ReturnType<typeof useActiveGraphRenderData>,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
): string => {
  const nodeId = selectedNodeId ? String(selectedNodeId).trim() : ''
  const edgeId = selectedEdgeId ? String(selectedEdgeId).trim() : ''
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData.edges : []
  if (nodeId) {
    const node = nodes.find(item => String(item?.id || '').trim() === nodeId)
    const props = (node?.properties || {}) as Record<string, unknown>
    return String(props['markdown:highlight:text'] || props['keyword:key'] || node?.label || '').trim()
  }
  if (edgeId) {
    const edge = edges.find(item => String(item?.id || '').trim() === edgeId)
    return String(edge?.label || '').trim()
  }
  return ''
}

export function MarkdownWorkspacePresentationNavMenu(props: {
  canNavigateSlides: boolean
  toolbarButtonClassName: string
  presentationApiRef: React.MutableRefObject<MarkdownPresentationApi | null>
}) {
  if (!props.canNavigateSlides) return null
  return (
    <menu className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Presentation navigation">
      <li className="list-none">
        <button
          type="button"
          className={props.toolbarButtonClassName}
          title="Previous slide"
          onClick={() => props.presentationApiRef.current?.prev()}
        >
          <ChevronLeft className={markdownWorkspaceToolbarGlyphClassName} />
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={props.toolbarButtonClassName}
          title="Next slide"
          onClick={() => props.presentationApiRef.current?.next()}
        >
          <ChevronRight className={markdownWorkspaceToolbarGlyphClassName} />
        </button>
      </li>
    </menu>
  )
}

export function MarkdownWorkspaceDisplayMenu(props: {
  toolbarButtonClassName: string
  markdownTextHighlight: boolean
  setMarkdownTextHighlight: (next: boolean) => void
  markdownWordWrap: boolean
  setMarkdownWordWrap: (next: boolean) => void
  highlightCount?: number
}) {
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText || '')
  const selectedNodeId = useGraphStore(s => s.selectedNodeId || null)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId || null)
  const renderGraphData = useActiveGraphRenderData(true)
  const selectedHighlightLabel = React.useMemo(
    () => readSelectedHighlightLabel(renderGraphData, selectedNodeId, selectedEdgeId),
    [renderGraphData, selectedEdgeId, selectedNodeId],
  )
  const storeHighlightCount = React.useMemo(
    () => Math.max(
      readMarkdownToolbarHighlightCount(markdownDocumentText),
      selectedHighlightLabel ? countMarkdownTextHighlightLineMatches(markdownDocumentText, selectedHighlightLabel) : 0,
    ),
    [markdownDocumentText, selectedHighlightLabel],
  )
  const highlightCount = typeof props.highlightCount === 'number' && Number.isFinite(props.highlightCount)
    ? Math.max(0, Math.floor(props.highlightCount))
    : storeHighlightCount
  const highlightCountLabel = highlightCount >= 100 ? '99+' : String(highlightCount)
  const highlightToggleTitle = highlightCount > 0
    ? `Toggle text highlight (${highlightCountLabel})`
    : 'Toggle text highlight'
  const highlightBadgeClassName = [
    'pointer-events-none absolute -right-1 -top-1',
    UI_RESPONSIVE_MARKDOWN_TOOLBAR_HIGHLIGHT_BADGE_CLASSNAME,
    getSemanticHighlightSurfaceClassName(SEMANTIC_HIGHLIGHT_SURFACES.markdownTextHighlight),
    'rounded-sm border px-0.5 text-center text-xs leading-3',
  ].join(' ')
  const highlightBadgeStyle = buildSemanticHighlightChipStyle({ defaultHighlight: true })

  return (
    <menu className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Display">
      <li className="list-none">
        <button
          type="button"
          className={`${props.toolbarButtonClassName} relative`}
          aria-pressed={props.markdownTextHighlight}
          aria-label={highlightToggleTitle}
          title={highlightToggleTitle}
          data-kg-sigil-highlight-count={highlightCount}
          {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.markdownTextHighlight)}
          onClick={() => props.setMarkdownTextHighlight(!props.markdownTextHighlight)}
        >
          <Eye className={markdownWorkspaceToolbarGlyphClassName} />
          {highlightCount > 0 ? (
            <span
              className={highlightBadgeClassName}
              style={highlightBadgeStyle}
              {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.markdownTextHighlight)}
            >
              {highlightCountLabel}
            </span>
          ) : null}
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={props.toolbarButtonClassName}
          aria-pressed={props.markdownWordWrap}
          title="Toggle word wrap"
          onClick={() => props.setMarkdownWordWrap(!props.markdownWordWrap)}
        >
          <WrapText className={markdownWorkspaceToolbarGlyphClassName} />
        </button>
      </li>
    </menu>
  )
}
