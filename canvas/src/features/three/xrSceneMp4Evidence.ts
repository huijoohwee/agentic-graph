import { readNativeIsoBmffContainerSummary } from '@/components/timeline/timelineMediaMetadata'

export const XR_MP4_MAX_BYTES = 64 * 1024 * 1024
export const XR_MP4_FRAME_SAMPLE_SIZE = 32
export type XrMp4DecodedEvidence = {
  durationSeconds: number; decodedFrames: number; width: number; height: number; sampleHashes: string[]
  finalFrameVerified?: boolean; finalFrameMeanError?: number
}
export function assertXrMp4Container(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 32 || bytes.byteLength > XR_MP4_MAX_BYTES) throw new Error('MP4 output has an invalid byte size.')
  const view = new DataView(bytes)
  const summary = readNativeIsoBmffContainerSummary({ view, byteSize: bytes.byteLength, bytesRead: bytes.byteLength, mimeType: '' })
  const brands = [summary.containerBrand, ...summary.compatibleBrands]
  if (!brands.some(brand => /^(isom|iso[2-9]|mp4[12]|avc1|M4V)$/.test(brand)) || summary.videoTrackCount < 1) {
    throw new Error('Recorder output is not an MP4 video container. No format substitution was saved.')
  }
  let payload = false
  for (let offset = 0; offset + 8 <= view.byteLength;) {
    let size = view.getUint32(offset)
    const type = String.fromCharCode(...new Uint8Array(bytes, offset + 4, 4))
    let header = 8
    if (size === 1) {
      if (offset + 16 > view.byteLength) throw new Error('Truncated MP4 box.')
      size = Number(view.getBigUint64(offset + 8)); header = 16
    } else if (size === 0) size = view.byteLength - offset
    if (!Number.isSafeInteger(size) || size < header || offset + size > view.byteLength) throw new Error('Invalid MP4 box length.')
    if (type === 'mdat' && size > header) payload = true
    offset += size
  }
  if (!payload) throw new Error('MP4 output contains no video sample payload.')
}

function waitForMedia(video: HTMLVideoElement, eventName: string, signal?: AbortSignal, timeoutMs = 8_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer)
      video.removeEventListener(eventName, done)
      video.removeEventListener('error', failed)
      signal?.removeEventListener('abort', aborted)
      if (error) reject(error); else resolve()
    }
    const done = () => finish()
    const failed = () => finish(new Error('MP4 output could not be decoded.'))
    const aborted = () => finish(new DOMException('MP4 export cancelled.', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('MP4 decode verification timed out.')), timeoutMs)
    video.addEventListener(eventName, done, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal?.addEventListener('abort', aborted, { once: true })
    if (signal?.aborted) aborted()
  })
}

/** Decode the actual recorder bytes; MIME labels and an ftyp box alone are not proof. */
export async function verifyXrSceneMp4(
  blob: Blob, expectedDuration: number, signal?: AbortSignal, expectedFinalFrame?: Uint8ClampedArray,
): Promise<XrMp4DecodedEvidence> {
  if (signal?.aborted) throw new DOMException('MP4 export cancelled.', 'AbortError')
  if (blob.size > XR_MP4_MAX_BYTES) throw new Error('MP4 export exceeds the 64 MB limit.')
  assertXrMp4Container(await blob.arrayBuffer())
  const video = document.createElement('video')
  const url = URL.createObjectURL(blob)
  video.muted = true; video.playsInline = true; video.preload = 'auto'
  try {
    const metadata = waitForMedia(video, 'loadedmetadata', signal)
    video.src = url; video.load()
    await metadata
    let durationSeconds = video.duration
    // Native fragmented MP4 may omit a finite duration in the initial moov box.
    // Decode to the actual end rather than treating the requested duration as evidence.
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      const playback = new AbortController()
      const abortPlayback = () => playback.abort()
      signal?.addEventListener('abort', abortPlayback, { once: true })
      if (signal?.aborted) abortPlayback()
      const ended = waitForMedia(video, 'ended', playback.signal, expectedDuration * 1_000 + 8_000)
      try {
        // Observe timeout/abort even if the browser never settles the play request.
        await Promise.all([ended, Promise.resolve().then(() => video.play())])
      } finally {
        playback.abort()
        signal?.removeEventListener('abort', abortPlayback)
      }
      durationSeconds = video.currentTime
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0
      || Math.abs(durationSeconds - expectedDuration) > Math.max(0.4, expectedDuration * 0.08)) {
      throw new Error(`MP4 duration does not match the authored scene (decoded=${durationSeconds}, authored=${expectedDuration}).`)
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error('MP4 output has no decoded video dimensions.')
    if (video.readyState < 2) await waitForMedia(video, 'loadeddata', signal)
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('MP4 frame verification is unavailable.')
    const sampleHashes: string[] = []
    let finalFrameMeanError: number | undefined
    for (const time of [0, durationSeconds / 2, Math.max(0, durationSeconds - 0.001)]) {
      if (signal?.aborted) throw new DOMException('MP4 export cancelled.', 'AbortError')
      if (Math.abs(video.currentTime - time) > 0.001) {
        const sought = waitForMedia(video, 'seeked', signal)
        video.currentTime = time
        await sought
      }
      context.clearRect(0, 0, 32, 32)
      context.drawImage(video, 0, 0, 32, 32)
      const pixels = context.getImageData(0, 0, 32, 32).data
      let hash = 2166136261; let alpha = 0
      for (let index = 0; index < pixels.length; index += 1) {
        hash = Math.imul(hash ^ pixels[index], 16777619)
        if (index % 4 === 3) alpha += pixels[index]
      }
      if (!alpha) throw new Error('MP4 output has an empty decoded frame.')
      sampleHashes.push((hash >>> 0).toString(16))
      if (expectedFinalFrame && sampleHashes.length === 3) {
        if (expectedFinalFrame.length !== pixels.length) throw new Error('MP4 endpoint reference has invalid dimensions.')
        let error = 0; let mismatchedPixels = 0
        for (let index = 0; index < pixels.length; index += 4) {
          const distance = Math.abs(pixels[index] - expectedFinalFrame[index])
            + Math.abs(pixels[index + 1] - expectedFinalFrame[index + 1])
            + Math.abs(pixels[index + 2] - expectedFinalFrame[index + 2])
          error += distance
          if (distance / 3 > 32) mismatchedPixels++
        }
        finalFrameMeanError = error / (pixels.length / 4 * 3)
        // Lossy codec/chroma conversion is allowed; a different camera image is not.
        if (finalFrameMeanError > 12 || mismatchedPixels > pixels.length / 4 * 0.08) {
          throw new Error(`MP4 final decoded frame does not match the authored endpoint (meanError=${finalFrameMeanError}, mismatchedPixels=${mismatchedPixels}).`)
        }
      }
    }
    return { durationSeconds, decodedFrames: sampleHashes.length, width: video.videoWidth, height: video.videoHeight, sampleHashes,
      ...(expectedFinalFrame ? { finalFrameVerified: true, finalFrameMeanError } : {}) }
  } finally {
    video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url)
  }
}
