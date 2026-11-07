import React from 'react'
import { DOCUMENT_REPOSITORY_DISPLAY_ROOTS } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
import { DASHBOARD_TEMPLATE_DISPLAY_ROOT, DASHBOARD_TEMPLATE_PATH, readDashboardTemplate } from '@/components/DashboardCanvas/dashboardTemplateSource'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { openMarkdownWorkspacePathInExplorer } from '@/features/markdown-workspace/openMarkdownWorkspacePathInExplorer'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

const STORAGE_ROOTS = [
  ['Product', DOCUMENT_REPOSITORY_DISPLAY_ROOTS.agenticGraphDocs],
  ['Workspace', DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceDocs],
  ['Seeds', DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceSeeds],
  ['Templates', DASHBOARD_TEMPLATE_DISPLAY_ROOT],
  ['Offline', DOCUMENT_REPOSITORY_DISPLAY_ROOTS.offlineFallback],
] as const

/** Canonical storage roots belong to Settings, alongside the sync controls. */
export function WorkspaceStorageOwnershipRow() {
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const openTemplate = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const fs = await getWorkspaceFs()
      await readDashboardTemplate(fs, DASHBOARD_TEMPLATE_PATH)
      await applyWorkspaceImportToCanvas({ fs, createdPaths: [DASHBOARD_TEMPLATE_PATH], opts: { applyToGraph: false, skipComposedGraphApply: true } })
      if (!openMarkdownWorkspacePathInExplorer(DASHBOARD_TEMPLATE_PATH)) throw new Error('Could not open the shared template.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the shared template.')
    } finally {
      setBusy(false)
    }
  }
  return <li>
    <KeyTypeValueStaticRow {...staticRowProps}
      id={buildSettingsRowAnchorId('workspace-storage-sync-row', 'ownership')}
      dataKgAnchor={buildSettingsRowAnchorId('workspace-storage-sync-row', 'ownership')}
      keyNode="Storage ownership"
      typeNode="roots"
      valueNode={<section aria-label="Workspace storage ownership" className="min-w-0">
        <dl className="m-0 grid gap-1">
          {STORAGE_ROOTS.map(([label, root]) => <div key={label} className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
            <dt>{label}</dt>
            <dd className="m-0 min-w-0 break-all" title={root}>{label === 'Templates'
              ? <button type="button" disabled={busy} className="text-left underline disabled:opacity-50" aria-label={`Open ${root}`} onClick={() => void openTemplate()}>{root}</button>
              : root}</dd>
          </div>)}
        </dl>
        {error && <p role="alert" className="mt-1">{error}</p>}
      </section>}
      align="start" />
  </li>
}
