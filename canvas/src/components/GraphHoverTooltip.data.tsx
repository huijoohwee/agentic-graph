import React from 'react'
import type { GraphEdge } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { summarizePropertySpec, getNodePropSpec, getEdgePropSpec, buildEdgeSchemaBadges } from '@/lib/graph/schema'
import IconButton from '@/components/IconButton'
import { getBadgeChipClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import type { GraphFieldKind } from '@/features/graph-fields/graphFields'
import { FieldTypeBadgeIcon } from '@/features/graph-fields/ui/graphFieldIcons'
import type { GraphHoverPreviewConfig } from '@/hooks/store/types'
import { truncateTextWithEllipsis } from '@/components/GraphCanvas/layout/utils'
import { getNodeLabelFullText2d } from '@/components/GraphCanvas/labelLayout2d'
import { getEdgeLabelForDisplay } from '@/components/GraphCanvas/edgeDisplay'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { extractVoxelScores, VOXEL_SCORE_DIMENSIONS } from '@/features/three/voxelStyle'
import { HOVER_PARTS, formatHoverValue } from 'agentic-design-system/hover/text'
import type { GraphNode, JSONValue } from '@/lib/graph/types'
import { getNodeImagePreviewUrls } from '@/components/GraphCanvas/helpers'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'

const NODE_PROP_PRIORITY = [
  'name',
  'title',
  'description',
  'summary',
  'category',
  'role',
  'keyword:key',
  'keyword:role',
  'keyword:ner',
  'keyword:frequency',
  'keyword:pagerank',
  'visual:importance',
  'visual:nodeSize',
  'visual:layer',
]

const EDGE_PROP_PRIORITY = [
  'strength:score',
  'strength:ppmi',
  'strength:count',
  'keyword:predicate',
  'keyword:verbLike',
  'keyword:directed',
  'weight',
  'score',
  'confidence',
  'count',
]

function markdownToPlainText(markdown: string): string {
  const raw = String(markdown || '')
  if (!raw.trim()) return ''
  let text = raw
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/`[^`]*`/g, ' ')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
  text = text.replace(/\s+/g, ' ')
  return text.trim()
}

function firstString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null
  for (const key of keys) {
    const v = obj[key]
    const s = typeof v === 'string' ? v.trim() : ''
    if (s) return s
  }
  return null
}

export function buildHoverDescription(node: GraphNode): string {
  const props = (node.properties || {}) as unknown as Record<string, unknown>
  const meta = (node.metadata || {}) as unknown as Record<string, unknown>
  const raw =
    firstString(props, ['description', 'summary', 'chunk_text', 'text', 'markdown', 'mdSectionMarkdown', 'sectionMarkdown']) ||
    firstString(meta, ['mdSectionMarkdown', 'sectionMarkdown', 'markdown', 'description', 'summary', 'text']) ||
    ''
  return markdownToPlainText(raw)
}

export function buildHoverImageInfo(node: GraphNode): { imageSrc: string | null; imageCount: number } {
  const urls = getNodeImagePreviewUrls(node)
  return { imageSrc: urls.length > 0 ? urls[0] : null, imageCount: urls.length }
}

export function buildGraphHoverSemanticKey(args: { kind?: unknown; id?: unknown } | null | undefined): string | null {
  const kind = String(args?.kind || '').trim()
  const id = String(args?.id || '').trim()
  if (!kind || !id) return null
  return buildScopedGraphSemanticKey('graph-hover-panel', { graphSemanticKey: `${kind}:${id}` }) || null
}

export function sortProps(props: Record<string, JSONValue>, kind: 'node' | 'edge'): [string, JSONValue][] {
  const entries = Object.entries(props || {})
  const priority = kind === 'node' ? NODE_PROP_PRIORITY : EDGE_PROP_PRIORITY
  const rank = (key: string) => {
    const idx = priority.indexOf(key)
    return idx === -1 ? priority.length : idx
  }
  return entries
    .slice()
    .sort(([a], [b]) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.localeCompare(b)
    })
}

export function buildNodeContent(
  node: GraphNode,
  schema: GraphSchema | null | undefined,
  iconClassName: string,
  uiIconBadgeChipClass: string,
  uiIconBadgeChipTextSizeClass: string,
  uiPanelMicroLabelTextSizeClass: string,
  config: GraphHoverPreviewConfig,
  expanded: boolean,
  onToggleExpanded: (() => void) | null,
): React.ReactNode {
  const sorted = sortProps(node.properties || {}, 'node')
  const contentCfg = schema?.behavior?.hover?.content;
  const showProps = contentCfg?.showProps !== false && config.showNodeProperties;
  const showType = contentCfg?.showType !== false && config.showNodeLabel;
  const showId = contentCfg?.showId !== false && config.showNodeId;
  const primaryNodeText = getNodeLabelFullText2d(node)
  const voxelScores = extractVoxelScores(node)
  const { imageSrc, imageCount } = buildHoverImageInfo(node)
  const descRaw = config.showNodeDescription ? buildHoverDescription(node) : ''
  const descText = expanded ? descRaw : truncateTextWithEllipsis(descRaw, 280)

  return (
    <section>
      <section className="font-semibold">
        {primaryNodeText}
        {showType && (
          <span className={UI_THEME_TOKENS.tooltip.textSecondary}>
            ({node.type})
          </span>
        )}
      </section>
      {showId && (
        <section className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} break-all`}>
          {node.id}
        </section>
      )}
      {voxelScores ? (
        <section className="mt-1 space-y-1">
          {VOXEL_SCORE_DIMENSIONS.map((d) => {
            const v = voxelScores[d.key]
            const pct = Math.round(v * 100)
            return (
              <section key={d.key} className="space-y-0.5">
                <section className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} flex justify-between gap-2`}>
                  <span className="font-semibold">{d.label}</span>
                  <span>{`${pct}%`}</span>
                </section>
                <section className="h-2 w-full rounded bg-black/20 overflow-hidden">
                  <section className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                </section>
              </section>
            )
          })}
        </section>
      ) : null}
      {imageSrc ? (
        <section className="mt-1">
          <section className="flex gap-2 items-start">
            <CardMediaPreview
              kind="image"
              url={imageSrc}
              title={primaryNodeText}
              interactive={false}
              fit="cover"
              className="h-12 w-12 flex-none rounded-lg"
              mediaClassName="h-12 w-12 flex-none rounded-lg"
            />
            <section className="min-w-0 flex-1">
              {imageCount > 1 ? (
                <section className={`text-xs ${UI_THEME_TOKENS.tooltip.textTertiary} font-semibold`}>{`+${imageCount - 1}`}</section>
              ) : null}
            </section>
          </section>
        </section>
      ) : null}
      {descRaw ? (
        <button
          type="button"
          className={`mt-1 text-left ${UI_THEME_TOKENS.tooltip.text} break-words leading-tight w-full`}
          onClick={onToggleExpanded ?? undefined}
        >
          <section className={`${expanded ? HOVER_PARTS.expanded : ''} text-xs`}>
            {descText}
          </section>
        </button>
      ) : null}
      {showProps && sorted.length > 0 && (
        <section className="mt-1 space-y-0.5">
          {sorted.slice(0, 4).map(([k, v]) => {
            if (k === 'description' || k === 'chunk_text' || k === 'mdSectionMarkdown') return null
            const spec = getNodePropSpec(schema, node.type, k)
            const description = spec && typeof spec.description === 'string' ? spec.description.trim() : ''
            const badges = summarizePropertySpec(spec)
            return (
              <section key={k} className="space-y-0.5">
                <section className="flex gap-1 items-center">
                  {spec ? (
                    <FieldTypeBadgeIcon
                      kind={spec.type as GraphFieldKind}
                      className={iconClassName}
                    />
                  ) : null}
                  <span className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} truncate ${HOVER_PARTS.key}`}>
                    {k}:
                  </span>
                  <span className={`text-xs ${UI_THEME_TOKENS.tooltip.text} break-all`}>
                    {formatHoverValue(v)}
                  </span>
                </section>
                {description && (
                  <section className={`${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.tooltip.textTertiary} leading-tight break-normal`}>
                    {description}
                  </section>
                )}
                {badges.length > 0 && (
                  <section className="flex flex-wrap gap-1">
                    {badges.map(badge => (
                      <span
                        key={badge}
                        className={getBadgeChipClass('default', {
                          baseClass: uiIconBadgeChipClass,
                          textSizeClass: uiIconBadgeChipTextSizeClass,
                        })}
                      >
                        {badge}
                      </span>
                    ))}
                  </section>
                )}
              </section>
            )
          })}
        </section>
      )}
    </section>
  )
}

export function buildEdgeContent(
  edge: GraphEdge,
  schema: GraphSchema | null | undefined,
  iconClassName: string,
  uiIconBadgeChipClass: string,
  uiIconBadgeChipTextSizeClass: string,
  uiPanelMicroLabelTextSizeClass: string,
  config: GraphHoverPreviewConfig,
  expanded: boolean,
  onToggleExpanded: (() => void) | null,
): React.ReactNode {
  const edgeLabelForDisplay = getEdgeLabelForDisplay(edge)
  const sorted = sortProps(edge.properties || {}, 'edge')
  const schemaBadges = buildEdgeSchemaBadges(
    schema,
    edge.label,
    edge.properties as Record<string, unknown> | null | undefined,
  )
  const contentCfg = schema?.behavior?.hover?.content;
  const showProps = contentCfg?.showProps !== false && config.showEdgeProperties;
  const showId = contentCfg?.showId !== false && config.showEdgeId;
  const descRaw = typeof (edge.properties as Record<string, unknown> | null | undefined)?.description === 'string'
    ? String((edge.properties as Record<string, unknown>).description || '')
    : ''
  const primaryEdgeText = edgeLabelForDisplay || String(edge.id || '').trim() || 'Edge'
  const desc = showProps ? descRaw : ''
  const descText = expanded ? desc : truncateTextWithEllipsis(desc, 280)

  return (
    <section>
      <section className="font-semibold">
        {(config.showEdgeLabel || !edgeLabelForDisplay) && (
          <span className="block whitespace-normal break-words">
            {primaryEdgeText}
          </span>
        )}
      </section>
      {config.showEdgeLabel && (
        <section className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} break-all`}>
          {String(edge.source)} → {String(edge.target)}
        </section>
      )}
      {schemaBadges.length > 0 && (
        <section className="mt-1 flex flex-wrap gap-1">
          {schemaBadges.map(badge => (
            <span
              key={badge.badge}
              className={getBadgeChipClass('default', {
                baseClass: uiIconBadgeChipClass,
                textSizeClass: uiIconBadgeChipTextSizeClass,
              })}
            >
              {badge.label}
            </span>
          ))}
        </section>
      )}
      {showId && (
        <section className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} break-all`}>
          {edge.id}
        </section>
      )}
      {desc ? (
        <button
          type="button"
          className={`mt-1 text-left ${UI_THEME_TOKENS.tooltip.text} break-words leading-tight w-full`}
          onClick={onToggleExpanded ?? undefined}
        >
          <section className={`${expanded ? HOVER_PARTS.expanded : ''} text-xs`}>
            {descText}
          </section>
        </button>
      ) : null}
      {showProps && sorted.length > 0 && (
        <section className="mt-1 space-y-0.5">
          {sorted.slice(0, 4).map(([k, v]) => {
            const spec = getEdgePropSpec(schema, edge.label, k)
            const description = spec && typeof spec.description === 'string' ? spec.description.trim() : ''
            const badges = summarizePropertySpec(spec)
            return (
              <section key={k} className="space-y-0.5">
                <section className="flex gap-1 items-center">
                  {spec ? (
                    <FieldTypeBadgeIcon
                      kind={spec.type as GraphFieldKind}
                      className={iconClassName}
                    />
                  ) : null}
                  <span className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} truncate ${HOVER_PARTS.key}`}>
                    {k}:
                  </span>
                  <span className={`text-xs ${UI_THEME_TOKENS.tooltip.text} break-all`}>
                    {formatHoverValue(v)}
                  </span>
                </section>
                {description && (
                  <section className={`${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.tooltip.textTertiary} leading-tight break-normal`}>
                    {description}
                  </section>
                )}
                {badges.length > 0 && (
                  <section className="flex flex-wrap gap-1">
                    {badges.map(badge => (
                      <span
                        key={badge}
                        className={getBadgeChipClass('default', {
                          baseClass: uiIconBadgeChipClass,
                          textSizeClass: uiIconBadgeChipTextSizeClass,
                        })}
                      >
                        {badge}
                      </span>
                    ))}
                  </section>
                )}
              </section>
            )
          })}
        </section>
      )}
    </section>
  )
}

export function buildGroupContent(
  group: GraphGroup,
): React.ReactNode {
  const label = String(group.label || '').trim()
  const memberCount = Array.isArray(group.memberNodeIds) ? group.memberNodeIds.length : 0
  const id = String(group.id || '')
  return (
    <section>
      <section className="font-semibold break-words">{label || id}</section>
      <section className={`text-xs ${UI_THEME_TOKENS.tooltip.textSecondary} break-all`}>{id}</section>
      <section className={`mt-1 text-xs ${UI_THEME_TOKENS.tooltip.text}`}>
        <span className="font-medium">{memberCount}</span> nodes
      </section>
    </section>
  )
}

