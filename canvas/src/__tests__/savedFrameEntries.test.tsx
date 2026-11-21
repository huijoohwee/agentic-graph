import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildRemoteVideoFrameFileName } from 'grph-shared/rich-media/providers'
import { readSavedFrameEntries, videoFrameBundles } from '@/features/source-files/useSavedFrameEntries'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { createRemoteVideoFramePublicAssetHandler } from '@/lib/rich-media/server/videoFrameServer'
import { REMOTE_VIDEO_FRAME_PUBLIC_PREFIX } from '@/lib/rich-media/videoFrameAssets'
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
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await fs.rm(root, { recursive: true, force: true })
  }
}
