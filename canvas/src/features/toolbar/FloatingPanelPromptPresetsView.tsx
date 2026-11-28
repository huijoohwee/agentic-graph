import React from 'react'
import { emitChatInputAppend } from '@/features/canvas/utils'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getUiSectionActionClassName } from '@/lib/ui/sectionChipChrome'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { usePromptPresetCatalogState } from '@/features/chat/usePromptPresetCatalog'
import type { PresetSummary } from '@/features/chat/gatewayPresetCatalog'
import {
  defaultPromptPresetSelectionRuntime,
  type PromptPresetSelectionRuntime,
} from '@/features/chat/promptPresetSelectionRuntime'
import { openFloatingPanelChatWithSeedWhenReady } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import { PROCEDURAL_ASSET_PROMPT_TOKENS } from '@/features/image-to-glb/proceduralAssetPromptPreset'
import { insertTextIntoActiveCardInlineTextEditor } from '@/lib/cards/cardInlineTextExternalCommands'
import { MainPanelTypeIcon } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { resolveInlineInvocationChipClassName } from '@/features/markdown/ui/dataViewChipStyles'
import {
  FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT,
  FloatingPanelCatalogHeader,
  FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName,
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

function renderPromptPresetTokenChip(preset: PresetSummary): React.ReactNode {
  const className = resolveInlineInvocationChipClassName({
    value: preset.slashCommand,
    extraClassName: 'max-w-[7.5rem]',
  })
  const chip = renderAgenticOsInvocationKeywordChip({ value: preset.slashCommand, className })
  if (React.isValidElement<{ className?: string }>(chip)) {
    return React.cloneElement(chip, {
      className: cn(chip.props.className, 'agentic-collection-trailing'),
      'data-kg-prompt-preset-token-chip': preset.id,
    } as React.HTMLAttributes<HTMLElement>)
  }
  return (
    <span
      className={cn(className, 'agentic-collection-trailing')}
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
  chatDraft,
}: {
  runtime?: FloatingPanelPromptPresetsRuntime
  chatDraft?: string
}) {
  const inChat = chatDraft !== undefined
  const [browseAll, setBrowseAll] = React.useState(false)
  const selection = React.useRef<object | null>(null)
  const search = useFloatingPanelCatalogSearch()
  const { presets, loading, error: catalogError, retry } = usePromptPresetCatalogState(runtime.loadCatalog)
  const [invocationError, setInvocationError] = React.useState('')
  const [invokingId, setInvokingId] = React.useState('')
  React.useLayoutEffect(() => {
    setInvokingId('')
    return () => { selection.current = null }
  }, [chatDraft, runtime])

  const showAll = !inChat || browseAll || !!search.normalizedSearchQuery
  const compact = inChat && !showAll
  const visiblePresets = React.useMemo(() => presets.filter(preset => {
    if (inChat && preset.executionSurface === 'card-run') return false
    if (compact && preset.runtimeCommand !== '/canvas.project') return false
    return matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [
      preset.id, preset.label, preset.slashCommand, preset.description,
      preset.activation, ...preset.invocationModes, preset.chatRoute, preset.mcpTool, preset.mcpToken,
    ])
  }), [compact, inChat, presets, search.normalizedSearchQuery])

  const invokePreset = React.useCallback(async (preset: PresetSummary) => {
    if (selection.current) return
    setInvocationError('')
    if (preset.executionSurface === 'card-run') {
      if (!insertTextIntoActiveCardInlineTextEditor(PROCEDURAL_ASSET_PROMPT_TOKENS)) {
        setInvocationError('Select an editable Card to insert this preset. Use Card Run to create the asset.')
      }
      return
    }
    const ticket = {}
    selection.current = ticket
    const documentName = useGraphStore.getState().markdownDocumentName
    setInvokingId(preset.id)
    try {
      const result = await runtime.loadPrompt(preset.id)
      if (selection.current !== ticket || useGraphStore.getState().markdownDocumentName !== documentName) return
      if ('error' in result) {
        setInvocationError(result.error)
        return
      }
      if (inChat) {
        search.clearSearchQuery()
        setBrowseAll(false)
        emitChatInputAppend({ text: result.prompt, mode: 'replace', submit: false })
      } else if (!runtime.invokePrompt(result.prompt)) {
        setInvocationError(`Unable to open ${preset.label} in Chat.`)
      }
    } catch (error) {
      if (selection.current === ticket) setInvocationError(error instanceof Error ? error.message : String(error))
    } finally {
      if (selection.current === ticket) {
        selection.current = null
        setInvokingId('')
      }
    }
  }, [inChat, runtime, search.clearSearchQuery])

  const statusMessage = catalogError || invocationError
  return (
    <section
      className={inChat ? 'grid min-w-0 gap-1' : floatingPanelCatalogSurfaceClassName()}
      data-kg-floating-panel-prompt-presets-view="true"
      data-kg-floating-panel-catalog-layout="media-reuse"
      aria-label="Prompt Presets"
    >
      {compact ? (
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Prompt presets</h3>
          <button type="button" className={getUiSectionActionClassName('secondary', 'px-2')} onClick={() => setBrowseAll(true)}>Browse all presets</button>
        </header>
      ) : <FloatingPanelCatalogHeader
        title="Prompt Presets"
        subtitle={inChat ? 'Choose a prompt to edit and send.' : 'Select a preset to prepare an editable draft.'}
        actionsLabel="Prompt Presets actions"
        dataAttributes={{ 'data-kg-floating-panel-prompt-presets-header': '1' }}
        searchControl={(
          <FloatingPanelCatalogSearchControl
            state={search}
            id={inChat ? 'kg-chat-prompt-presets-search' : 'kg-prompt-presets-catalog-search'}
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
      />}
      {inChat && showAll && <button type="button" className="justify-self-start text-xs underline" onClick={() => { search.clearSearchQuery(); setBrowseAll(false) }}>Back to Canvas presets</button>}
      <section
        className={inChat ? 'min-w-0' : floatingPanelCatalogBodyClassName()}
        tabIndex={-1}
        data-kg-floating-panel-catalog-body="prompt-presets"
        aria-label="Prompt Presets catalog"
      >
        {inChat && chatDraft.trim() && <p className="text-xs">Choosing a preset replaces the current draft.</p>}
        {loading ? (
          <p className={cn('px-2 py-3 text-xs', UI_THEME_TOKENS.text.tertiary)}>Loading prompt presets…</p>
        ) : null}
        {statusMessage ? (
          <p className={cn('rounded border px-2 py-3 text-xs', UI_THEME_TOKENS.status.error)} role="alert" data-kg-prompt-presets-error="true">
            {statusMessage}
            {catalogError && <button type="button" className="ml-2 underline" onClick={retry}>Retry catalog</button>}
          </p>
        ) : null}
        {!loading && !statusMessage && visiblePresets.length === 0 ? (
          <p className={cn('px-2 py-3 text-xs', UI_THEME_TOKENS.text.tertiary)}>No prompt presets match this search.</p>
        ) : null}
        <section
          className={compact ? 'flex flex-wrap gap-1' : 'agentic-collection'} data-layout="list"
          data-kg-floating-panel-catalog-list="prompt-presets"
          data-kg-floating-panel-catalog-list-rows={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
        >
          {visiblePresets.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={compact ? getUiSectionActionClassName('secondary', 'px-2') : 'agentic-collection-item'} data-layout="list"
              disabled={Boolean(invokingId)}
              aria-label={`Use ${preset.label} in ${preset.executionSurface === 'card-run' ? 'Card' : 'Chat'}`}
              title={`${preset.description} ${preset.executionSurface === 'card-run' ? 'Insert into the active Card without running.' : 'Use in Chat without submitting.'}`}
              data-kg-floating-panel-catalog-row="prompt-presets"
              data-kg-floating-panel-catalog-row-layout={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
              data-kg-prompt-preset-row={preset.id}
              data-kg-prompt-preset-activation={preset.activation}
              data-kg-prompt-preset-delivery={preset.executionSurface === 'card-run' ? 'card-insert-no-run' : 'chat-seed-no-submit'}
              onClick={() => { void invokePreset(preset) }}
            >
              {compact ? preset.label : (
                <>
                  <span className="agentic-collection-leading" aria-hidden="true">
                    <MainPanelTypeIcon iconKey="floatingPanel.promptPresets" className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="agentic-collection-title block">{preset.label}</span>
                    <span className="agentic-collection-meta block">
                      {invokingId === preset.id ? 'Opening in Chat…' : preset.description}
                    </span>
                  </span>
                  {renderPromptPresetTokenChip(preset)}
                </>
              )}
            </button>
          ))}
        </section>
      </section>
    </section>
  )
}
