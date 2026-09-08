import assert from 'node:assert/strict'
import type { MarkdownWorkspaceLoadedSnapshot } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.types'
import { commitMarkdownWorkspaceWriteback } from '@/lib/markdown-workspace-runtime/markdownWorkspaceWritebackCommit'
import { syncWorkspaceTextState } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.io'

export function testMarkdownWorkspaceWritebackCommitCentralizesWorkspaceAndEditorRefresh() {
  const calls: string[] = []
  const lastLoadedRef: { current: MarkdownWorkspaceLoadedSnapshot | null } = { current: null }

  commitMarkdownWorkspaceWriteback({
    path: '/docs/demo.md' as never,
    text: '# Demo',
    lastLoadedRef: lastLoadedRef as never,
    patchWorkspaceEntryInlineText: (path, text) => {
      calls.push(`patch:${String(path)}:${String(text)}`)
    },
    setActiveTextProgrammatic: (text) => {
      calls.push(`editor:${String(text)}`)
    },
  })

  if (!lastLoadedRef.current) {
    throw new Error('expected writeback commit helper to refresh lastLoadedRef')
  }
  if (lastLoadedRef.current.path !== '/docs/demo.md' || lastLoadedRef.current.text !== '# Demo') {
    throw new Error(`expected writeback commit helper to persist the active path/text pair, got ${JSON.stringify(lastLoadedRef.current)}`)
  }
  if (calls.join('|') !== 'patch:/docs/demo.md:# Demo|editor:# Demo') {
    throw new Error(`expected writeback commit helper to patch workspace text before refreshing the editor, got ${calls.join('|')}`)
  }
  lastLoadedRef.current = { path: '/docs/demo.md', text: '# Canonical', observedWorkspaceText: '# Raw residue' }
  commitMarkdownWorkspaceWriteback({
    path: '/docs/demo.md', text: '# Canonical reapply', lastLoadedRef,
    patchWorkspaceEntryInlineText: () => {}, setActiveTextProgrammatic: () => {},
  })
  const reapplied = lastLoadedRef.current as { text: string; observedWorkspaceText?: string | null }
  if (reapplied.text !== '# Canonical reapply' || reapplied.observedWorkspaceText !== '# Raw residue') {
    throw new Error('expected display-only reapply to retain the observed raw write baseline')
  }
  commitMarkdownWorkspaceWriteback({
    path: '/docs/demo.md', text: '# Read failed', lastLoadedRef,
    observedWorkspaceText: undefined, observedWorkspaceFs: undefined,
    patchWorkspaceEntryInlineText: () => {}, setActiveTextProgrammatic: () => {},
  })
  assert.equal(lastLoadedRef.current?.observedWorkspaceText, undefined)
  lastLoadedRef.current = { path: '/docs/demo.md', text: '# Canonical', observedWorkspaceText: '# Raw residue' }
  commitMarkdownWorkspaceWriteback({ path: '/docs/other.md', text: '# Other', lastLoadedRef,
    patchWorkspaceEntryInlineText: () => {}, setActiveTextProgrammatic: () => {},
  })
  assert.equal(lastLoadedRef.current?.observedWorkspaceText, undefined, 'a new path cannot inherit prior write authority')
}

export function testMarkdownWorkspaceTextStateSyncCentralizesEditorAndDocumentRefresh() {
  const calls: string[] = []
  const lastLoadedRef = { current: null as { path: string; text: string } | null }

  syncWorkspaceTextState({
    path: '/docs/demo.md' as never,
    text: '# Demo',
    lastLoadedRef: lastLoadedRef as never,
    patchWorkspaceEntryInlineText: (path, text) => {
      calls.push(`patch:${String(path)}:${String(text)}`)
    },
    setActiveText: text => {
      calls.push(`editor:${String(text)}`)
    },
    activeDocumentKey: 'docs/demo.md',
    activeDocumentSourceUrl: 'https://example.com/demo',
    setActiveMarkdownDocument: async payload => {
      calls.push(
        `document:${String(payload.name)}:${String(payload.sourceUrl || '')}:${String(payload.applyViewPreset)}:${String(payload.text)}`,
      )
      return true
    },
  })

  if (!lastLoadedRef.current) {
    throw new Error('expected workspace text state sync helper to refresh lastLoadedRef')
  }
  if (lastLoadedRef.current.path !== '/docs/demo.md' || lastLoadedRef.current.text !== '# Demo') {
    throw new Error(`expected workspace text state sync helper to persist the active path/text pair, got ${JSON.stringify(lastLoadedRef.current)}`)
  }
  if (calls.join('|') !== 'patch:/docs/demo.md:# Demo|editor:# Demo|document:docs/demo.md:https://example.com/demo:false:# Demo') {
    throw new Error(`expected workspace text state sync helper to centralize patch, editor, and active-document refresh, got ${calls.join('|')}`)
  }
}

export function testMarkdownWorkspaceTextStateSyncRefreshesTrackedPathWithoutActiveEditorSync() {
  const calls: string[] = []
  const lastLoadedRef = { current: { path: '/docs/demo.md', text: 'old' } }

  syncWorkspaceTextState({
    path: '/docs/demo.md' as never,
    text: '',
    lastLoadedRef: lastLoadedRef as never,
    patchWorkspaceEntryInlineText: (path, text) => {
      calls.push(`patch:${String(path)}:${String(text)}`)
    },
    synchronizeActiveDocument: false,
  })

  if (lastLoadedRef.current.path !== '/docs/demo.md' || lastLoadedRef.current.text !== '') {
    throw new Error(`expected workspace text state sync helper to keep tracked non-active path text coherent, got ${JSON.stringify(lastLoadedRef.current)}`)
  }
  if (calls.join('|') !== 'patch:/docs/demo.md:') {
    throw new Error(`expected non-active workspace text state sync helper to patch entries without editor/document refresh, got ${calls.join('|')}`)
  }
}
