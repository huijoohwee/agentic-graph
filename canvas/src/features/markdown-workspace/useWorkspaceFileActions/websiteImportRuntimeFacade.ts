import React from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceBridgeImportResult, WorkspaceImportWebsiteOpts } from '@/features/markdown-explorer/workspaceActionBridge'
import type { WorkspaceWebsiteImportCtx } from './types'
import { runWorkspaceWebsiteImport } from './websiteImportAction'

const standaloneJobRef = { current: 0 }

export async function importWebsiteViaWorkspaceRuntime(urlRaw: string, opts?: WorkspaceImportWebsiteOpts): Promise<void | WorkspaceBridgeImportResult> {
  const url = String(urlRaw || '').trim()
  if (!url) return
  const jobId = (standaloneJobRef.current += 1)
  const { getWorkspaceFs } = await import('@/features/workspace-fs/workspaceFs')
  const result = await runWorkspaceWebsiteImport({ url, opts, importJobRef: standaloneJobRef, jobId, status: { setStatusProgress: () => void 0 }, getFs: getWorkspaceFs })
  return { createdPaths: result.createdPaths, websiteImportManifest: result.websiteImportManifest, websiteImportSummary: result.websiteImportSummary }
}

export function useWorkspaceWebsiteImportAction(args: {
  core: {
    importJobRef: React.MutableRefObject<number>
    status: ReturnType<typeof import('./core').useWorkspaceStatusHelpers>
    focusAfterImport: (createdPath: WorkspacePath, opts?: { sourceUrl?: string | null; applyToGraph?: boolean; jobId?: number }) => Promise<void>
  }
  ctx: WorkspaceWebsiteImportCtx
}) {
  const { importJobRef, status, focusAfterImport } = args.core
  const { getFs, refresh, setExpandedPaths } = args.ctx
  const handleImportWebsite = React.useCallback(async (urlRaw: string, opts?: WorkspaceImportWebsiteOpts) => {
    const url = String(urlRaw || '').trim()
    if (!url) return
    const jobId = (importJobRef.current += 1)
    status.setStatusProgress('Importing website')
    try {
      const result = await runWorkspaceWebsiteImport({ url, opts, importJobRef, jobId, status, getFs, refresh, setExpandedPaths, focusAfterImport })
      status.setStatusInfo(`Imported website: ${result.host}`)
      return { createdPaths: result.createdPaths, websiteImportManifest: result.websiteImportManifest, websiteImportSummary: result.websiteImportSummary }
    } catch (error) {
      if (importJobRef.current !== jobId) return
      const message = String((error as { message?: unknown })?.message ?? error)
      if (/cancelled/i.test(message)) return
      status.setStatusError(`Import failed: ${message}`)
      if (opts?.source === 'invocation') throw error
    }
  }, [focusAfterImport, getFs, importJobRef, refresh, setExpandedPaths, status])
  return { handleImportWebsite }
}
