import assert from 'node:assert/strict'
import {
  captureWorkspaceSourceTextRevision,
  enqueueWorkspaceSourceTextTransaction,
  publishWorkspaceSourceTextRevision,
  readWorkspaceSourceTextSnapshot,
} from '@/features/workspace-fs/workspaceSourceTextTransaction'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { writeWorkspaceFileAndSync } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'

export async function testWorkspaceSourceTextSnapshotRetriesAfterConcurrentPublication() {
  const path = '/notes/source-snapshot-race.md'
  let releaseFirstRead = () => void 0
  const firstReadRelease = new Promise<void>(resolve => {
    releaseFirstRead = resolve
  })
  let readCount = 0
  const snapshotPromise = readWorkspaceSourceTextSnapshot({
    path,
    read: async () => {
      readCount += 1
      if (readCount === 1) {
        await firstReadRelease
        return 'stale text'
      }
      return 'current text'
    },
  })

  await Promise.resolve()
  publishWorkspaceSourceTextRevision(path)
  releaseFirstRead()
  const snapshot = await snapshotPromise

  assert.equal(snapshot.current, true)
  assert.equal(snapshot.value, 'current text')
  assert.equal(readCount, 2)
}

export async function testWorkspaceSourceTextSnapshotWaitsForReservedWrite() {
  const path = '/notes/source-snapshot-pending-write.md'
  let durableText = 'stale text'
  let releaseWrite = () => void 0
  const writeRelease = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const transaction = enqueueWorkspaceSourceTextTransaction({
    path,
    text: 'current text',
    write: async ({ text }) => {
      await writeRelease
      durableText = text
    },
  })
  let snapshotSettled = false
  const snapshotPromise = readWorkspaceSourceTextSnapshot({
    path,
    read: async () => durableText,
  }).finally(() => {
    snapshotSettled = true
  })

  await Promise.resolve()
  await Promise.resolve()
  assert.equal(snapshotSettled, false)
  releaseWrite()
  const [writeResult, snapshot] = await Promise.all([transaction, snapshotPromise])

  assert.equal(writeResult.accepted, true)
  assert.equal(snapshot.current, true)
  assert.equal(snapshot.value, 'current text')
}

export async function testWorkspaceSourceTextSnapshotDoesNotWaitForUnrelatedPath() {
  const pendingPath = '/notes/source-snapshot-pending-other.md'
  const readablePath = '/notes/source-snapshot-current.md'
  let releaseWrite = () => void 0
  const writeRelease = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const transaction = enqueueWorkspaceSourceTextTransaction({
    path: pendingPath,
    text: 'pending text',
    write: async () => {
      await writeRelease
    },
  })
  let snapshotSettled = false
  const snapshotPromise = readWorkspaceSourceTextSnapshot({
    path: readablePath,
    read: async () => 'current text',
  }).finally(() => {
    snapshotSettled = true
  })

  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const settledBeforeUnrelatedWrite = snapshotSettled
  releaseWrite()
  assert.equal(settledBeforeUnrelatedWrite, true)
  const snapshot = await snapshotPromise
  assert.equal(snapshot.current, true)
  assert.equal(snapshot.value, 'current text')
  await transaction
}

export async function testWorkspaceSourceTextTransactionRejectsStaleExpectedRevision() {
  const path = '/notes/source-write-race.md'
  const expectedRevision = captureWorkspaceSourceTextRevision(path)
  publishWorkspaceSourceTextRevision(path)
  let writeCount = 0

  const result = await enqueueWorkspaceSourceTextTransaction({
    path,
    text: 'stale text',
    expectedRevision,
    write: async () => {
      writeCount += 1
    },
  })

  assert.equal(result.accepted, false)
  assert.equal(writeCount, 0)
}

export async function testWorkspaceAutosaveWriteRejectsChangedDurableSourceBase() {
  const path = '/notes/autosave-source-race.md'
  let durableText = 'newer graph text'
  let writeCount = 0
  let inlineText = ''
  const fs: WorkspaceFs = {
    ensureSeed: async () => true,
    listEntries: async () => [],
    readFileText: async () => durableText,
    writeFileText: async (_path, text) => {
      writeCount += 1
      durableText = text
    },
    createFile: async () => '/notes/new.md',
    createFolder: async () => '/notes/new-folder',
    deleteEntry: async () => {},
  }

  const saved = await writeWorkspaceFileAndSync({
    path,
    text: 'stale editor text',
    getFs: async () => fs,
    lastLoadedRef: { current: { path, text: 'older loaded text' } },
    patchWorkspaceEntryInlineText: (_path, text) => {
      inlineText = text
    },
    expectedSourceRevision: captureWorkspaceSourceTextRevision(path),
    expectedWorkspaceText: 'older loaded text',
    resetParsedState: false,
  })

  assert.equal(saved, false)
  assert.equal(writeCount, 0)
  assert.equal(durableText, 'newer graph text')
  assert.equal(inlineText, '')
}

export async function testActiveMarkdownDocumentRejectsStaleSameDocumentRevision() {
  const store = useGraphStore.getState()
  const previousName = store.markdownDocumentName
  const previousText = store.markdownDocumentText
  const previousApplyPreset = store.markdownDocumentApplyViewPreset
  try {
    store.setMarkdownDocument('/notes/revision-race.md', 'current graph text', {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    const accepted = await useGraphStore.getState().setActiveMarkdownDocument({
      name: '/notes/revision-race.md',
      text: 'stale filesystem text',
      expectedCurrentDocumentName: '/notes/revision-race.md',
      expectedCurrentDocumentText: 'older filesystem text',
      normalizeMermaidMmd: false,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
      applyToGraph: false,
    })

    assert.equal(accepted, false)
    assert.equal(useGraphStore.getState().markdownDocumentText, 'current graph text')
  } finally {
    useGraphStore.getState().setMarkdownDocument(previousName, previousText, {
      autoEnableFrontmatter: false,
      applyViewPreset: previousApplyPreset,
    })
  }
}

export async function testActiveMarkdownDocumentAllowsExpectedDocumentSwitchRevision() {
  const store = useGraphStore.getState()
  const previousName = store.markdownDocumentName
  const previousText = store.markdownDocumentText
  const previousApplyPreset = store.markdownDocumentApplyViewPreset
  try {
    store.setMarkdownDocument('/notes/previous.md', 'previous text', {
      autoEnableFrontmatter: false,
      applyViewPreset: false,
    })
    const accepted = await useGraphStore.getState().setActiveMarkdownDocument({
      name: '/notes/next.md',
      text: 'next text',
      expectedCurrentDocumentName: '/notes/previous.md',
      expectedCurrentDocumentText: 'previous text',
      normalizeMermaidMmd: false,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
      applyToGraph: false,
    })

    assert.equal(accepted, true)
    assert.equal(useGraphStore.getState().markdownDocumentName, '/notes/next.md')
    assert.equal(useGraphStore.getState().markdownDocumentText, 'next text')
  } finally {
    useGraphStore.getState().setMarkdownDocument(previousName, previousText, {
      autoEnableFrontmatter: false,
      applyViewPreset: previousApplyPreset,
    })
  }
}
