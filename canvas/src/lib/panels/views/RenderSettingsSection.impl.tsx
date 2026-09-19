import React from 'react'
import { runMarkdownPipelineWithStatus } from '@/features/panels/hooks/markdownPipelineActions'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from '@/features/panels/ui/Tooltip'
import { KeyTypeValueStaticRow, RightAlignedValueCell } from 'grph-shared/react/keyTypeValueRow'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphBehavior, GraphSchema } from '@/lib/graph/schema'
import { DEFAULT_BBOX_COLLIDE_PADDING, DEFAULT_GROUP_BBOX_COLLIDE_PADDING } from '@/lib/graph/layoutDefaults'
import { RUN_CODEBASE_INDEX_PIPELINE_LABEL, UI_COPY } from '@/lib/config'
import { RENDER_PANEL_SECTION_COPY } from '@/features/panels/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import RenderPresetSection from '@/features/panels/views/RenderPresetSection'
import ThreeViewTuningSection from '@/features/panels/views/ThreeViewTuningSection'
import { LayoutModeRendererSettings } from '@/features/toolbar/ui/LayoutModeRendererSettings'
import MediaNodesSection from '@/features/panels/views/MediaNodesSection'
import { isVoxelModeApplicable } from '@/lib/canvas/canvas3dMode'
import { uiToolbarButtonMutedClassName } from '@/features/toolbar/ui/toolbarStyles'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
import { UI_RESPONSIVE_BADGE_CHIP_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
export const RENDER_SETTINGS_PRESETS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2'
type GraphSelectMode = NonNullable<GraphBehavior['selectMode']>
type GraphCreateMode = NonNullable<GraphBehavior['createMode']>

interface ThreeGroupsCollapsed {
  links: boolean
  layout: boolean
  backgroundFog: boolean
  starfield: boolean
  camera: boolean
  selection: boolean
}

interface RenderSettingsSectionProps {
  layoutSettings?: React.ComponentProps<typeof LayoutModeRendererSettings>
  inspection?: boolean
  threeGroupsCollapsed?: ThreeGroupsCollapsed
  onToggleThreeGroup?: (group: keyof ThreeGroupsCollapsed, next: boolean) => void
  presetsCollapsed?: boolean
  onTogglePresets?: (next: boolean) => void
  codebaseIndexCollapsed?: boolean
  onToggleCodebaseIndex?: (next: boolean) => void
}

export default function RenderSettingsSection({
  layoutSettings,
  inspection = false,
  threeGroupsCollapsed,
  onToggleThreeGroup,
  presetsCollapsed,
  onTogglePresets,
  codebaseIndexCollapsed,
  onToggleCodebaseIndex,
}: RenderSettingsSectionProps) {
  const schema = useGraphStore(s => s.schema) as GraphSchema
  const setSchema = useGraphStore(s => s.setSchema)
  const canvasRenderMode = useGraphStore(s => s.canvasRenderMode)
  const canvas3dMode = useGraphStore(s => s.canvas3dMode)
  const setCanvasRenderMode = useGraphStore(s => s.setCanvasRenderMode)
  const setCanvas3dMode = useGraphStore(s => s.setCanvas3dMode)
  const viewportControlsPreset = useGraphStore(s => s.viewportControlsPreset)
  const setViewportControlsPreset = useGraphStore(s => s.setViewportControlsPreset)
  const documentStructureBaselineLock = useGraphStore(s => s.documentStructureBaselineLock === true)
  const upsertUiToast = useGraphStore(s => s.upsertUiToast)
  const setThreeConfig = useGraphStore(s => s.setThreeConfig)
  const setCharge = useGraphStore(s => s.setCharge)
  const setCollisionByType = useGraphStore(s => s.setCollisionByType)
  const updateNodeStyle = useGraphStore(s => s.updateNodeStyle)
  const updateEdgeStyle = useGraphStore(s => s.updateEdgeStyle)
  const setEdgeArrow = useGraphStore(s => s.setEdgeArrow)
  const setSelectMode = useGraphStore(s => s.setSelectMode)
  const setCreateMode = useGraphStore(s => s.setCreateMode)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const frontmatterModeEnabled = useGraphStore(s => s.frontmatterModeEnabled === true)
  const multiDimTableModeEnabled = useGraphStore(s => s.multiDimTableModeEnabled === true)
  const documentSemanticMode = useGraphStore(s => s.documentSemanticMode)

  const ensureBaselineUnlocked = React.useCallback((): boolean => {
    if (documentStructureBaselineLock !== true) return true
    upsertUiToast({
      id: 'baseline-locked',
      kind: 'warning',
      message: UI_COPY.baselineLockedToast,
      ttlMs: 6000,
    })
    return false
  }, [documentStructureBaselineLock, upsertUiToast])

  const [pipelineStatus, setPipelineStatus] = React.useState<string | null>(null)
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || 'text-xs',
  )
  const uiPanelKeyValueInputClass = useGraphStore(
    s =>
      s.uiPanelKeyValueInputClass
      || PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  )
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )
  const neutralToolbarButtonClassName = `App-toolbar__btn ${uiToolbarButtonMutedClassName}`
  const compactStaticRowProps = {
    textSizeClassName: uiPanelKeyValueTextSizeClass,
    fontClassName: uiPanelTextFontClass,
    densityClassName: uiPanelRowDensityCompactClass,
    activeClassName: UI_THEME_TOKENS.table.rowHoverHighlight,
  } as const

  const voxelApplicable = isVoxelModeApplicable({
    canvas2dRenderer,
    documentSemanticMode,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    schema,
  })

  const setHideLabelsBelowScale = React.useCallback(
    (scale: number) => {
      const current = schema
      const curPerformance = current.performance || {}
      const curLod = curPerformance.lod || {}
      const nextScale = Number.isFinite(scale) ? Math.max(0, scale) : 0
      setSchema({
        ...current,
        performance: { ...curPerformance, lod: { ...curLod, hideLabelsBelowScale: nextScale } },
      })
    },
    [schema, setSchema],
  )


  const setFitPadding = React.useCallback(
    (value: number) => {
      const current = schema
      const curLayout = current.layout || {}
      const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : (curLayout.fitPadding ?? 80)
      setSchema({ ...current, layout: { ...curLayout, fitPadding: next } })
    },
    [schema, setSchema],
  )

  const setBboxCollidePadding = React.useCallback(
    (value: number) => {
      const current = schema
      const curLayout = current.layout || {}
      const curForces = curLayout.forces || {}
      const base = curForces.bboxCollidePadding
      const fallback =
        typeof base === 'number' && Number.isFinite(base) ? base : DEFAULT_BBOX_COLLIDE_PADDING
      const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
      setSchema({
        ...current,
        layout: { ...curLayout, forces: { ...curForces, bboxCollidePadding: next } },
      })
    },
    [schema, setSchema],
  )

  const setGroupBboxCollidePadding = React.useCallback(
    (value: number) => {
      const current = schema
      const curLayout = current.layout || {}
      const curForces = curLayout.forces || {}
      const base = curForces.groupBboxCollidePadding
      const fallback =
        typeof base === 'number' && Number.isFinite(base) ? base : DEFAULT_GROUP_BBOX_COLLIDE_PADDING
      const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
      setSchema({
        ...current,
        layout: { ...curLayout, forces: { ...curForces, groupBboxCollidePadding: next } },
      })
    },
    [schema, setSchema],
  )

  const setLabelRelaxMaxNodesForRelax = React.useCallback(
    (value: number) => {
      const current = schema
      const curPerformance = current.performance || {}
      const curLabelRelax = curPerformance.labelRelax || {}
      const base = curLabelRelax.maxNodesForRelax
      const fallback =
        typeof base === 'number' && Number.isFinite(base) ? base : 3600
      const rawNext = Number.isFinite(value) ? Math.floor(value) : fallback
      const next = Math.max(0, Math.min(8000, rawNext))
      setSchema({
        ...current,
        performance: { ...curPerformance, labelRelax: { ...curLabelRelax, maxNodesForRelax: next } },
      })
    },
    [schema, setSchema],
  )

  const setLabelRelaxMaxNodeLabels = React.useCallback(
    (value: number) => {
      const current = schema
      const curPerformance = current.performance || {}
      const curLabelRelax = curPerformance.labelRelax || {}
      const base = curLabelRelax.maxNodeLabels
      const fallback =
        typeof base === 'number' && Number.isFinite(base) ? base : 420
      const rawNext = Number.isFinite(value) ? Math.floor(value) : fallback
      const next = Math.max(0, Math.min(1200, rawNext))
      setSchema({
        ...current,
        performance: { ...curPerformance, labelRelax: { ...curLabelRelax, maxNodeLabels: next } },
      })
    },
    [schema, setSchema],
  )

  const setRectNodeMaxZoomMinimapWidthRatio = React.useCallback(
    (value: number | null) => {
      const current = schema
      const curLayout = current.layout || {}
      const curRect = curLayout.rectNodes || {}
      if (value === null) {
        const nextRect = { ...curRect } as { maxZoomMinimapWidthRatio?: number; maxZoomMinimapHeightRatio?: number }
        delete nextRect.maxZoomMinimapWidthRatio
        delete nextRect.maxZoomMinimapHeightRatio
        const hasAny = Object.values(nextRect).some(v => v !== undefined)
        setSchema({
          ...current,
          layout: {
            ...curLayout,
            rectNodes: hasAny ? nextRect : undefined,
          },
        })
        return
      }
      const widthRatio = Math.max(1, Math.min(50, value))
      const heightRatio = widthRatio / 2
      const nextRect = { ...curRect, maxZoomMinimapWidthRatio: widthRatio, maxZoomMinimapHeightRatio: heightRatio }
      const hasAny = Object.values(nextRect).some(v => v !== undefined)
      setSchema({
        ...current,
        layout: {
          ...curLayout,
          rectNodes: hasAny ? nextRect : undefined,
        },
      })
    },
    [schema, setSchema],
  )

  const setRectNodeMaxZoomMinimapHeightRatio = React.useCallback(
    (value: number | null) => {
      const current = schema
      const curLayout = current.layout || {}
      const curRect = curLayout.rectNodes || {}
      if (value === null) {
        const nextRect = { ...curRect } as { maxZoomMinimapWidthRatio?: number; maxZoomMinimapHeightRatio?: number }
        delete nextRect.maxZoomMinimapWidthRatio
        delete nextRect.maxZoomMinimapHeightRatio
        const hasAny = Object.values(nextRect).some(v => v !== undefined)
        setSchema({
          ...current,
          layout: {
            ...curLayout,
            rectNodes: hasAny ? nextRect : undefined,
          },
        })
        return
      }
      const rawHeight = Math.max(0.5, Math.min(25, value))
      const rawWidth = rawHeight * 2
      const widthRatio = Math.max(1, Math.min(50, rawWidth))
      const heightRatio = widthRatio / 2
      const nextRect = { ...curRect, maxZoomMinimapWidthRatio: widthRatio, maxZoomMinimapHeightRatio: heightRatio }
      const hasAny = Object.values(nextRect).some(v => v !== undefined)
      setSchema({
        ...current,
        layout: {
          ...curLayout,
          rectNodes: hasAny ? nextRect : undefined,
        },
      })
    },
    [schema, setSchema],
  )

  const handleRunCodebaseIndexPipeline = React.useCallback(async () => {
    await runMarkdownPipelineWithStatus(setPipelineStatus)
  }, [])

  const schemaBadges = React.useMemo(() => {
    if (!schema || !schema.propertySchemas) return []
    const badges = new Set<string>()
    const nodeProps = schema.propertySchemas.node || {}
    const edgeProps = schema.propertySchemas.edge || {}
    Object.keys(nodeProps).forEach(type => {
      const props = nodeProps[type] || {}
      Object.keys(props).forEach(key => {
        const spec = schema.validation?.node?.[type]
        if (!spec) return
        const isRequired = (spec.required || []).includes(key)
        const isUnique = (spec.uniqueness || []).includes(key)
        if (isRequired) badges.add('required')
        if (isUnique) badges.add('unique')
      })
    })
    Object.keys(edgeProps).forEach(label => {
      const props = edgeProps[label] || {}
      Object.keys(props).forEach(key => {
        const spec = schema.validation?.edge?.[label]
        if (!spec) return
        const isRequired = (spec.required || []).includes(key)
        const isUnique = (spec.uniqueness || []).includes(key)
        if (isRequired) badges.add('required')
        if (isUnique) badges.add('unique')
      })
    })
    const sorted = Array.from(badges)
    sorted.sort()
    return sorted
  }, [schema])

  const renderSectionTitle = React.useCallback(
    (copyKey: keyof typeof RENDER_PANEL_SECTION_COPY) => {
      const copy = RENDER_PANEL_SECTION_COPY[copyKey]
      const titleContent = (
        <section className="flex flex-col">
          <span className="inline-flex items-center gap-2">
            {copy.badge && (
              <span className={`text-xs font-semibold ${UI_THEME_TOKENS.text.tertiary}`}>
                {copy.badge}
              </span>
            )}
            <span className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>
              {copy.title}
            </span>
          </span>
          {copy.descriptionShort && (
            <span className={`${uiPanelMicroLabelTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
              {copy.descriptionShort}
            </span>
          )}
        </section>
      )
      if (!copy.tooltip) return titleContent
      return (
        <Tooltip
          content={copy.tooltip}
          maxWidthPx={260}
          contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
        >
          {titleContent}
        </Tooltip>
      )
    },
    [uiPanelMicroLabelTextSizeClass],
  )

  return (
    <section>
      {schemaBadges.length > 0 && (
        <section
          className={[
            `mb-2 flex flex-wrap gap-1 ${UI_THEME_TOKENS.text.primary}`,
            uiPanelKeyValueTextSizeClass,
            uiPanelTextFontClass,
          ].join(' ')}
        >
          {schemaBadges.map(badge => (
            <span
              key={badge}
              className={`${UI_RESPONSIVE_BADGE_CHIP_CLASSNAME} rounded-full border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.panel.headerBg}`}
            >
              {badge === 'required' ? 'R' : badge === 'unique' ? 'U' : badge}
            </span>
          ))}
        </section>
      )}
      <CollapsibleSection
        title={renderSectionTitle('presetsAndTuning')}
        toolbarAligned
        headerClassName="z-20"
        collapsed={presetsCollapsed}
        onToggle={onTogglePresets}
      >
        <LayoutModeRendererSettings embedded {...layoutSettings} inspection={inspection} />
        <section className="mt-2 space-y-2">
          <section className={RENDER_SETTINGS_PRESETS_GRID_CLASS_NAME}>
            <section className="flex items-center justify-between gap-2">
              <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.primary}`}>
                Render Mode
              </section>
              <select
                className={uiPanelKeyValueInputClass}
                disabled={inspection}
                value={canvasRenderMode}
                onChange={e => {
                  if (!ensureBaselineUnlocked()) return
                  setCanvasRenderMode(e.target.value === '3d' ? '3d' : '2d')
                }}
              >
                <option value="2d">2d</option>
                <option value="3d">3d</option>
              </select>
            </section>
            <section className="flex items-center justify-between gap-2">
              <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.primary}`}>
                Viewport Controls
              </section>
              <select
                className={uiPanelKeyValueInputClass}
                disabled={inspection}
                value={viewportControlsPreset || 'map'}
                onChange={e => {
                  const raw = e.target.value
                  setViewportControlsPreset(raw === 'design' ? 'design' : 'map')
                }}
              >
                <option value="map">map</option>
                <option value="design">design</option>
              </select>
            </section>
            <section className="flex items-center justify-between gap-2">
              <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.primary}`}>
                3D Mode
              </section>
              <select
                className={uiPanelKeyValueInputClass}
                value={canvas3dMode}
                disabled={inspection || canvasRenderMode !== '3d'}
                onChange={e => {
                  if (!ensureBaselineUnlocked()) return
                  const raw = e.target.value
                  const next = raw === 'voxel' ? 'voxel' : raw === 'xr' ? 'xr' : '3d'
                  if (next === 'voxel' && !voxelApplicable) return
                  setCanvas3dMode(next)
                }}
              >
                <option value="3d">3d</option>
                <option value="xr">xr</option>
                <option value="voxel" disabled={!voxelApplicable}>voxel</option>
              </select>
            </section>
            <section className="flex items-center justify-between gap-2">
              <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.primary}`}>
                Selection Mode
              </section>
              <select
                className={uiPanelKeyValueInputClass}
                disabled={inspection}
                value={(schema.behavior?.selectMode ?? 'single') as GraphSelectMode}
                onChange={e => {
                  if (!ensureBaselineUnlocked()) return
                  const raw = e.target.value
                  const next: GraphSelectMode =
                    raw === 'multi' || raw === 'lasso' ? (raw as GraphSelectMode) : 'single'
                  setSelectMode(next)
                }}
              >
                <option value="single">single</option>
                <option value="multi">multi</option>
                <option value="lasso">lasso</option>
              </select>
            </section>
            <section className="flex items-center justify-between gap-2">
              <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.primary}`}>
                Create Mode
              </section>
              <select
                className={uiPanelKeyValueInputClass}
                disabled={inspection}
                value={(schema.behavior?.createMode ?? 'shift-drag') as GraphCreateMode}
                onChange={e => {
                  if (!ensureBaselineUnlocked()) return
                  const raw = e.target.value
                  const next: GraphCreateMode =
                    raw === 'click-source-target' || raw === 'panel-only'
                      ? (raw as GraphCreateMode)
                      : 'shift-drag'
                  setCreateMode(next)
                }}
              >
                <option value="shift-drag">shift-drag</option>
                <option value="click-source-target">click-source-target</option>
                <option value="panel-only">panel-only</option>
              </select>
            </section>

          </section>
          <section className="pt-1">
            <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} font-semibold ${UI_THEME_TOKENS.text.primary}`}>
              Spacing and labels
            </section>
            <section className="mt-1 grid grid-cols-1 gap-1">
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.layout.fitPadding</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={1}
                      min={0}
                      className={uiPanelKeyValueInputClass}
                      value={schema.layout?.fitPadding ?? 80}
                      onChange={e => setFitPadding(parseFloat(e.target.value || '80'))}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.layout.forces.bboxCollidePadding</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={1}
                      min={0}
                      className={uiPanelKeyValueInputClass}
                      value={
                        typeof schema.layout?.forces?.bboxCollidePadding === 'number'
                          ? schema.layout.forces.bboxCollidePadding
                          : DEFAULT_BBOX_COLLIDE_PADDING
                      }
                      onChange={e => setBboxCollidePadding(parseFloat(e.target.value || String(DEFAULT_BBOX_COLLIDE_PADDING)))}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.layout.forces.groupBboxCollidePadding</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={1}
                      min={0}
                      className={uiPanelKeyValueInputClass}
                      value={
                        typeof schema.layout?.forces?.groupBboxCollidePadding === 'number'
                          ? schema.layout.forces.groupBboxCollidePadding
                          : DEFAULT_GROUP_BBOX_COLLIDE_PADDING
                      }
                      onChange={e => setGroupBboxCollidePadding(parseFloat(e.target.value || String(DEFAULT_GROUP_BBOX_COLLIDE_PADDING)))}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.layout.rectNodes.maxZoomMinimapWidthRatio</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={0.5}
                      min={1}
                      max={50}
                      className={uiPanelKeyValueInputClass}
                      value={
                        typeof schema.layout?.rectNodes?.maxZoomMinimapWidthRatio === 'number'
                          ? schema.layout.rectNodes.maxZoomMinimapWidthRatio
                          : typeof schema.layout?.rectNodes?.maxZoomMinimapHeightRatio === 'number'
                              ? schema.layout.rectNodes.maxZoomMinimapHeightRatio * 2
                              : ''
                      }
                      placeholder="5"
                      onChange={e => {
                        const rawText = String(e.target.value || '')
                        if (!rawText.trim()) {
                          setRectNodeMaxZoomMinimapWidthRatio(null)
                          return
                        }
                        const raw = parseFloat(rawText)
                        if (!Number.isFinite(raw)) return
                        setRectNodeMaxZoomMinimapWidthRatio(raw)
                      }}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.layout.rectNodes.maxZoomMinimapHeightRatio</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={0.5}
                      min={0.5}
                      max={25}
                      className={uiPanelKeyValueInputClass}
                      value={
                        typeof schema.layout?.rectNodes?.maxZoomMinimapWidthRatio === 'number'
                          ? schema.layout.rectNodes.maxZoomMinimapWidthRatio / 2
                          : typeof schema.layout?.rectNodes?.maxZoomMinimapHeightRatio === 'number'
                              ? schema.layout.rectNodes.maxZoomMinimapHeightRatio
                              : ''
                      }
                      placeholder="2.5"
                      onChange={e => {
                        const rawText = String(e.target.value || '')
                        if (!rawText.trim()) {
                          setRectNodeMaxZoomMinimapHeightRatio(null)
                          return
                        }
                        const raw = parseFloat(rawText)
                        if (!Number.isFinite(raw)) return
                        setRectNodeMaxZoomMinimapHeightRatio(raw)
                      }}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.performance.lod.hideLabelsBelowScale</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      className={uiPanelKeyValueInputClass}
                      value={schema.performance?.lod?.hideLabelsBelowScale ?? 0}
                      onChange={e => setHideLabelsBelowScale(parseFloat(e.target.value || '0'))}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.performance.labelRelax.maxNodesForRelax</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={100}
                      min={0}
                      className={uiPanelKeyValueInputClass}
                      value={schema.performance?.labelRelax?.maxNodesForRelax ?? 3600}
                      onChange={e => setLabelRelaxMaxNodesForRelax(parseFloat(e.target.value || '3600'))}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
              <KeyTypeValueStaticRow
                layout="keyValue"
                keyNode={<span className={uiPanelMonospaceTextClass}>graph.performance.labelRelax.maxNodeLabels</span>}
                valueNode={(
                  <RightAlignedValueCell>
                    <input
                      type="number"
                      step={20}
                      min={0}
                      className={uiPanelKeyValueInputClass}
                      value={schema.performance?.labelRelax?.maxNodeLabels ?? 420}
                      onChange={e => setLabelRelaxMaxNodeLabels(parseFloat(e.target.value || '420'))}
                    />
                  </RightAlignedValueCell>
                )}
                {...compactStaticRowProps}
              />
            </section>
          </section>
        </section>
        <RenderPresetSection
          inspection={inspection}
          schema={schema}
          setSchema={setSchema}
          setCanvasRenderMode={setCanvasRenderMode}
          setThreeConfig={setThreeConfig}
          setCharge={setCharge}
          setCollisionByType={setCollisionByType}
          updateNodeStyle={updateNodeStyle}
          updateEdgeStyle={updateEdgeStyle}
          setEdgeArrow={setEdgeArrow}
        />
        {!inspection && <ThreeViewTuningSection
          schema={schema}
          setThreeConfig={setThreeConfig}
          threeGroupsCollapsed={threeGroupsCollapsed}
          onToggleThreeGroup={onToggleThreeGroup}
        />}
      </CollapsibleSection>
      <MediaNodesSection toolbarAligned />
      <CollapsibleSection
        title={renderSectionTitle('codebaseIndexPipeline')}
        toolbarAligned
        collapsed={codebaseIndexCollapsed}
        onToggle={onToggleCodebaseIndex}
      >
        <section
          className={[
            `flex items-center gap-2 ${UI_THEME_TOKENS.text.tertiary}`,
            uiPanelKeyValueTextSizeClass,
            uiPanelTextFontClass,
          ].join(' ')}
        >
          <button
            type="button"
            className={[
              neutralToolbarButtonClassName,
              uiPanelKeyValueTextSizeClass,
              uiPanelTextFontClass,
            ].join(' ')}
            onClick={handleRunCodebaseIndexPipeline}
          >
            {RUN_CODEBASE_INDEX_PIPELINE_LABEL}
          </button>
          {pipelineStatus && (
            <span className="truncate">
              {pipelineStatus}
            </span>
          )}
        </section>
      </CollapsibleSection>
    </section>
  )
}
