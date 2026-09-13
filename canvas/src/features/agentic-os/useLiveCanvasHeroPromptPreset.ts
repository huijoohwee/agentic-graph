import React from 'react'
import { isProductEntryLandingRuntime } from '@/lib/routing/basePath'
import {
  defaultPromptPresetSelectionRuntime,
  type PromptPresetSelectionRuntime,
} from '@/features/chat/promptPresetSelectionRuntime'

/** Home and 81rv10 share the editor; only the initial catalog selection differs. */
export function useLiveCanvasHeroPromptPreset(
  _defaultQuery: string,
  runtime: PromptPresetSelectionRuntime = defaultPromptPresetSelectionRuntime,
) {
  const [initialPresetId] = React.useState(() => (
    isProductEntryLandingRuntime(import.meta.env?.BASE_URL) ? 'launch-copilot' : 'xr-physics'
  ))
  const [selectedPresetId, setSelectedPresetId] = React.useState(initialPresetId)
  const [draft, updateDraft] = React.useState('')
  const [selectedPrompt, setSelectedPrompt] = React.useState(draft)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const edits = React.useRef(0)

  const setDraft = React.useCallback<React.Dispatch<React.SetStateAction<string>>>(value => {
    edits.current += 1
    setLoading(false)
    setError('')
    updateDraft(value)
  }, [])
  const selectPreset = React.useCallback((selection: { id: string; prompt: string }) => {
    setDraft(selection.prompt)
    setSelectedPresetId(selection.id)
    setSelectedPrompt(selection.prompt)
  }, [setDraft])

  React.useEffect(() => {
    let active = true
    const revision = edits.current
    const current = () => active && edits.current === revision
    setLoading(true)
    setError('')
    void runtime.loadPrompt(initialPresetId).then(result => {
      if (!current()) return
      if ('error' in result) setError(result.error)
      else selectPreset({ id: initialPresetId, prompt: result.prompt })
    }).catch(reason => {
      if (current()) setError(reason instanceof Error ? reason.message : 'Unable to load the prompt preset.')
    }).finally(() => {
      if (current()) setLoading(false)
    })
    return () => { active = false }
  }, [initialPresetId, runtime, selectPreset])

  return { draft, setDraft, selectedPresetId, selectedPrompt, selectPreset, loading, error }
}
