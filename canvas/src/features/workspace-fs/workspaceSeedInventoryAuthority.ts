export type WorkspaceDocsMirrorAuthority =
  | 'agentic-canvas-os-storage'
  | 'huijoohwee-demo-docs-github'
  | 'huijoohwee-output-docs-github'
  | 'agentic-graph-workspace-seeds-bundled'
  | 'agentic-graph-workspace-seeds-local'

type WorkspaceSeedMirrorEntry = {
  relPath: string
  authority?: WorkspaceDocsMirrorAuthority
}

const normalizeRelativePath = (value: string): string =>
  String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase()

const isCanonicalWorkspaceSeedMirrorEntry = (
  entry: WorkspaceSeedMirrorEntry,
): boolean => {
  const relPath = normalizeRelativePath(entry.relPath)
  return relPath === 'workspace-seeds' || relPath.startsWith('workspace-seeds/')
}

export const isCanonicalWorkspaceSeedAuthority = (
  authority: WorkspaceDocsMirrorAuthority | undefined,
): boolean => (
  authority === 'agentic-graph-workspace-seeds-bundled'
  || authority === 'agentic-graph-workspace-seeds-local'
)

export const overlayCanonicalWorkspaceSeedEntries = <Entry extends WorkspaceSeedMirrorEntry>(
  publishedEntries: ReadonlyArray<Entry>,
  workspaceSeedEntries: ReadonlyArray<Entry>,
): Entry[] => {
  if (workspaceSeedEntries.length === 0) return [...publishedEntries]
  return [
    ...publishedEntries.filter(entry => !isCanonicalWorkspaceSeedMirrorEntry(entry)),
    ...workspaceSeedEntries,
  ]
}
