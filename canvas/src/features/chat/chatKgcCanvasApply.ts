import { shouldApplyImportedCanvasDocumentToGraph } from '@/features/markdown-workspace/workspaceImport'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { normalizeWorkspacePath, workspaceBasename, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { requestMarkdownExplorerSourceFilesOpen } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'
import {
  readSourceFilesBootstrapSnapshot,
  subscribeSourceFilesBootstrapReady,
} from '@/features/source-files/sourceFilesBootstrapReadiness'
import { resolveActivePathMaterializationSourceAuthority } from '@/features/source-files/sourceFilesActivePathAuthority'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeMermaidMmdToMarkdown } from 'grph-shared/markdown/mermaidInput'

const ACTIVE_PATH_AUTHORITY_TIMEOUT_MS = 3_000

async function activateChatKgcWorkspacePath(path: string): Promise<boolean> {
  const workspacePath = normalizeWorkspacePath(path)
  if (!workspacePath || workspacePath === '/') return false
  requestMarkdownExplorerSourceFilesOpen(workspacePath)
  if (readSourceFilesBootstrapSnapshot().basePhase !== 'ready') {
    useMarkdownExplorerStore.getState().setActivePath(workspacePath)
    await Promise.resolve()
    return useMarkdownExplorerStore.getState().activePath === workspacePath
  }

  const sourceAuthorityIntentKey =
    resolveActivePathMaterializationSourceAuthority(workspacePath).sourceAuthorityIntentKey
  return await new Promise<boolean>(resolve => {
    let settled = false
    let requestStarted = false
    let activationYielded = false
    let unsubscribeSourceAuthority = () => void 0
    let unsubscribeExplorer = () => void 0
    const finish = (accepted: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      unsubscribeSourceAuthority()
      unsubscribeExplorer()
      resolve(accepted)
    }
    const inspect = () => {
      if (!requestStarted) return
      if (useMarkdownExplorerStore.getState().activePath !== workspacePath) {
        finish(false)
        return
      }
      const snapshot = readSourceFilesBootstrapSnapshot()
      if (snapshot.documentIntentKey === sourceAuthorityIntentKey) {
        if (snapshot.documentIntentPhase === 'error') {
          finish(false)
          return
        }
        if (snapshot.documentIntentPhase === 'resolving') return
        if (snapshot.documentIntentPhase === 'ready' && activationYielded) {
          finish(true)
          return
        }
      }
      // The mounted Source Files owner begins its intent synchronously. No matching
      // intent after one microtask means this caller is running without that owner.
      if (activationYielded) finish(true)
    }
    const timeout = setTimeout(() => finish(false), ACTIVE_PATH_AUTHORITY_TIMEOUT_MS)
    unsubscribeSourceAuthority = subscribeSourceFilesBootstrapReady(inspect)
    unsubscribeExplorer = useMarkdownExplorerStore.subscribe(inspect)
    requestStarted = true
    useMarkdownExplorerStore.getState().setActivePath(workspacePath)
    queueMicrotask(() => {
      activationYielded = true
      inspect()
    })
  })
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
