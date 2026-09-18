import React from 'react'
import type { GraphSchema } from '@/lib/graph/schema'
import type { JSONValue } from '@/lib/graph/types'
import {
  UI_ANCHORS,
  UI_LABELS,
  TRAVERSAL_PRESET_UI_TOOLTIP,
  RENDER_TRAVERSAL_BUTTON_LABEL_GRAPH_RAG,
} from '@/lib/config'
import { buildCleanSchema } from '@/features/schema-editor/utils'
import { CanvasEditableKeyTypeValueRow as KeyTypeValueRow } from '@/features/panels/ui/CanvasEditableKeyTypeValueRow'
import { RightAlignedTooltipInput } from '@/features/panels/ui/RightAlignedTooltipInput'
import { buildNumericTooltip } from '@/lib/config'
import {
  TRAVERSAL_MAX_DEPTH_DEFAULT,
  TRAVERSAL_MAX_DEPTH_MIN,
  TRAVERSAL_MAX_DEPTH_MAX,
  clampTraversalMaxDepth,
} from '@/features/panels/utils/orchestratorTraversal'
import Tooltip from '@/features/panels/ui/Tooltip'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  threePresetCatalog,
  threePresetNodePalette,
  graphSizePresetCatalog,
  type ThreePresetCatalogEntry,
  type GraphSizePresetCatalogEntry,
} from '@/features/panels/views/renderPresetCatalog'
import { uiToolbarButtonNeutralClassName } from '@/features/toolbar/ui/toolbarStyles'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface RenderPresetSectionProps {
  inspection?: boolean
  schema: GraphSchema
  setSchema: (schema: GraphSchema) => void
  setCanvasRenderMode: (mode: '2d' | '3d') => void
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  setCharge: (charge: number) => void
  setCollisionByType: (type: string, radius: number) => void
  updateNodeStyle: (type: string, style: Partial<GraphSchema['nodeStyles'][string]>) => void
  updateEdgeStyle: (label: string, style: Partial<GraphSchema['edgeStyles'][string]>) => void
  setEdgeArrow: (label: string, hasArrow: boolean) => void
}

interface TraversalPresetSectionProps {
  runGraphRagTraversal: () => void
  traversalStartNodeId: string
  setTraversalStartNodeId: (value: string) => void
  traversalMaxDepth: number
  setTraversalMaxDepth: (value: number) => void
  traversalLabelFilter: string
  setTraversalLabelFilter: (value: string) => void
  runTraversalQuery: () => void
  selectedNodeId: string | null
}

export default function RenderPresetSection({
  inspection = false,
  schema,
  setSchema,
  setCanvasRenderMode,
  setThreeConfig,
  setCharge,
  setCollisionByType,
  updateNodeStyle,
  updateEdgeStyle,
  setEdgeArrow,
}: RenderPresetSectionProps) {
  const presetButtonClassName = `App-toolbar__btn text-xs px-2 py-1 border ${UI_THEME_TOKENS.input.border} ${uiToolbarButtonNeutralClassName}`

  const applyGraphSizePreset = React.useCallback(
    (preset: GraphSizePresetCatalogEntry) => {
      const current = schema
      const curPerformance = current.performance || {}
      const curLod = curPerformance.lod || {}
      const curCaps = curPerformance.caps || {}
      const overrides = preset.layoutOverrides
      const nextLod = { ...curLod }
      if (typeof overrides.hideLabelsBelowScale === 'number' && Number.isFinite(overrides.hideLabelsBelowScale)) {
        nextLod.hideLabelsBelowScale = Math.max(0, overrides.hideLabelsBelowScale)
      }
      const nextCaps = { ...curCaps }
      const caps = overrides.caps || {}
      if (typeof caps.maxNodes === 'number' && Number.isFinite(caps.maxNodes)) {
        nextCaps.maxNodes = Math.max(0, Math.floor(caps.maxNodes))
      }
      if (typeof caps.maxEdges === 'number' && Number.isFinite(caps.maxEdges)) {
        nextCaps.maxEdges = Math.max(0, Math.floor(caps.maxEdges))
      }
      const nextPerformance: NonNullable<GraphSchema['performance']> = {
        ...curPerformance,
        lod: nextLod,
        caps: nextCaps,
      }
      setSchema({ ...current, performance: nextPerformance })
    },
    [schema, setSchema],
  )

  const applyThreePreset = React.useCallback(
    (preset: ThreePresetCatalogEntry) => {
      setCanvasRenderMode('3d')

      const overrides = preset.layoutOverrides
      if (typeof overrides?.charge === 'number' && Number.isFinite(overrides.charge)) {
        setCharge(overrides.charge)
      }

      const types = schema.catalog?.nodeTypes || []
      const collisionRadius = overrides?.collisionRadius
      if (typeof collisionRadius === 'number' && Number.isFinite(collisionRadius)) {
        types.forEach(t => {
          setCollisionByType(t, collisionRadius)
        })
      }

      if (overrides?.applyNodePalette) {
        types.forEach((type, index) => {
          const color = threePresetNodePalette[index % threePresetNodePalette.length]
          updateNodeStyle(type, { color })
        })
      }

      if (overrides?.applyGraphLayerDefaults) {
        const current = useGraphStore.getState().schema
        const metadata = current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
          ? current.metadata
          : {}
        const existingGraphLayersRaw = Object.prototype.hasOwnProperty.call(metadata, 'canvas:graphLayers')
          ? (metadata['canvas:graphLayers'] as unknown)
          : undefined
        const existingGraphLayersMeta =
          existingGraphLayersRaw && typeof existingGraphLayersRaw === 'object' && !Array.isArray(existingGraphLayersRaw)
            ? (existingGraphLayersRaw as Record<string, unknown>)
            : {}
        const existingDefaultStyleRaw = Object.prototype.hasOwnProperty.call(existingGraphLayersMeta, 'defaultStyle')
          ? (existingGraphLayersMeta.defaultStyle as unknown)
          : undefined
        const existingDefaultStyle =
          existingDefaultStyleRaw &&
          typeof existingDefaultStyleRaw === 'object' &&
          !Array.isArray(existingDefaultStyleRaw)
            ? (existingDefaultStyleRaw as Record<string, unknown>)
            : {}
        const nextDefaultStyle: Record<string, unknown> = { ...existingDefaultStyle }
        if (typeof nextDefaultStyle.fill !== 'string') {
          nextDefaultStyle.fill = '#E5E7EB'
        }
        if (typeof nextDefaultStyle.stroke !== 'string') {
          nextDefaultStyle.stroke = '#9CA3AF'
        }
        if (typeof nextDefaultStyle.dash !== 'string') {
          nextDefaultStyle.dash = '4,2'
        }
        if (typeof nextDefaultStyle.fillOpacity !== 'number' || !Number.isFinite(nextDefaultStyle.fillOpacity as number)) {
          nextDefaultStyle.fillOpacity = 0.22
        }
        if (typeof nextDefaultStyle.strokeWidth !== 'number' || !Number.isFinite(nextDefaultStyle.strokeWidth as number)) {
          nextDefaultStyle.strokeWidth = 1.0
        }
        const nextGraphLayersMeta: Record<string, unknown> = {
          ...existingGraphLayersMeta,
          defaultStyle: nextDefaultStyle,
        }
        const nextSchema: GraphSchema = {
          ...current,
          metadata: {
            ...metadata,
            'canvas:graphLayers': nextGraphLayersMeta as JSONValue,
          },
        }
        setSchema(nextSchema)
      }

      setThreeConfig(preset.threeConfig)
    },
    [schema, setSchema, setCanvasRenderMode, setCharge, setCollisionByType, updateNodeStyle, setThreeConfig],
  )

  return (
    <section className="mt-2" data-kg-anchor={UI_ANCHORS.ragEmbedding}>
      <section className="flex flex-wrap gap-2">
        <button
          className={presetButtonClassName}
          type="button"
          onClick={() => {
            const clean = buildCleanSchema()
            setSchema(clean)
            setCanvasRenderMode('2d')
          }}
        >
          Starter 2D
        </button>
        <button
          className={presetButtonClassName}
          type="button"
          onClick={() => {
            const nodeTypes = schema.catalog?.nodeTypes || []
            const edgeLabels = schema.catalog?.edgeLabels || []
            const nodePalette = ['#007BFF', '#FFC107', '#28A745', '#FD7E14', '#DC3545']
            nodeTypes.forEach((type, index) => {
              const color = nodePalette[index % nodePalette.length]
              updateNodeStyle(type, { color })
            })
            if (edgeLabels.length > 0) {
              const primaryEdgeLabel = edgeLabels[0]
              updateEdgeStyle(primaryEdgeLabel, { color: '#9aa0a6', width: 1.5 })
              setEdgeArrow(primaryEdgeLabel, true)
              const currentSchema = useGraphStore.getState().schema
              const routing = currentSchema.edgeRouting || {}
              const curvatureByLabel = routing.curvatureByLabel ? { ...routing.curvatureByLabel } : {}
              curvatureByLabel[primaryEdgeLabel] = 0.25
              setSchema({
                ...currentSchema,
                edgeRouting: { ...routing, mode: 'quadratic', curvatureByLabel },
              })
            }
            setCanvasRenderMode('2d')
          }}
        >
          Demo 2D Styling
        </button>
        {threePresetCatalog.map(preset => (
          <button
            key={preset.id}
            className={presetButtonClassName}
            type="button"
            disabled={inspection}
            onClick={() => applyThreePreset(preset)}
          >
            {preset.label}
          </button>
        ))}
        {graphSizePresetCatalog.map(preset => (
          <button
            key={preset.id}
            className={presetButtonClassName}
            type="button"
            onClick={() => applyGraphSizePreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </section>
    </section>
  )
}

export function TraversalPresetSection({
  runGraphRagTraversal,
  traversalStartNodeId,
  setTraversalStartNodeId,
  traversalMaxDepth,
  setTraversalMaxDepth,
  traversalLabelFilter,
  setTraversalLabelFilter,
  runTraversalQuery,
  selectedNodeId,
}: TraversalPresetSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const presetButtonClassName = `App-toolbar__btn text-xs px-2 py-1 border ${UI_THEME_TOKENS.input.border} ${uiToolbarButtonNeutralClassName}`
  const panelClassName = `mt-2 border ${UI_THEME_TOKENS.panel.border} rounded px-2 py-1 ${UI_THEME_TOKENS.panel.bg}`
  const sectionHeadingClassName = `${uiPanelKeyValueTextSizeClass} font-semibold uppercase tracking-wide ${UI_THEME_TOKENS.text.tertiary} mb-1`
  const keyLabelClassName = `${UI_THEME_TOKENS.text.secondary} break-words`

  return (
    <section
      className={panelClassName}
      data-kg-anchor={UI_ANCHORS.ragEmbedding}
    >
      <section className="flex items-center justify-between gap-1 mb-1">
        <Tooltip
          content={TRAVERSAL_PRESET_UI_TOOLTIP}
          maxWidthPx={260}

        >
          <section className={sectionHeadingClassName}>
            Traversal
          </section>
        </Tooltip>
      </section>
      <section className="flex flex-wrap gap-2">
        <button
          className={presetButtonClassName}
          type="button"
          onClick={runGraphRagTraversal}
          data-kg-anchor={UI_ANCHORS.ragGraphRAGWorkflow}
          aria-label={UI_LABELS.ragGraphRAGWorkflow}
        >
          {RENDER_TRAVERSAL_BUTTON_LABEL_GRAPH_RAG}
        </button>
        <button
          className={presetButtonClassName}
          type="button"
          onClick={() => {
            if (selectedNodeId) {
              setTraversalStartNodeId(selectedNodeId)
            }
            setTraversalMaxDepth(TRAVERSAL_MAX_DEPTH_DEFAULT)
            setTraversalLabelFilter('')
          }}
        >
          Neighborhood preset (2 hops from selected)
        </button>
        <button
          className={presetButtonClassName}
          type="button"
          onClick={() => {
            if (selectedNodeId) {
              setTraversalStartNodeId(selectedNodeId)
            }
            setTraversalMaxDepth(clampTraversalMaxDepth(4))
            setTraversalLabelFilter('requires,enables')
          }}
        >
          Requires/enables chain preset
        </button>
      </section>
      <section className={`mt-2 border-t ${UI_THEME_TOKENS.panel.divider} pt-2`}>
        <section className={sectionHeadingClassName}>
          Traversal Query
        </section>
        <section className="space-y-1">
          <KeyTypeValueRow
            density="compact"
            layout="keyIconValue"
            keyNode={(
              <Tooltip
                content="Orchestrator → choose startNodeId for generic traversal queries → treat this node as the traversal anchor so presets and ad‑hoc walks explore neighborhoods relative to a single starting point."
                maxWidthPx={260}

              >
                <span className={keyLabelClassName}>
                  traversalStartNodeId
                </span>
              </Tooltip>
            )}
            typeNode={null}
            valueNode={(
              <RightAlignedTooltipInput
                tooltip={buildNumericTooltip({
                  defaultValue: 'selected node',
                  impact: 'Sets traversal anchor; impacts presets and generic traversal queries.',
                })}
                type="text"
                value={traversalStartNodeId}
                onChange={e => setTraversalStartNodeId(e.target.value)}
                placeholder={selectedNodeId ? `Start node (default: ${selectedNodeId})` : 'Start node id'}
              />
            )}
          />
          <KeyTypeValueRow
            density="compact"
            layout="keyIconValue"
            keyNode={(
              <Tooltip
                content="Orchestrator → cap maxDepth hops from the traversal start node → bound neighborhood walks so generic traversals stay inspectable while still surfacing multi‑hop structure around the chosen anchor."
                maxWidthPx={260}

              >
                <span className={keyLabelClassName}>
                  traversalMaxDepth
                </span>
              </Tooltip>
            )}
            typeNode={null}
            valueNode={(
              <RightAlignedTooltipInput
                tooltip={buildNumericTooltip({
                  defaultValue: TRAVERSAL_MAX_DEPTH_DEFAULT,
                  min: TRAVERSAL_MAX_DEPTH_MIN,
                  max: TRAVERSAL_MAX_DEPTH_MAX,
                  interval: 1,
                  impact: 'More hops expands reach; fewer narrows scope.',
                })}
                type="number"
                min={TRAVERSAL_MAX_DEPTH_MIN}
                max={TRAVERSAL_MAX_DEPTH_MAX}
                value={clampTraversalMaxDepth(traversalMaxDepth)}
                onChange={e => {
                  const next = clampTraversalMaxDepth(e.target.value)
                  setTraversalMaxDepth(next)
                }}
              />
            )}
          />
          <KeyTypeValueRow
            density="compact"
            layout="keyIconValue"
            keyNode={(
              <Tooltip
                content="Orchestrator → filter traversal relations by allowed edge labels → keep generic walks constrained to selected relation names so GraphRAG‑style previews highlight only semantically relevant connections."
                maxWidthPx={260}

              >
                <span className={keyLabelClassName}>
                  traversalLabelFilter
                </span>
              </Tooltip>
            )}
            typeNode={null}
            valueNode={(
              <RightAlignedTooltipInput
                tooltip={buildNumericTooltip({
                  defaultValue: 'all labels',
                  impact: 'Comma-separated labels increase precision; empty favors recall.',
                })}
                type="text"
                value={traversalLabelFilter}
                onChange={e => setTraversalLabelFilter(e.target.value)}
                placeholder="Edge labels filter (comma separated)"
              />
            )}
          />
          <section className="flex justify-end pt-1">
            <button
              className={`App-toolbar__btn ${uiPanelKeyValueTextSizeClass} px-2 py-1 border ${UI_THEME_TOKENS.input.border} ${uiToolbarButtonNeutralClassName}`}
              type="button"
              onClick={runTraversalQuery}
            >
              Run Traversal
            </button>
          </section>
        </section>
      </section>
    </section>
  )
}
