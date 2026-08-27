import type { P2PCollaborationExtensionPayload } from '@/features/collaboration/p2pCollaborationProtocol'
import {
  createXrV2ConnectedPreviewTransport,
  XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS,
  XR_V2_CONNECTED_PREVIEW_NAMESPACE,
  type XrV2PreviewExtensionPort,
} from './connectedPreviewTransport'
import { waitForXrV2ConnectedPreviewPaintScheduler } from './xrV2ConnectedPreviewScheduler'
import { warmXrV2ConnectedPreviewTransport } from './xrV2ConnectedPreviewWarmup'
import {
  inspectXrV2WebmContainer,
  verifyXrV2WebmSamplePayload,
  type XrV2ContainerTrackInventory,
} from './containerTrackInventory'
import {
  copyEncodedChunk,
  XR_V2_ENCODED_TRACK_SET_SCHEMA,
  type XrV2EncodedVideoSample,
  type XrV2WebmVideoCodec,
} from './encodedTrackMuxContracts'
import { muxXrV2EncodedTracksToWebm } from './webmEncodedTrackMuxer'
import type {
  XrV2ConnectedPreviewRenderedState,
  XrV2ConnectedPreviewViewerSession,
} from './xrV2ConnectedPreviewViewerRuntime'
export type XrV2ConnectedPreviewBrowserObservation = Readonly<{
  schema: 'agenticgraph-xr-v2-connected-preview-browser-observation/v1'
  transport: 'webrtc-data-channel'
  entityRef: string
  sourceDigest: string
  graphDataRevision: number
  authoringEditRevision: number
  authorRenderedAtMs: number
  requestedVisible: boolean
  viewerVisible: boolean
  authorRevision: number
  viewerRevision: number
  editApplied: boolean
  viewerRenderedFrame: true
  viewerRenderRevision: number
  viewerRenderedAtMs: number
  latencyMs: number
  withinCeiling: boolean
  navigationEntryCountBefore: number
  navigationEntryCountAfter: number
  documentIdentityPreserved: boolean
}>

export type XrV2ConnectedPreviewAuthoringEdit = Readonly<{
  entityRef: string
  visible: boolean
  sourceDigest: string
  graphDataRevision: number
  authoringEditRevision: number
  authorRenderedAtMs: number
}>

export type XrV2EncodedTrackWebmFixture = Readonly<{
  blob: Blob
  inventory: XrV2ContainerTrackInventory
  exactPayloadsVerified: boolean
  sourceCodecs: readonly XrV2WebmVideoCodec[]
  sourceSampleCounts: readonly number[]
  decodedSourceFrameCounts: readonly number[]
}>

export type XrV2EncodedTrackBrowserObservation = Readonly<{
  schema: 'agenticgraph-xr-v2-encoded-track-browser-observation/v1'
  byteSize: number
  trackCount: number
  sourceCodecs: readonly string[]
  packagedCodecs: readonly string[]
  sourceSampleCounts: readonly number[]
  decodedSourceFrameCounts: readonly number[]
  packagedSampleCounts: readonly number[]
  exactPayloadsVerified: boolean
  seekHeadEntryCount: number
  cuePointCount: number
  decodedWidth: number
  decodedHeight: number
  durationSeconds: number
  seekTimeSeconds: number
  playbackObserved: boolean
  sourceReleased: boolean
}>

async function encodeXrV2BrowserVideoTrack(args: Readonly<{
  codec: XrV2WebmVideoCodec
  webCodecsCodec: string
  hueOffset: number
  signal: AbortSignal
}>): Promise<readonly XrV2EncodedVideoSample[]> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('WebCodecs video encoding is unavailable in this browser.')
  }
  const width = 96
  const height = 64
  const frameRate = 30
  const frameDurationUs = 1_000_000 / frameRate
  const support = await VideoEncoder.isConfigSupported({
    codec: args.webCodecsCodec,
    width,
    height,
    bitrate: 250_000,
    framerate: frameRate,
    latencyMode: 'realtime',
  })
  if (!support.supported) throw new Error(`WebCodecs does not support ${args.webCodecsCodec}.`)
  const samples: XrV2EncodedVideoSample[] = []
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: chunk => samples.push(copyEncodedChunk(chunk, Math.round(frameDurationUs))),
    error: error => { encoderError = error },
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('XR v2 WebCodecs fixture canvas is unavailable.')
  try {
    encoder.configure(support.config)
    for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
      if (args.signal.aborted) throw new Error('XR v2 WebCodecs fixture was aborted.')
      context.fillStyle = `hsl(${(args.hueOffset + frameIndex * 19) % 360} 70% 35%)`
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#ffffff'
      context.fillRect(8 + frameIndex * 8, 18, 20, 20)
      const timestamp = Math.round(frameIndex * frameDurationUs)
      const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(frameDurationUs) })
      try {
        encoder.encode(frame, { keyFrame: frameIndex === 0 || frameIndex === 4 })
      } finally {
        frame.close()
      }
    }
    await encoder.flush()
    if (encoderError) throw encoderError
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  samples.sort((left, right) => left.timestampUs - right.timestampUs)
  if (samples.length !== 8 || samples[0]?.type !== 'key') {
    throw new Error(`WebCodecs ${args.codec} fixture emitted an unexpected sample inventory.`)
  }
  return Object.freeze(samples)
}

async function decodeXrV2BrowserVideoTrack(args: Readonly<{
  codec: string
  samples: readonly XrV2EncodedVideoSample[]
  signal: AbortSignal
}>): Promise<number> {
  if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
    throw new Error('WebCodecs video decoding is unavailable in this browser.')
  }
  if (args.signal.aborted) throw new Error('XR v2 WebCodecs decode was aborted.')
  const config: VideoDecoderConfig = { codec: args.codec, codedWidth: 96, codedHeight: 64 }
  const support = await VideoDecoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`WebCodecs decoder does not support ${args.codec}.`)
  let decodedFrames = 0
  let decoderError: Error | null = null
  const decoder = new VideoDecoder({
    output: frame => { decodedFrames += 1; frame.close() },
    error: error => { decoderError = error },
  })
  try {
    decoder.configure(support.config)
    for (const sample of args.samples) {
      if (args.signal.aborted) throw new Error('XR v2 WebCodecs decode was aborted.')
      decoder.decode(new EncodedVideoChunk({
        type: sample.type,
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: sample.data,
      }))
    }
    await decoder.flush()
    if (decoderError) throw decoderError
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }
  if (decodedFrames !== args.samples.length) {
    throw new Error(`WebCodecs ${args.codec} decoder emitted ${decodedFrames}/${args.samples.length} frames.`)
  }
  return decodedFrames
}

/** Produces a real, two-track, already-encoded WebM fixture in the browser. */
export async function createXrV2EncodedTrackWebmFixture(
  signal: AbortSignal,
): Promise<XrV2EncodedTrackWebmFixture> {
  const [vp8Samples, vp9Samples] = await Promise.all([
    encodeXrV2BrowserVideoTrack({
      codec: 'vp8', webCodecsCodec: 'vp8', hueOffset: 205, signal,
    }),
    encodeXrV2BrowserVideoTrack({
      codec: 'vp9', webCodecsCodec: 'vp09.00.10.08', hueOffset: 25, signal,
    }),
  ])
  const decodedSourceFrameCounts = await Promise.all([
    decodeXrV2BrowserVideoTrack({ codec: 'vp8', samples: vp8Samples, signal }),
    decodeXrV2BrowserVideoTrack({ codec: 'vp09.00.10.08', samples: vp9Samples, signal }),
  ])
  const sourceTracks = [
    { kind: 'video' as const, codec: 'vp8' as const, width: 96, height: 64, frameRate: 30, samples: vp8Samples },
    { kind: 'video' as const, codec: 'vp9' as const, width: 96, height: 64, frameRate: 30, samples: vp9Samples },
  ]
  const muxed = muxXrV2EncodedTracksToWebm({
    schema: XR_V2_ENCODED_TRACK_SET_SCHEMA,
    tracks: sourceTracks,
  })
  if (muxed.status !== 'ready') throw new Error(`XR v2 track mux failed: ${muxed.reason}: ${muxed.detail}`)
  const inventory = inspectXrV2WebmContainer(muxed.container.bytes)
  if (inventory.tracks.length !== sourceTracks.length
    || inventory.tracks.some((track, index) => track.codec !== sourceTracks[index]?.codec)
    || inventory.tracks.some((track, index) => track.sampleCount !== sourceTracks[index]?.samples.length)
    || inventory.seekHeadEntryCount < 3
    || inventory.cuePointCount < 2) {
    throw new Error('XR v2 WebM inventory did not preserve the two encoded source tracks.')
  }
  const exactPayloadsVerified = inventory.tracks.every((track, trackIndex) => (
    track.samples.every((sample, sampleIndex) => verifyXrV2WebmSamplePayload(
      muxed.container.bytes,
      sample,
      sourceTracks[trackIndex].samples[sampleIndex].data,
    ))
  ))
  if (!exactPayloadsVerified) throw new Error('XR v2 WebM payload bytes drifted during packaging.')
  return Object.freeze({
    blob: new Blob([muxed.container.bytes.slice().buffer], { type: muxed.container.mimeType }),
    inventory,
    exactPayloadsVerified,
    sourceCodecs: Object.freeze(sourceTracks.map(track => track.codec)),
    sourceSampleCounts: Object.freeze(sourceTracks.map(track => track.samples.length)),
    decodedSourceFrameCounts: Object.freeze(decodedSourceFrameCounts),
  })
}

function waitForIceGatheringComplete(
  connection: RTCPeerConnection,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('WebRTC preview observation was aborted.'))
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => finish(new Error('WebRTC ICE gathering timed out.')), 5_000)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      connection.removeEventListener('icegatheringstatechange', onChange)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(new Error('WebRTC preview observation was aborted.'))
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    connection.addEventListener('icegatheringstatechange', onChange)
    onChange()
  })
}

function waitForDataChannelOpen(channel: RTCDataChannel, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('WebRTC preview observation was aborted.'))
  if (channel.readyState === 'open') return Promise.resolve()
  if (channel.readyState === 'closing' || channel.readyState === 'closed') {
    return Promise.reject(new Error('WebRTC data channel closed before opening.'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => finish(new Error('WebRTC data channel did not open.')), 5_000)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      channel.removeEventListener('open', onOpen)
      channel.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(new Error('WebRTC preview observation was aborted.'))
    const onOpen = () => finish()
    const onError = () => finish(new Error('WebRTC data channel failed before opening.'))
    signal.addEventListener('abort', onAbort, { once: true })
    channel.addEventListener('open', onOpen, { once: true })
    channel.addEventListener('error', onError, { once: true })
    if (channel.readyState === 'open') onOpen()
  })
}

const XR_V2_CONNECTED_PREVIEW_CHANNEL_READY_TIMEOUT_MS = 5_000

/**
 * A data channel can report `open` before its first SCTP application frame has
 * completed a round trip. Confirm the already-open path before starting the
 * edit propagation clock so connection establishment never masquerades as
 * edit latency.
 */
export function confirmXrV2ConnectedPreviewChannelRoundTrip(
  authorChannel: RTCDataChannel,
  viewerChannel: RTCDataChannel,
  signal: AbortSignal,
  options: Readonly<{ challenge?: string; timeoutMs?: number }> = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? XR_V2_CONNECTED_PREVIEW_CHANNEL_READY_TIMEOUT_MS
  const randomId = globalThis.crypto?.randomUUID?.().replace(/-/gu, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
  const challenge = options.challenge ?? `kg-xr-v2-channel-ready:${randomId}`
  const acknowledgement = `${challenge}:ack`
  if (authorChannel.readyState !== 'open' || viewerChannel.readyState !== 'open') {
    return Promise.reject(new Error('WebRTC connected-preview channels closed before readiness confirmation.'))
  }
  if (!/^kg-xr-v2-channel-ready:[A-Za-z0-9_-]{4,128}$/.test(challenge)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10
    || timeoutMs > XR_V2_CONNECTED_PREVIEW_CHANNEL_READY_TIMEOUT_MS) {
    return Promise.reject(new Error('WebRTC connected-preview readiness confirmation is invalid.'))
  }
  if (signal.aborted) return Promise.reject(new Error('WebRTC preview observation was aborted.'))
  return new Promise((resolve, reject) => {
    let settled = false
    let viewerObservedChallenge = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      if (timeout !== null) clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      authorChannel.removeEventListener('message', onAuthorMessage)
      viewerChannel.removeEventListener('message', onViewerMessage)
      authorChannel.removeEventListener('close', onClose)
      viewerChannel.removeEventListener('close', onClose)
      authorChannel.removeEventListener('error', onError)
      viewerChannel.removeEventListener('error', onError)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(new Error('WebRTC preview observation was aborted.'))
    const onClose = () => finish(new Error('WebRTC connected-preview channel closed during readiness confirmation.'))
    const onError = () => finish(new Error('WebRTC connected-preview channel failed during readiness confirmation.'))
    const onViewerMessage = (event: MessageEvent<unknown>) => {
      if (event.data !== challenge) return
      viewerObservedChallenge = true
      try { viewerChannel.send(acknowledgement) }
      catch { finish(new Error('WebRTC connected-preview readiness acknowledgement could not be sent.')) }
    }
    const onAuthorMessage = (event: MessageEvent<unknown>) => {
      if (event.data === acknowledgement && viewerObservedChallenge) finish()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    authorChannel.addEventListener('message', onAuthorMessage)
    viewerChannel.addEventListener('message', onViewerMessage)
    authorChannel.addEventListener('close', onClose, { once: true })
    viewerChannel.addEventListener('close', onClose, { once: true })
    authorChannel.addEventListener('error', onError, { once: true })
    viewerChannel.addEventListener('error', onError, { once: true })
    timeout = setTimeout(
      () => finish(new Error('WebRTC connected-preview readiness round trip timed out.')),
      timeoutMs,
    )
    try { authorChannel.send(challenge) }
    catch { finish(new Error('WebRTC connected-preview readiness challenge could not be sent.')) }
  })
}

function waitForRemoteDataChannel(
  connection: RTCPeerConnection,
  signal: AbortSignal,
): Promise<RTCDataChannel> {
  if (signal.aborted) return Promise.reject(new Error('WebRTC preview observation was aborted.'))
  return new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => finish(null, new Error('WebRTC remote data channel timed out.')), 5_000)
    const finish = (channel: RTCDataChannel | null, error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      connection.removeEventListener('datachannel', onDataChannel)
      if (error || !channel) reject(error ?? new Error('WebRTC remote data channel is unavailable.'))
      else resolve(channel)
    }
    const onAbort = () => finish(null, new Error('WebRTC preview observation was aborted.'))
    const onDataChannel = (event: RTCDataChannelEvent) => finish(event.channel)
    signal.addEventListener('abort', onAbort, { once: true })
    connection.addEventListener('datachannel', onDataChannel, { once: true })
    if (signal.aborted) onAbort()
  })
}

function createPreviewDataChannelPort(channel: RTCDataChannel): XrV2PreviewExtensionPort {
  return Object.freeze({
    register: handler => {
      const onMessage = (event: MessageEvent<unknown>) => {
        let payload: P2PCollaborationExtensionPayload
        try {
          payload = JSON.parse(String(event.data)) as P2PCollaborationExtensionPayload
        } catch {
          return
        }
        handler({
          kind: 'message',
          namespace: XR_V2_CONNECTED_PREVIEW_NAMESPACE,
          sourceId: 'browser-webrtc-loopback-peer',
          payload,
          receivedAt: performance.now(),
        })
      }
      channel.addEventListener('message', onMessage)
      return () => channel.removeEventListener('message', onMessage)
    },
    publish: payload => {
      if (channel.readyState !== 'open') return { status: 'not-connected', deliveredPeerCount: 0 }
      try {
        channel.send(JSON.stringify(payload))
        return { status: 'sent', deliveredPeerCount: 1 }
      } catch {
        return { status: 'not-connected', deliveredPeerCount: 0 }
      }
    },
    connectedPeerCount: () => channel.readyState === 'open' ? 1 : 0,
  })
}

/**
 * Exercises the production connected-preview adapter over two real browser
 * RTCPeerConnections. Signalling stays local to the deterministic smoke; the
 * runtime adapter still defaults to the canonical collaboration extension.
 */
export async function probeXrV2ConnectedPreviewOverWebRtc(
  signal: AbortSignal,
  authoringEdit: XrV2ConnectedPreviewAuthoringEdit,
  viewerSession: XrV2ConnectedPreviewViewerSession,
): Promise<XrV2ConnectedPreviewBrowserObservation> {
  if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC is unavailable in this browser.')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(authoringEdit.entityRef)
    || !/^fnv1a32:[0-9a-f]{8}$/.test(authoringEdit.sourceDigest)
    || !Number.isSafeInteger(authoringEdit.graphDataRevision)
    || authoringEdit.graphDataRevision < 0
    || !Number.isSafeInteger(authoringEdit.authoringEditRevision)
    || authoringEdit.authoringEditRevision < 1
    || !Number.isFinite(authoringEdit.authorRenderedAtMs)
    || authoringEdit.authorRenderedAtMs < 0) {
    throw new Error('Connected preview requires one bounded edit from the mounted authoring plan.')
  }
  if (!viewerSession || typeof viewerSession.applyEdit !== 'function'
    || typeof viewerSession.snapshot !== 'function') {
    throw new Error('Connected preview requires one mounted viewer session.')
  }
  const originalDocument = document
  const navigationEntryCountBefore = performance.getEntriesByType('navigation').length
  const probeAbortController = new AbortController()
  const forwardAbort = () => probeAbortController.abort()
  signal.addEventListener('abort', forwardAbort, { once: true })
  if (signal.aborted) forwardAbort()
  const probeSignal = probeAbortController.signal
  const probeStartedAtMs = performance.now()
  let editSubmittedAtMs: number | null = null
  let viewerEditReceivedAtMs: number | null = null
  let viewerEditRenderedAtMs: number | null = null
  const authorPeer = new RTCPeerConnection({ iceServers: [] })
  const viewerPeer = new RTCPeerConnection({ iceServers: [] })
  const authorChannel = authorPeer.createDataChannel('agenticgraph-xr-v2-preview', {
    ordered: false, maxRetransmits: 0, priority: 'high',
  } as RTCDataChannelInit)
  let viewerChannel: RTCDataChannel | null = null
  let authorTransport: ReturnType<typeof createXrV2ConnectedPreviewTransport> | null = null
  let viewerTransport: ReturnType<typeof createXrV2ConnectedPreviewTransport> | null = null
  try {
    await authorPeer.setLocalDescription(await authorPeer.createOffer())
    await waitForIceGatheringComplete(authorPeer, probeSignal)
    if (!authorPeer.localDescription) throw new Error('WebRTC author offer is unavailable.')
    await viewerPeer.setRemoteDescription(authorPeer.localDescription)
    await viewerPeer.setLocalDescription(await viewerPeer.createAnswer())
    await waitForIceGatheringComplete(viewerPeer, probeSignal)
    if (!viewerPeer.localDescription) throw new Error('WebRTC viewer answer is unavailable.')
    const viewerChannelReady = waitForRemoteDataChannel(viewerPeer, probeSignal)
    const [remoteChannel] = await Promise.all([
      viewerChannelReady,
      authorPeer.setRemoteDescription(viewerPeer.localDescription),
    ])
    viewerChannel = remoteChannel
    await Promise.all([
      waitForDataChannelOpen(authorChannel, probeSignal),
      waitForDataChannelOpen(viewerChannel, probeSignal),
    ])
    // Prove the busy workspace paint scheduler is servicing frames before
    // starting the strict 250 ms edit-to-render acknowledgement clock.
    await waitForXrV2ConnectedPreviewPaintScheduler(probeSignal)
    await warmXrV2ConnectedPreviewTransport({ authorPort: createPreviewDataChannelPort(authorChannel), viewerPort: createPreviewDataChannelPort(viewerChannel), viewerSession, authoringEdit, signal: probeSignal })
    await confirmXrV2ConnectedPreviewChannelRoundTrip(
      authorChannel,
      viewerChannel,
      probeSignal,
    )
    let viewerRevision = 0
    let editApplied = false
    let viewerApplyFailure: unknown = null
    let renderedState: XrV2ConnectedPreviewRenderedState | null = null
    viewerTransport = createXrV2ConnectedPreviewTransport({
      role: 'viewer',
      streamId: 'browser-preview',
      port: createPreviewDataChannelPort(viewerChannel),
      onViewerEdit: async (edit, revision) => {
        viewerEditReceivedAtMs = performance.now()
        const matchesAuthoringEdit = edit.operation === 'set-visible'
          && edit.entityRef === authoringEdit.entityRef
          && edit.visible === authoringEdit.visible
          && edit.sourceDigest === authoringEdit.sourceDigest
          && edit.graphDataRevision === authoringEdit.graphDataRevision
          && edit.authoringEditRevision === authoringEdit.authoringEditRevision
          && edit.authorRenderedAtMs === authoringEdit.authorRenderedAtMs
        if (!matchesAuthoringEdit) throw new Error('Connected preview viewer rejected source identity drift.')
        try {
          renderedState = await viewerSession.applyEdit(authoringEdit, revision, probeSignal)
          viewerEditRenderedAtMs = performance.now()
        } catch (error) {
          viewerApplyFailure = error
          throw error
        }
        editApplied = renderedState.entityRef === authoringEdit.entityRef
          && renderedState.visible === authoringEdit.visible
          && renderedState.sourceDigest === authoringEdit.sourceDigest
          && renderedState.graphDataRevision === authoringEdit.graphDataRevision
          && renderedState.revision === revision
          && renderedState.attached
        viewerRevision = revision
      },
    })
    authorTransport = createXrV2ConnectedPreviewTransport({
      role: 'author',
      streamId: 'browser-preview',
      port: createPreviewDataChannelPort(authorChannel),
    })
    editSubmittedAtMs = performance.now()
    const result = await authorTransport.submitEdit({
      operation: 'set-visible',
      entityRef: authoringEdit.entityRef,
      visible: authoringEdit.visible,
      sourceDigest: authoringEdit.sourceDigest,
      graphDataRevision: authoringEdit.graphDataRevision,
      authoringEditRevision: authoringEdit.authoringEditRevision,
      authorRenderedAtMs: authoringEdit.authorRenderedAtMs,
    })
    if (result.status !== 'acknowledged' || result.latencyMs === null) {
      const detail = viewerApplyFailure instanceof Error ? `: ${viewerApplyFailure.message}` : ''
      const timing = JSON.stringify({ scheduler: 'scheduler' in globalThis,
        preEditMs: editSubmittedAtMs - probeStartedAtMs,
        viewerReceiveMs: viewerEditReceivedAtMs === null ? null : viewerEditReceivedAtMs - editSubmittedAtMs,
        viewerRenderMs: viewerEditRenderedAtMs === null ? null : viewerEditRenderedAtMs - editSubmittedAtMs })
      throw new Error(`Connected preview was not acknowledged (${result.status}${detail}; ${timing}).`)
    }
    const viewerSnapshot = viewerSession.snapshot()
    if (!editApplied || viewerRevision !== result.revision || !renderedState || !viewerSnapshot
      || viewerSnapshot.revision !== result.revision
      || viewerSnapshot.renderedAtMs !== renderedState.renderedAtMs) {
      throw new Error('Connected preview acknowledgement did not match the applied viewer revision.')
    }
    return Object.freeze({
      schema: 'agenticgraph-xr-v2-connected-preview-browser-observation/v1',
      transport: 'webrtc-data-channel',
      entityRef: authoringEdit.entityRef,
      sourceDigest: authoringEdit.sourceDigest,
      graphDataRevision: authoringEdit.graphDataRevision,
      authoringEditRevision: authoringEdit.authoringEditRevision,
      authorRenderedAtMs: authoringEdit.authorRenderedAtMs,
      requestedVisible: authoringEdit.visible,
      viewerVisible: viewerSnapshot.visible,
      authorRevision: result.revision,
      viewerRevision,
      editApplied,
      viewerRenderedFrame: true,
      viewerRenderRevision: viewerSnapshot.revision,
      viewerRenderedAtMs: viewerSnapshot.renderedAtMs,
      latencyMs: result.latencyMs,
      withinCeiling: result.withinCeiling
        && result.latencyMs <= XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS,
      navigationEntryCountBefore,
      navigationEntryCountAfter: performance.getEntriesByType('navigation').length,
      documentIdentityPreserved: document === originalDocument,
    })
  } finally {
    signal.removeEventListener('abort', forwardAbort)
    probeAbortController.abort()
    authorTransport?.dispose()
    viewerTransport?.dispose()
    try { authorChannel.close() } catch { void 0 }
    try { viewerChannel?.close() } catch { void 0 }
    authorPeer.close()
    viewerPeer.close()
  }
}
