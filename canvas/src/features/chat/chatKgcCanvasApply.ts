import { shouldApplyImportedCanvasDocumentToGraph } from '@/features/markdown-workspace/workspaceImport'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { normalizeWorkspacePath, workspaceBasename, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { requestMarkdownExplorerSourceFilesOpen } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import { readSourceFilesBootstrapSnapshot } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeMermaidMmdToMarkdown } from 'grph-shared/markdown/mermaidInput'

const ACTIVE_PATH_STABILITY_INTERVAL_MS = 25
const ACTIVE_PATH_STABILITY_CHECKS = 4
const ACTIVE_PATH_MIN_BROWSER_CHECKS = 10
const ACTIVE_PATH_MAX_CHECKS = 40

async function activateChatKgcWorkspacePath(path: string): Promise<boolean> {
  const workspacePath = normalizeWorkspacePath(path)
  if (!workspacePath || workspacePath === '/') return false
  requestMarkdownExplorerSourceFilesOpen(workspacePath)
  const browserSourceAuthorityReady = readSourceFilesBootstrapSnapshot().basePhase === 'ready'
  const minimumChecks = browserSourceAuthorityReady ? ACTIVE_PATH_MIN_BROWSER_CHECKS : 1
  let stableChecks = 0
  for (let check = 0; check < ACTIVE_PATH_MAX_CHECKS; check += 1) {
    const explorer = useMarkdownExplorerStore.getState()
    if (explorer.activePath !== workspacePath) {
      explorer.setActivePath(workspacePath)
      stableChecks = 0
    }
    await new Promise<void>(resolve => setTimeout(resolve, ACTIVE_PATH_STABILITY_INTERVAL_MS))
    if (useMarkdownExplorerStore.getState().activePath === workspacePath) {
      stableChecks += 1
      if (check + 1 >= minimumChecks && stableChecks >= ACTIVE_PATH_STABILITY_CHECKS) return true
    } else {
      stableChecks = 0
    }
  }
  return false
}

export async function applyChatKgcDocumentTextToCanvas({
  name,
  text,
}: {
  name: string
  text: string
}): Promise<boolean> {
  return await useGraphStore.getState().setActiveMarkdownDocument({
    name,
    text: normalizeMermaidMmdToMarkdown(name, text),
    normalizeMermaidMmd: false,
    sourceUrl: null,
    jsonSourceText: null,
    applyViewPreset: true,
    applyToGraph: true,
    forceApplyToGraph: true,
  })
}

export async function applyChatKgcWorkspaceDocumentToCanvas(path: string): Promise<boolean> {
  const workspacePath = normalizeWorkspacePath(path)
  if (!workspacePath) return false
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  const text = String((await fs.readFileText(workspacePath)) || '')
  if (!shouldApplyImportedCanvasDocumentToGraph({ path: workspacePath, text })) return false
  await applyWorkspaceImportToCanvas({
    fs,
    createdPaths: [workspacePath],
    opts: {
      applyToGraph: true,
      skipComposedGraphApply: true,
    },
  })
  if (!await activateChatKgcWorkspacePath(workspacePath)) return false
  const name = workspaceDocumentKey(workspacePath) || workspaceBasename(workspacePath) || workspacePath
  return await applyChatKgcDocumentTextToCanvas({ name, text })
}
