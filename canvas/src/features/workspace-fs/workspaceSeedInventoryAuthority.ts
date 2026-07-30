export type WorkspaceDocsMirrorAuthority =
  | 'agentic-canvas-os-storage'
  | 'huijoohwee-demo-docs-github'
  | 'huijoohwee-output-docs-github'
  | 'knowgrph-workspace-seeds-bundled'
  | 'knowgrph-workspace-seeds-local'

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
  authority === 'knowgrph-workspace-seeds-bundled'
  || authority === 'knowgrph-workspace-seeds-local'
)

export const overlayCanonicalLocalWorkspaceSeedEntries = <Entry extends WorkspaceSeedMirrorEntry>(
  publishedEntries: ReadonlyArray<Entry>,
  localSeedEntries: ReadonlyArray<Entry>,
): Entry[] => {
  if (localSeedEntries.length === 0) return [...publishedEntries]
  return [
    ...publishedEntries.filter(entry => !isCanonicalWorkspaceSeedMirrorEntry(entry)),
    ...localSeedEntries,
  ]
}
