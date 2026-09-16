import React from 'react'
import { isPromptPresetCatalogError, loadPromptPresetCatalog, type PromptPreset } from './promptPresetCatalog'

/** One request per explicit attempt; late responses cannot replace a newer catalog. */
export function usePromptPresetCatalogState(load = loadPromptPresetCatalog) {
  const [presets, setPresets] = React.useState<PromptPreset[]>([])
  const [loading, setLoading] = React.useState(true), [error, setError] = React.useState('')
  const [attempt, setAttempt] = React.useState(0)
  const retry = React.useCallback(() => setAttempt(value => value + 1), [])
  React.useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    void Promise.resolve().then(() => load()).then(result => {
      if (cancelled) return
      setPresets(isPromptPresetCatalogError(result) ? [] : result.presets)
      setError(isPromptPresetCatalogError(result) ? result.error : '')
    }).catch(cause => {
      if (!cancelled) { setPresets([]); setError(cause instanceof Error ? cause.message : 'Prompt preset catalog unavailable.') }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [load, attempt])
  return { presets, loading, error, retry }
}
export function usePromptPresetCatalog(): readonly PromptPreset[] {
  return usePromptPresetCatalogState().presets
}
