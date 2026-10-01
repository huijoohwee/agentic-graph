import assert from 'node:assert/strict'
import { act } from 'react'
import { initJsdomHarness as initDom } from './jsdomHarness'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useWebsiteImportSelectionSession } from '@/features/source-files/websiteImportSelectionSession'

export async function initJsdomHarness() {
  const env = initDom(), previousMode = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  resetWorkspaceFsForTests(); const fs = await getWorkspaceFs()
  for (const entry of await fs.listEntries()) if (entry.name === '_import-index.md') await fs.deleteEntry(entry.path, { mirrorToHost: false })
  await import('@/features/workspace-fs/importInventoryPersistence')
  return { restore() { resetWorkspaceFsForTests(); if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode; env.restore() } }
}

export async function waitForImportCondition(ready: () => boolean) {
  await act(async () => {
    for (let i = 0; i < 1000 && !ready(); i++) await new Promise(resolve => setTimeout(resolve, 1))
    assert.ok(ready(), 'import state did not reach the expected condition')
  })
}
export const settleDiscovery = () => waitForImportCondition(() => useWebsiteImportSelectionSession.getState().session?.busy === false)
