import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import {
  DUCKDB_SQL_FIELD_TOOLTIP,
  DUCKDB_QUERY_PRESETS_TOOLTIP,
  DUCKDB_QUERY_PRESET_ID_TOOLTIP,
  DUCKDB_QUERY_PRESET_DESCRIPTION_TOOLTIP,
  UI_COPY,
} from '@/lib/config'
import type { DuckDbQueryConfig } from '@/features/panels/utils/graphragConfig'
import { TraversalPresetSection } from '@/features/panels/views/RenderPresetSection'
import { OrchestratorTraversalSectionContent } from '@/features/panels/views/OrchestratorTraversalSection'
import { buildOrchestratorTraversalSectionViewModel } from '@/features/panels/views/OrchestratorTraversalSectionModel'
import type { GraphRagPathHelper } from '@/features/panels/views/OrchestratorTraversalPanelsModel'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import Tooltip from '@/features/panels/ui/Tooltip'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MonacoTextEditor } from '@/features/monaco/MonacoTextEditor'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_CHIP_CLASSNAME,
  UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME,
  UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  uiToolbarButtonMutedClassName,
  uiToolbarButtonPrimarySolidClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
const inlineNodeButtonClassName = `${UI_RESPONSIVE_CHIP_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`
const helperPanelClassName = `mb-2 border ${UI_THEME_TOKENS.panel.border} rounded px-2 py-1`
const helperTitleClassName = UI_THEME_TOKENS.text.tertiary
const helperLabelClassName = `${UI_THEME_TOKENS.text.tertiary} break-words`
const helperValueTextClassName = UI_THEME_TOKENS.text.primary
const helperBodyTextClassName = UI_THEME_TOKENS.text.secondary
const inlineSelectClassName = `border ${UI_THEME_TOKENS.input.border} rounded ${UI_RESPONSIVE_MICRO_INLINE_CONTROL_CLASSNAME} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} w-full sm:w-auto`

type DuckDbQueryPresetDirectionMode = {
  id: string
  label: string
  buildSql: () => string
}

type DuckDbQueryPreset = DuckDbQueryConfig & {
  directionModes?: DuckDbQueryPresetDirectionMode[]
}

interface OrchestratorTraversalPresetsSectionProps {
  runGraphRagTraversal: () => void
  traversalPlaneProgress?: number | null
  traversalStartNodeId: string
  setTraversalStartNodeId: (value: string) => void
  traversalMaxDepth: number
  setTraversalMaxDepth: (value: number) => void
  traversalLabelFilter: string
  setTraversalLabelFilter: (value: string) => void
  runGenericTraversalQuery: () => void
  selectedNodeId: string | null
  graphRagPathHelper: GraphRagPathHelper | null
  graphNodesById: Record<string, { label: string }>
  selectNode: (id: string | null) => void
  duckdbQueriesFromConfig?: DuckDbQueryConfig[]
}

interface GraphRagPathTraverseHelperSectionProps {
  runGraphRagTraversal: () => void
  traversalPlaneProgress?: number | null
  graphRagPathHelper: GraphRagPathHelper | null
  graphNodesById: Record<string, { label: string }>
  selectNode: (id: string | null) => void
  setTraversalStartNodeId: (value: string) => void
  setTraversalLabelFilter: (value: string) => void
  setTraversalMaxDepth: (value: number) => void
  runGenericTraversalQuery: () => void
  uiPanelKeyValueTextSizeClass: string
  uiPanelTextFontClass: string
}

function GraphRagPathTraverseHelperSection({
  runGraphRagTraversal,
  traversalPlaneProgress,
  graphRagPathHelper,
  graphNodesById,
  selectNode,
  setTraversalStartNodeId,
  setTraversalLabelFilter,
  setTraversalMaxDepth,
  runGenericTraversalQuery,
  uiPanelKeyValueTextSizeClass,
  uiPanelTextFontClass,
}: GraphRagPathTraverseHelperSectionProps) {
  const defaultStaticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const compactStaticRowProps = useCanvasKeyTypeValueStaticRowProps('compact')
  if (!graphRagPathHelper) return null

  return (
    <section className={helperPanelClassName}>
      <section
        className={[
          `font-semibold uppercase tracking-normal ${helperTitleClassName} mb-1`,
          uiPanelKeyValueTextSizeClass,
          uiPanelTextFontClass,
        ].join(' ')}
      >
        {UI_COPY.orchestratorGraphRagPathTraverseHelperTitle}
      </section>
      <section className="space-y-1">
        <KeyTypeValueStaticRow
          {...defaultStaticRowProps}
          layout="keyIconValue"
          keyNode={(
            <span className={helperLabelClassName}>{UI_COPY.orchestratorControlsLabel}</span>
          )}
          typeNode={null}
          valueNode={(
            <section className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={[
                  `App-toolbar__btn ${uiToolbarButtonMutedClassName}`,
                  uiPanelKeyValueTextSizeClass,
                  uiPanelTextFontClass,
                ].join(' ')}
                onClick={runGraphRagTraversal}
              >
                <span className="inline-flex items-center gap-2">
                  <span>{UI_COPY.orchestratorPlayPathButtonLabel}</span>
                  {typeof traversalPlaneProgress === 'number' && Number.isFinite(traversalPlaneProgress) && traversalPlaneProgress >= 0 && traversalPlaneProgress <= 1 && (
                    <span className="relative inline-block w-10 h-3 overflow-hidden align-middle" aria-hidden="true">
                      <span className={`absolute left-0 right-0 top-1/2 h-px ${UI_THEME_TOKENS.panel.divider}`} style={{ transform: 'translateY(-50%)' }} />
                      <span
                        className="absolute top-1/2"
                        style={{
                          transform: `translate(${Math.round(traversalPlaneProgress * 36)}px, -50%)`,
                          fontSize: 12,
                          opacity: 0.85,
                        }}
                      >
                        {'✈'}
                      </span>
                    </span>
                  )}
                </span>
              </button>
              <Tooltip
                content="Preset optimized for inspecting a single path via traversal."
                maxWidthPx={260}
                contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              >
                <button
                  type="button"
                  className={[
                    `App-toolbar__btn ${uiToolbarButtonMutedClassName}`,
                    uiPanelKeyValueTextSizeClass,
                    uiPanelTextFontClass,
                  ].join(' ')}
                  onClick={() => {
                    const ownerId = graphRagPathHelper.ownerNodeId
                    if (!ownerId) return
                    selectNode(ownerId)
                    setTraversalStartNodeId(ownerId)
                    setTraversalLabelFilter(
                      'imports,contains,calls,hasRuntimeEvent,runtimeOf',
                    )
                    setTraversalMaxDepth(4)
                    runGenericTraversalQuery()
                  }}
                >
                  {UI_COPY.orchestratorPlayGraphRagTraversalButtonLabel}
                </button>
              </Tooltip>
            </section>
          )}
        />
        <KeyTypeValueStaticRow
          {...compactStaticRowProps}
          layout="keyIconValue"
          keyNode={(
            <span className={helperLabelClassName}>{UI_COPY.orchestratorSequenceLabel}</span>
          )}
          typeNode={null}
          valueNode={(
            <section
              className={[
                'flex flex-wrap gap-1',
                helperValueTextClassName,
                uiPanelKeyValueTextSizeClass,
                uiPanelTextFontClass,
              ].join(' ')}
            >
              {[graphRagPathHelper.ownerNodeId, ...graphRagPathHelper.traverse].map(
                (nodeId, index) => {
                  const node = graphNodesById[String(nodeId)]
                  const label = node ? node.label : String(nodeId)
                  return (
                    <button
                      key={`${nodeId}-${index}`}
                      type="button"
                      className={inlineNodeButtonClassName}
                      onClick={() => selectNode(String(nodeId))}
                    >
                      {label}
                    </button>
                  )
                },
              )}
            </section>
          )}
          align="start"
        />
      </section>
    </section>
  )
}

interface DuckDbQueryPresetsSectionProps {
  presets: DuckDbQueryPreset[]
  activePresetId: string
  setActivePresetId: (value: string) => void
  editableSqlById: Record<string, string>
  setEditableSqlById: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  directionModeByPresetId: Record<string, string>
  setDirectionModeByPresetId: (
    updater: (prev: Record<string, string>) => Record<string, string>,
  ) => void
  setTraversalStartNodeId: (value: string) => void
  setTraversalLabelFilter: (value: string) => void
  setTraversalMaxDepth: (value: number) => void
  uiPanelMonospaceTextClass: string
  uiPanelKeyValueTextSizeClass: string
  uiPanelTextFontClass: string
}

function DuckDbQueryPresetsSection({
  presets,
  activePresetId,
  setActivePresetId,
  editableSqlById,
  setEditableSqlById,
  directionModeByPresetId,
  setDirectionModeByPresetId,
  setTraversalStartNodeId,
  setTraversalLabelFilter,
  setTraversalMaxDepth,
  uiPanelMonospaceTextClass,
  uiPanelKeyValueTextSizeClass,
  uiPanelTextFontClass,
}: DuckDbQueryPresetsSectionProps) {
  const activePreset = presets.find(preset => preset.id === activePresetId) || null
  const defaultStaticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  if (!activePreset) return null

  return (
    <section className={helperPanelClassName}>
      <section
        className={[
          `font-semibold uppercase tracking-normal ${helperTitleClassName} mb-1`,
          uiPanelKeyValueTextSizeClass,
          uiPanelTextFontClass,
        ].join(' ')}
      >
        <Tooltip
          content={DUCKDB_QUERY_PRESETS_TOOLTIP}
          maxWidthPx={260}
          contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
        >
          <span>{UI_COPY.orchestratorDuckDbQueryPresetsTitle}</span>
        </Tooltip>
      </section>
      <section className="space-y-1">
        <KeyTypeValueStaticRow
          {...defaultStaticRowProps}
          layout="keyIconValue"
          keyNode={(
            <Tooltip
              content={DUCKDB_QUERY_PRESET_ID_TOOLTIP}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className={helperLabelClassName}
            >
              duckdbQueries[].id
            </Tooltip>
          )}
          typeNode={null}
          valueNode={(
            <section className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 w-full">
              <section className="flex items-center gap-1 w-full sm:w-auto">
                <Tooltip
                  content={UI_COPY.orchestratorDuckDbPresetSelectTooltip}
                  maxWidthPx={260}
                  contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
                  className="w-full sm:w-auto"
                >
                  <PanelSelect
                    className={[
                      inlineSelectClassName,
                      UI_THEME_TOKENS.focus.primaryBorderRing,
                      uiPanelKeyValueTextSizeClass,
                      uiPanelTextFontClass,
                    ].join(' ')}
                    value={activePresetId}
                    onValueChange={selectedValueInput => setActivePresetId(selectedValueInput)}
                  >
                    {presets.map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </PanelSelect>
                </Tooltip>
                {activePreset.suggestedStartNodeId && (
                  <button
                    type="button"
                    className={[
                      `App-toolbar__btn ${uiToolbarButtonMutedClassName}`,
                      uiPanelKeyValueTextSizeClass,
                      uiPanelTextFontClass,
                    ].join(' ')}
                    onClick={() => {
                      setTraversalStartNodeId(activePreset.suggestedStartNodeId || '')
                      setTraversalLabelFilter('calls')
                      setTraversalMaxDepth(4)
                    }}
                  >
                    {UI_COPY.orchestratorDuckDbSeedTraversalButtonLabel}
                  </button>
                )}
              </section>
              <section className="flex items-center gap-1 w-full sm:w-auto">
                <button
                  type="button"
                  className={[
                    `App-toolbar__btn ${uiToolbarButtonMutedClassName}`,
                    uiPanelKeyValueTextSizeClass,
                    uiPanelTextFontClass,
                  ].join(' ')}
                  onClick={() => {
                    const text = editableSqlById[activePresetId] || activePreset.sql
                    if (
                      navigator &&
                      navigator.clipboard &&
                      typeof navigator.clipboard.writeText === 'function'
                    ) {
                      navigator.clipboard.writeText(text).catch(() => {})
                    }
                  }}
                >
                  {UI_COPY.orchestratorDuckDbCopySqlButtonLabel}
                </button>
                {activePreset.directionModes && activePreset.directionModes.length > 0 && (
                  <section className="flex flex-wrap items-center gap-1">
                    <span
                      className={[
                        helperLabelClassName,
                        uiPanelKeyValueTextSizeClass,
                        uiPanelTextFontClass,
                      ].join(' ')}
                    >
                      {UI_COPY.orchestratorDuckDbDirectionLabel}
                    </span>
                    {activePreset.directionModes.map(mode => {
                      const currentModeId =
                        directionModeByPresetId[activePreset.id] ||
                        activePreset.directionModes?.[0]?.id ||
                        ''
                      const isActive = currentModeId === mode.id
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          className={[
                            'App-toolbar__btn',
                            isActive ? uiToolbarButtonPrimarySolidClassName : uiToolbarButtonMutedClassName,
                            uiPanelKeyValueTextSizeClass,
                            uiPanelTextFontClass,
                          ].join(' ')}
                          onClick={() => {
                            setDirectionModeByPresetId(prev => ({
                              ...prev,
                              [activePreset.id]: mode.id,
                            }))
                            setEditableSqlById(prev => ({
                              ...prev,
                              [activePreset.id]: mode.buildSql(),
                            }))
                          }}
                        >
                          {mode.label}
                        </button>
                      )
                    })}
                  </section>
                )}
              </section>
            </section>
          )}
        />
        <KeyTypeValueStaticRow
          {...defaultStaticRowProps}
          layout="keyIconValue"
          keyNode={(
            <Tooltip
              content={DUCKDB_QUERY_PRESET_DESCRIPTION_TOOLTIP}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className={UI_THEME_TOKENS.text.tertiary}
            >
              duckdbQueries[].description
            </Tooltip>
          )}
          typeNode={null}
          valueNode={(
            <Tooltip
              content={UI_COPY.orchestratorDuckDbDescriptionValueTooltip}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            >
              <section
                className={[
                  helperBodyTextClassName,
                  uiPanelKeyValueTextSizeClass,
                  uiPanelTextFontClass,
                ].join(' ')}
              >
                {activePreset.description}
              </section>
            </Tooltip>
          )}
          align="start"
        />
        <KeyTypeValueStaticRow
          {...defaultStaticRowProps}
          layout="keyIconValue"
          keyNode={(
            <Tooltip
              content={DUCKDB_SQL_FIELD_TOOLTIP}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className={UI_THEME_TOKENS.text.tertiary}
            >
              duckdbQueries[].sql
            </Tooltip>
          )}
          typeNode={null}
          valueNode={(
            <Tooltip
              content={UI_COPY.orchestratorDuckDbSqlValueTooltip}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className="w-full"
            >
              <section className={`${UI_RESPONSIVE_PANEL_CODE_EDITOR_FRAME_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded overflow-hidden ${UI_THEME_TOKENS.input.bg}`}>
                <MonacoTextEditor
                  value={editableSqlById[activePresetId] || activePreset.sql}
                  onChange={(value) => {
                    setEditableSqlById(prev => ({
                      ...prev,
                      [activePresetId]: value,
                    }))
                  }}
                  language="sql"
                  uri={`inmemory://duckdb/sql/${encodeURIComponent(activePresetId)}`}
                  themeMode="light"
                  wordWrap={false}
                  className={`w-full h-full ${uiPanelMonospaceTextClass}`}
                />
              </section>
            </Tooltip>
          )}
          align="start"
        />
      </section>
    </section>
  )
}

export function OrchestratorTraversalPresetsSection({
  runGraphRagTraversal,
  traversalPlaneProgress,
  traversalStartNodeId,
  setTraversalStartNodeId,
  traversalMaxDepth,
  setTraversalMaxDepth,
  traversalLabelFilter,
  setTraversalLabelFilter,
  runGenericTraversalQuery,
  selectedNodeId,
  graphRagPathHelper,
  graphNodesById,
  selectNode,
  duckdbQueriesFromConfig,
}: OrchestratorTraversalPresetsSectionProps) {
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const presets: DuckDbQueryPreset[] = React.useMemo(() => {
    const list: DuckDbQueryPreset[] = []
    if (Array.isArray(duckdbQueriesFromConfig) && duckdbQueriesFromConfig.length > 0) {
      duckdbQueriesFromConfig.forEach((item) => {
        if (!item) return
        const id = typeof item.id === 'string' ? item.id.trim() : ''
        const label = typeof item.label === 'string' ? item.label.trim() : ''
        const sql = typeof item.sql === 'string' ? item.sql : ''
        if (!id || !label || !sql.trim()) return
        const preset: DuckDbQueryPreset = {
          id,
          label,
          sql,
          description: item.description,
          suggestedStartNodeId: item.suggestedStartNodeId,
        }
        list.push(preset)
      })
    }
    return list
  }, [duckdbQueriesFromConfig])

  const [activePresetId, setActivePresetId] = React.useState<string>(
    presets[0]?.id ?? '',
  )
  const [editableSqlById, setEditableSqlById] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    presets.forEach(preset => {
      initial[preset.id] = preset.sql
    })
    return initial
  })
  const [directionModeByPresetId, setDirectionModeByPresetId] = React.useState<Record<string, string>>(
    {},
  )

  React.useEffect(() => {
    if (!presets.length) {
      setActivePresetId('')
      setEditableSqlById({})
      setDirectionModeByPresetId({})
      return
    }
    const nextId = presets[0].id
    setActivePresetId(nextId)
    const initial: Record<string, string> = {}
    presets.forEach(preset => {
      initial[preset.id] = preset.sql
    })
    setEditableSqlById(initial)
    setDirectionModeByPresetId({})
  }, [presets])

  return (
    <>
      <TraversalPresetSection
        runGraphRagTraversal={runGraphRagTraversal}
        traversalStartNodeId={traversalStartNodeId}
        setTraversalStartNodeId={setTraversalStartNodeId}
        traversalMaxDepth={traversalMaxDepth}
        setTraversalMaxDepth={setTraversalMaxDepth}
        traversalLabelFilter={traversalLabelFilter}
        setTraversalLabelFilter={setTraversalLabelFilter}
        runTraversalQuery={runGenericTraversalQuery}
        selectedNodeId={selectedNodeId}
      />
      <GraphRagPathTraverseHelperSection
        runGraphRagTraversal={runGraphRagTraversal}
        traversalPlaneProgress={traversalPlaneProgress}
        graphRagPathHelper={graphRagPathHelper}
        graphNodesById={graphNodesById}
        selectNode={selectNode}
        setTraversalStartNodeId={setTraversalStartNodeId}
        setTraversalLabelFilter={setTraversalLabelFilter}
        setTraversalMaxDepth={setTraversalMaxDepth}
        runGenericTraversalQuery={runGenericTraversalQuery}
        uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
        uiPanelTextFontClass={uiPanelTextFontClass}
      />
      <DuckDbQueryPresetsSection
        presets={presets}
        activePresetId={activePresetId}
        setActivePresetId={setActivePresetId}
        editableSqlById={editableSqlById}
        setEditableSqlById={setEditableSqlById}
        directionModeByPresetId={directionModeByPresetId}
        setDirectionModeByPresetId={setDirectionModeByPresetId}
        setTraversalStartNodeId={setTraversalStartNodeId}
        setTraversalLabelFilter={setTraversalLabelFilter}
        setTraversalMaxDepth={setTraversalMaxDepth}
        uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
        uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
        uiPanelTextFontClass={uiPanelTextFontClass}
      />
    </>
  )
}

interface OrchestratorTraversalAndLayersSectionProps {
  traversalViewModel: ReturnType<typeof buildOrchestratorTraversalSectionViewModel>
}

export function OrchestratorTraversalAndLayersSection({
  traversalViewModel,
}: OrchestratorTraversalAndLayersSectionProps) {
  return (
    <>
      <OrchestratorTraversalSectionContent viewModel={traversalViewModel} />
    </>
  )
}
