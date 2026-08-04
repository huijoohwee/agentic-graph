import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveVideoSequenceExportErrorCode } from '../videoSequenceExport'
import {
  collectVideoSequenceRecorderOutput,
  flushVideoSequenceRecorderOutput,
} from '../videoSequenceRecorderLifecycle'
import { waitForVideoSequenceSegmentPlayback } from '../videoSequenceSegmentPlayback'

class MockMediaRecorder extends EventTarget {
  requestDataCalls = 0
  state: RecordingState = 'recording'

  emitData(value: string): void {
    const event = new Event('dataavailable') as BlobEvent
    Object.defineProperty(event, 'data', { value: new Blob([value]) })
    this.dispatchEvent(event)
  }

  requestData(): void {
    this.requestDataCalls += 1
    this.emitData('requested')
  }

  stop(): void {
    this.state = 'inactive'
    this.dispatchEvent(new Event('stop'))
  }
}

class MockVideo extends EventTarget {
  currentTime = 0
  ended = false
  error: MediaError | null = null
  paused = false
  readonly removedListeners: string[] = []

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removedListeners.push(type)
    super.removeEventListener(type, callback, options)
  }
}

test('recorder output flushes actual data and settles on stop', async () => {
  const recorder = new MockMediaRecorder()
  const output = collectVideoSequenceRecorderOutput(recorder as unknown as MediaRecorder)

  await flushVideoSequenceRecorderOutput({
    output,
    recorder: recorder as unknown as MediaRecorder,
  })
  assert.equal(recorder.requestDataCalls, 1)
  assert.equal(output.hasNonEmptyData(), true)

  recorder.stop()
  const chunks = await output.chunks
  assert.equal(output.hasStopped(), true)
  assert.equal(chunks.length, 1)
  assert.equal(await new Blob(chunks).text(), 'requested')
})

test('recorder data wait aborts with the edited-export abort code', async () => {
  const recorder = new MockMediaRecorder()
  recorder.requestData = () => {
    recorder.requestDataCalls += 1
  }
  const output = collectVideoSequenceRecorderOutput(recorder as unknown as MediaRecorder)
  const controller = new AbortController()
  const flushing = flushVideoSequenceRecorderOutput({
    output,
    recorder: recorder as unknown as MediaRecorder,
    signal: controller.signal,
  })

  controller.abort()
  await assert.rejects(flushing, error => resolveVideoSequenceExportErrorCode(error) === 'aborted')
  recorder.stop()
  await output.chunks
})

test('segment media errors reject immediately and remove owned listeners', async () => {
  const video = new MockVideo()
  const playback = waitForVideoSequenceSegmentPlayback({
    endSeconds: 1,
    video: video as unknown as HTMLVideoElement,
  })
  video.error = { code: 3 } as MediaError
  video.dispatchEvent(new Event('error'))

  await assert.rejects(playback, error => resolveVideoSequenceExportErrorCode(error) === 'source-load-failed')
  assert.deepEqual(
    [...new Set(video.removedListeners)].sort(),
    ['ended', 'error', 'pause', 'timeupdate'],
  )
})

test('an unexpected pause before the source range ends is a runtime failure', async () => {
  const video = new MockVideo()
  video.currentTime = 0.25
  video.paused = true

  await assert.rejects(
    waitForVideoSequenceSegmentPlayback({
      endSeconds: 1,
      video: video as unknown as HTMLVideoElement,
    }),
    error => resolveVideoSequenceExportErrorCode(error) === 'runtime-failed',
  )
})
