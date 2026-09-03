import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import {
  resolveActivePathFromWorkspaceFileSelection,
  resolveInitialMarkdownWorkspaceSelectionPath,
  resolveInvalidatedMarkdownWorkspaceSelectionPath,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionSync'
import { buildWorkspaceEntriesIndex } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'

const buildFileEntry = (path: string): WorkspaceEntry => ({
  path,
  parentPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '/' : '/',
  kind: 'file',
  name: path.split('/').pop() || '',
  text: '',
  updatedAtMs: 1,
})

export function testMarkdownWorkspaceSelectionSyncCentralizesHydrationAndInvalidation() {
  const entriesIndex = buildWorkspaceEntriesIndex([buildFileEntry('/docs/a.md')])
  const initial = resolveInitialMarkdownWorkspaceSelectionPath({
    selectionPath: null,
    activePath: '/docs/a.md' as never,
    entriesIndex,
  })
  if (initial !== '/docs/a.md') {
    throw new Error(`expected empty selection state to hydrate from active path, got ${String(initial)}`)
  }

  const preserveMatching = resolveInitialMarkdownWorkspaceSelectionPath({
    selectionPath: '/docs/a.md' as never,
    activePath: '/docs/a.md' as never,
    entriesIndex,
  })
  if (preserveMatching !== null) {
    throw new Error(`expected matching selection state to avoid redundant hydration, got ${String(preserveMatching)}`)
  }

  const syncExternalActiveChange = resolveInitialMarkdownWorkspaceSelectionPath({
    selectionPath: '/docs/b.md' as never,
    activePath: '/docs/a.md' as never,
    entriesIndex,
  })
  if (syncExternalActiveChange !== '/docs/a.md') {
    throw new Error(`expected external active path changes to update selection, got ${String(syncExternalActiveChange)}`)
  }

  const preserveDocsMirrorAlias = resolveInitialMarkdownWorkspaceSelectionPath({
    selectionPath: '/docs/a.md' as never,
    activePath: '/a.md' as never,
    entriesIndex,
  })
  if (preserveDocsMirrorAlias !== null) {
    throw new Error(`expected docs mirror aliases to avoid redundant hydration, got ${String(preserveDocsMirrorAlias)}`)
  }

  const preserveActiveWhenSelectionIsRootDocsAlias = resolveActivePathFromWorkspaceFileSelection({
    selectionPath: '/a.md' as never,
    activePath: '/docs/a.md' as never,
    entriesIndex,
    selectionEntryKind: 'file',
  })
  if (preserveActiveWhenSelectionIsRootDocsAlias !== null) {
    throw new Error(`expected root docs alias selection not to reactivate stale active path, got ${String(preserveActiveWhenSelectionIsRootDocsAlias)}`)
  }

  const preserveRecentProgrammaticActive = resolveActivePathFromWorkspaceFileSelection({
    selectionPath: '/chat-log/20260605T164025Z/agentic-os-trace_20260605T164025Z.md' as never,
    activePath: '/chat-log/20260605T170530Z/agentic-os-trace_20260605T170530Z.md' as never,
    entriesIndex: buildWorkspaceEntriesIndex([
      buildFileEntry('/chat-log/20260605T164025Z/agentic-os-trace_20260605T164025Z.md'),
    ]),
    selectionEntryKind: 'file',
    lastSetActivePath: {
      path: '/chat-log/20260605T170530Z/agentic-os-trace_20260605T170530Z.md' as never,
      atMs: 1000,
    },
    nowMs: 1200,
  })
  if (preserveRecentProgrammaticActive !== null) {
    throw new Error(`expected recent programmatic active path to outrank stale selected row, got ${String(preserveRecentProgrammaticActive)}`)
  }

  const expiredProgrammaticActive = resolveActivePathFromWorkspaceFileSelection({
    selectionPath: '/chat-log/20260605T164025Z/agentic-os-trace_20260605T164025Z.md' as never,
    activePath: '/chat-log/20260605T170530Z/agentic-os-trace_20260605T170530Z.md' as never,
    entriesIndex: buildWorkspaceEntriesIndex([
      buildFileEntry('/chat-log/20260605T164025Z/agentic-os-trace_20260605T164025Z.md'),
    ]),
    selectionEntryKind: 'file',
    lastSetActivePath: {
      path: '/chat-log/20260605T170530Z/agentic-os-trace_20260605T170530Z.md' as never,
      atMs: 1000,
    },
    nowMs: 3100,
  })
  if (expiredProgrammaticActive !== '/chat-log/20260605T164025Z/agentic-os-trace_20260605T164025Z.md') {
    throw new Error(`expected expired programmatic active path to yield to selected file row, got ${String(expiredProgrammaticActive)}`)
  }

  const loadingNoop = resolveInvalidatedMarkdownWorkspaceSelectionPath({
    selectionPath: '/docs/missing.md' as never,
    activePath: '/docs/a.md' as never,
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/docs/a.md')]),
    loading: true,
  })
  if (typeof loadingNoop !== 'undefined') {
    throw new Error(`expected loading invalidation check to noop, got ${String(loadingNoop)}`)
  }

  const fallbackToActive = resolveInvalidatedMarkdownWorkspaceSelectionPath({
    selectionPath: '/docs/missing.md' as never,
    activePath: '/docs/a.md' as never,
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/docs/a.md')]),
    loading: false,
  })
  if (fallbackToActive !== '/docs/a.md') {
    throw new Error(`expected missing selection to fall back to active path, got ${String(fallbackToActive)}`)
  }

  const clearMissing = resolveInvalidatedMarkdownWorkspaceSelectionPath({
    selectionPath: '/docs/missing.md' as never,
    activePath: '/docs/also-missing.md' as never,
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/docs/a.md')]),
    loading: false,
  })
  if (clearMissing !== null) {
    throw new Error(`expected missing selection with missing active path to clear, got ${String(clearMissing)}`)
  }
}
