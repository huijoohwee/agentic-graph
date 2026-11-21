import assert from 'node:assert/strict'
import { buildRemoteVideoFrameFileName } from 'grph-shared/rich-media/providers'
import { forgetSavedVideoFrames, indexSavedVideoFrames } from '@/lib/rich-media/savedVideoFrameCatalog'
import { timestampLinkSeconds } from '@/lib/rich-media/videoTimestampLink'
import { closeSavedFramePreview, formatSavedFrameTime, readSavedFrameSelection, selectSavedVideoFrame } from '@/lib/rich-media/savedVideoFrameSelection'
import { savedClipThumbnailTimes } from '@/components/timeline/useSavedClipThumbnails'
import { resolveSavedFrameDocument, savedFrameTimelineTarget } from '@/features/video-agent/savedVideoFrameTransport'

import { useGraphStore } from '@/hooks/useGraphStore'
import { REMOTE_VIDEO_FRAME_PUBLIC_PREFIX, savedFrameListUrl } from '@/lib/rich-media/videoFrameAssets'

export async function checkSavedVideoFrameSelection(sourceUrl: string, markdown: string) {
  const path = '/websites/media/source'
  const file = { kind: 'file' as const, parentPath: path, name: 'clip.video-agent.md', path: path + '/clip.video-agent.md', updatedAtMs: 0 }
  for (const documentPath of [path + '/frames', path.slice(1) + '/transcript.md']) {
    assert.deepEqual(resolveSavedFrameDocument([file], { sourceUrl, seconds: 0, documentPath }),
      { path: file.path, key: file.path.slice(1) })
  }
  const seconds = 1.125
  const name = (format: string) => buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds: seconds, format })
  const catalog = indexSavedVideoFrames('/frames', [name('png'), name('jpg')])
  assert.deepEqual(catalog.times, [seconds])
  assert.equal(catalog.at(seconds, 'webp')?.name, name('png'))
  assert.equal(catalog.at(seconds, 'jpg')?.name, name('jpg'))
  assert.equal(catalog.at(seconds, 'jpg', '/frames/' + name('png'))?.name, name('png'))
  assert.equal(catalog.at(1, 'png'), undefined)
  assert.equal(formatSavedFrameTime(seconds), '0:01.125')
  const href = new URL(sourceUrl)
  href.searchParams.set('t', String(seconds))
  assert.equal(timestampLinkSeconds(href.href, sourceUrl), seconds)
  assert.equal(timestampLinkSeconds(href.href, new URL('/unrelated', sourceUrl).href), null)
  const samples = savedClipThumbnailTimes(Array.from({ length: 80 }, (_, i) => i + 0.125),
    { sourceStartSeconds: 1, sourceEndSeconds: 75 }, 42.125)
  assert.equal(samples.length, 16)
  assert.ok(samples.includes(42.125))
  assert.ok(samples.every(t => t >= 1 && t <= 75))
  const target = savedFrameTimelineTarget(markdown, { seconds, sourceUrl }, 0)
  assert.ok(target && Math.abs(target.position * 60 - seconds) < 0.001, 'Fractional cue must map to its timeline position')
  assert.equal(savedFrameTimelineTarget(markdown, { seconds, sourceUrl: new URL('/other', sourceUrl).href }, 0), null)
  const trimmed = markdown.replace(/^(\s*Source video\s*:[^\n]+)$/m,
    line => line.replace(/,\s*kgsrc_[\d_]+/g, '').replace(',', ', kgsrc_3_9,'))
  assert.notEqual(trimmed, markdown)
  assert.equal(savedFrameTimelineTarget(trimmed, { seconds, sourceUrl }, 0), null)
  const trimStart = savedFrameTimelineTarget(trimmed, { seconds: 3, sourceUrl }, 0)
  const trimMiddle = savedFrameTimelineTarget(trimmed, { seconds: 6, sourceUrl }, 0)
  const trimEnd = savedFrameTimelineTarget(trimmed, { seconds: 9, sourceUrl }, 0)
  assert.ok(trimStart && trimMiddle && trimEnd && Math.abs((trimStart.position + trimEnd.position) / 2 - trimMiddle.position) < 1e-6)
  const previous = useGraphStore.getState()
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  forgetSavedVideoFrames(sourceUrl)
  try {
    globalThis.fetch = async input => {
      requests.push(String(input))
      return Response.json({ directory: REMOTE_VIDEO_FRAME_PUBLIC_PREFIX, files: [name('png')], next: null })
    }
    useGraphStore.setState({ markdownDocumentName: 'source.video-agent.md', markdownDocumentText: markdown,
      timelineTransportPlaying: true, timelineTransportPosition: 0 })
    await selectSavedVideoFrame({ sourceUrl, seconds })
    assert.equal(readSavedFrameSelection()?.image?.url, REMOTE_VIDEO_FRAME_PUBLIC_PREFIX + '/' + name('png'))
    assert.equal(readSavedFrameSelection()?.error, undefined)
    assert.equal(useGraphStore.getState().timelineTransportPosition, target.position)
    assert.equal(useGraphStore.getState().timelineTransportPlaying, false)
    closeSavedFramePreview()
    assert.equal(readSavedFrameSelection()?.open, false)
    assert.deepEqual(requests, [savedFrameListUrl(sourceUrl)], 'Opening a saved cue only reads the directory')
  } finally {
    closeSavedFramePreview()
    forgetSavedVideoFrames(sourceUrl)
    globalThis.fetch = originalFetch
    useGraphStore.setState(previous)
  }
}
