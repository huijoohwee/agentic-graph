export type VoiceStudioBrowserCapabilities = {
  microphoneCapture: boolean
  speechRecognition: boolean
  speechSynthesis: boolean
}

type SpeechRecognitionResultLike = {
  isFinal?: boolean
  0?: { transcript?: string }
}

type SpeechRecognitionEventLike = {
  resultIndex?: number
  results?: ArrayLike<SpeechRecognitionResultLike>
}

export type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type VoiceBrowserWindow = Window & {
  MediaRecorder?: new (stream: MediaStream) => MediaRecorder
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
  SpeechSynthesisUtterance?: new (text?: string) => SpeechSynthesisUtterance
}

export function readVoiceStudioBrowserCapabilities(target: Window | undefined = typeof window === 'undefined' ? undefined : window): VoiceStudioBrowserCapabilities {
  const browser = target as VoiceBrowserWindow | undefined
  return {
    microphoneCapture: Boolean(browser?.navigator?.mediaDevices?.getUserMedia && browser.MediaRecorder),
    speechRecognition: Boolean(browser?.SpeechRecognition || browser?.webkitSpeechRecognition),
    speechSynthesis: Boolean(browser?.speechSynthesis && browser.SpeechSynthesisUtterance),
  }
}

export function createSpeechRecognition(
  args: {
    language: string
    onTranscript: (text: string, final: boolean) => void
    onError: () => void
    onEnd: () => void
  },
  target: Window | undefined = typeof window === 'undefined' ? undefined : window,
): SpeechRecognitionLike | null {
  const browser = target as VoiceBrowserWindow | undefined
  const Recognition = browser?.SpeechRecognition || browser?.webkitSpeechRecognition
  if (!Recognition) return null
  const recognition = new Recognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = args.language
  recognition.onerror = args.onError
  recognition.onend = args.onEnd
  recognition.onresult = event => {
    const results = event.results
    if (!results) return
    let finalText = ''
    let interimText = ''
    for (let index = event.resultIndex || 0; index < results.length; index += 1) {
      const result = results[index]
      const transcript = String(result?.[0]?.transcript || '')
      if (result?.isFinal) finalText += transcript
      else interimText += transcript
    }
    if (finalText.trim()) args.onTranscript(finalText.trim(), true)
    if (interimText.trim()) args.onTranscript(interimText.trim(), false)
  }
  return recognition
}

export function stopBrowserSpeech(target: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  target?.speechSynthesis?.cancel()
}

export function speakBrowserText(args: {
  text: string
  language: string
  voice?: SpeechSynthesisVoice | null
  onEnd?: () => void
  onError?: () => void
}, target: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  const browser = target as VoiceBrowserWindow | undefined
  if (!browser?.speechSynthesis || !browser.SpeechSynthesisUtterance || !args.text.trim()) return false
  browser.speechSynthesis.cancel()
  const utterance = new browser.SpeechSynthesisUtterance(args.text.trim())
  utterance.lang = args.language
  if (args.voice) utterance.voice = args.voice
  utterance.onend = () => args.onEnd?.()
  utterance.onerror = () => args.onError?.()
  browser.speechSynthesis.speak(utterance)
  return true
}
