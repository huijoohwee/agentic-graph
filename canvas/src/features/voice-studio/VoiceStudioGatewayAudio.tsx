import React from 'react'
import { audioLimits, synthesizeSpeech, transcribeAudio } from 'agentic-gateway/connectors/openai-audio'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

type Props = { mode: 'dictate' | 'create'; text: string; onTranscript: (value: string) => void }

export default function VoiceStudioGatewayAudio({ mode, text, onTranscript }: Props) {
  const [baseUrl, setBaseUrl] = React.useState('http://127.0.0.1:8080/v1')
  const [model, setModel] = React.useState('')
  const [voice, setVoice] = React.useState('alloy')
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [preview, setPreview] = React.useState('')
  const active = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => { active.current?.abort(); active.current = null }, [])
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const transcribing = mode === 'dictate'
  const ready = !!(baseUrl.trim() && model.trim() && (transcribing ? file : text.trim() && voice.trim()))
  async function run() {
    if (!ready || active.current) return
    const request = new AbortController()
    active.current = request
    setBusy(true)
    setStatus(transcribing ? 'Transcribing…' : 'Generating speech…')
    setPreview('')
    const options = { baseUrl, model, signal: request.signal }
    try {
      if (transcribing && file) {
        const value = await transcribeAudio({ ...options, file })
        if (active.current !== request) return
        onTranscript(value)
        setStatus('Transcript added.')
      } else {
        const audio = await synthesizeSpeech({ ...options, input: text, voice })
        if (active.current !== request) return
        setPreview(URL.createObjectURL(audio))
        setStatus('AI-generated speech ready.')
      }
    } catch (error) {
      if (active.current === request) setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      if (active.current === request) { active.current = null; setBusy(false) }
    }
  }
  function cancel() {
    active.current?.abort()
    active.current = null
    setBusy(false)
    setStatus('Cancelled.')
  }
  const control = cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)
  return (
    <fieldset className={cn('grid gap-2 rounded border p-2 text-xs', UI_THEME_TOKENS.panel.border)}>
      <legend>OpenAI-compatible local audio</legend>
      <label className="grid gap-1">Local server URL<input className={control} type="url" value={baseUrl} disabled={busy} onChange={e => setBaseUrl(e.target.value)} /></label>
      <label className="grid gap-1">Model ID<input className={control} value={model} disabled={busy} onChange={e => setModel(e.target.value)} /></label>
      {transcribing ? <label className="grid gap-1">Audio file (up to {audioLimits.fileBytes / 1048576} MiB)<input type="file" accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.flac,.ogg" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        : <label className="grid gap-1">Stock voice ID<input className={control} value={voice} disabled={busy} onChange={e => setVoice(e.target.value)} /></label>}
      <div className="flex gap-2">
        <button type="button" className={control} disabled={!ready || busy} onClick={() => void run()}>{transcribing ? 'Transcribe file' : 'Generate WAV'}</button>
        {busy && <button type="button" className={control} onClick={cancel}>Cancel</button>}
      </div>
      <output aria-live="polite">{status}</output>
      {preview && <audio className="w-full" controls src={preview} aria-label="AI-generated speech" />}
    </fieldset>
  )
}
