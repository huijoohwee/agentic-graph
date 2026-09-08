import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { resolveVideoSequenceRenderSegments, resolveVideoSequenceExportErrorCode, type VideoSequenceExportPlan } from '@/components/timeline/videoSequenceExport'

const readUtf8 = (relativePath: string): string => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()

export function testVideoSequenceLocalImportAvoidsSuccessfulFsProbeAbortAndMediaRemounts() {
  const timelinePlanSyncText = readUtf8('src/components/timeline/timelinePlanSync.ts')
  const previewMediaSessionText = readUtf8('src/components/timeline/useTimelinePreviewMediaSession.ts')
  const sourceRegistryText = readUtf8('src/components/timeline/videoSequenceSourceRegistry.ts')
  const normalizedTimelinePlanSyncText = normalizeWhitespace(timelinePlanSyncText)
  const failureOnlyCleanupSnippet = normalizeWhitespace(`
    if (!durationSeconds) {
      probe.removeAttribute('src')
      probe.load()
      return null
    }
    return { durationSeconds, url }
  `)

  if (!normalizedTimelinePlanSyncText.includes(failureOnlyCleanupSnippet)) {
    throw new Error('expected successful local @fs metadata probes to keep their source bound and reserve probe teardown for failed loads only')
  }

  if (
    !previewMediaSessionText.includes('key: `video-sequence:${src}`') ||
    previewMediaSessionText.includes('key: `video-sequence:${clean(source.id) || `${label}:${index}`}`')
  ) {
    throw new Error('expected preview-session video-sequence items to key by resolved source URL so repeated local imports do not remount the same media element')
  }

  if (
    !sourceRegistryText.includes('const registryBySignature = new Map<string, RegisteredVideoSequenceSourceFile>()') ||
    !sourceRegistryText.includes('buildVideoSequenceSourceFileSignature(file)') ||
    !sourceRegistryText.includes('const existing = registryBySignature.get(fileSignature) || null') ||
    !sourceRegistryText.includes('const objectUrl = existing?.objectUrl || createObjectUrl(file)') ||
    !sourceRegistryText.includes('OBJECT_URL_REVOKE_DELAY_MS = 2000') ||
    !sourceRegistryText.includes('scheduleObjectUrlRevoke(previous.objectUrl)') ||
    sourceRegistryText.includes('revokeObjectUrl(previous.objectUrl)')
  ) {
    throw new Error('expected video sequence source registry replacements to reuse canonical blob URLs and delay revocation so mounted media does not emit abort churn during valid source refreshes')
  }
}

export async function testVideoSequenceExportKeepsSuccessfulSourceProbesBound() {
  const { restore } = initJsdomHarness()
  const originalCreate = document.createElement
  const probes: HTMLVideoElement[] = []
  const loaded: string[] = []
  const durations = new Map([['https://example.com/a.mp4', 20], ['https://example.com/b.mp4', 40]])
  let onLoaded: (() => void) | undefined
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    const element = originalCreate.call(document, tag, options)
    if (tag === 'video') {
      const video = element as HTMLVideoElement
      probes.push(video)
      video.load = () => {
        const url = video.getAttribute('src')
        if (!url) return
        loaded.push(url)
        queueMicrotask(() => {
          Object.defineProperty(video, 'duration', { configurable: true, value: durations.get(url) || 0 })
          onLoaded?.()
          video.dispatchEvent(new window.Event(video.duration ? 'loadedmetadata' : 'error'))
        })
      }
    }
    return element
  }) as typeof document.createElement
  const source = (name: string) => ({ id: name, originalName: name, relativePath: name, workspacePath: '', sourceUrl: `https://example.com/${name}`, mimeHint: 'video/mp4', byteSize: null, importMode: 'url' as const })
  const plan: VideoSequenceExportPlan = { durationMinutes: 4, filenameBase: 'probe-reuse', segments: [
    { durationMinutes: 1, hasGrade: false, hasMask: false, label: 'first', sourceLineIndex: 1, source: source('a.mp4'), sourceStartRatio: 0, sourceEndRatio: 0.5, timelineStartMinutes: 0, timelineEndMinutes: 1 },
    { durationMinutes: 1, hasGrade: false, hasMask: false, label: 'second', sourceLineIndex: 2, source: source('a.mp4'), sourceStartRatio: 0.5, sourceEndRatio: 1, timelineStartMinutes: 1, timelineEndMinutes: 2 },
    { durationMinutes: 1, hasGrade: false, hasMask: false, label: 'third', sourceLineIndex: 3, source: source('b.mp4'), sourceStartRatio: 0.25, sourceEndRatio: 0.75, timelineStartMinutes: 3, timelineEndMinutes: 4 },
  ] }
  const prepare = (signal?: AbortSignal) => resolveVideoSequenceRenderSegments({ plan, renderKind: 'video', signal })
  try {
    const segments = await prepare()
    assert.deepEqual(loaded, ['https://example.com/a.mp4', 'https://example.com/b.mp4'], 'probe each unique URL only once per export')
    assert.deepEqual(segments.map(item => [item.label, item.sourceStartSeconds, item.sourceEndSeconds, item.gapSecondsBefore]), [['first', 0, 10, 0], ['second', 10, 20, 0], ['third', 10, 30, 1]])
    assert.ok(probes.every(video => !video.hasAttribute('src')), 'release temporary probes after observing metadata')
    durations.set('https://example.com/a.mp4', 60)
    loaded.length = 0
    assert.equal((await prepare())[0]?.sourceEndSeconds, 30, 'metadata must be fresh for a later export')
    assert.equal(loaded.length, 2)
    durations.delete('https://example.com/b.mp4')
    await assert.rejects(prepare(), error => resolveVideoSequenceExportErrorCode(error) === 'source-load-failed')
    assert.ok(probes.every(video => !video.hasAttribute('src')), 'release failed probes too')
    const beforeAbort = probes.length
    const aborted = new AbortController()
    aborted.abort()
    await assert.rejects(prepare(aborted.signal), error => resolveVideoSequenceExportErrorCode(error) === 'aborted')
    assert.equal(probes.length, beforeAbort, 'an aborted export must not allocate probes')
    const inFlight = new AbortController()
    onLoaded = () => inFlight.abort()
    await assert.rejects(resolveVideoSequenceRenderSegments({ plan: { ...plan, segments: plan.segments.slice(0, 1) }, renderKind: 'video', signal: inFlight.signal }), error => resolveVideoSequenceExportErrorCode(error) === 'aborted')
    assert.equal(probes.length, beforeAbort + 1, 'stop after the in-flight probe on cancellation')
    assert.ok(probes.every(video => !video.hasAttribute('src')))
  } finally {
    document.createElement = originalCreate
    restore()
  }
}
