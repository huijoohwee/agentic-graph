import {
  buildMarkdownSourceFileTree,
  expandMarkdownSourceFolderAncestors,
  flattenVisibleMarkdownSourceFileTree,
  listPersistedMarkdownSourceFolderPaths,
  normalizeMarkdownSourceFolderPath,
  resolveMarkdownSourceParentFolderPath,
  toggleMarkdownSourceFolderPath,
} from '@/features/markdown/ui/markdownSourceFileTree'

export async function testMarkdownSourceFileTreeCentralizesSourcePanelModelLogic() {
  if (normalizeMarkdownSourceFolderPath('\\docs\\guides\\') !== 'docs/guides') {
    throw new Error('expected source folder path normalization to collapse windows separators and trailing slashes')
  }

  const tree = buildMarkdownSourceFileTree([
    { id: 'a', name: 'docs/readme.md', active: true },
    { id: 'b', name: 'docs/guides/intro.md' },
    { id: 'c', name: 'notes/todo.md' },
    { id: 'd', name: 'chat-log/20260719T010707Z/agenticOs.md' },
    { id: 'e', name: 'video-runs-24/run.json' },
    { id: 'f', name: 'agentic-os-docs/README.md' },
  ])

  const collapsedVisible = flattenVisibleMarkdownSourceFileTree({
    root: tree.root,
    expandedPaths: new Set(['']),
  })
  const collapsedPaths = collapsedVisible.map(node => node.path).join(',')
  if (collapsedPaths !== 'docs,notes') {
    throw new Error(`expected collapsed root visibility docs,notes, got ${collapsedPaths}`)
  }

  const expandedVisible = flattenVisibleMarkdownSourceFileTree({
    root: tree.root,
    expandedPaths: new Set(['', 'docs', 'docs/guides']),
  })
  const expandedPaths = expandedVisible.map(node => node.path).join(',')
  if (expandedPaths !== 'docs,docs/readme.md,docs/guides,docs/guides/intro.md,notes') {
    throw new Error(`expected expanded source tree visibility order, got ${expandedPaths}`)
  }

  const readmeNode = expandedVisible.find(node => node.path === 'docs/readme.md')
  if (!readmeNode?.active || readmeNode.fileId !== 'a') {
    throw new Error(`expected active readme node to preserve active/file id metadata, got ${JSON.stringify(readmeNode || null)}`)
  }

  const expandedAncestors = expandMarkdownSourceFolderAncestors({
    expandedPaths: new Set(['']),
    selectedFolderPath: 'docs/guides',
  })
  if (!expandedAncestors.has('') || !expandedAncestors.has('docs') || !expandedAncestors.has('docs/guides')) {
    throw new Error(`expected ancestor expansion to include root/docs/docs-guides, got ${Array.from(expandedAncestors).join(',')}`)
  }

  const toggledOpen = toggleMarkdownSourceFolderPath(new Set(['']), 'docs')
  if (!toggledOpen.has('docs')) throw new Error('expected toggle to open docs folder')
  const toggledClosed = toggleMarkdownSourceFolderPath(toggledOpen, 'docs')
  if (toggledClosed.has('docs')) throw new Error('expected second toggle to close docs folder')

  const persistedPaths = listPersistedMarkdownSourceFolderPaths(new Set(['', 'notes', 'docs/guides']))
  if (persistedPaths.join(',') !== 'docs/guides,notes') {
    throw new Error(`expected persisted source folder paths to be normalized/sorted without root, got ${persistedPaths.join(',')}`)
  }

  if (resolveMarkdownSourceParentFolderPath('docs/guides/intro.md') !== 'docs/guides') {
    throw new Error('expected source file parent folder resolution to preserve nested directory path')
  }

  if (
    collapsedPaths.includes('agentic-os-docs') ||
    collapsedPaths.includes('chat-log') ||
    collapsedPaths.includes('video-runs-24')
  ) {
    throw new Error(`expected generated run evidence to stay out of the source tree, got ${collapsedPaths}`)
  }
}
