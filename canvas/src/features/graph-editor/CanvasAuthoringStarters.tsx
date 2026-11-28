import React from 'react'
import { defaultPromptPresetSelectionRuntime, type PromptPresetSelectionRuntime } from '@/features/chat/promptPresetSelectionRuntime'
import { usePromptPresetCatalogState } from '@/features/chat/usePromptPresetCatalog'
import { openFloatingPanelChatWithSeedWhenReady } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'

export default function CanvasAuthoringStarters({ runtime = defaultPromptPresetSelectionRuntime }: { runtime?: PromptPresetSelectionRuntime }) {
  const { presets, error } = usePromptPresetCatalogState(runtime.loadCatalog)
  const [failure, setFailure] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const request = React.useRef(0)
  React.useEffect(() => () => { request.current++ }, [])
  async function choose(id: string) {
    const sequence = ++request.current
    setLoading(true)
    setFailure('')
    try {
      const result = await runtime.loadPrompt(id)
      if (sequence !== request.current) return
      if ('error' in result) throw new Error(result.error)
      if (!openFloatingPanelChatWithSeedWhenReady({ text: result.prompt, mode: 'replace', delivery: 'queuedHandoff', submit: false })) throw new Error('Unable to open Chat.')
    } catch (issue) {
      if (sequence === request.current) setFailure(issue instanceof Error ? issue.message : 'Unable to load the starter.')
    } finally {
      if (sequence === request.current) setLoading(false)
    }
  }
  return <section aria-label="Start a diagram" className="flex max-w-full flex-wrap justify-center gap-1 pointer-events-auto">
    {presets.filter(preset => preset.authoringStarter).slice(0, 4).map(preset => <button key={preset.id} type="button"
      className="App-toolbar__btn" disabled={loading} onClick={() => void choose(preset.id)}>{preset.label}</button>)}
    {(failure || error) && <p role="alert">{failure || error}</p>}
  </section>
}
