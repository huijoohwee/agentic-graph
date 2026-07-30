import React from 'react'
import {
  defaultPromptPresetSelectionRuntime,
  type PromptPresetSelectionRuntime,
} from '@/features/chat/promptPresetSelectionRuntime'
import {
  isPromptPresetCatalogError,
  type PromptPreset,
} from '@/features/chat/promptPresetCatalog'

export function LiveCanvasHeroPromptPresetPicker(props: {
  activePresetId: string
  onSelect: (selection: { id: string; prompt: string }) => void
  runtime?: PromptPresetSelectionRuntime
}) {
  const { activePresetId, onSelect } = props
  const runtime = props.runtime || defaultPromptPresetSelectionRuntime
  const [presets, setPresets] = React.useState<PromptPreset[]>([])
  const [catalogError, setCatalogError] = React.useState('')
  const [invocationError, setInvocationError] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [loadingPresetId, setLoadingPresetId] = React.useState('')

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
    }).catch(error => {
      if (active) {
        setCatalogError(error instanceof Error ? error.message : 'Prompt preset catalog unavailable.')
        setPresets([])
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [runtime])

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
  return (
    <fieldset data-kg-live-canvas-hero-prompt-presets="true">
      <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--kg-text-secondary)]">
        Catalog
      </legend>
      {loading ? <p className="mt-1 text-[10px] text-[var(--kg-text-secondary)]">Loading prompt presets…</p> : null}
      {statusMessage ? <p className="mt-1 text-[10px] text-red-500" role="alert">{statusMessage}</p> : null}
      {!loading && !catalogError ? (
        <select
          className="mt-1 min-h-9 w-full rounded-lg border border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)]/80 px-2.5 py-1.5 text-xs text-[var(--kg-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-canvas-accent)]"
          aria-label="Prompt preset"
          title={presets.find(preset => preset.id === activePresetId)?.description}
          value={activePresetId}
          disabled={Boolean(loadingPresetId)}
          data-kg-live-canvas-hero-prompt-preset-select="true"
          onChange={event => {
            const preset = presets.find(candidate => candidate.id === event.target.value)
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
        </select>
      ) : null}
    </fieldset>
  )
}
