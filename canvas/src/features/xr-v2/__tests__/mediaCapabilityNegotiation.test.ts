import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  inspectBrowserRecorderCapabilities,
  negotiateBrowserRecordingPlan,
} from '../mediaCapabilityNegotiation'

test('recorder negotiation selects the first browser-supported native container', () => {
  const inspected: string[] = []
  const plan = negotiateBrowserRecordingPlan({
    mediaRecorderAvailable: true,
    canvasCaptureStreamAvailable: true,
    isMimeTypeSupported: mimeType => {
      inspected.push(mimeType)
      return mimeType === 'video/webm;codecs=vp8,opus'
    },
  }, { source: 'canvas', preferredContainer: 'auto', includeAudio: true })

  assert.deepEqual(plan, {
    status: 'supported',
    recorder: 'MediaRecorder',
    container: 'webm',
    mimeType: 'video/webm;codecs=vp8,opus',
  })
  assert.deepEqual(inspected, ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'])
})

test('recorder negotiation fails closed when capture or MIME support is absent', () => {
  assert.deepEqual(negotiateBrowserRecordingPlan({
    mediaRecorderAvailable: true,
    canvasCaptureStreamAvailable: false,
    isMimeTypeSupported: () => true,
  }, { source: 'canvas', preferredContainer: 'webm', includeAudio: false }), {
    status: 'unsupported', reason: 'canvas-capture-unavailable',
  })

  const capabilities = inspectBrowserRecorderCapabilities({
    MediaRecorder: { isTypeSupported: () => { throw new Error('probe failed') } },
    HTMLCanvasElement: { prototype: { captureStream: () => undefined } },
  })
  assert.equal(capabilities.mediaRecorderAvailable, true)
  assert.equal(capabilities.canvasCaptureStreamAvailable, true)
  assert.equal(capabilities.isMimeTypeSupported('video/webm'), false)
})
