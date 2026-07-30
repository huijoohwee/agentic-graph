import {
  resolveWorkspaceFolderContractDocumentPath,
  resolveWorkspaceFolderContractTargetPath,
} from '@/lib/markdown-workspace-runtime/workspaceFolderContractTarget'
import { buildWorkspaceEntriesIndex } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const folderPath = '/docs/workspace-seeds'
const baseEntries: WorkspaceEntry[] = [
  {
    path: '/',
    parentPath: null,
    kind: 'folder',
    name: '',
    updatedAtMs: 1,
  },
  {
    path: '/docs',
    parentPath: '/',
    kind: 'folder',
    name: 'docs',
    updatedAtMs: 1,
  },
  {
    path: folderPath,
    parentPath: '/docs',
    kind: 'folder',
    name: 'workspace-seeds',
    updatedAtMs: 1,
  },
  {
    path: `${folderPath}/a-companion.md`,
    parentPath: folderPath,
    kind: 'file',
    name: 'a-companion.md',
    text: '# Companion',
    updatedAtMs: 1,
  },
  {
    path: `${folderPath}/b-runtime.md`,
    parentPath: folderPath,
    kind: 'file',
    name: 'b-runtime.md',
    text: '# Runtime',
    updatedAtMs: 1,
  },
]

export function testRegularWorkspaceFolderTargetDoesNotMaterializeFirstDescendant() {
  const entriesIndex = buildWorkspaceEntriesIndex(baseEntries)
  const target = resolveWorkspaceFolderContractTargetPath({
    entriesIndex,
    folderPath,
    preferredMode: 'sitemap',
  })
  if (target !== null) {
    throw new Error(`expected regular folder navigation to preserve the active document, got ${target}`)
  }
}

export function testWorkspaceFolderTargetKeepsExplicitContractFallback() {
  const sitemapPath = resolveWorkspaceFolderContractDocumentPath(
    folderPath,
    'sitemap',
  )
  const entriesIndex = buildWorkspaceEntriesIndex([
    ...baseEntries,
    {
      path: sitemapPath,
      parentPath: folderPath,
      kind: 'file',
      name: 'repo.sitemap.md',
      text: '# Sitemap',
      updatedAtMs: 1,
    },
  ])
  const target = resolveWorkspaceFolderContractTargetPath({
    entriesIndex,
    folderPath,
    preferredMode: 'user-journey',
  })
  if (target !== sitemapPath) {
    throw new Error(`expected explicit alternate folder contract ${sitemapPath}, got ${String(target)}`)
  }
}
