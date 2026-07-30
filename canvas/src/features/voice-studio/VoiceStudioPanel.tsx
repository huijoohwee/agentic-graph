import React from 'react'
import { CircleStop, Mic, Play, ShieldCheck, Square, Upload, Volume2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  buildVoiceProfileManifest,
  isVoiceProfileSelectable,
  VOICE_STUDIO_LOCAL_LIMITS,
  type VoiceProfileManifest,
  type VoiceStudioOperation,
} from './voiceStudioContract'
import {
  createSpeechRecognition,
  readVoiceStudioBrowserCapabilities,
  speakBrowserText,
  stopBrowserSpeech,
  type SpeechRecognitionLike,
} from './voiceStudioBrowserRuntime'
import {
  readVoiceStudioLaunchRequest,
  subscribeVoiceStudioLaunchRequest,
} from './voiceStudioInvocation'

const operationLabel: Record<VoiceStudioOperation, string> = {
  clone: 'Clone',
  dictate: 'Dictate',
  create: 'Create',
}

export function VoiceStudioPanel() {
  const launch = React.useSyncExternalStore(
    subscribeVoiceStudioLaunchRequest,
    readVoiceStudioLaunchRequest,
    readVoiceStudioLaunchRequest,
  )
  const capabilities = React.useMemo(() => readVoiceStudioBrowserCapabilities(), [])
  const [operation, setOperation] = React.useState<VoiceStudioOperation>(launch?.operation || 'clone')
  const [status, setStatus] = React.useState('Ready. No provider call has been made.')
  const [profiles, setProfiles] = React.useState<VoiceProfileManifest[]>([])
  const [profileName, setProfileName] = React.useState('My voice')
  const [locale, setLocale] = React.useState('en-SG')
  const [permittedUse, setPermittedUse] = React.useState('Private studio creation')
  const [rightsBasis, setRightsBasis] = React.useState<VoiceProfileManifest['rights']['basis']>('self')
  const [consentReceiptId, setConsentReceiptId] = React.useState('')
  const [rightsReceiptId, setRightsReceiptId] = React.useState('')
  const [retentionPolicy, setRetentionPolicy] = React.useState<VoiceProfileManifest['rights']['retentionPolicy']>('session-only')
  const [consentExpiresAt, setConsentExpiresAt] = React.useState('')
  const [rightsAttested, setRightsAttested] = React.useState(false)
  const [notPublicFigure, setNotPublicFigure] = React.useState(false)
  const [sample, setSample] = React.useState<File | null>(null)
  const [transcript, setTranscript] = React.useState('')
  const [interimTranscript, setInterimTranscript] = React.useState('')
  const [recordingRightsReceiptId, setRecordingRightsReceiptId] = React.useState('')
  const [participantNotice, setParticipantNotice] = React.useState('')
  const [participantNoticeAttested, setParticipantNoticeAttested] = React.useState(false)
  const [browserRecognitionApproved, setBrowserRecognitionApproved] = React.useState(false)
  const [recording, setRecording] = React.useState(false)
  const [captureUrl, setCaptureUrl] = React.useState<string | null>(null)
  const [createText, setCreateText] = React.useState(
    launch?.operation === 'create' ? launch.prompt.slice(0, VOICE_STUDIO_LOCAL_LIMITS.createTextCharacters) : '',
  )
  const [selectedProfileId, setSelectedProfileId] = React.useState('')
  const [speaking, setSpeaking] = React.useState(false)
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])
  const [voiceName, setVoiceName] = React.useState('')
  const selectableProfiles = React.useMemo(
    () => profiles.filter(profile => isVoiceProfileSelectable(profile)),
    [profiles],
  )
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const recognitionGenerationRef = React.useRef(0)
  const captureTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureGenerationRef = React.useRef(0)
  const captureUrlRef = React.useRef<string | null>(null)
  const samplePreviewUrlRef = React.useRef<string | null>(null)
  const panelRef = React.useRef<HTMLElement | null>(null)
  const [samplePreviewUrl, setSamplePreviewUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!window.speechSynthesis) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  const replaceCaptureUrl = React.useCallback((next: string | null) => {
    const previous = captureUrlRef.current
    if (previous && previous !== next) URL.revokeObjectURL(previous)
    captureUrlRef.current = next
    setCaptureUrl(next)
  }, [])

  const replaceSamplePreviewUrl = React.useCallback((next: string | null) => {
    const previous = samplePreviewUrlRef.current
    if (previous && previous !== next) URL.revokeObjectURL(previous)
    samplePreviewUrlRef.current = next
    setSamplePreviewUrl(next)
  }, [])

  React.useEffect(() => {
    if (!sample) {
      replaceSamplePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(sample)
    replaceSamplePreviewUrl(url)
    return () => {
      if (samplePreviewUrlRef.current !== url) return
      samplePreviewUrlRef.current = null
      URL.revokeObjectURL(url)
    }
  }, [replaceSamplePreviewUrl, sample])

  React.useEffect(() => () => {
    captureGenerationRef.current += 1
    recognitionGenerationRef.current += 1
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
    captureTimerRef.current = null
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.stop() } catch { /* already inactive */ }
    }
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* already stopping */ }
      }
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    stopBrowserSpeech()
    if (captureUrlRef.current) URL.revokeObjectURL(captureUrlRef.current)
    captureUrlRef.current = null
    if (samplePreviewUrlRef.current) URL.revokeObjectURL(samplePreviewUrlRef.current)
    samplePreviewUrlRef.current = null
  }, [])

  const registerProfile = async () => {
    if (!sample || !rightsAttested || !notPublicFigure) {
      setStatus('Choose an audio sample and attest voice rights and non-public-figure status.')
      return
    }
    try {
      const manifest = await buildVoiceProfileManifest({
        displayName: profileName,
        locale,
        sample,
        basis: rightsBasis,
        rightsAttested,
        notPublicFigure,
        consentReceiptId,
        rightsReceiptId,
        permittedUse,
        retentionPolicy,
        expiresAt: consentExpiresAt,
      })
      const next = [manifest, ...profiles.filter(profile => profile.id !== manifest.id)]
      setProfiles(next)
      setSelectedProfileId(manifest.id)
      setSample(null)
      setStatus('Receipt-bound profile manifest ready. Sample bytes were not stored; host verification and a live cloning adapter are still required.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not register the voice profile.')
    }
  }

  const detachRecognition = React.useCallback(() => {
    recognitionGenerationRef.current += 1
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.stop() } catch { /* already inactive */ }
    }
    setInterimTranscript('')
  }, [])

  const updateRecognitionApproval = React.useCallback((approved: boolean) => {
    setBrowserRecognitionApproved(approved)
    if (!approved) detachRecognition()
  }, [detachRecognition])

  const stopCapture = React.useCallback(() => {
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
    captureTimerRef.current = null
    detachRecognition()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* already stopping */ }
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setRecording(false)
    setInterimTranscript('')
  }, [detachRecognition])

  const discardCaptureSession = React.useCallback(() => {
    captureGenerationRef.current += 1
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
    captureTimerRef.current = null
    detachRecognition()
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* already stopping */ }
      }
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    replaceCaptureUrl(null)
    setRecording(false)
  }, [detachRecognition, replaceCaptureUrl])

  const startCapture = async () => {
    if (!capabilities.microphoneCapture) {
      setStatus('Microphone capture is unavailable in this browser context.')
      return
    }
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(recordingRightsReceiptId.trim())
      || !participantNotice.trim() || !participantNoticeAttested) {
      setStatus('Recording requires an exact rights receipt, participant-notice evidence, and explicit attestation.')
      return
    }
    try {
      discardCaptureSession()
      const generation = captureGenerationRef.current
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (captureGenerationRef.current !== generation) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      let capturedBytes = 0
      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (captureGenerationRef.current !== generation || recorderRef.current !== recorder) return
        if (event.data.size < 1) return
        capturedBytes += event.data.size
        if (capturedBytes > VOICE_STUDIO_LOCAL_LIMITS.captureBytes) {
          setStatus('Capture stopped at the 100 MB browser safety limit.')
          stopCapture()
          return
        }
        chunks.push(event.data)
      }
      recorder.onstop = () => {
        if (captureGenerationRef.current !== generation || recorderRef.current !== recorder) return
        if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
        captureTimerRef.current = null
        recorderRef.current = null
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) replaceCaptureUrl(URL.createObjectURL(blob))
        setStatus(previous => previous.includes('safety limit')
          ? previous
          : 'Capture stopped. Transcript remains editable; recording exists only in this browser session.')
      }
      const recognitionGeneration = browserRecognitionApproved
        ? recognitionGenerationRef.current + 1
        : recognitionGenerationRef.current
      if (browserRecognitionApproved) recognitionGenerationRef.current = recognitionGeneration
      const recognitionIsCurrent = () => recognitionGenerationRef.current === recognitionGeneration
      const recognition = browserRecognitionApproved
        ? createSpeechRecognition({
            language: locale,
            onTranscript: (text, final) => {
              if (!recognitionIsCurrent()) return
              if (final) {
                setTranscript(previous =>
                  `${previous}${previous ? ' ' : ''}${text}`.slice(0, VOICE_STUDIO_LOCAL_LIMITS.transcriptCharacters))
                setInterimTranscript('')
              } else setInterimTranscript(text.slice(0, VOICE_STUDIO_LOCAL_LIMITS.transcriptCharacters))
            },
            onError: () => {
              if (recognitionIsCurrent()) {
                setStatus('Browser speech recognition stopped; the audio capture can continue.')
              }
            },
            onEnd: () => {
              if (recognitionIsCurrent()) setInterimTranscript('')
            },
          })
        : null
      recognitionRef.current = recognition
      recorder.start(250)
      recognition?.start()
      captureTimerRef.current = setTimeout(() => {
        setStatus('Capture stopped at the five-minute browser safety limit.')
        stopCapture()
      }, VOICE_STUDIO_LOCAL_LIMITS.captureDurationMs)
      setRecording(true)
      setStatus(recognition
        ? 'Recording-rights evidence is attached. Capture and browser-managed recognition are active; Stop is always available.'
        : 'Recording-rights evidence is attached. Capture is active; type the transcript manually and use Stop to finish.')
    } catch {
      discardCaptureSession()
      setStatus('Microphone permission was denied or capture could not start.')
    }
  }

  const cancelActiveSpeech = React.useCallback(() => {
    stopBrowserSpeech()
    setSpeaking(false)
  }, [])

  const previewSpeech = () => {
    const selectedProfile = profiles.find(profile => profile.id === selectedProfileId)
    if (selectedProfile && !isVoiceProfileSelectable(selectedProfile)) {
      setSelectedProfileId('')
      setStatus('The selected profile is revoked or expired. New create work is blocked.')
      return
    }
    const selectedVoice = voices.find(voice => voice.name === voiceName) || null
    const ok = speakBrowserText({
      text: createText,
      language: selectedVoice?.lang || locale,
      voice: selectedVoice,
      onEnd: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false)
        setStatus('System voice preview failed.')
      },
    })
    if (!ok) {
      setStatus('System speech synthesis is unavailable or the text is empty.')
      return
    }
    setSpeaking(true)
    setStatus(selectedProfileId
      ? 'Playing a disclosed system-voice preview. The selected consented profile requires a live adapter for cloned-voice output.'
      : 'Playing a disclosed browser system-voice preview.')
  }

  const stopSpeech = React.useCallback(() => {
    cancelActiveSpeech()
    setStatus('Speech preview stopped.')
  }, [cancelActiveSpeech])

  const revokeSelectedProfile = React.useCallback(() => {
    if (!selectedProfileId) return
    const next = profiles.map(profile => profile.id === selectedProfileId
      ? { ...profile, rights: { ...profile.rights, revoked: true } }
      : profile)
    setProfiles(next)
    setSelectedProfileId('')
    setStatus('Profile manifest revoked locally. New selection and create work are blocked; external deletion is not claimed.')
  }, [profiles, selectedProfileId])

  const selectOperation = React.useCallback((candidate: VoiceStudioOperation) => {
    if (candidate === operation) return
    const stoppedActiveWork = recording || speaking
    discardCaptureSession()
    cancelActiveSpeech()
    setSample(null)
    setOperation(candidate)
    setStatus(stoppedActiveWork
      ? `${operationLabel[candidate]} selected. The previous capture or speech preview was stopped.`
      : `${operationLabel[candidate]} selected. No provider call has been made.`)
  }, [cancelActiveSpeech, discardCaptureSession, operation, recording, speaking])

  React.useEffect(() => {
    if (!launch) return
    discardCaptureSession()
    cancelActiveSpeech()
    setSample(null)
    setOperation(launch.operation)
    if (launch.operation === 'create') {
      setCreateText(launch.prompt.slice(0, VOICE_STUDIO_LOCAL_LIMITS.createTextCharacters))
    }
    setStatus(`${operationLabel[launch.operation]} invocation loaded. No provider call has been made.`)
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [cancelActiveSpeech, discardCaptureSession, launch])

  return (
    <section ref={panelRef} tabIndex={-1} className="grid min-w-0 gap-3 p-1 outline-none" aria-label="AI Voice Studio" data-kg-voice-studio="1">
      <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">AI Voice Studio</h3>
            <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>Clean-room · provider-neutral · injected-adapter Dev; provider unconfigured</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]" data-kg-voice-consent-gate="1">
            <ShieldCheck className="size-3.5" aria-hidden />
            Consent gated
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1" role="tablist" aria-label="Voice workflow">
          {(Object.keys(operationLabel) as VoiceStudioOperation[]).map(candidate => (
            <button
              key={candidate}
              type="button"
              role="tab"
              id={`kg-voice-tab-${candidate}`}
              aria-controls={`kg-voice-panel-${candidate}`}
              aria-selected={operation === candidate}
              tabIndex={operation === candidate ? 0 : -1}
              className={cn('rounded border px-2 py-1 text-xs', UI_THEME_TOKENS.panel.border, operation === candidate ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}
              onClick={() => selectOperation(candidate)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const candidates = Object.keys(operationLabel) as VoiceStudioOperation[]
                const current = candidates.indexOf(candidate)
                const nextIndex = event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? candidates.length - 1
                    : (current + (event.key === 'ArrowRight' ? 1 : -1) + candidates.length) % candidates.length
                const next = candidates[nextIndex]
                selectOperation(next)
                const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                buttons?.[nextIndex]?.focus()
              }}
              data-kg-voice-operation={candidate}
            >
              {operationLabel[candidate]}
            </button>
          ))}
        </div>
      </section>

      {operation === 'clone' ? (
        <section id="kg-voice-panel-clone" role="tabpanel" aria-labelledby="kg-voice-tab-clone" className="grid gap-2">
          <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>Registers a digest-bound rights manifest. It does not claim a cloned model until a host adapter verifies one.</p>
          <label className="grid gap-1 text-xs">Profile name<input className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={profileName} maxLength={80} onChange={event => setProfileName(event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs">Locale<input className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={locale} onChange={event => setLocale(event.target.value)} /></label>
            <label className="grid gap-1 text-xs">Rights basis<select className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={rightsBasis} onChange={event => setRightsBasis(event.target.value as VoiceProfileManifest['rights']['basis'])}><option value="self">Self</option><option value="written-authorization">Written authorization</option><option value="licensed">Licensed</option></select></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs">Consent receipt ID<input className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={consentReceiptId} maxLength={128} onChange={event => setConsentReceiptId(event.target.value)} /></label>
            <label className="grid gap-1 text-xs">Recording-rights receipt ID<input className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={rightsReceiptId} maxLength={128} onChange={event => setRightsReceiptId(event.target.value)} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs">Retention policy<select className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={retentionPolicy} onChange={event => setRetentionPolicy(event.target.value as VoiceProfileManifest['rights']['retentionPolicy'])}><option value="session-only">Session only</option><option value="30-days">30 days</option><option value="max-90-days">Maximum 90 days</option><option value="contract-bound">Contract bound</option></select></label>
            <label className="grid gap-1 text-xs">Consent expires<input type="datetime-local" className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={consentExpiresAt} onChange={event => setConsentExpiresAt(event.target.value)} /></label>
          </div>
          <label className="grid gap-1 text-xs">Permitted use<input className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={permittedUse} onChange={event => setPermittedUse(event.target.value)} /></label>
          <label className={cn('flex cursor-pointer items-center gap-2 rounded border p-2 text-xs', UI_THEME_TOKENS.panel.border)}>
            <Upload className="size-4" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{sample?.name || 'Choose an audio sample'}</span>
            <input
              className="sr-only"
              type="file"
              accept="audio/*"
              onChange={event => {
                const next = event.target.files?.[0] || null
                if (next && next.size > VOICE_STUDIO_LOCAL_LIMITS.cloneSampleBytes) {
                  setSample(null)
                  setStatus('Voice samples must be 100 MB or smaller.')
                  return
                }
                setSample(next)
              }}
            />
          </label>
          {samplePreviewUrl && rightsAttested && notPublicFigure && consentReceiptId && rightsReceiptId
            ? <audio controls src={samplePreviewUrl} className="w-full" aria-label="Voice sample preview" />
            : null}
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={rightsAttested} onChange={event => setRightsAttested(event.target.checked)} />I have rights to use this voice for the stated purpose.</label>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={notPublicFigure} onChange={event => setNotPublicFigure(event.target.checked)} />This is not a public figure or impersonation target.</label>
          <button type="button" className={cn('rounded border px-3 py-2 text-xs font-semibold', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.activeBg)} onClick={() => void registerProfile()}>Register consented profile</button>
        </section>
      ) : null}

      {operation === 'dictate' ? (
        <section id="kg-voice-panel-dictate" role="tabpanel" aria-labelledby="kg-voice-tab-dictate" className="grid gap-2">
          <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>Recording stays session-local. Microphone permission is not consent; an exact rights receipt and participant notice are required. Browser recognition may use a browser-managed service.</p>
          <label className="grid gap-1 text-xs">Recording-rights receipt ID<input className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={recordingRightsReceiptId} maxLength={128} onChange={event => setRecordingRightsReceiptId(event.target.value)} /></label>
          <label className="grid gap-1 text-xs">Participant-notice evidence<textarea className={cn('min-h-16 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={participantNotice} maxLength={240} onChange={event => setParticipantNotice(event.target.value)} /></label>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={participantNoticeAttested} onChange={event => setParticipantNoticeAttested(event.target.checked)} />I attest that recording rights and participant notice cover this capture.</label>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={browserRecognitionApproved} onChange={event => updateRecognitionApproval(event.target.checked)} />I approve optional browser-managed speech-recognition egress for this capture.</label>
          <div className="flex gap-2">
            <button type="button" disabled={recording} className={cn('inline-flex items-center gap-1 rounded border px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border)} onClick={() => void startCapture()}><Mic className="size-4" aria-hidden />Start</button>
            <button type="button" disabled={!recording} className={cn('inline-flex items-center gap-1 rounded border px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border)} onClick={stopCapture} data-kg-voice-stop="dictation"><Square className="size-4" aria-hidden />Stop</button>
          </div>
          {captureUrl ? <audio controls src={captureUrl} className="w-full" aria-label="Voice capture preview" /> : null}
          <label className="grid gap-1 text-xs">Transcript<textarea className={cn('min-h-32 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} maxLength={VOICE_STUDIO_LOCAL_LIMITS.transcriptCharacters} value={`${transcript}${interimTranscript ? `${transcript ? ' ' : ''}${interimTranscript}` : ''}`} onChange={event => { setTranscript(event.target.value.slice(0, VOICE_STUDIO_LOCAL_LIMITS.transcriptCharacters)); setInterimTranscript('') }} /></label>
        </section>
      ) : null}

      {operation === 'create' ? (
        <section id="kg-voice-panel-create" role="tabpanel" aria-labelledby="kg-voice-tab-create" className="grid gap-2">
          <p className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>System-voice preview is available now. A consented profile is metadata-only until a live adapter returns a verified audio artifact.</p>
          <label className="grid gap-1 text-xs">Consented profile<select className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={selectedProfileId} onChange={event => setSelectedProfileId(event.target.value)}><option value="">System voice only</option>{profiles.map(profile => <option key={profile.id} value={profile.id} disabled={!isVoiceProfileSelectable(profile)}>{profile.displayName} · {profile.profileRevision} · {isVoiceProfileSelectable(profile) ? profile.state : 'revoked/expired'}</option>)}</select></label>
          {selectedProfileId ? <button type="button" className={cn('rounded border px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border)} onClick={revokeSelectedProfile}>Revoke selected profile manifest</button> : null}
          <p className={cn('text-[11px]', UI_THEME_TOKENS.text.secondary)}>{selectableProfiles.length} active, unexpired local manifest{selectableProfiles.length === 1 ? '' : 's'}. Host receipt verification is still required for live output.</p>
          <label className="grid gap-1 text-xs">System preview voice<select className={cn('rounded border px-2 py-1.5', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} value={voiceName} onChange={event => setVoiceName(event.target.value)}><option value="">Browser default</option>{voices.map(voice => <option key={`${voice.name}:${voice.lang}`} value={voice.name}>{voice.name} · {voice.lang}</option>)}</select></label>
          <label className="grid gap-1 text-xs">Text<textarea className={cn('min-h-32 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} maxLength={VOICE_STUDIO_LOCAL_LIMITS.createTextCharacters} value={createText} onChange={event => setCreateText(event.target.value.slice(0, VOICE_STUDIO_LOCAL_LIMITS.createTextCharacters))} /></label>
          <div className="flex gap-2">
            <button type="button" disabled={speaking} className={cn('inline-flex items-center gap-1 rounded border px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border)} onClick={previewSpeech}><Play className="size-4" aria-hidden />Preview</button>
            <button type="button" disabled={!speaking} className={cn('inline-flex items-center gap-1 rounded border px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border)} onClick={stopSpeech} data-kg-voice-stop="speech"><CircleStop className="size-4" aria-hidden />Stop</button>
          </div>
          <p className="inline-flex items-center gap-1 text-[11px]"><Volume2 className="size-3.5" aria-hidden />Synthetic-voice disclosure is always required.</p>
        </section>
      ) : null}

      <p className={cn('rounded border p-2 text-xs', UI_THEME_TOKENS.panel.border)} role="status" aria-live="polite" data-kg-voice-status="1">{status}</p>
    </section>
  )
}
