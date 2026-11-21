import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildRemoteVideoFrameFileName } from 'grph-shared/rich-media/providers'
import { readSavedFrameEntries, videoFrameBundles } from '@/features/source-files/useSavedFrameEntries'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { createRemoteVideoFrameHandler, createRemoteVideoFramePublicAssetHandler } from '@/lib/rich-media/server/videoFrameServer'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport/urlImport'
import { FRAME_FORMAT_SETTING } from '@/features/settings/workspaceFrameFormatSetting'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { transcriptFrameTimes } from '@/features/markdown-workspace/workspaceImport/transcriptFrames'
import { videoFrameWorkerPool } from '@/lib/rich-media/server/videoFrameWorker'
import { REMOTE_VIDEO_FRAME_PUBLIC_PREFIX, TRANSCRIPT_FRAME_BATCH_SIZE } from '@/lib/rich-media/videoFrameAssets'
import { websiteSourceBundlePath } from '@/lib/websites/websitePathUtils'

export async function testSavedFrameDirectory() {
  const sourceUrl = new URL('/video?id=one', 'https://media.example.test').href
  const parentPath = websiteSourceBundlePath(sourceUrl)
  const primary: WorkspaceEntry = { name: 'clip.video-agent.md', path: parentPath + '/clip.video-agent.md', parentPath, kind: 'file', updatedAtMs: 0 }
  const legacy = { ...primary, parentPath: '/docs_/earlier', path: '/docs_/earlier/' + primary.name }
  const sources = { [primary.path]: { kind: 'url' as const, url: sourceUrl }, [legacy.path]: { kind: 'url' as const, url: sourceUrl } }
  const [bundle] = videoFrameBundles([primary, legacy], sources)
  assert.deepEqual(videoFrameBundles([primary, legacy], sources), [{ path: parentPath + '/frames', source: sourceUrl }])
  assert.deepEqual(videoFrameBundles([primary, { ...primary, name: 'source.json', path: parentPath + '/source.json',
    text: JSON.stringify({ sourceUrl }) }], {}), [bundle])
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saved-frame-test-'))
  const handler = createRemoteVideoFramePublicAssetHandler({ workspaceRoot: root, cacheRoot: root })
  const server = createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end() }))
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const origin = 'http://127.0.0.1:' + address.port
    const fetchPage: typeof fetch = (input, init) =>
      fetch(new URL(String(input).slice(REMOTE_VIDEO_FRAME_PUBLIC_PREFIX.length), origin), init)
    const read = () => readSavedFrameEntries(bundle!, new AbortController().signal, fetchPage)
    assert.deepEqual(await read(), [])
    const names = Array.from({ length: 257 }, (_, timeSeconds) => buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds }))
    for (const name of names) await fs.writeFile(path.join(root, name), name)
    const different = buildRemoteVideoFrameFileName({ sourceUrl: sourceUrl + '2', timeSeconds: 0 })
    await fs.writeFile(path.join(root, different), 'separate source')
    const directoryName = buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds: 500 })
    await fs.mkdir(path.join(root, directoryName))
    const list = await read()
    assert.deepEqual(list.map(entry => entry.name), names.sort())
    for (const entry of list) {
      assert.equal(entry.path, bundle!.path + '/' + entry.name)
      assert.deepEqual(entry.savedAsset, { url: REMOTE_VIDEO_FRAME_PUBLIC_PREFIX + '/' + entry.name })
      assert.equal(entry.text, undefined)
    }
    const first = list[0]!
    const image = await fetchPage(REMOTE_VIDEO_FRAME_PUBLIC_PREFIX + '/' + first.name)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.equal(await image.text(), first.name)
    await fs.unlink(path.join(root, first.name))
    assert.equal((await read()).length, 256)
    await verifyTimestampImport(root)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function verifyTimestampImport(root: string) {
  const id = 'SourceCueFixture'
  const sourceUrl = new URL('/watch?v=' + id, 'https://www.youtube.com').href
  const markdown = `[0:01](https://youtu.be/${id}?t=1) [0:03](https://youtu.be/AnotherVideo?t=3)`
  const cues = Array.from({ length: TRANSCRIPT_FRAME_BATCH_SIZE + 3 }, (_, i) => ({ start: i + 0.125, duration: 1, text: 'cue ' + i }))
  const transcriptJsonText = JSON.stringify({ segments: [...cues, cues[0]] })
  const expected = [0.125, 1, ...cues.slice(1).map(cue => cue.start)]
  assert.deepEqual(transcriptFrameTimes(sourceUrl, markdown, transcriptJsonText), expected)
  const name = (timeSeconds: number, format = 'png') => buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds, format })
  const listing = createRemoteVideoFramePublicAssetHandler({ workspaceRoot: root, cacheRoot: root })
  let rejectTime: number | null = cues.at(-1)!.start
  const extracted: number[] = []
  const writer = createRemoteVideoFrameHandler({ workspaceRoot: root, repoRoot: root, cacheRoot: root,
    getPythonBin: async () => 'python', withRepoPythonPath: env => env, workerPool: {
      ...videoFrameWorkerPool,
      request: async req => {
        if (req.timeSeconds === rejectTime) return { ok: false, error: 'test decoder unavailable' }
        extracted.push(req.timeSeconds)
        await fs.writeFile(req.outputPath, 'frame')
        return { ok: true, path: req.outputPath, timeSeconds: req.timeSeconds, format: req.format, cached: false, bytes: 5 }
      },
    } })
  let batches = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost')
    if (url.pathname === '/__video_frame') { batches++; void writer(req, res, () => res.end()); return }
    req.url = url.pathname.slice(REMOTE_VIDEO_FRAME_PUBLIC_PREFIX.length) + url.search
    void listing(req, res, () => res.end())
  })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const origin = 'http://127.0.0.1:' + address.port
    const fetchVideoFrames: typeof fetch = (input, init) => fetch(new URL(String(input), origin), init)
    const workspace = createMemoryWorkspaceFs()
    let conversions = 0
    const run = () => importWorkspaceUrl({ fs: workspace, urlRaw: sourceUrl, fetchVideoFrames,
      fetchUrlContent: async () => {
        conversions++
        return { normalizedUrl: sourceUrl, name: 'clip.md', text: markdown, sourceMediaKind: 'video', transcriptJsonText }
      } })
    await fs.writeFile(path.join(root, name(0.125, 'png')), 'existing frame')
    await assert.rejects(run, /test decoder unavailable/)
    assert.ok(batches >= 2, 'long transcripts must use bounded batches')
    rejectTime = null
    await run()
    assert.equal(conversions, 1, 'resume should use the preserved source transcript')
    for (const seconds of expected) {
      const file = path.join(root, name(seconds))
      assert.ok((await fs.stat(file)).size > 0)
    }
    assert.deepEqual([...extracted].sort((a, b) => a - b), expected.slice(1))
    const before = batches
    await run()
    assert.equal(batches, before, 'a complete import should only read the inventory')
    await fs.unlink(path.join(root, name(1)))
    await run()
    assert.deepEqual(extracted.slice(expected.length - 1), [1])
    const browser = initWindowHarness({ storage: new MemoryStorage() })
    try {
      assert.equal(FRAME_FORMAT_SETTING.default?.(), 'PNG')
      assert.equal(FRAME_FORMAT_SETTING.read(), 'PNG')
      assert.deepEqual(FRAME_FORMAT_SETTING.options, ['PNG', 'JPEG', 'WebP'])
      for (const [label, extension, mime] of [['JPEG', 'jpg', 'image/jpeg'], ['WebP', 'webp', 'image/webp']] as const) {
        FRAME_FORMAT_SETTING.write!(label)
        assert.equal(FRAME_FORMAT_SETTING.read(), label)
        await run()
        for (const seconds of expected) assert.ok((await fs.stat(path.join(root, name(seconds, extension)))).size)
        const image = await fetchVideoFrames(REMOTE_VIDEO_FRAME_PUBLIC_PREFIX + '/' + name(expected[0]!, extension))
        assert.equal(image.headers.get('content-type'), mime)
        await image.arrayBuffer()
        const count = batches
        await run()
        assert.equal(batches, count)
      }
    } finally { browser.restore() }
    const invalid = await fetchVideoFrames('/__video_frame?url=' + encodeURIComponent(sourceUrl) + '&times=2,1',
      { method: 'POST', headers: { 'X-Workspace-Frame-Import': '1' } })
    assert.equal(invalid.status, 400)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
