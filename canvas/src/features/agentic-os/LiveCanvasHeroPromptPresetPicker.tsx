import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { usePromptPresetCatalogState } from '@/features/chat/usePromptPresetCatalog'
import {
  defaultPromptPresetSelectionRuntime,
  type PromptPresetSelectionRuntime,
} from '@/features/chat/promptPresetSelectionRuntime'
import {
  type PromptPreset,
} from '@/features/chat/promptPresetCatalog'

export function LiveCanvasHeroPromptPresetPicker(props: {
  activePresetId: string
  onSelect: (selection: { id: string; prompt: string }) => void
  runtime?: PromptPresetSelectionRuntime
}) {
  const { activePresetId, onSelect } = props
  const runtime = props.runtime || defaultPromptPresetSelectionRuntime
  const { presets, loading, error: catalogError, retry } = usePromptPresetCatalogState(runtime.loadCatalog)
  const [invocationError, setInvocationError] = React.useState('')
  const [loadingPresetId, setLoadingPresetId] = React.useState('')

  const selectPreset = React.useCallback(async (preset: PromptPreset) => {
    if (loadingPresetId) return
    setInvocationError('')
    setLoadingPresetId(preset.id)
    try {
      const result = await runtime.loadPrompt(preset.id)
      if ('error' in result) {
        setInvocationError(result.error)
        return
      }
      onSelect({ id: preset.id, prompt: result.prompt })
    } catch (error) {
      setInvocationError(error instanceof Error ? error.message : `Unable to load ${preset.label}.`)
    } finally {
      setLoadingPresetId('')
    }
  }, [loadingPresetId, onSelect, runtime])

  const statusMessage = catalogError || invocationError
  const selectedDescription = presets.find(preset => preset.id === activePresetId)?.description
  return (
    <fieldset data-kg-live-canvas-hero-prompt-presets="true">
      <legend className="text-xs font-semibold uppercase tracking-normal text-[var(--kg-text-secondary)]">
        Catalog
      </legend>
      {loading ? <p className="mt-1 text-xs text-[var(--kg-text-secondary)]">Loading prompt presets…</p> : null}
      {statusMessage ? <p className="mt-1 text-xs text-red-500" role="alert">{statusMessage}</p> : null}
      {catalogError && !loading && <button type="button" onClick={retry}
        className="mt-2 rounded border px-3 py-2 text-xs">Retry catalog</button>}
      {!loading && !catalogError ? (
        <PanelSelect
          className="mt-1 min-h-9 w-full rounded-lg border border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/80 px-2.5 py-1.5 text-xs text-[var(--kg-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-canvas-accent)]"
          aria-label="Prompt preset"
          title={selectedDescription}
          aria-describedby={selectedDescription ? 'apex-preset-description' : undefined}
          value={activePresetId}
          disabled={Boolean(loadingPresetId)}
          data-kg-live-canvas-hero-prompt-preset-select="true"
          onValueChange={selectedValueInput => {
            const preset = presets.find(candidate => candidate.id === selectedValueInput)
            if (preset) void selectPreset(preset)
          }}
        >
          {presets.map(preset => (
            <option
              key={preset.id}
              value={preset.id}
              data-kg-prompt-preset-activation={preset.activation}
            >
              {loadingPresetId === preset.id ? `Loading ${preset.label}…` : preset.label}
            </option>
          ))}
        </PanelSelect>
      ) : null}
      {!loading && !catalogError && selectedDescription ? <p id="apex-preset-description"
        className="mt-2 max-h-16 overflow-y-auto text-xs leading-4 text-[var(--kg-text-secondary)]">{selectedDescription}</p> : null}
    </fieldset>
  )
}
