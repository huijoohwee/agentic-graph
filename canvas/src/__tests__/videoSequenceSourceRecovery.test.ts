import assert from 'node:assert/strict'
import { test } from 'node:test'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { createLocalMediaFileStore, writeLocalMediaFiles, type LocalMediaFileRecord } from '@/lib/storage/localMediaFileStore'
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
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { useTimelinePreviewMediaSession, type TimelinePreviewMediaSession } from '@/components/timeline/useTimelinePreviewMediaSession'

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
  relativePath: item.relativePath,
  lastModified: 123,
})
const versionRecord = (item: VideoSequenceTimelineSource, bytes: string, lastModified: number): LocalMediaFileRecord => ({
  ...record(item), id: `${item.id}|${lastModified}`, blob: new Blob([bytes], { type: item.mimeHint }), lastModified,
})
const openFileTable = (name = 'agentic-graph-local-media-files') => {
  const database = new Dexie(name)
  database.version(1).stores({ files: '&id, *keys' })
  return { database, files: database.table<LocalMediaFileRecord, string>('files') }
}

test('local media retains original bytes across a database reopen', async () => {
  const name = `media-reopen-${Date.now()}`
  const initial = createLocalMediaFileStore(name)
  const item = source('original.mp4')
  await initial.write([record(item)])
  initial.close()
  const reopened = createLocalMediaFileStore(name)
  try {
    const { records: [restored], ambiguousKeys } = await reopened.read(buildVideoSequenceSourceRegistryKeys(item))
    assert.deepEqual(ambiguousKeys, [])
    assert.equal(restored.name, item.originalName)
    assert.equal(restored.lastModified, 123)
    assert.deepEqual(new Uint8Array(await restored.blob.arrayBuffer()), new Uint8Array([1, 2, 3, 4]))
    assert.deepEqual(await reopened.read(['other.mp4']), { records: [], ambiguousKeys: [] })
  } finally { reopened.close() }
})

test('latest import owns aliases even with an older modification time, and old bytes can be reimported', async () => {
  const name = `media-version-ownership-${Date.now()}`
  const store = createLocalMediaFileStore(name)
  const item = source('version-ownership.mp4')
  const old = versionRecord(item, 'old!', 999)
  const current = versionRecord(item, 'new!', 1)
  const keys = buildVideoSequenceSourceRegistryKeys(item)
  const inspection = openFileTable(name)
  try {
    await store.write([old])
    await store.write([current])
    const latest = await store.read(keys)
    assert.deepEqual(latest.ambiguousKeys, [])
    assert.equal(latest.records.length, 1)
    assert.equal(await latest.records[0].blob.text(), 'new!', 'import order, not file modification time, owns the alias')
    const retainedOld = await inspection.files.get(old.id)
    assert.ok(retainedOld)
    assert.equal(await retainedOld.blob.text(), 'old!', 'alias replacement must preserve original bytes')
    assert.deepEqual(retainedOld.keys, [])
    await store.write([old])
    const reimported = await store.read(keys)
    assert.deepEqual(reimported.ambiguousKeys, [])
    assert.equal(reimported.records.length, 1)
    assert.equal(await reimported.records[0].blob.text(), 'old!')
  } finally { inspection.database.close(); store.close() }
})

test('concurrent store writers leave exactly one committed owner for shared aliases', async () => {
  const name = `media-concurrent-ownership-${Date.now()}`
  const firstStore = createLocalMediaFileStore(name)
  const secondStore = createLocalMediaFileStore(name)
  const item = source('concurrent-ownership.mp4')
  const first = versionRecord(item, 'one!', 100)
  const second = versionRecord(item, 'two!', 200)
  const committed: string[] = []
  try {
    await Promise.all([
      firstStore.write([first]).then(() => { committed.push(first.id) }),
      secondStore.write([second]).then(() => { committed.push(second.id) }),
    ])
    const read = await firstStore.read(buildVideoSequenceSourceRegistryKeys(item))
    assert.deepEqual(read.ambiguousKeys, [])
    assert.equal(read.records.length, 1)
    assert.equal(read.records[0].id, committed[committed.length - 1])
    assert.equal(await read.records[0].blob.text(), read.records[0].id === first.id ? 'one!' : 'two!')
  } finally { firstStore.close(); secondStore.close() }
})

test('ambiguous legacy path identity blocks recovery before weaker aliases', async () => {
  const item = { ...source('legacy-ambiguous-recovery.mp4'), relativePath: 'legacy/legacy-ambiguous-recovery.mp4' }
  const strongestKey = buildVideoSequenceSourceRegistryKeys(item)[0]
  const first = { ...versionRecord(item, 'old!', 1), keys: [strongestKey] }
  const second = { ...versionRecord(item, 'new!', 2), keys: [strongestKey] }
  const weaker = { ...versionRecord(item, 'weak', 3), keys: buildVideoSequenceSourceRegistryKeys(source(item.originalName)) }
  const legacy = openFileTable()
  try {
    await legacy.files.bulkPut([first, second, weaker])
    const store = createLocalMediaFileStore()
    try {
      const read = await store.read(buildVideoSequenceSourceRegistryKeys(item))
      assert.deepEqual(read.ambiguousKeys, [strongestKey])
    } finally { store.close() }
    await restoreVideoSequenceSourceFiles([item])
    assert.equal(resolveVideoSequenceSourceRuntimeUrl(item), '', 'a weaker unique alias must not resolve ambiguous source bytes')
  } finally { legacy.database.close() }
})

test('directory-specific identities survive recovery in either order despite a shared basename', async () => {
  for (const reverse of [false, true]) {
    const name = `directory-recovery-${reverse}.mp4`
    const first = { ...source(name), id: `left/${name}`, relativePath: `left/${name}` }
    const second = { ...source(name), id: `right/${name}`, relativePath: `right/${name}` }
    await writeLocalMediaFiles([versionRecord(first, 'left', 1), versionRecord(second, 'rght', 2)])
    await restoreVideoSequenceSourceFiles(reverse ? [second, first] : [first, second])
    const firstUrl = resolveVideoSequenceSourceRuntimeUrl(first)
    const secondUrl = resolveVideoSequenceSourceRuntimeUrl(second)
    assert.match(firstUrl, /^blob:/)
    assert.match(secondUrl, /^blob:/)
    assert.notEqual(firstUrl, secondUrl)
    assert.equal(await (await fetch(firstUrl)).text(), 'left')
    assert.equal(await (await fetch(secondUrl)).text(), 'rght')
    assert.equal(resolveVideoSequenceSourceRuntimeUrl({ ...first, byteSize: 5 }), '')
    assert.equal(resolveVideoSequenceSourceRuntimeUrl({ ...second, mimeHint: 'video/webm' }), '')
  }
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

test('delayed revocation preserves directory handles and reimport recreates a revoked version', async () => {
  const item = source('delayed-version-lifecycle.mp4')
  const old = new File(['old!'], item.originalName, { type: item.mimeHint, lastModified: 101 })
  const current = new File(['new!'], item.originalName, { type: item.mimeHint, lastModified: 102 })
  registerVideoSequenceSourceFiles([old])
  const oldUrl = resolveVideoSequenceSourceRuntimeUrl(item)
  registerVideoSequenceSourceFiles([current])
  assert.notEqual(resolveVideoSequenceSourceRuntimeUrl(item), oldUrl)

  const name = 'delayed-directory-lifecycle.mp4'
  const left = { ...source(name), id: `left/${name}`, relativePath: `left/${name}` }
  const right = { ...source(name), id: `right/${name}`, relativePath: `right/${name}` }
  const leftFile = new File(['left'], name, { type: left.mimeHint, lastModified: 103 })
  const rightFile = new File(['rght'], name, { type: right.mimeHint, lastModified: 104 })
  Object.defineProperty(leftFile, 'webkitRelativePath', { value: left.relativePath })
  Object.defineProperty(rightFile, 'webkitRelativePath', { value: right.relativePath })
  registerVideoSequenceSourceFiles([leftFile, rightFile])
  const leftUrl = resolveVideoSequenceSourceRuntimeUrl(left)
  const rightUrl = resolveVideoSequenceSourceRuntimeUrl(right)
  assert.match(leftUrl, /^blob:/)
  assert.match(rightUrl, /^blob:/)
  assert.notEqual(leftUrl, rightUrl)

  await new Promise(resolve => setTimeout(resolve, 2100))
  await assert.rejects(fetch(oldUrl), 'the replaced version should release its old handle')
  assert.equal(await (await fetch(leftUrl)).text(), 'left', 'path-specific aliases still own this handle')
  assert.equal(await (await fetch(rightUrl)).text(), 'rght')
  registerVideoSequenceSourceFiles([old])
  const reimportedUrl = resolveVideoSequenceSourceRuntimeUrl(item)
  assert.match(reimportedUrl, /^blob:/)
  assert.notEqual(reimportedUrl, oldUrl, 'a revoked signature must create a new handle')
  assert.equal(await (await fetch(reimportedUrl)).text(), 'old!')
})

test('mounted MainPanel restores local bytes and refreshes plans without document edits or BottomPanel', async () => {
  const item = { ...source('mounted-main-recovery.mp4'), id: 'clip_main_recovery' }
  await writeLocalMediaFiles([record(item)])
  const markdownText = ['---', 'kgVideoSequenceTimeline: true', `kgVideoSequenceSources: ${JSON.stringify([item])}`,
    'flow_diagrams:', '  video_sequence:', '    type: mermaid_gantt', '    value: |-',
    '      gantt', '        dateFormat HH:mm', '        section Video',
    `        ${item.originalName} : ${item.id}, kgsrc_0_1, kgpos_0, 0.0167m`, '---'].join('\n')
  const dom = new JSDOM('<main id="test-main"></main>', { url: 'http://127.0.0.1/' })
  const previous = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  })
  const snapshots: TimelinePreviewMediaSession[] = []
  function MainPreview() {
    const session = useTimelinePreviewMediaSession({ markdownDocumentName: 'recovery.md', markdownText })
    snapshots.push(session)
    return React.createElement('output', null, session.items[0]?.src || 'Waiting for local source')
  }
  const root = createRoot(dom.window.document.getElementById('test-main')!)
  let timeout: ReturnType<typeof setTimeout> | undefined
  let unsubscribe = () => {}
  const recovered = new Promise<void>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('MainPanel did not restore its source')), 3000)
    unsubscribe = subscribeVideoSequenceSources(() => {
      if (resolveVideoSequenceSourceRuntimeUrl(item)) { clearTimeout(timeout); resolve() }
    })
  })
  try {
    await act(async () => { root.render(React.createElement(MainPreview)) })
    await act(async () => { await recovered })
    assert.equal(snapshots[0].items.length, 0, 'first render precedes asynchronous device-local recovery')
    const restored = snapshots[snapshots.length - 1]
    assert.equal(restored.items.length, 1)
    assert.match(restored.items[0].src, /^blob:/)
    assert.ok(restored.exportPlan?.segments.length)
    assert.ok(restored.previewPlan?.segments.length)
    assert.notEqual(restored.exportPlan, snapshots[0].exportPlan)
    assert.notEqual(restored.previewPlan, snapshots[0].previewPlan)
    const oldUrl = restored.items[0].src
    await act(async () => {
      registerVideoSequenceSourceFiles([new File(['live'], item.originalName, { type: item.mimeHint, lastModified: 456 })])
    })
    const reimported = snapshots[snapshots.length - 1]
    assert.notEqual(reimported.items[0].src, oldUrl, 'unchanged document follows the newly imported source')
    assert.equal(await (await fetch(reimported.items[0].src)).text(), 'live')
    assert.equal(dom.window.document.querySelector('output')?.textContent, reimported.items[0].src)
  } finally {
    unsubscribe(); clearTimeout(timeout)
    await act(async () => { root.unmount() })
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
