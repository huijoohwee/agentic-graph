import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import {
  hydrateWorkspaceFileFromPendingLocalImport,
  peekPendingWorkspaceLocalImport,
} from '../workspaceImport'
import type { WorkspaceImportResult } from '../workspaceImport/types'
import { shouldApplyImportedCanvasDocumentToGraph } from '../workspaceImport/applyPolicy'
import { normalizeCorpusImportManifest } from '@/features/queryable-corpus/sourceFilesCorpusManifest'
import { activateStrybldrImportSurface } from '@/features/strybldr/strybldrImportSurface'

const IMPORTED_WORKSPACE_DOCUMENT_ACTIVATION_MAX_ATTEMPTS = 2

export function normalizeWorkspaceImportResult(raw: unknown): WorkspaceImportResult {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const createdPaths = Array.isArray(rec.createdPaths)
    ? rec.createdPaths.map(path => String(path || '').trim()).filter(Boolean)
    : []
  const removedPaths = Array.isArray(rec.removedPaths)
    ? rec.removedPaths.map(path => String(path || '').trim()).filter(Boolean)
    : []
  const sources = Array.isArray(rec.sources)
    ? rec.sources
        .map((item): WorkspaceImportResult['sources'][number] | null => {
          const path = String((item as { path?: unknown } | null)?.path || '').trim() as WorkspacePath
          const rawSource = (item as { source?: unknown } | null)?.source
          if (!path || !rawSource || typeof rawSource !== 'object') return null
          const kind = String((rawSource as { kind?: unknown }).kind || '').trim()
          if (kind === 'url') {
            const url = String((rawSource as { url?: unknown }).url || '').trim()
            if (!url) return null
            return { path, source: { kind: 'url' as const, url } }
          }
          if (kind === 'local') {
            const originalName = typeof (rawSource as { originalName?: unknown }).originalName === 'string'
              ? String((rawSource as { originalName?: string }).originalName || '').trim()
              : ''
            return originalName
              ? { path, source: { kind: 'local' as const, originalName } }
              : { path, source: { kind: 'local' as const } }
          }
          return null
        })
        .filter((item): item is WorkspaceImportResult['sources'][number] => !!item)
    : []
  const jsonSourceDocuments = Array.isArray(rec.jsonSourceDocuments)
    ? rec.jsonSourceDocuments
        .map((item): NonNullable<WorkspaceImportResult['jsonSourceDocuments']>[number] | null => {
          const path = String((item as { path?: unknown } | null)?.path || '').trim() as WorkspacePath
          const text = typeof (item as { text?: unknown } | null)?.text === 'string'
            ? String((item as { text?: string }).text || '')
            : ''
          if (!path || !text.trim()) return null
          return { path, text }
        })
        .filter((item): item is NonNullable<WorkspaceImportResult['jsonSourceDocuments']>[number] => !!item)
    : []
  const skipped = Array.isArray(rec.skipped)
    ? rec.skipped
        .map(item => {
          const name = String((item as { name?: unknown } | null)?.name || '').trim()
          const reasonRaw = String((item as { reason?: unknown } | null)?.reason || '').trim()
          const reason = reasonRaw === 'missing-name' ? 'missing-name' : reasonRaw === 'unsupported' ? 'unsupported' : ''
          if (!reason) return null
          return { name, reason }
        })
        .filter((item): item is WorkspaceImportResult['skipped'][number] => !!item)
    : []
  const failed = Array.isArray(rec.failed)
    ? rec.failed
        .map(item => {
          const name = String((item as { name?: unknown } | null)?.name || '').trim()
          const error = String((item as { error?: unknown } | null)?.error || '').trim()
          if (!error) return null
          return { name, error }
        })
        .filter((item): item is WorkspaceImportResult['failed'][number] => !!item)
    : []
  const applyToGraph = typeof rec.applyToGraph === 'boolean' ? rec.applyToGraph : undefined
  const corpusManifest = normalizeCorpusImportManifest(rec.corpusManifest)
  return {
    createdPaths,
    ...(removedPaths.length > 0 ? { removedPaths } : {}),
    sources,
    skipped,
    failed,
    ...(jsonSourceDocuments.length > 0 ? { jsonSourceDocuments } : {}),
    ...(typeof applyToGraph === 'boolean' ? { applyToGraph } : {}),
    ...(corpusManifest ? { corpusManifest } : {}),
  }
}

export async function resolveImportedCanvasDocumentApplyToGraph(args: {
  fs: WorkspaceFs
  createdPaths: string[]
}): Promise<boolean> {
  const createdPaths = Array.isArray(args.createdPaths)
    ? args.createdPaths.map(path => String(path || '').trim()).filter(Boolean)
    : []
  for (const path of createdPaths) {
    const text = String((await args.fs.readFileText(path).catch(() => '')) || '')
    if (shouldApplyImportedCanvasDocumentToGraph({ path, text })) return true
    if (!peekPendingWorkspaceLocalImport(path)) continue
    const hydrated = await hydrateWorkspaceFileFromPendingLocalImport({ fs: args.fs, path }).catch(() => null)
    const hydratedText = String(hydrated?.text || '')
    if (shouldApplyImportedCanvasDocumentToGraph({ path, text: hydratedText })) return true
  }
  return false
}

export async function applyWorkspaceImportToCanvasBestEffort(args: {
  fs: WorkspaceFs
  createdPaths: string[]
  opts?: {
    applyToGraph?: boolean
    workspaceEntries?: WorkspaceEntry[]
    sourcesByPath?: Record<string, WorkspaceEntrySource | undefined> | null
    removedPaths?: string[]
  } | null
}): Promise<void> {
  const createdPaths = Array.isArray(args.createdPaths)
    ? args.createdPaths.map(path => String(path || '').trim()).filter(Boolean)
    : []
  if (createdPaths.length === 0) return
  try {
    const { applyWorkspaceImportToCanvas } = (await import('@/features/workspace-fs/applyWorkspaceImportToCanvas')) as typeof import(
      '@/features/workspace-fs/applyWorkspaceImportToCanvas'
    )
    await applyWorkspaceImportToCanvas({
      fs: args.fs,
      createdPaths,
      ...(args.opts ? { opts: args.opts } : {}),
    })
  } catch {
    void 0
  }
}

export async function pickFirstCreatedFilePathForImportFocus(fs: WorkspaceFs, createdPaths: string[]): Promise<string | null> {
  const normalized = Array.isArray(createdPaths) ? createdPaths.map(path => String(path || '').trim()).filter(Boolean) : []
  if (normalized.length === 0) return null

  try {
    const entries = await fs.listEntries()
    const filePaths = new Set(
      entries
        .filter(entry => entry.kind === 'file')
        .map(entry => String(entry.path || '').trim())
        .filter(Boolean),
    )
    const firstFilePath = normalized.find(path => filePaths.has(path))
    if (firstFilePath) return firstFilePath
  } catch {
    void 0
  }

  const fileLike = normalized.find(path => /\/[^/]+\.[^/]+$/.test(path))
  if (fileLike) return fileLike
  return normalized[0] || null
}

export async function activateFirstImportedWorkspaceFile(args: {
  fs: WorkspaceFs
  createdPaths: string[]
  applyToGraph?: boolean
  jsonSourceDocuments?: WorkspaceImportResult['jsonSourceDocuments']
}): Promise<boolean> {
  const createdPaths = Array.isArray(args.createdPaths)
    ? args.createdPaths.map(path => String(path || '').trim()).filter(Boolean)
    : []
  if (createdPaths.length === 0) return false
  try {
    const [
      { normalizeWorkspacePath, workspaceBasename, workspaceDocumentKey },
      { normalizeMermaidMmdToMarkdown },
    ] = await Promise.all([
      import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
      import('grph-shared/markdown/mermaidInput') as Promise<typeof import('grph-shared/markdown/mermaidInput')>,
    ])

    const firstPath = (await pickFirstCreatedFilePathForImportFocus(args.fs, createdPaths)) || ''
    if (!firstPath) return false

    const pendingImport = peekPendingWorkspaceLocalImport(firstPath as WorkspacePath)
    const hydrated = pendingImport?.kind === 'glb' || pendingImport?.kind === 'gltf'
      ? null
      : await hydrateWorkspaceFileFromPendingLocalImport({ fs: args.fs, path: firstPath }).catch(() => null)
    let activationPath = normalizeWorkspacePath(firstPath) as WorkspacePath
    let activationText = String((hydrated?.text || (await args.fs.readFileText(activationPath).catch(() => ''))) || '')
    let activationName = workspaceDocumentKey(activationPath) || workspaceBasename(activationPath) || activationPath
    try {
      useMarkdownExplorerStore.getState().setActivePath(activationPath)
    } catch {
      try {
        useMarkdownExplorerStore.setState({
          activePath: activationPath,
          lastSetActivePath: { path: activationPath, atMs: Date.now() },
        })
      } catch {
        void 0
      }
    }

    let activated = false
    for (let attempt = 0; attempt < IMPORTED_WORKSPACE_DOCUMENT_ACTIVATION_MAX_ATTEMPTS; attempt += 1) {
      const selectedPath = normalizeWorkspacePath(useMarkdownExplorerStore.getState().activePath || '/')
      if (selectedPath !== activationPath) {
        const selectedText = await args.fs.readFileText(selectedPath).catch(() => '')
        const sameSourceAlias = !!(
          selectedText
          && selectedText === activationText
          && workspaceBasename(selectedPath) === workspaceBasename(activationPath)
        )
        if (!sameSourceAlias) return false
        activationPath = selectedPath as WorkspacePath
        activationText = selectedText
        activationName = workspaceDocumentKey(activationPath) || workspaceBasename(activationPath) || activationPath
      }
      const jsonSourceText = (args.jsonSourceDocuments || [])
        .find(item => normalizeWorkspacePath(String(item?.path || '')) === activationPath)?.text ?? null
      activated = await useGraphStore.getState().setActiveMarkdownDocument({
        name: activationName,
        text: normalizeMermaidMmdToMarkdown(activationName, activationText),
        normalizeMermaidMmd: false,
        sourceUrl: null,
        jsonSourceText,
        applyViewPreset: args.applyToGraph === true,
        applyToGraph: args.applyToGraph === true,
      })
      if (activated) break
    }
    if (!activated) return false
    if (args.applyToGraph === true) {
      try {
        activateStrybldrImportSurface({
          graphData: useGraphStore.getState().graphData,
          rawText: activationText,
        })
      } catch {
        void 0
      }
    }
    return true
  } catch {
    return false
  }
}
