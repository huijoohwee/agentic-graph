import fs from 'node:fs'
import path from 'node:path'

const readSource = (fileName: string): string => fs.readFileSync(
  path.resolve(process.cwd(), 'src', 'features', 'panels', 'views', fileName),
  'utf8',
)

export const testMainPanelSettingsSurfacesDocumentStorageSyncContract = () => {
  const settingsViewText = readSource('SettingsView.tsx')
  const rowsText = readSource('DocumentStorageSyncSettingsRows.tsx')
  if (!settingsViewText.includes("DOCUMENT_STORAGE_SYNC_SETTINGS_AREA = 'Document Storage & Sync'")
    || !settingsViewText.includes('<DocumentStorageSyncSettingsRows />')) {
    throw new Error('Expected MainPanel Settings to own and render Document Storage & Sync')
  }
  for (const token of [
    'DOCUMENT_REPOSITORY_DISPLAY_ROOTS.knowgrphDocs',
    'DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceDocs',
    'DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceSeeds',
    'Product:',
    'Workspace:',
    'Seeds:',
    'IndexedDB: active',
    'Queued outbox: retained',
    'Sync now',
  ]) {
    if (!rowsText.includes(token)) throw new Error(`Expected document storage settings to include ${JSON.stringify(token)}`)
  }
  const authorityText = fs.readFileSync(
    path.resolve(process.cwd(), '..', 'grph-shared', 'src', 'collaboration', 'documentRepositoryAuthority.ts'),
    'utf8',
  )
  for (const token of [
    'GitHub/knowgrph/docs',
    'GitHub/huijoohwee/docs',
    'GitHub/knowgrph/docs/workspace-seeds',
    'IndexedDB',
  ]) {
    if (!authorityText.includes(token)) throw new Error(`Expected shared document authority to include ${JSON.stringify(token)}`)
  }
  if (!rowsText.includes("from 'grph-shared/react/keyTypeValueRow'")) {
    throw new Error('Expected document storage settings to reuse shared KTV rows')
  }
  if (rowsText.includes('apiKey') || rowsText.includes('GITHUB_TOKEN')) {
    throw new Error('Expected document storage settings to keep server-managed credentials out of browser UI')
  }
  const persistedWorkspaceFsText = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceFsPersisted.ts'),
    'utf8',
  )
  for (const token of ['deleteWorkspaceDocsMirrorEntry', 'shouldMirrorCanonicalSeedDelete', 'cancelWorkspaceDocsMirrorMutationsUnderPath']) {
    if (!persistedWorkspaceFsText.includes(token)) {
      throw new Error(`Expected persisted Source Files mutations to mirror canonical seed deletion through ${token}`)
    }
  }
}
