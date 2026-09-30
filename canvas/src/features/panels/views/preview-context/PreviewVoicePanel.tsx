import React from 'react'
import { readVoiceStudioBrowserCapabilities, speakBrowserText, stopBrowserSpeech } from '@/features/voice-studio/voiceStudioBrowserRuntime'
import { requestVoiceStudioLaunch } from '@/features/voice-studio/voiceStudioInvocation'
import { VOICE_STUDIO_COMMAND, VOICE_STUDIO_ROUTES } from '@/features/voice-studio/voiceStudioContract'
import { buildPreviewNarration, localPreviewVoices, PREVIEW_NARRATION_LIMIT } from './previewContext'

export default function PreviewVoicePanel({ documentText, selectionText }: { documentText: string; selectionText: string }) {
  const excerpt = React.useMemo(() => buildPreviewNarration(documentText), [documentText])
  const [text, setText] = React.useState(excerpt.text)
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])
  const [voiceId, setVoiceId] = React.useState('')
  const [status, setStatus] = React.useState('Ready to audition the current document excerpt.')
  const [speaking, setSpeaking] = React.useState(false)
  const generation = React.useRef(0), ownsSpeech = React.useRef(false)
  const capable = readVoiceStudioBrowserCapabilities().speechSynthesis
  const language = typeof document === 'undefined' ? '' : (document.documentElement.lang || navigator.language).split('-')[0]
  const selectedVoice = voices.find(voice => voice.voiceURI === voiceId) || voices.find(voice => voice.lang.split('-')[0] === language) || voices[0]
  React.useEffect(() => {
    generation.current += 1
    if (ownsSpeech.current) stopBrowserSpeech()
    ownsSpeech.current = false
    setSpeaking(false)
    setText(excerpt.text)
    setStatus('Ready to audition the current document excerpt.')
  }, [excerpt])
  React.useEffect(() => {
    const synthesis = window.speechSynthesis
    if (!synthesis) return
    const update = () => setVoices(localPreviewVoices(synthesis.getVoices()))
    update()
    synthesis.addEventListener('voiceschanged', update)
    return () => { synthesis.removeEventListener('voiceschanged', update); generation.current += 1; if (ownsSpeech.current) stopBrowserSpeech() }
  }, [])
  const stop = () => {
    generation.current += 1
    if (ownsSpeech.current) stopBrowserSpeech()
    ownsSpeech.current = false
    setSpeaking(false)
    setStatus('Preview stopped.')
  }
  const play = () => {
    const voice = selectedVoice
    if (!voice || !text.trim()) return
    const id = ++generation.current
    const finish = (message: string) => { if (generation.current === id) { ownsSpeech.current = false; setSpeaking(false); setStatus(message) } }
    ownsSpeech.current = true
    setSpeaking(true)
    setStatus('Playing local voice preview…')
    if (!speakBrowserText({ text, language: voice.lang, voice, onEnd: () => finish('Preview complete.'), onError: () => finish('Voice preview failed. Try another local voice.') })) finish('Voice preview is unavailable.')
  }
  return <section className="grid min-w-0 gap-3" aria-label="AI Voice Studio preview">
    <header><h3 className="font-semibold">AI Voice Studio</h3><p className="text-xs">Audition text from this document with an installed local voice.</p></header>
    <nav className="flex flex-wrap gap-2" aria-label="Voice preview source">
      <button type="button" className="rounded border px-2 py-1" onClick={() => { stop(); setText(excerpt.text) }}>Use document excerpt</button>
      <button type="button" className="rounded border px-2 py-1" disabled={!selectionText.trim()} onClick={() => { stop(); setText(selectionText.slice(0, PREVIEW_NARRATION_LIMIT)) }}>Use selected item text</button>
    </nav>
    <label className="grid gap-1">Preview text<textarea className="min-h-32 w-full rounded border bg-transparent p-2" maxLength={PREVIEW_NARRATION_LIMIT} value={text} onChange={event => { stop(); setText(event.target.value) }} /></label>
    <p className="text-xs">{text.length}/{PREVIEW_NARRATION_LIMIT} characters{excerpt.truncated ? ' · Document excerpt is shortened.' : '.'} Edits stay in this preview.</p>
    <label className="grid gap-1">Local preview voice<select className="w-full rounded border bg-transparent p-2" value={selectedVoice?.voiceURI || ''} disabled={!voices.length} onChange={event => { stop(); setVoiceId(event.target.value) }}>
      {!voices.length ? <option value="">No installed local voice available</option> : voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
    </select></label>
    {!capable || !voices.length ? <p role="status">Local voice playback is unavailable in this browser. You can still prepare the preview text.</p> : null}
    <nav className="flex flex-wrap gap-2" aria-label="Voice preview controls">
      <button type="button" className="rounded border px-2 py-1" disabled={!capable || !voices.length || !text.trim() || speaking} onClick={play}>Play preview</button>
      <button type="button" className="rounded border px-2 py-1" disabled={!speaking} onClick={stop}>Stop preview</button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => { stop(); requestVoiceStudioLaunch({ command: VOICE_STUDIO_COMMAND, ...VOICE_STUDIO_ROUTES.create, prompt: text }) }}>Open full AI Voice Studio</button>
    </nav>
    <p role="status">{status}</p>
  </section>
}
