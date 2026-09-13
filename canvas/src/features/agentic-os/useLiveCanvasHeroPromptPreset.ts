import React from 'react'
import { isProductEntryLandingRuntime } from '@/lib/routing/basePath'
import {
  defaultPromptPresetSelectionRuntime,
  type PromptPresetSelectionRuntime,
} from '@/features/chat/promptPresetSelectionRuntime'

/** Home and 81rv10 share the editor; only the initial catalog selection differs. */
export function useLiveCanvasHeroPromptPreset(
  defaultQuery: string,
  runtime: PromptPresetSelectionRuntime = defaultPromptPresetSelectionRuntime,
) {
  const [initialPresetId] = React.useState(() => (
    isProductEntryLandingRuntime(import.meta.env?.BASE_URL) ? 'launch-copilot' : 'video-agent'
  ))
  const [selectedPresetId, setSelectedPresetId] = React.useState(initialPresetId)
  const [draft, updateDraft] = React.useState(initialPresetId === 'video-agent' ? defaultQuery : '')
  const [selectedPrompt, setSelectedPrompt] = React.useState(draft)
  const [loading, setLoading] = React.useState(initialPresetId !== 'video-agent')
  const [error, setError] = React.useState('')
  const edits = React.useRef(0)
  const previousDefaultQuery = React.useRef(defaultQuery)

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
    if (initialPresetId === 'video-agent') return
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
      if (current()) setError(reason instanceof Error ? reason.message : 'Unable to load the 81rv10 prompt preset.')
    }).finally(() => {
      if (current()) setLoading(false)
    })
    return () => { active = false }
  }, [initialPresetId, runtime, selectPreset])

  React.useEffect(() => {
    const previous = previousDefaultQuery.current
    previousDefaultQuery.current = defaultQuery
    if (selectedPresetId !== 'video-agent') return
    updateDraft(value => value === previous ? defaultQuery : value)
    setSelectedPrompt(value => value === previous ? defaultQuery : value)
  }, [defaultQuery, selectedPresetId])

  return { draft, setDraft, selectedPresetId, selectedPrompt, selectPreset, loading, error }
}
