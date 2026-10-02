import assert from 'node:assert/strict'
import { test } from 'node:test'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { createLocalMediaFileStore, writeLocalMediaFiles } from '@/lib/storage/localMediaFileStore'
import {
  buildVideoSequenceSourceRegistryKeys,
  readVideoSequenceSourceRevision,
  registerVideoSequenceSourceFiles,
  resolveVideoSequenceSourceRuntimeUrl,
  restoreVideoSequenceSourceFiles,
  subscribeVideoSequenceSources,
} from '@/components/timeline/videoSequenceSourceRegistry'
import type { VideoSequenceTimelineSource } from '@/components/timeline/videoSequenceTimeline'
import { loadTimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

const source = (name: string, byteSize = 4): VideoSequenceTimelineSource => ({
  id: name, originalName: name, relativePath: name, workspacePath: '', sourceUrl: '',
  mimeHint: 'video/mp4', byteSize, importMode: 'file',
})
const record = (item: VideoSequenceTimelineSource) => ({
  id: item.id,
  keys: buildVideoSequenceSourceRegistryKeys(item),
  blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: item.mimeHint }),
  name: item.originalName,
  lastModified: 123,
})

test('local media retains original bytes across a database reopen', async () => {
  const name = `media-reopen-${Date.now()}`
  const initial = createLocalMediaFileStore(name)
  const item = source('original.mp4')
  await initial.write([record(item)])
  initial.close()
  const reopened = createLocalMediaFileStore(name)
  try {
    const [restored] = await reopened.read(buildVideoSequenceSourceRegistryKeys(item))
    assert.equal(restored.name, item.originalName)
    assert.equal(restored.lastModified, 123)
    assert.deepEqual(new Uint8Array(await restored.blob.arrayBuffer()), new Uint8Array([1, 2, 3, 4]))
    assert.deepEqual(await reopened.read(['other.mp4']), [])
  } finally { reopened.close() }
})

test('stored video rehydrates the shared runtime and publishes one revision', async () => {
  const item = source('restore-native-frames.mp4')
  await writeLocalMediaFiles([record(item)])
  assert.equal(resolveVideoSequenceSourceRuntimeUrl(item), '')
  let notifications = 0
  const before = readVideoSequenceSourceRevision()
  const unsubscribe = subscribeVideoSequenceSources(() => { notifications += 1 })
  try {
    await Promise.all([restoreVideoSequenceSourceFiles([item]), restoreVideoSequenceSourceFiles([item])])
    const url = resolveVideoSequenceSourceRuntimeUrl(item)
    assert.match(url, /^blob:/)
    assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), new Uint8Array([1, 2, 3, 4]))
    assert.equal(readVideoSequenceSourceRevision(), before + 1)
    assert.equal(notifications, 1)
    await restoreVideoSequenceSourceFiles([item])
    assert.equal(resolveVideoSequenceSourceRuntimeUrl(item), url)
  } finally { unsubscribe() }
})

test('recovery rejects changed source identity and keeps a concurrent import', async () => {
  const item = source('race-native-frames.mp4')
  await writeLocalMediaFiles([record(item)])
  const mismatched = { ...item, byteSize: 6 }
  await restoreVideoSequenceSourceFiles([mismatched])
  assert.equal(resolveVideoSequenceSourceRuntimeUrl(mismatched), '')
  const pending = restoreVideoSequenceSourceFiles([item])
  registerVideoSequenceSourceFiles([new File(['live'], item.originalName, { type: item.mimeHint, lastModified: 999 })])
  const liveUrl = resolveVideoSequenceSourceRuntimeUrl(item)
  await pending
  assert.equal(resolveVideoSequenceSourceRuntimeUrl(item), liveUrl)
  assert.equal(await (await fetch(liveUrl)).text(), 'live')
})

test('metadata probe teardown cannot reenter its error handler', async () => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  for (const event of ['loadedmetadata', 'error'] as const) {
    let loads = 0
    const probe = {
      src: '', duration: 1, videoWidth: 0, videoHeight: 0,
      onloadedmetadata: null as null | (() => void), onerror: null as null | (() => void),
      canPlayType: () => 'probably',
      removeAttribute: () => { probe.src = '' },
      load: () => {
        loads += 1
        if (loads < 10) queueMicrotask(() => probe.src ? probe[event === 'loadedmetadata' ? 'onloadedmetadata' : 'onerror']?.() : probe.onerror?.())
      },
    }
    try {
      globalThis.document = { createElement: () => probe } as unknown as Document
      globalThis.window = { setTimeout, clearTimeout } as unknown as Window & typeof globalThis
      globalThis.fetch = async () => new Response('', { status: 404 })
      const summary = await loadTimelineMediaReaderSummary(`blob:probe-cleanup-${event}`)
      assert.equal(summary.durationSeconds, event === 'loadedmetadata' ? 1 : 0)
      assert.equal(loads, 2, 'one source load and one teardown, with no repeated error cleanup')
      assert.equal(probe.onloadedmetadata, null)
      assert.equal(probe.onerror, null)
    } finally {
      globalThis.document = originalDocument
      globalThis.window = originalWindow
      globalThis.fetch = originalFetch
    }
  }
})

test('reimporting a known file version refreshes its plan once', () => {
  const item = source('reimport-versions.mp4')
  const first = new File(['old!'], item.originalName, { type: item.mimeHint, lastModified: 1 })
  const second = new File(['new!'], item.originalName, { type: item.mimeHint, lastModified: 2 })
  registerVideoSequenceSourceFiles([first])
  const firstUrl = resolveVideoSequenceSourceRuntimeUrl(item)
  registerVideoSequenceSourceFiles([second])
  assert.notEqual(resolveVideoSequenceSourceRuntimeUrl(item), firstUrl)
  let notifications = 0
  let unsubscribe = () => {}
  const listener = () => {
    notifications += 1
    unsubscribe()
    unsubscribe = subscribeVideoSequenceSources(listener)
    assert.ok(notifications < 3, 'resubscribing during a notification must not repeat that notification')
  }
  unsubscribe = subscribeVideoSequenceSources(listener)
  try {
    registerVideoSequenceSourceFiles([first])
    assert.equal(resolveVideoSequenceSourceRuntimeUrl(item), firstUrl)
    assert.equal(notifications, 1)
    registerVideoSequenceSourceFiles([first])
    assert.equal(notifications, 1)
  } finally { unsubscribe() }
})
