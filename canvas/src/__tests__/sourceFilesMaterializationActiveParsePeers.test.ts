import test from 'node:test'
import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeActiveWorkspaceEntryIntoSourceFiles, isMaterializedWorkspaceSourceProofCurrent } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { ensureBuiltInParsersRegistered } from '@/features/parsers/ensure'
import { listParsers, registerParser } from '@/features/parsers/registry'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'

const activePath = '/drafts/peer-stability.md'
const documentName = 'drafts/peer-stability.md'
const sourceText = '---\nkgCanvas2dRenderer: "sequence"\n---\n# Peer stability\n'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function deferMarkdownParser(name = documentName, body = sourceText) {
  ensureBuiltInParsersRegistered()
  const original = listParsers().find(parser => String(parser.id) === 'markdown')
  assert.ok(original, 'expected the native markdown parser to stay registered')
  const started = deferred(), complete = deferred()
  registerParser({
    ...original,
    parseAsync: async (nextName, nextBody) => {
      assert.equal(nextName, name)
      assert.equal(nextBody, body)
      started.resolve()
      await complete.promise
      return original.parseAsync ? original.parseAsync(nextName, nextBody) : original.parse(nextName, nextBody)
    },
  })
  return {
    started: started.promise,
    release: () => complete.resolve(),
    restore: () => {
      complete.resolve()
      registerParser(original)
    },
  }
}

const fs: WorkspaceFs = {
  ensureSeed: async () => false,
  listEntries: async () => [],
  readFileText: async path => path === activePath ? sourceText : null,
  writeFileText: async () => undefined,
  createFile: async () => '/drafts/new.md',
  createFolder: async () => '/drafts',
  deleteEntry: async () => undefined,
}

test('active source parse keeps semantically identical non-active peers', async () => {
  const previous = useGraphStore.getState()
  const explorer = useMarkdownExplorerStore.getState()
  const { restore } = initJsdomHarness()
  const active: SourceFile = {
    id: 'active-peer-stability',
    name: documentName,
    text: sourceText,
    enabled: true,
    status: 'idle',
    source: { kind: 'local', path: `workspace:${activePath}` },
  }
  const inactive: SourceFile = {
    id: 'inactive-peer-stability',
    name: 'drafts/retained.md',
    text: '# Retained peer\n',
    enabled: false,
    status: 'idle',
    source: { kind: 'local', path: 'workspace:/drafts/retained.md' },
  }
  const entry: WorkspaceEntry = {
    path: activePath,
    parentPath: '/drafts',
    kind: 'file',
    name: 'peer-stability.md',
    text: sourceText,
    updatedAtMs: 1,
  }
  const parser = deferMarkdownParser()
  try {
    useGraphStore.setState({
      sourceFiles: [active, inactive],
      markdownDocumentName: documentName,
      markdownDocumentText: sourceText,
      markdownDocumentApplyViewPreset: false,
      setActiveMarkdownDocument: async payload => {
        useGraphStore.setState({
          markdownDocumentName: payload.name,
          markdownDocumentText: payload.text,
          markdownDocumentApplyViewPreset: true,
        })
        return true
      },
    })
    useMarkdownExplorerStore.getState().setActivePath(activePath)
    const pending = materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: activePath,
      applyToGraph: true,
      fs,
      sourceFilesSnapshot: [active, inactive],
      premergedSourceFiles: [active, inactive],
      activeWorkspaceEntriesSnapshot: [entry],
      sourcesByPath: {},
    })
    await parser.started
    const current = useGraphStore.getState()
    useGraphStore.setState({
      sourceFiles: current.sourceFiles.map(file => file.id === inactive.id ? { ...file } : file),
    })
    parser.release()
    const proof = await pending
    assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
    const settled = useGraphStore.getState()
    assert.equal(settled.sourceFiles.find(file => file.id === inactive.id)?.text, inactive.text)
    assert.equal(settled.markdownDocumentName, documentName)
    assert.equal(settled.markdownDocumentText, sourceText)
  } finally {
    parser.release()
    parser.restore()
    invalidateCachedWorkspaceActiveEntrySnapshot(activePath)
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
})
