import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import {
  KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  KTV_SECTION_TITLE_CLASS_NAME,
  KTV_STATUS_TEXT_SIZE_CLASS_NAME,
} from 'grph-shared/ui/keyTypeValueRows'
import Tooltip from '@/features/panels/ui/Tooltip'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildNodeMediaInventory, type NodeMediaInventoryRow } from '@/components/GraphCanvas/helpers'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { RENDER_PANEL_SECTION_COPY } from '@/features/panels/config'
import { IFRAME_ALLOWED_HOSTS } from '@/lib/config'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { RICH_MEDIA_DISPLAY_COPY, readRichMediaDisplayMode } from '@/lib/render/richMediaSsot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { PanelInlineLabeledRangeRow } from '@/features/panels/ui/PanelInlineLabeledRangeRow'

const mediaStatsPanelClassName = `mt-2 border ${UI_THEME_TOKENS.table.cellBorder} rounded ${UI_THEME_TOKENS.panel.bg} max-h-40 overflow-auto`
const mediaToggleShellClassName = `inline-flex rounded border ${UI_THEME_TOKENS.input.border} overflow-hidden ${UI_THEME_TOKENS.button.neutralSubtle}`
export const MEDIA_NODES_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5'

export default function MediaNodesSection({
  toolbarAligned = false,
  collapsed,
  onToggle,
}: {
  toolbarAligned?: boolean
  collapsed?: boolean
  onToggle?: (next: boolean) => void
}) {
  const graph = useActiveGraphRenderData() as GraphData | null
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  )
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || KTV_STATUS_TEXT_SIZE_CLASS_NAME,
  )
  const renderMediaAsNodes = useGraphStore(s => s.renderMediaAsNodes)
  const setRenderMediaAsNodes = useGraphStore(s => s.setRenderMediaAsNodes)
  const markdownViewerMediaMode = useGraphStore(s => s.markdownViewerMediaMode || 'chip')
  const setMarkdownViewerMediaMode = useGraphStore(s => s.setMarkdownViewerMediaMode)
  const mediaNodeOpacity = useGraphStore(s => s.mediaNodeOpacity)
  const setMediaNodeOpacity = useGraphStore(s => s.setMediaNodeOpacity)
  const canvasRenderMode = useGraphStore(s => s.canvasRenderMode)
  const canvas3dMode = useGraphStore(s => s.canvas3dMode)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const frontmatterModeEnabled = useGraphStore(s => s.frontmatterModeEnabled === true)
  const documentSemanticMode = useGraphStore(s => s.documentSemanticMode)
  const richMediaDisplayMode = readRichMediaDisplayMode({
    renderMediaAsNodes,
    canvasRenderMode,
    canvas3dMode,
    canvas2dRenderer,
    frontmatterModeEnabled,
    documentSemanticMode,
  })
  const copy = RENDER_PANEL_SECTION_COPY.mediaNodes

  const inventory = React.useMemo(() => {
    const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as GraphNode[]) : []
    return buildNodeMediaInventory(nodes, {
      maxRows: 200,
      limitStatsToRows: true,
    })
  }, [graph])

  const rows = inventory.rows as ReadonlyArray<NodeMediaInventoryRow>
  const totalCount = inventory.totalCount
  const imageCount = inventory.imageLikeCount
  const videoCount = inventory.videoCount
  const audioCount = inventory.audioCount
  const iframeCount = inventory.iframeCount

  const iframeHostsRaw = String(IFRAME_ALLOWED_HOSTS || '').trim()
  const iframeHostList = iframeHostsRaw
    ? iframeHostsRaw
        .split(/[,\s]+/)
        .map(h => h.trim())
        .filter(Boolean)
    : []
  const hasIframeHosts = iframeHostList.length > 0

  const titleContent = (
    <section className="flex flex-col">
      <span className="inline-flex items-center gap-2">
        {copy.badge && (
          <span
            className={[
              uiPanelKeyValueTextSizeClass,
              uiPanelTextFontClass,
              `font-semibold ${UI_THEME_TOKENS.text.tertiary}`,
            ].join(' ')}
          >
            {copy.badge}
          </span>
        )}
        <span className={KTV_SECTION_TITLE_CLASS_NAME}>
          {copy.title}
        </span>
      </span>
      {copy.descriptionShort && (
        <span
          className={[
            uiPanelMicroLabelTextSizeClass,
            uiPanelTextFontClass,
            UI_THEME_TOKENS.text.secondary,
          ].join(' ')}
        >
          {copy.descriptionShort}
        </span>
      )}
    </section>
  )

  return (
    <CollapsibleSection
      title={copy.tooltip ? (
        <Tooltip
          content={copy.tooltip}
          maxWidthPx={260}

        >
          {titleContent}
        </Tooltip>
      ) : (
        titleContent
      )}
      toolbarAligned={toolbarAligned}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {!graph || totalCount === 0 ? (
        <section
          className={[
            uiPanelMicroLabelTextSizeClass,
            uiPanelTextFontClass,
            UI_THEME_TOKENS.text.secondary,
          ].join(' ')}
        >
          No media-capable nodes detected in the current GraphData.
        </section>
      ) : (
        <section className="space-y-2">
          <section
            className={[
              MEDIA_NODES_STATS_GRID_CLASS_NAME,
              UI_THEME_TOKENS.text.primary,
              uiPanelKeyValueTextSizeClass,
              uiPanelTextFontClass,
            ].join(' ')}
          >
            <section className="flex flex-col">
              <span className={`uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`}>Media nodes</span>
              <span className="font-semibold">{String(totalCount)}</span>
            </section>
            <section className="flex flex-col">
              <span className={`uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`}>Images/SVG</span>
              <span className="font-semibold">{String(imageCount)}</span>
            </section>
            <section className="flex flex-col">
              <span className={`uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`}>Video</span>
              <span className="font-semibold">{String(videoCount)}</span>
            </section>
            <section className="flex flex-col">
              <span className={`uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`}>Audio</span>
              <span className="font-semibold">{String(audioCount)}</span>
            </section>
            <section className="flex flex-col">
              <span className={`uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`}>IFrame</span>
              <span className="font-semibold">{String(iframeCount)}</span>
            </section>
          </section>

          <section className="mt-2 flex items-center justify-between gap-2">
            <section className="flex items-center gap-2">
              <Tooltip
                content={copy.viewToggleHelper || ''}
                maxWidthPx={260}

              >
                <span
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    `${UI_THEME_TOKENS.text.secondary} cursor-help`,
                  ].join(' ')}
                >
                  {RICH_MEDIA_DISPLAY_COPY.viewLabel}
                </span>
              </Tooltip>
              <section className={mediaToggleShellClassName}>
                <button
                  type="button"
                  onClick={() => setRenderMediaAsNodes(false)}
                  className={[
                    `px-2 py-1 ${uiPanelMicroLabelTextSizeClass}`,
                    uiPanelTextFontClass,
                    richMediaDisplayMode === 'panel-only'
                      ? `${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg}`
                      : UI_THEME_TOKENS.button.primarySolid,
                  ].join(' ')}
                >
                  {RICH_MEDIA_DISPLAY_COPY.circleOnly}
                </button>
                <button
                  type="button"
                  onClick={() => setRenderMediaAsNodes(true)}
                  className={[
                    `px-2 py-1 ${uiPanelMicroLabelTextSizeClass} border-l ${UI_THEME_TOKENS.input.border}`,
                    uiPanelTextFontClass,
                    richMediaDisplayMode === 'panel-only'
                      ? UI_THEME_TOKENS.button.primarySolid
                      : `${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg}`,
                  ].join(' ')}
                >
                  {RICH_MEDIA_DISPLAY_COPY.panelOnly}
                </button>
              </section>
            </section>
            <PanelInlineLabeledRangeRow
              label={RICH_MEDIA_DISPLAY_COPY.opacityLabel}
              valueLabel={`${Math.round(mediaNodeOpacity * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={mediaNodeOpacity}
              onChange={setMediaNodeOpacity}
              labelClassName={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                UI_THEME_TOKENS.text.secondary,
              ].join(' ')}
              rangeClassName="w-24"
              valueClassName={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                `${UI_THEME_TOKENS.text.primary} w-10 text-right`,
              ].join(' ')}
            />
          </section>

          <section className="mt-2 flex items-center justify-between gap-2">
            <span
              className={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                UI_THEME_TOKENS.text.secondary,
              ].join(' ')}
            >
              Viewer @ media
            </span>
            <section className={mediaToggleShellClassName} aria-label="Viewer media display mode">
              <button
                type="button"
                onClick={() => setMarkdownViewerMediaMode('chip')}
                className={[
                  `px-2 py-1 ${uiPanelMicroLabelTextSizeClass}`,
                  uiPanelTextFontClass,
                  markdownViewerMediaMode === 'chip'
                    ? UI_THEME_TOKENS.button.primarySolid
                    : `${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg}`,
                ].join(' ')}
              >
                Chip
              </button>
              <button
                type="button"
                onClick={() => setMarkdownViewerMediaMode('image')}
                className={[
                  `px-2 py-1 ${uiPanelMicroLabelTextSizeClass} border-l ${UI_THEME_TOKENS.input.border}`,
                  uiPanelTextFontClass,
                  markdownViewerMediaMode === 'image'
                    ? UI_THEME_TOKENS.button.primarySolid
                    : `${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg}`,
                ].join(' ')}
              >
                Image
              </button>
            </section>
          </section>

          <section className="mt-2 flex flex-col gap-1">
            <span
              className={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                UI_THEME_TOKENS.text.secondary,
              ].join(' ')}
            >
              Iframe allowlist (direct embeds)
            </span>
            <span
              className={[
                uiPanelMicroLabelTextSizeClass,
                uiPanelTextFontClass,
                UI_THEME_TOKENS.text.primary,
              ].join(' ')}
            >
              {hasIframeHosts
                ? iframeHostList.join(', ')
                : 'Unrestricted — set VITE_IFRAME_ALLOWED_HOSTS to limit direct embeds'}
            </span>
            {!hasIframeHosts && (
              <span
                className={[
                  uiPanelMicroLabelTextSizeClass,
                  uiPanelTextFontClass,
                  UI_THEME_TOKENS.text.tertiary,
                ].join(' ')}
              >
                Non-direct iframes load via /__webpage_proxy by default.
              </span>
            )}
          </section>

          <section className={mediaStatsPanelClassName}>
            <table className="min-w-full text-left">
              <thead>
                <tr
                  className={[
                    uiPanelMicroLabelTextSizeClass,
                    uiPanelTextFontClass,
                    `${UI_THEME_TOKENS.text.tertiary} border-b ${UI_THEME_TOKENS.table.cellBorder}`,
                  ].join(' ')}
                >
                  <th className="px-2 py-1 w-20">Type</th>
                  <th className="px-2 py-1">Label</th>
                  <th className="px-2 py-1 w-20">Media</th>
                </tr>
              </thead>
              <tbody
                className={[
                  uiPanelKeyValueTextSizeClass,
                  uiPanelTextFontClass,
                  UI_THEME_TOKENS.text.primary,
                ].join(' ')}
              >
                {rows.map(row => {
                  const label = readMarkdownSigilDisplayText(row.label)
                  return (
                    <tr key={row.id} className={`border-b ${UI_THEME_TOKENS.panel.divider} last:border-b-0`}>
                      <td className="px-2 py-1 truncate">{row.type}</td>
                      <td className="px-2 py-1 truncate" title={label}>{renderMarkdownSigilInlineText(row.label)}</td>
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center gap-1">
                          <span className={`uppercase tracking-normal ${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
                            {row.media.kind}
                          </span>
                          <span className={`inline-flex h-2 w-2 rounded-full ${UI_THEME_TOKENS.status.neutralDot}`} />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </section>
      )}
    </CollapsibleSection>
  )
}
