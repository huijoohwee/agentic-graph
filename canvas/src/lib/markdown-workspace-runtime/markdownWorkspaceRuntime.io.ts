import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import type { MarkdownWorkspaceRuntimeGetFs, MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'
import { ORCHESTRATOR_WORKFLOW_WORKSPACE_PATH } from '@/features/panels/utils/orchestratorWorkspaceFiles'
import { PARSER_SCRIPT_WORKSPACE_PATH } from '@/features/panels/utils/parserWorkspaceFiles'
import { SCHEMA_CONFIG_WORKSPACE_PATH } from '@/features/panels/utils/schemaWorkspaceFiles'
import { useParserUIState } from '@/features/parsers/uiState'
import { parseSchemaText } from '@/features/schema/io'
import { buildSourceFileLifecycleState } from '@/features/source-files/sourceFileParsedState'
import { applyActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import { commitMarkdownWorkspaceWriteback } from './markdownWorkspaceWritebackCommit'
import { cancelWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { WORKSPACE_SYNC_TASK_MARKDOWN_EDITOR_SSOT } from '@/lib/async/workspaceSyncKeys'
import {
  resolveWorkspaceSourceFileInlineText,
  upsertWorkspaceEntryInlineText,
} from '@/features/workspace-fs/workspaceInlineText'
import { recordDocumentVersionSnapshot } from '@/features/document-versioning/documentVersioning'
import { preferCanonicalYamlFrontmatterFencedText } from '@/lib/markdown/frontmatter'
import {
  enqueueWorkspaceSourceTextTransaction,
  isWorkspaceSourceTextRevisionCurrent,
  type WorkspaceSourceTextRevision,
} from '@/features/workspace-fs/workspaceSourceTextTransaction'

export const pushWorkspaceTextToActiveMarkdownDocument = (args: {
  activeDocumentKey: string
  activeDocumentSourceUrl: string | null
  jsonSourceText?: string | null
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
  text: string
  applyViewPreset?: boolean
  applyToGraph?: boolean
  forceApplyToGraph?: boolean
  canvasWorkspacePreset?: CanvasWorkspaceFrontmatterPreset | null
  normalizeWebpageFrontmatterToMarkdown?: boolean
}): void => {
  cancelWorkspaceSyncTask(`${WORKSPACE_SYNC_TASK_MARKDOWN_EDITOR_SSOT}:${args.activeDocumentKey}`)
  void applyActiveMarkdownDocumentPayload({
    setActiveMarkdownDocument: args.setActiveMarkdownDocument,
    name: args.activeDocumentKey,
    text: args.text,
    sourceUrl: args.activeDocumentSourceUrl,
    jsonSourceText: args.jsonSourceText,
    autoEnableFrontmatter: false,
    applyViewPreset: args.applyViewPreset ?? false,
    applyToGraph: args.applyToGraph,
    forceApplyToGraph: args.forceApplyToGraph,
    canvasWorkspacePreset: args.canvasWorkspacePreset,
    normalizeWebpageFrontmatterToMarkdown: args.normalizeWebpageFrontmatterToMarkdown ?? true,
  })
}

export const updateExistingWorkspaceSourceFile = (args: {
  path: WorkspacePath
  text: string
  resetParsedState: boolean
}): void => {
  try {
    const store = useGraphStore.getState()
    const wsPath = resolveWorkspaceSourcePathKey(args.path)
    const current = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
    const existing = current.find(file => String(file?.source?.path || '') === wsPath) || null
    if (!existing) return
    if (args.resetParsedState) {
      store.updateSourceFile(existing.id, {
        text: args.text,
        ...buildSourceFileLifecycleState({ status: 'idle' }),
      })
      return
    }
    store.updateSourceFile(existing.id, {
      text: resolveWorkspaceSourceFileInlineText(args.text),
      ...buildSourceFileLifecycleState({
        status: 'idle',
        previousState: existing,
        preserveParsedState: true,
      }),
    })
  } catch {
    void 0
  }
}

export const applyWorkspaceSpecialFileEffects = (args: {
  path: WorkspacePath
  text: string
  setGraphRagWorkflowJsonText: (text: string) => void
}): void => {
  if (args.path === ORCHESTRATOR_WORKFLOW_WORKSPACE_PATH) {
    try {
      args.setGraphRagWorkflowJsonText(args.text)
    } catch {
      void 0
    }
  }
  if (args.path === PARSER_SCRIPT_WORKSPACE_PATH) {
    try {
      useParserUIState.getState().setScriptText(args.text)
    } catch {
      void 0
    }
  }
  if (args.path === SCHEMA_CONFIG_WORKSPACE_PATH) {
    try {
      const next = parseSchemaText(args.text)
      const store = useGraphStore.getState()
      store.setSchema(next)
      store.setSchemaOpStatus(true, 'Applied schema from workspace file')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? '')
      try {
        useGraphStore.getState().setSchemaOpStatus(false, `Schema parse failed: ${msg}`)
      } catch {
        void 0
      }
    }
  }
}

function resolveWorkspaceEntryInlineTextPatch(args: {
  path: WorkspacePath
  patchWorkspaceEntryInlineText?: (path: WorkspacePath, text: string) => void
  setEntries?: Dispatch<SetStateAction<WorkspaceEntry[]>>
  createEntryIfMissing?: boolean
}): ((path: WorkspacePath, text: string) => void) | null {
  if (typeof args.patchWorkspaceEntryInlineText === 'function') return args.patchWorkspaceEntryInlineText
  if (!args.setEntries) return null
  return (path: WorkspacePath, text: string) => {
    args.setEntries?.(prev =>
      upsertWorkspaceEntryInlineText({
        entries: prev,
        path,
        text,
        createIfMissing: args.createEntryIfMissing === true,
      }),
    )
  }
}

export const syncWorkspaceTextState = (args: {
  path: WorkspacePath
  text: string
  lastLoadedRef: MutableRefObject<{ path: WorkspacePath; text: string } | null>
  patchWorkspaceEntryInlineText?: (path: WorkspacePath, text: string) => void
  setEntries?: Dispatch<SetStateAction<WorkspaceEntry[]>>
  createEntryIfMissing?: boolean
  setActiveText?: (text: string) => void
  synchronizeActiveDocument?: boolean
  activeDocumentKey?: string
  activeDocumentSourceUrl?: string | null
  jsonSourceText?: string | null
  setActiveMarkdownDocument?: MarkdownWorkspaceRuntimeSetActiveDocument
}): void => {
  const patchWorkspaceEntryInlineText = resolveWorkspaceEntryInlineTextPatch(args)
  const shouldRefreshTrackedPathOnly =
    args.synchronizeActiveDocument === false && args.lastLoadedRef.current?.path === args.path
  if (args.synchronizeActiveDocument !== false) {
    if (patchWorkspaceEntryInlineText) {
      commitMarkdownWorkspaceWriteback({
        path: args.path,
        text: args.text,
        lastLoadedRef: args.lastLoadedRef,
        patchWorkspaceEntryInlineText,
        setActiveTextProgrammatic: nextText => {
          if (typeof args.setActiveText === 'function') args.setActiveText(nextText)
        },
      })
    } else {
      args.lastLoadedRef.current = { path: args.path, text: args.text }
      if (typeof args.setActiveText === 'function') args.setActiveText(args.text)
    }
    if (args.activeDocumentKey && args.setActiveMarkdownDocument) {
      pushWorkspaceTextToActiveMarkdownDocument({
        activeDocumentKey: args.activeDocumentKey,
        activeDocumentSourceUrl: args.activeDocumentSourceUrl ?? null,
        jsonSourceText: args.jsonSourceText,
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        text: args.text,
      })
    }
  } else {
    if (patchWorkspaceEntryInlineText) {
      patchWorkspaceEntryInlineText(args.path, args.text)
    }
    if (shouldRefreshTrackedPathOnly) {
      args.lastLoadedRef.current = { path: args.path, text: args.text }
    }
  }
}

export const writeWorkspaceFileAndSync = async (args: {
  path: WorkspacePath
  text: string
  getFs: MarkdownWorkspaceRuntimeGetFs
  skipWrite?: boolean
  lastLoadedRef: MutableRefObject<{ path: WorkspacePath; text: string } | null>
  patchWorkspaceEntryInlineText?: (path: WorkspacePath, text: string) => void
  setEntries?: Dispatch<SetStateAction<WorkspaceEntry[]>>
  createEntryIfMissing?: boolean
  synchronizeActiveDocument?: boolean
  setActiveText?: (text: string) => void
  activeDocumentKey?: string
  activeDocumentSourceUrl?: string | null
  jsonSourceText?: string | null
  setActiveMarkdownDocument?: MarkdownWorkspaceRuntimeSetActiveDocument
  setGraphRagWorkflowJsonText?: (text: string) => void
  expectedSourceRevision?: WorkspaceSourceTextRevision
  expectedWorkspaceText?: string | null
  resetParsedState: boolean
}): Promise<boolean> => {
  const lastLoaded = args.lastLoadedRef.current
  const textToWrite = lastLoaded && lastLoaded.path === args.path
    ? preferCanonicalYamlFrontmatterFencedText({
        candidateText: args.text,
        canonicalText: lastLoaded.text,
      })
    : args.text
  const hasExpectedWorkspaceText = Object.prototype.hasOwnProperty.call(args, 'expectedWorkspaceText')
  const transaction = await enqueueWorkspaceSourceTextTransaction({
    path: args.path,
    text: textToWrite,
    expectedRevision: args.expectedSourceRevision,
    write: async ({ path, text }) => {
      if (args.skipWrite === true) return true
      const fs = await args.getFs()
      if (hasExpectedWorkspaceText) {
        const currentText = String(await fs.readFileText(path) ?? '')
        const expectedWorkspaceText = String(args.expectedWorkspaceText ?? '')
        if (currentText !== expectedWorkspaceText && currentText !== text) return false
        if (currentText === text) return true
      }
      await fs.writeFileText(path, text)
    },
  })
  if (!transaction.accepted || !isWorkspaceSourceTextRevisionCurrent(transaction.revision)) return false
  recordDocumentVersionSnapshot({
    path: args.path,
    text: textToWrite,
    label: args.resetParsedState ? 'Save' : 'Autosave',
    source: 'editorWorkspace',
  })
  syncWorkspaceTextState({
    ...args,
    text: textToWrite,
  })
  updateExistingWorkspaceSourceFile({
    path: args.path,
    text: textToWrite,
    resetParsedState: args.resetParsedState,
  })
  if (typeof args.setGraphRagWorkflowJsonText === 'function') {
    applyWorkspaceSpecialFileEffects({
      path: args.path,
      text: textToWrite,
      setGraphRagWorkflowJsonText: args.setGraphRagWorkflowJsonText,
    })
  }
  return true
}

export const resolveAuthoritativeWorkspaceText = async (args: {
  path: WorkspacePath
  getFs: MarkdownWorkspaceRuntimeGetFs
  lastLoadedRef: MutableRefObject<{ path: WorkspacePath; text: string } | null>
  activeTextRef: MutableRefObject<string>
  userEditedActiveTextRef: MutableRefObject<boolean>
}): Promise<string> => {
  const lastLoaded = args.lastLoadedRef.current
  const isDirty = !!(
    args.userEditedActiveTextRef.current &&
    lastLoaded &&
    lastLoaded.path === args.path &&
    lastLoaded.text !== args.activeTextRef.current
  )
  if (isDirty) {
    return preferCanonicalYamlFrontmatterFencedText({
      candidateText: String(args.activeTextRef.current || ''),
      canonicalText: String(lastLoaded?.text || ''),
    })
  }
  if (lastLoaded && lastLoaded.path === args.path && typeof lastLoaded.text === 'string' && lastLoaded.text.trim()) {
    return lastLoaded.text
  }
  const fs = await args.getFs()
  const hydrated = typeof fs.readFileText === 'function'
    ? await fs.readFileText(args.path).catch(() => '')
    : ''
  if (String(hydrated || '').trim()) return String(hydrated || '')
  return String(args.activeTextRef.current || '')
}
