import React from 'react'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  isPromptPresetCatalogError,
  type PromptPreset,
} from '@/features/chat/promptPresetCatalog'
import {
  defaultPromptPresetSelectionRuntime,
  type PromptPresetSelectionRuntime,
} from '@/features/chat/promptPresetSelectionRuntime'
import { openFloatingPanelChatWithSeedWhenReady } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import { MainPanelTypeIcon } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { resolveInlineInvocationChipClassName } from '@/features/markdown/ui/dataViewChipStyles'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import {
  FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT,
  FloatingPanelCatalogHeader,
  FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogCompactIconFrameClassName,
  floatingPanelCatalogCompactRowClassName,
  floatingPanelCatalogCompactRowMetaClassName,
  floatingPanelCatalogCompactRowTitleClassName,
  floatingPanelCatalogSurfaceClassName,
  matchesFloatingPanelCatalogSearch,
  useFloatingPanelCatalogSearch,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { UI_TEXT_TRUNCATE_CHIP } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export type FloatingPanelPromptPresetsRuntime = PromptPresetSelectionRuntime & {
  invokePrompt: (prompt: string) => boolean
}

const defaultFloatingPanelPromptPresetsRuntime: FloatingPanelPromptPresetsRuntime = {
  ...defaultPromptPresetSelectionRuntime,
  invokePrompt: prompt => openFloatingPanelChatWithSeedWhenReady({
    text: prompt,
    mode: 'replace',
    delivery: 'queuedHandoff',
    submit: false,
  }),
}

function renderPromptPresetTokenChip(preset: PromptPreset): React.ReactNode {
  const className = resolveInlineInvocationChipClassName({
    value: preset.slashCommand,
    extraClassName: 'max-w-[7.5rem]',
  })
  const chip = renderAgenticOsInvocationKeywordChip({ value: preset.slashCommand, className })
  if (React.isValidElement<{ className?: string }>(chip)) {
    return React.cloneElement(chip, {
      className: cn(chip.props.className, 'shrink-0'),
      'data-kg-prompt-preset-token-chip': preset.id,
    } as React.HTMLAttributes<HTMLElement>)
  }
  return (
    <span
      className={cn(className, 'shrink-0')}
      title={preset.slashCommand}
      data-kg-card-inline-keyword-pill="1"
      data-kg-prompt-preset-token-chip={preset.id}
    >
      <span className={UI_TEXT_TRUNCATE_CHIP}>{preset.slashCommand}</span>
    </span>
  )
}

export function FloatingPanelPromptPresetsView({
  runtime = defaultFloatingPanelPromptPresetsRuntime,
}: {
  runtime?: FloatingPanelPromptPresetsRuntime
}) {
  const panelTypography = usePanelTypography()
  const search = useFloatingPanelCatalogSearch()
  const [presets, setPresets] = React.useState<PromptPreset[]>([])
  const [catalogError, setCatalogError] = React.useState('')
  const [invocationError, setInvocationError] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [invokingId, setInvokingId] = React.useState('')

  React.useEffect(() => {
    let active = true
    setLoading(true)
    void runtime.loadCatalog().then(result => {
      if (!active) return
      if (isPromptPresetCatalogError(result)) {
        setCatalogError(result.error)
        setPresets([])
      } else {
        setCatalogError('')
        setPresets(result.presets)
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [runtime])

  const visiblePresets = React.useMemo(() => presets.filter(preset => matchesFloatingPanelCatalogSearch(
    search.normalizedSearchQuery,
    [
      preset.id,
      preset.label,
      preset.slashCommand,
      preset.description,
      preset.activation,
      ...preset.invocationModes,
      preset.chatRoute,
      preset.mcpTool,
      preset.mcpToken,
    ],
  )), [presets, search.normalizedSearchQuery])

  const invokePreset = React.useCallback(async (preset: PromptPreset) => {
    if (invokingId) return
    setInvocationError('')
    setInvokingId(preset.id)
    try {
      const result = await runtime.loadPrompt(preset.id)
      if ('error' in result) {
        setInvocationError(result.error)
        return
      }
      if (!runtime.invokePrompt(result.prompt)) {
        setInvocationError(`Unable to open ${preset.label} in Chat.`)
      }
    } finally {
      setInvokingId('')
    }
  }, [invokingId, runtime])

  const statusMessage = catalogError || invocationError
  return (
    <section
      className={floatingPanelCatalogSurfaceClassName(panelTypography.panelTextClass)}
      data-kg-floating-panel-prompt-presets-view="true"
      data-kg-floating-panel-catalog-layout="media-reuse"
      aria-label="Prompt Presets"
    >
      <FloatingPanelCatalogHeader
        title="Prompt Presets"
        subtitle="Source-backed Chat response and MCP invocation catalog"
        actionsLabel="Prompt Presets actions"
        dataAttributes={{ 'data-kg-floating-panel-prompt-presets-header': '1' }}
        searchControl={(
          <FloatingPanelCatalogSearchControl
            state={search}
            id="kg-prompt-presets-catalog-search"
            buttonLabel="Search prompt presets"
            panelLabel="Search Prompt Presets catalog"
            placeholder="Search presets"
            panelWidthClassName="w-40 max-w-[12rem]"
            affordanceDataAttributes={{ 'data-kg-floating-panel-prompt-presets-search-affordance': '1' }}
            panelDataAttributes={{ 'data-kg-floating-panel-prompt-presets-search-panel': 'overlay' }}
            inputDataAttributes={{ 'data-kg-floating-panel-prompt-presets-search-input': '1' }}
            clearDataAttributes={{ 'data-kg-floating-panel-prompt-presets-search-clear': '1' }}
            toggleDataAttributes={{ 'data-kg-floating-panel-prompt-presets-search-toggle': '1' }}
          />
        )}
      />
      <section
        className={floatingPanelCatalogBodyClassName('pr-1')}
        tabIndex={-1}
        data-kg-floating-panel-catalog-body="prompt-presets"
        aria-label="Prompt Presets catalog"
      >
        {loading ? (
          <p className={cn('px-2 py-3 text-xs', UI_THEME_TOKENS.text.tertiary)}>Loading prompt presets…</p>
        ) : null}
        {statusMessage ? (
          <p className={cn('rounded border px-2 py-3 text-xs', UI_THEME_TOKENS.status.error)} role="alert" data-kg-prompt-presets-error="true">
            {statusMessage}
          </p>
        ) : null}
        {!loading && !statusMessage && visiblePresets.length === 0 ? (
          <p className={cn('px-2 py-3 text-xs', UI_THEME_TOKENS.text.tertiary)}>No prompt presets match this search.</p>
        ) : null}
        <section
          className="grid min-w-0 gap-1"
          data-kg-floating-panel-catalog-list="prompt-presets"
          data-kg-floating-panel-catalog-list-rows={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
        >
          {visiblePresets.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={floatingPanelCatalogCompactRowClassName()}
              disabled={Boolean(invokingId)}
              aria-label={`Use ${preset.label} in Chat`}
              title={`${preset.description} Use in Chat without submitting.`}
              data-kg-floating-panel-catalog-row="prompt-presets"
              data-kg-floating-panel-catalog-row-layout={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
              data-kg-prompt-preset-row={preset.id}
              data-kg-prompt-preset-activation={preset.activation}
              data-kg-prompt-preset-delivery="chat-seed-no-submit"
              onClick={() => { void invokePreset(preset) }}
            >
              <span className={floatingPanelCatalogCompactIconFrameClassName()} aria-hidden="true">
                <MainPanelTypeIcon iconKey="floatingPanel.promptPresets" className="h-3.5 w-3.5" strokeWidth={1.7} />
              </span>
              <span className="min-w-0">
                <span className={floatingPanelCatalogCompactRowTitleClassName('block')}>{preset.label}</span>
                <span className={floatingPanelCatalogCompactRowMetaClassName('block')}>
                  {invokingId === preset.id ? 'Opening in Chat…' : preset.description}
                </span>
              </span>
              {renderPromptPresetTokenChip(preset)}
            </button>
          ))}
        </section>
      </section>
    </section>
  )
}
