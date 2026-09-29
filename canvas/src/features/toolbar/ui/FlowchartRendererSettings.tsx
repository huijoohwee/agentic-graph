import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_COMPACT_CONTROL_TOUCH_TARGET_CLASSNAME,
  UI_RESPONSIVE_CONTROL_TOUCH_TARGET_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildFlowchartApiMetaUrl } from '@/lib/flowchart/source'
import { useShallow } from 'zustand/react/shallow'
import {
  normalizeCompactControlsBreakpointPx,
  NumberRow,
  SelectRow,
  ToggleRow,
  useCompactControls,
} from './FlowchartRendererControls'
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'

type ApiRuntimeRun = {
  id: string
  title?: string
  preset?: string
  params?: Record<string, unknown>
  is_default?: boolean
  table_counts?: Record<string, number>
}

type ApiBuilderOption = {
  value: unknown
  label: string
}

type ApiRuntimePreset = {
  id: string
  title?: string
  params?: Record<string, unknown>
  param_keys?: string[]
  published_param_options?: Record<string, ApiBuilderOption[]>
}

type ApiRuntimeMobilePwa = {
  compact_controls_breakpoint_px?: number
  prefer_stacked_controls?: boolean
  safe_area_aware?: boolean
}

type ApiRuntimeMeta = {
  runtime?: {
    presets?: ApiRuntimePreset[]
    runs?: ApiRuntimeRun[]
    mobile_pwa?: ApiRuntimeMobilePwa
  }
}

type BuilderPresetSummary = {
  id: string
  title: string
  runCount: number
  label: string
}

const summarizeParams = (params: Record<string, unknown> | undefined): string => {
  if (!params || typeof params !== 'object') return ''
  const entries = Object.entries(params)
    .filter(([key]) => String(key || '').trim())
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
  return entries.join(', ')
}

const summarizeTableCounts = (tableCounts: Record<string, number> | undefined): string => {
  if (!tableCounts || typeof tableCounts !== 'object') return ''
  const preferredKeys = ['events', 'demos', 'sources', 'organizer', 'team', 'techstack']
  return preferredKeys
    .filter(key => typeof tableCounts[key] === 'number' && Number.isFinite(tableCounts[key]) && tableCounts[key] > 0)
    .map(key => `${tableCounts[key]} ${key}`)
    .join(' | ')
}

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return JSON.stringify(value.map(item => JSON.parse(stableSerialize(item))))
  if (value && typeof value === 'object') {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, JSON.parse(stableSerialize(nested))]),
      ),
    )
  }
  return JSON.stringify(value)
}

const buildPresetInitialParams = (preset: ApiRuntimePreset | null | undefined): Record<string, unknown> => {
  if (!preset) return {}
  const defaults = preset.params && typeof preset.params === 'object' ? preset.params : {}
  const keys = Array.isArray(preset.param_keys) ? preset.param_keys : Object.keys(defaults)
  return Object.fromEntries(
    keys.map(key => {
      const options = Array.isArray(preset.published_param_options?.[key]) ? preset.published_param_options?.[key] || [] : []
      const fallbackValue = Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : options[0]?.value
      return [key, fallbackValue]
    }),
  )
}

const normalizeBuilderParams = (preset: ApiRuntimePreset | null | undefined, params: Record<string, unknown>): Record<string, unknown> => {
  if (!preset) return {}
  const defaults = preset.params && typeof preset.params === 'object' ? preset.params : {}
  const keys = Array.isArray(preset.param_keys) ? preset.param_keys : Object.keys(defaults)
  return Object.fromEntries(
    keys
      .map(key => [key, Object.prototype.hasOwnProperty.call(params, key) ? params[key] : defaults[key]])
      .filter(([, value]) => typeof value !== 'undefined'),
  )
}

export function FlowchartRendererSettings() {
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')
  const [apiRuntimeMeta, setApiRuntimeMeta] = React.useState<ApiRuntimeMeta | null>(null)
  const [builderPresetId, setBuilderPresetId] = React.useState('')
  const [builderParams, setBuilderParams] = React.useState<Record<string, unknown>>({})
  const mobilePwa = apiRuntimeMeta?.runtime?.mobile_pwa
  const compactControlsBreakpointPx = React.useMemo(
    () => normalizeCompactControlsBreakpointPx(mobilePwa?.compact_controls_breakpoint_px),
    [mobilePwa?.compact_controls_breakpoint_px],
  )
  const preferStackedControls = mobilePwa?.prefer_stacked_controls !== false
  const compactControls = useCompactControls(preferStackedControls, compactControlsBreakpointPx)
  const safeAreaAware = mobilePwa?.safe_area_aware === true
  const compactButtonGroupClass = compactControls ? 'flex flex-col gap-1' : 'flex flex-wrap gap-1 justify-end'
  const compactButtonClass = compactControls ? 'w-full justify-center' : ''

  const {
    dataSource,
    setDataSource,
    apiRunId,
    setApiRunId,
    pollIntervalSec,
    setPollIntervalSec,
    nodeSizeMetric,
    setNodeSizeMetric,
    nodeGlowMetric,
    setNodeGlowMetric,
    nodePulseMetric,
    setNodePulseMetric,
    nodeBorderMetric,
    setNodeBorderMetric,
    edgeOpacityMetric,
    setEdgeOpacityMetric,
    showBadges,
    setShowBadges,
    showGapScore,
    setShowGapScore,
    showClusterGap,
    setShowClusterGap,
  } = useGraphStore(
    useShallow(s => ({
      dataSource: s.flowchartDataSource,
      setDataSource: s.setFlowchartDataSource,
      apiRunId: s.flowchartApiRunId,
      setApiRunId: s.setFlowchartApiRunId,
      pollIntervalSec: s.flowchartPollIntervalSec,
      setPollIntervalSec: s.setFlowchartPollIntervalSec,
      nodeSizeMetric: s.flowchartNodeSizeMetric,
      setNodeSizeMetric: s.setFlowchartNodeSizeMetric,
      nodeGlowMetric: s.flowchartNodeGlowMetric,
      setNodeGlowMetric: s.setFlowchartNodeGlowMetric,
      nodePulseMetric: s.flowchartNodePulseMetric,
      setNodePulseMetric: s.setFlowchartNodePulseMetric,
      nodeBorderMetric: s.flowchartNodeBorderMetric,
      setNodeBorderMetric: s.setFlowchartNodeBorderMetric,
      edgeOpacityMetric: s.flowchartEdgeOpacityMetric,
      setEdgeOpacityMetric: s.setFlowchartEdgeOpacityMetric,
      showBadges: s.flowchartShowSpecificityBadges,
      setShowBadges: s.setFlowchartShowSpecificityBadges,
      showGapScore: s.flowchartShowGapScoreInLabel,
      setShowGapScore: s.setFlowchartShowGapScoreInLabel,
      showClusterGap: s.flowchartShowClusterGapRatio,
      setShowClusterGap: s.setFlowchartShowClusterGapRatio,
    })),
  )

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(buildFlowchartApiMetaUrl(), { cache: 'no-store' })
        if (!res.ok) return
        const parsed = (await res.json()) as unknown
        if (cancelled || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
        setApiRuntimeMeta(parsed as ApiRuntimeMeta)
      } catch {
        if (!cancelled) setApiRuntimeMeta(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const apiRuns = React.useMemo(() => {
    const raw = apiRuntimeMeta?.runtime?.runs
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item): item is ApiRuntimeRun => !!item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string')
      .map(item => {
        const paramsSummary = summarizeParams(item.params)
        const baseTitle = String(item.title || item.id || '').trim()
        const label = [baseTitle, paramsSummary].filter(Boolean).join(' | ')
        return {
          id: String(item.id || '').trim(),
          title: baseTitle,
          preset: String(item.preset || '').trim(),
          params: item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : {},
          is_default: item.is_default === true,
          table_counts:
            item.table_counts && typeof item.table_counts === 'object' && !Array.isArray(item.table_counts)
              ? item.table_counts
              : {},
          label: item.is_default ? `${label || item.id} (default)` : label || String(item.id || '').trim(),
        }
      })
      .filter(item => item.id)
  }, [apiRuntimeMeta])

  const apiPresets = React.useMemo(() => {
    const raw = apiRuntimeMeta?.runtime?.presets
    if (!Array.isArray(raw)) return []
    const mapped = raw
      .filter((item): item is ApiRuntimePreset => !!item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string')
      .map(item => ({
        id: String(item.id || '').trim(),
        title: String(item.title || item.id || '').trim(),
        params: item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : {},
        param_keys: Array.isArray(item.param_keys) ? item.param_keys.map(key => String(key || '').trim()).filter(Boolean) : [],
        published_param_options:
          item.published_param_options && typeof item.published_param_options === 'object' && !Array.isArray(item.published_param_options)
            ? item.published_param_options
            : {},
      }))
      .filter(item => item.id)
    const runCounts = Object.fromEntries(
      apiRuns.map(run => String(run.preset || '').trim()).filter(Boolean).reduce((acc, presetId) => {
        acc.set(presetId, (acc.get(presetId) || 0) + 1)
        return acc
      }, new Map<string, number>()),
    )
    return mapped.sort((left, right) => {
      const runDiff = (runCounts[right.id] || 0) - (runCounts[left.id] || 0)
      if (runDiff !== 0) return runDiff
      return left.title.localeCompare(right.title)
    })
  }, [apiRuns, apiRuntimeMeta])

  const presetById = React.useMemo(
    () => Object.fromEntries(apiPresets.map(item => [item.id, item])),
    [apiPresets],
  )

  const defaultApiRunId = React.useMemo(() => apiRuntimeMeta?.runtime?.runs?.find(item => item?.is_default)?.id || '', [apiRuntimeMeta])

  const effectiveApiRunId = React.useMemo(() => {
    if (!apiRuns.length) return ''
    if (apiRunId && apiRuns.some(item => item.id === apiRunId)) return apiRunId
    if (defaultApiRunId && apiRuns.some(item => item.id === defaultApiRunId)) return defaultApiRunId
    return apiRuns[0]?.id || ''
  }, [apiRunId, apiRuns, defaultApiRunId])

  React.useEffect(() => {
    if (!effectiveApiRunId || effectiveApiRunId === apiRunId) return
    setApiRunId(effectiveApiRunId)
  }, [apiRunId, effectiveApiRunId, setApiRunId])

  const activeRun = React.useMemo(
    () => apiRuns.find(item => item.id === effectiveApiRunId) || null,
    [apiRuns, effectiveApiRunId],
  )

  React.useEffect(() => {
    const nextPresetId = String(activeRun?.preset || '').trim()
    if (!nextPresetId || !presetById[nextPresetId]) return
    const nextPreset = presetById[nextPresetId]
    const nextParams = normalizeBuilderParams(nextPreset, activeRun?.params && typeof activeRun.params === 'object' ? activeRun.params : {})
    const nextSignature = stableSerialize(nextParams)
    if (builderPresetId !== nextPresetId) setBuilderPresetId(nextPresetId)
    if (stableSerialize(builderParams) !== nextSignature) setBuilderParams(nextParams)
  }, [activeRun, builderParams, builderPresetId, presetById])

  React.useEffect(() => {
    if (builderPresetId || !apiPresets.length) return
    const nextPresetId = String(activeRun?.preset || '').trim() || apiPresets[0]?.id || ''
    if (!nextPresetId || !presetById[nextPresetId]) return
    setBuilderPresetId(nextPresetId)
    setBuilderParams(buildPresetInitialParams(presetById[nextPresetId]))
  }, [activeRun, apiPresets, builderPresetId, presetById])

  const effectiveBuilderPresetId = React.useMemo(() => {
    if (builderPresetId && presetById[builderPresetId]) return builderPresetId
    return apiPresets[0]?.id || ''
  }, [apiPresets, builderPresetId, presetById])

  const builderPreset = React.useMemo(
    () => presetById[effectiveBuilderPresetId] || null,
    [effectiveBuilderPresetId, presetById],
  )

  const builderParamKeys = React.useMemo(() => {
    if (!builderPreset) return []
    return Array.isArray(builderPreset.param_keys) ? builderPreset.param_keys : Object.keys(builderPreset.params || {})
  }, [builderPreset])

  const normalizedBuilderParams = React.useMemo(
    () => normalizeBuilderParams(builderPreset, builderParams),
    [builderParams, builderPreset],
  )

  const matchingPublishedRun = React.useMemo(() => {
    if (!builderPreset) return null
    const targetSignature = stableSerialize(normalizedBuilderParams)
    return (
      apiRuns.find(run => {
        if (String(run.preset || '').trim() !== builderPreset.id) return false
        return stableSerialize(run.params && typeof run.params === 'object' ? run.params : {}) === targetSignature
      }) || null
    )
  }, [apiRuns, builderPreset, normalizedBuilderParams])

  const presetSummaries = React.useMemo<BuilderPresetSummary[]>(() => {
    return apiPresets.map(preset => {
      const runCount = apiRuns.filter(run => String(run.preset || '').trim() === preset.id).length
      const paramCount = (Array.isArray(preset.param_keys) ? preset.param_keys : []).length
      const paramLabel = paramCount > 0 ? `${paramCount} param${paramCount === 1 ? '' : 's'}` : 'static'
      return {
        id: preset.id,
        title: preset.title || preset.id,
        runCount,
        label: `${runCount} runs | ${paramLabel}`,
      }
    })
  }, [apiPresets, apiRuns])

  const featuredPresetSummaries = React.useMemo(
    () => presetSummaries.filter(item => item.runCount > 1).slice(0, 3),
    [presetSummaries],
  )

  const currentPresetRuns = React.useMemo(() => {
    if (!builderPreset) return []
    return apiRuns
      .filter(run => String(run.preset || '').trim() === builderPreset.id)
      .sort((left, right) => {
        if (left.is_default && !right.is_default) return -1
        if (!left.is_default && right.is_default) return 1
        return String(left.title || left.id || '').localeCompare(String(right.title || right.id || ''))
      })
  }, [apiRuns, builderPreset])

  const activeRunSummary = React.useMemo(
    () => summarizeTableCounts(activeRun?.table_counts),
    [activeRun],
  )

  return (
    <CollapsibleSection title="Flowchart" defaultCollapsed={false} stickyHeader={false} headerClassName={`px-2 ${uiPanelTextFontClass}`}>
      <section
        className={uiToolbarSettingsPanelBodyClassName}
        style={safeAreaAware ? { paddingBottom: 'max(var(--kg-toolbar-settings-panel-body-padding-block), env(safe-area-inset-bottom))' } : undefined}
      >
        <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
          Maps the selected flowchart source into the existing 2D Flowchart scene without file-specific assumptions.
        </section>
        {preferStackedControls ? (
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            Mobile runtime stacks controls at {compactControlsBreakpointPx}px and keeps safe-area spacing {safeAreaAware ? 'on' : 'off'}.
          </section>
        ) : null}
        <SelectRow
          label="Data source"
          value={dataSource}
          options={['api', 'fixture', 'workspace']}
          onChange={v => setDataSource(v === 'fixture' ? 'fixture' : v === 'workspace' ? 'workspace' : 'api')}
          compact={compactControls}
        />
        {dataSource === 'api' && apiPresets.length > 0 ? (
          <SelectRow
            label="Build preset"
            value={effectiveBuilderPresetId}
            options={apiPresets.map(item => item.id)}
            optionLabels={Object.fromEntries(apiPresets.map(item => [item.id, item.title || item.id]))}
            onChange={nextPresetId => {
              const nextPreset = presetById[nextPresetId] || null
              setBuilderPresetId(nextPresetId)
              setBuilderParams(buildPresetInitialParams(nextPreset))
            }}
            compact={compactControls}
          />
        ) : null}
        {dataSource === 'api' && featuredPresetSummaries.length > 0 ? (
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            Best exact-match families: {featuredPresetSummaries.map(item => `${item.title} (${item.label})`).join(' | ')}
          </section>
        ) : null}
        {dataSource === 'api' && featuredPresetSummaries.length > 0 ? (
          <section className={compactButtonGroupClass}>
            {featuredPresetSummaries.map(item => (
              <button
                key={item.id}
                type="button"
                className={`App-toolbar__btn ${UI_RESPONSIVE_COMPACT_CONTROL_TOUCH_TARGET_CLASSNAME} text-xs border ${compactButtonClass} ${UI_THEME_TOKENS.input.border} ${
                  effectiveBuilderPresetId === item.id
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.primary}`
                }`}
                onClick={() => {
                  const nextPreset = presetById[item.id] || null
                  setBuilderPresetId(item.id)
                  setBuilderParams(buildPresetInitialParams(nextPreset))
                }}
              >
                {item.title}
              </button>
            ))}
          </section>
        ) : null}
        {dataSource === 'api' && builderPreset && builderParamKeys.map(paramKey => {
          const options = Array.isArray(builderPreset.published_param_options?.[paramKey]) ? builderPreset.published_param_options?.[paramKey] || [] : []
          if (options.length === 0) return null
          const optionLabels = Object.fromEntries(options.map(option => [stableSerialize(option.value), option.label]))
          const currentSignature = stableSerialize(normalizedBuilderParams[paramKey])
          return (
            <SelectRow
              key={paramKey}
              label={`Param: ${paramKey}`}
              value={currentSignature}
              options={options.map(option => stableSerialize(option.value))}
              optionLabels={optionLabels}
              onChange={nextValueSignature => {
                const nextOption = options.find(option => stableSerialize(option.value) === nextValueSignature)
                if (!nextOption) return
                setBuilderParams(prev => ({ ...prev, [paramKey]: nextOption.value }))
              }}
              compact={compactControls}
            />
          )
        })}
        {dataSource === 'api' && builderPreset ? (
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            {matchingPublishedRun
              ? `Builder match: ${matchingPublishedRun.title || matchingPublishedRun.id}`
              : 'Builder match: no exact published run for the current preset and published-safe values.'}
          </section>
        ) : null}
        {dataSource === 'api' && currentPresetRuns.length > 1 ? (
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            Quick exact runs for this preset
          </section>
        ) : null}
        {dataSource === 'api' && currentPresetRuns.length > 1 ? (
          <section className={compactButtonGroupClass}>
            {currentPresetRuns.slice(0, 6).map(run => (
              <button
                key={run.id}
                type="button"
                className={`App-toolbar__btn ${UI_RESPONSIVE_COMPACT_CONTROL_TOUCH_TARGET_CLASSNAME} text-xs border ${compactButtonClass} ${UI_THEME_TOKENS.input.border} ${
                  effectiveApiRunId === run.id
                    ? `${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`
                    : `${UI_THEME_TOKENS.panel.headerBg} ${UI_THEME_TOKENS.text.primary}`
                }`}
                onClick={() => setApiRunId(run.id)}
              >
                {run.title || run.id}
              </button>
            ))}
          </section>
        ) : null}
        {dataSource === 'api' && matchingPublishedRun && matchingPublishedRun.id !== effectiveApiRunId ? (
          <section className={compactControls ? 'flex' : 'flex justify-end'}>
            <button
              type="button"
              className={`App-toolbar__btn ${UI_RESPONSIVE_CONTROL_TOUCH_TARGET_CLASSNAME} text-xs border ${compactControls ? 'w-full justify-center' : ''} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.activeBg} ${UI_THEME_TOKENS.button.activeText}`}
              onClick={() => setApiRunId(matchingPublishedRun.id)}
            >
              Use builder match
            </button>
          </section>
        ) : null}
        {dataSource === 'api' && apiRuns.length > 0 ? (
          <SelectRow
            label="Published run"
            value={effectiveApiRunId}
            options={apiRuns.map(item => item.id)}
            optionLabels={Object.fromEntries(apiRuns.map(item => [item.id, item.label]))}
            onChange={setApiRunId}
            compact={compactControls}
          />
        ) : null}
        {dataSource === 'api' && activeRunSummary ? (
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            Selected run summary: {activeRunSummary}
          </section>
        ) : null}
        {dataSource === 'api' && apiRuns.length > 0 ? (
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
            {apiRuns.find(item => item.id === effectiveApiRunId)?.label || ''}
          </section>
        ) : null}
        <NumberRow
          label="Poll interval (s)"
          value={pollIntervalSec}
          min={3}
          max={3600}
          step={1}
          onChange={setPollIntervalSec}
          compact={compactControls}
        />
        <section className={`pt-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Metric mapping</section>
        <SelectRow
          label="Node size"
          value={nodeSizeMetric}
          options={['gap_score', 'pmf_score', 'gap_velocity', 'source_count', 'none']}
          onChange={v => {
            const next =
              v === 'pmf_score' || v === 'gap_velocity' || v === 'source_count' || v === 'none' ? v : 'gap_score'
            setNodeSizeMetric(next)
          }}
          compact={compactControls}
        />
        <SelectRow
          label="Node glow"
          value={nodeGlowMetric}
          options={['pmf_score', 'gap_score', 'none']}
          onChange={v => {
            const next = v === 'gap_score' || v === 'none' ? v : 'pmf_score'
            setNodeGlowMetric(next)
          }}
          compact={compactControls}
        />
        <SelectRow
          label="Pulse speed"
          value={nodePulseMetric}
          options={['gap_velocity', 'pmf_score', 'none']}
          onChange={v => {
            const next = v === 'pmf_score' || v === 'none' ? v : 'gap_velocity'
            setNodePulseMetric(next)
          }}
          compact={compactControls}
        />
        <SelectRow
          label="Border thickness"
          value={nodeBorderMetric}
          options={['source_count', 'gap_score', 'none']}
          onChange={v => {
            const next = v === 'gap_score' || v === 'none' ? v : 'source_count'
            setNodeBorderMetric(next)
          }}
          compact={compactControls}
        />
        <SelectRow
          label="Edge opacity"
          value={edgeOpacityMetric}
          options={['strength', 'none']}
          onChange={v => setEdgeOpacityMetric(v === 'none' ? 'none' : 'strength')}
          compact={compactControls}
        />
        <section className={`pt-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Labels</section>
        <ToggleRow label="Specificity badges" value={showBadges} onChange={setShowBadges} compact={compactControls} />
        <ToggleRow label="Gap score in label" value={showGapScore} onChange={setShowGapScore} compact={compactControls} />
        <ToggleRow label="Cluster gap ratio" value={showClusterGap} onChange={setShowClusterGap} compact={compactControls} />
      </section>
    </CollapsibleSection>
  )
}
