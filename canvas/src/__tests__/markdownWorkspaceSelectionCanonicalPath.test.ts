import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { resolveMarkdownWorkspaceCanonicalSelection } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionCanonicalPath'
import { buildWorkspaceEntriesIndex } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'

const buildFileEntry = (path: string): WorkspaceEntry => ({
  path,
  parentPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '/' : '/',
  kind: 'file',
  name: path.split('/').pop() || '',
  text: '',
  updatedAtMs: 1,
})

export function testMarkdownWorkspaceSelectionCanonicalPathKeepsLiveAgenticOsTraceSelectionStable() {
  const tracePath = '/chat-log/20260419T180222Z/agentic-os-trace_20260419T180222Z.md'

  const mirrored = resolveMarkdownWorkspaceCanonicalSelection({
    activePath: tracePath as never,
    selectionPath: tracePath as never,
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry(tracePath)]),
  })
  if (mirrored !== null) {
    throw new Error(`expected live AGENTIC_OS trace path to remain selected during streaming, got ${JSON.stringify(mirrored)}`)
  }
}

export function testMarkdownWorkspaceSelectionCanonicalPathPromotesRootDocsAliasToDocsMirrorPath() {
  const rootAliasPath = '/agentic-graph-storyboard-demo.md'
  const docsPath = '/docs/agentic-graph-storyboard-demo.md'

  const mirrored = resolveMarkdownWorkspaceCanonicalSelection({
    activePath: rootAliasPath as never,
    selectionPath: rootAliasPath as never,
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry(docsPath)]),
  })
  if (!mirrored || mirrored.activePath !== docsPath || mirrored.selectionPath !== docsPath) {
    throw new Error(`expected root docs alias to upgrade to docs mirror path, got ${JSON.stringify(mirrored)}`)
  }

  const missingDocsMirror = resolveMarkdownWorkspaceCanonicalSelection({
    activePath: rootAliasPath as never,
    selectionPath: rootAliasPath as never,
    entriesIndex: buildWorkspaceEntriesIndex([buildFileEntry('/notes/other.md')]),
  })
  if (missingDocsMirror !== null) {
    throw new Error(`expected no root-alias upgrade without docs mirror file, got ${JSON.stringify(missingDocsMirror)}`)
  }
}
