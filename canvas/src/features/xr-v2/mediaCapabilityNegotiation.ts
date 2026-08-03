export type BrowserRecordingSource = 'canvas' | 'media-stream'
export type RecordingContainer = 'webm' | 'mp4'
export type RecordingContainerPreference = RecordingContainer | 'auto'

export type BrowserRecorderCapabilities = Readonly<{
  mediaRecorderAvailable: boolean
  canvasCaptureStreamAvailable: boolean
  isMimeTypeSupported: (mimeType: string) => boolean
}>

export type BrowserRecordingRequest = Readonly<{
  source: BrowserRecordingSource
  preferredContainer: RecordingContainerPreference
  includeAudio: boolean
}>

export type BrowserRecordingPlan =
  | Readonly<{
      status: 'supported'
      recorder: 'MediaRecorder'
      container: RecordingContainer
      mimeType: string
    }>
  | Readonly<{
      status: 'unsupported'
      reason: 'media-recorder-unavailable' | 'canvas-capture-unavailable' | 'container-unavailable'
    }>

type BrowserRecorderScope = Readonly<{
  MediaRecorder?: Readonly<{ isTypeSupported?: (mimeType: string) => boolean }>
  HTMLCanvasElement?: Readonly<{ prototype?: Readonly<{ captureStream?: unknown }> }>
}>

const MIME_CANDIDATES: Readonly<Record<RecordingContainer, Readonly<Record<'audio' | 'silent', readonly string[]>>>> = {
  webm: {
    audio: Object.freeze([
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]),
    silent: Object.freeze([
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ]),
  },
  mp4: {
    audio: Object.freeze([
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
    ]),
    silent: Object.freeze([
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ]),
  },
}

export function inspectBrowserRecorderCapabilities(scope: BrowserRecorderScope): BrowserRecorderCapabilities {
  const recorder = scope.MediaRecorder
  const typeProbe = recorder?.isTypeSupported
  return Object.freeze({
    mediaRecorderAvailable: typeof recorder !== 'undefined',
    canvasCaptureStreamAvailable: typeof scope.HTMLCanvasElement?.prototype?.captureStream === 'function',
    isMimeTypeSupported: (mimeType: string) => {
      if (typeof typeProbe !== 'function') return false
      try {
        return typeProbe.call(recorder, mimeType) === true
      } catch {
        return false
      }
    },
  })
}

/** Chooses only browser-native MediaRecorder outputs; it never supplies a muxer or codec. */
export function negotiateBrowserRecordingPlan(
  capabilities: BrowserRecorderCapabilities,
  request: BrowserRecordingRequest,
): BrowserRecordingPlan {
  if (!capabilities.mediaRecorderAvailable) {
    return { status: 'unsupported', reason: 'media-recorder-unavailable' }
  }
  if (request.source === 'canvas' && !capabilities.canvasCaptureStreamAvailable) {
    return { status: 'unsupported', reason: 'canvas-capture-unavailable' }
  }

  const containers: readonly RecordingContainer[] = request.preferredContainer === 'auto'
    ? ['webm', 'mp4']
    : [request.preferredContainer]
  const mediaKind = request.includeAudio ? 'audio' : 'silent'

  for (const container of containers) {
    for (const mimeType of MIME_CANDIDATES[container][mediaKind]) {
      let supported = false
      try {
        supported = capabilities.isMimeTypeSupported(mimeType) === true
      } catch {
        supported = false
      }
      if (supported) {
        return Object.freeze({ status: 'supported', recorder: 'MediaRecorder', container, mimeType })
      }
    }
  }
  return { status: 'unsupported', reason: 'container-unavailable' }
}
