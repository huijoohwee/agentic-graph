import React from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { applyActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import type { MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'
import { shouldRejectMarkdownDocumentPayload } from '@/lib/markdown/markdownDocumentPayloadGuards'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { normalizeMarkdownWorkspaceSelectionPath } from './markdownWorkspaceSelectionPath'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { isWorkspaceAuthoredMarkdownNotePath } from '@/features/workspace-fs/workspaceAuthoredNoteDocument'

export function resolveWorkspaceDocumentSwitchCanvasPreset(args: {
  activeDocumentKey: string
  text: string
}): CanvasWorkspaceFrontmatterPreset | null {
  const authoredPreset = parseCanvasWorkspaceFrontmatterPreset(args.text)
  if (!isWorkspaceAuthoredMarkdownNotePath(args.activeDocumentKey)) return authoredPreset
  if (authoredPreset?.canvasSurfaceMode || authoredPreset?.canvasRenderMode) return authoredPreset
  return {
    ...(authoredPreset || {}),
    canvasSurfaceMode: '2d',
    canvasRenderMode: '2d',
  }
}

function buildWorkspaceDocumentSwitchSignature(args: {
  activeDocumentKey: string
  text: string
  updatedAtMs: unknown
  graphDataSource?: string | null
  canvas2dRenderer?: string | null
}): string {
  const activeDocumentKey = String(args.activeDocumentKey || '').trim()
  const text = String(args.text || '')
  const textHash = hashStringToHexSharedContentCached(text, 'markdown-workspace-switch')
  const graphDataSource = String(args.graphDataSource || '').trim()
  return hashSignatureParts([
    'markdown-workspace-document-switch-apply',
    activeDocumentKey,
    text.length,
    textHash,
    typeof args.updatedAtMs === 'number' ? args.updatedAtMs : 0,
    graphDataSource,
    String(args.canvas2dRenderer || '').trim(),
  ])
}

export function shouldAcceptWorkspaceDocumentSelectionText(args: {
  activePath: WorkspacePath | null
  activeEntryKind: string
  activeDocumentKey?: string | null
  text: string
}): boolean {
  const activePath = String(args.activePath || '').trim()
  if (!activePath) return false
  if (args.activeEntryKind === 'folder') return false
  if (shouldRejectMarkdownDocumentPayload(args.text)) return false
  if (String(args.text || '').trim()) return true
  const activeDocumentKey = String(args.activeDocumentKey || '').trim()
  if (!activeDocumentKey) return false
  return !String(args.activeEntryKind || '').trim() || args.activeEntryKind === 'file'
}

export function shouldHydrateStableWorkspaceSelectionText(args: {
  activePath: WorkspacePath | null
  activeEntryKind: string
  activeDocumentKey?: string | null
  currentText: string
  nextText: string
  lastLoadedPath?: WorkspacePath | null
  userEditedActiveText: boolean
}): boolean {
  if (args.userEditedActiveText === true) return false
  if (!shouldAcceptWorkspaceDocumentSelectionText({
    activePath: args.activePath,
    activeEntryKind: args.activeEntryKind,
    activeDocumentKey: args.activeDocumentKey,
    text: args.nextText,
  })) {
    return false
  }
  const activePath = String(args.activePath || '').trim()
  if (!activePath) return false
  if (String(args.lastLoadedPath || '').trim() !== activePath) return true
  return String(args.currentText || '') !== String(args.nextText || '')
}

export function shouldPrimeWorkspaceDocumentSwitchCanvas(args: {
  activePath: WorkspacePath | null
  pendingSwitchPath: WorkspacePath | null
  activeEntryKind: string
  activeDocumentKey?: string | null
  inlineText: string
}): boolean {
  const activePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)
  const pendingSwitchPath = normalizeMarkdownWorkspaceSelectionPath(args.pendingSwitchPath)
  if (!activePath || pendingSwitchPath !== activePath) return false
  if (args.activeEntryKind !== 'file') return false
  if (!String(args.activeDocumentKey || '').trim()) return false
  return !String(args.inlineText || '').trim()
}

export function isWorkspaceGraphSourceStaleForDocument(args: {
  activeDocumentKey?: string | null
  graphDataSource?: string | null
}): boolean {
  const activeDocumentKey = String(args.activeDocumentKey || '').trim()
  if (!activeDocumentKey) return false
  const graphDataSource = String(args.graphDataSource || '').trim()
  const expectedMarkdownSource = `markdown:${activeDocumentKey}`
  return graphDataSource !== expectedMarkdownSource
}

function isWorkspaceGraphSourceConflictingMarkdownDocument(args: {
  activeDocumentKey?: string | null
  graphDataSource?: string | null
}): boolean {
  const activeDocumentKey = String(args.activeDocumentKey || '').trim()
  if (!activeDocumentKey) return false
  const graphDataSource = String(args.graphDataSource || '').trim()
  const expectedMarkdownSource = `markdown:${activeDocumentKey}`
  return graphDataSource.startsWith('markdown:') && graphDataSource !== expectedMarkdownSource
}

export function isWorkspace2dRendererPresetStaleForDocument(args: {
  text: string
  canvas2dRenderer?: string | null
}): boolean {
  const expectedRenderer = parseCanvasWorkspaceFrontmatterPreset(args.text)?.canvas2dRenderer || ''
  if (!expectedRenderer) return false
  return String(args.canvas2dRenderer || '').trim() !== expectedRenderer
}

export function shouldApplyStableWorkspaceSelectionToCanvas(args: {
  activePath: WorkspacePath | null
  activeEntryKind: string
  activeDocumentKey?: string | null
  nextText: string
  markdownDocumentName: string
  markdownDocumentText: string
  graphDataSource?: string | null
  canvas2dRenderer?: string | null
}): boolean {
  if (!shouldAcceptWorkspaceDocumentSelectionText({
    activePath: args.activePath,
    activeEntryKind: args.activeEntryKind,
    activeDocumentKey: args.activeDocumentKey,
    text: args.nextText,
  })) {
    return false
  }
  const activeDocumentKey = String(args.activeDocumentKey || '').trim()
  if (!activeDocumentKey) return false
  if (isWorkspaceGraphSourceStaleForDocument({
    activeDocumentKey,
    graphDataSource: args.graphDataSource,
  })) {
    return true
  }
  return (
    String(args.markdownDocumentName || '').trim() !== activeDocumentKey ||
    String(args.markdownDocumentText || '') !== String(args.nextText || '')
  )
}

export function isWorkspaceDocumentSwitchApplySettled(args: {
  activeDocumentKey?: string | null
  text: string
  markdownDocumentName: string
  markdownDocumentText: string
  graphDataSource?: string | null
  canvas2dRenderer?: string | null
}): boolean {
  const activeDocumentKey = String(args.activeDocumentKey || '').trim()
  if (!activeDocumentKey) return false
  if (String(args.markdownDocumentName || '').trim() !== activeDocumentKey) return false
  if (String(args.markdownDocumentText || '') !== String(args.text || '')) return false
  return !isWorkspaceGraphSourceStaleForDocument({
    activeDocumentKey,
    graphDataSource: args.graphDataSource,
  })
}

export type WorkspaceDocumentSwitchApplyStatus = 'applied' | 'settled' | 'deferred'

export function useMarkdownWorkspaceDocumentSwitchApply(args: {
  activePath: WorkspacePath | null
  canonicalMarkdownText: string
  readPendingSwitchNextPath: () => WorkspacePath | null
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
  prime?: {
    activeEntryKind: string
    activeDocumentKey: string
    activeDocumentSourceUrl: string | null
    inlineText: string
    updatedAtMs: unknown
    graphDataSource?: string | null
    markdownDocumentName: string
    markdownDocumentText: string
    canvas2dRenderer?: string | null
  }
}) {
  const lastDocumentSwitchApplySigRef = React.useRef<string>('')
  const documentSwitchApplyInFlightSigRef = React.useRef<string>('')
  const lastDocumentSwitchApplyAttemptRef = React.useRef<{ sig: string; atMs: number }>({ sig: '', atMs: 0 })
  const documentSwitchApplyRetryTimerRef = React.useRef<number | null>(null)
  const primedSwitchPathRef = React.useRef<WorkspacePath | null>(null)
  const [documentSwitchApplyRetryTick, setDocumentSwitchApplyRetryTick] = React.useState(0)

  const clearDocumentSwitchApplyRetry = React.useCallback(() => {
    if (documentSwitchApplyRetryTimerRef.current == null) return
    window.clearTimeout(documentSwitchApplyRetryTimerRef.current)
    documentSwitchApplyRetryTimerRef.current = null
  }, [])

  const scheduleDocumentSwitchApplyRetry = React.useCallback((path: WorkspacePath) => {
    const normalizedPath = normalizeMarkdownWorkspaceSelectionPath(path)
    if (!normalizedPath) return
    clearDocumentSwitchApplyRetry()
    documentSwitchApplyRetryTimerRef.current = window.setTimeout(() => {
      documentSwitchApplyRetryTimerRef.current = null
      if (args.readPendingSwitchNextPath() !== normalizedPath) return
      if (args.activePath !== normalizedPath) return
      setDocumentSwitchApplyRetryTick(tick => tick + 1)
    }, 450)
  }, [args.activePath, args.readPendingSwitchNextPath, clearDocumentSwitchApplyRetry])

  React.useEffect(() => {
    return () => {
      clearDocumentSwitchApplyRetry()
    }
  }, [clearDocumentSwitchApplyRetry])

  const applySelectedWorkspaceDocumentToCanvas = React.useCallback(async (applyArgs: {
    activeDocumentKey: string
    text: string
    sourceUrl: string | null
    updatedAtMs: unknown
    graphDataSource?: string | null
    markdownDocumentName: string
    markdownDocumentText: string
    canvas2dRenderer?: string | null
  }): Promise<WorkspaceDocumentSwitchApplyStatus> => {
    if (isWorkspaceDocumentSwitchApplySettled({
      activeDocumentKey: applyArgs.activeDocumentKey,
      text: applyArgs.text,
      markdownDocumentName: applyArgs.markdownDocumentName,
      markdownDocumentText: applyArgs.markdownDocumentText,
      graphDataSource: applyArgs.graphDataSource,
      canvas2dRenderer: applyArgs.canvas2dRenderer,
    })) {
      return 'settled'
    }
    const nextSig = buildWorkspaceDocumentSwitchSignature({
      activeDocumentKey: applyArgs.activeDocumentKey,
      text: applyArgs.text,
      updatedAtMs: applyArgs.updatedAtMs,
      graphDataSource: applyArgs.graphDataSource,
      canvas2dRenderer: applyArgs.canvas2dRenderer,
    })
    const nowMs = Date.now()
    const lastAttempt = lastDocumentSwitchApplyAttemptRef.current
    const graphSourceStaleForDocument = isWorkspaceGraphSourceStaleForDocument({
      activeDocumentKey: applyArgs.activeDocumentKey,
      graphDataSource: applyArgs.graphDataSource,
    })
    const graphSourceConflictingMarkdownDocument = isWorkspaceGraphSourceConflictingMarkdownDocument({
      activeDocumentKey: applyArgs.activeDocumentKey,
      graphDataSource: applyArgs.graphDataSource,
    })
    if (lastAttempt.sig === nextSig && nowMs - lastAttempt.atMs < 400) return 'deferred'
    if (documentSwitchApplyInFlightSigRef.current === nextSig) return 'deferred'
    const shouldReplayCompletedApplyForMarkdownConflict =
      graphSourceStaleForDocument && graphSourceConflictingMarkdownDocument
    if (!shouldReplayCompletedApplyForMarkdownConflict && lastDocumentSwitchApplySigRef.current === nextSig) return 'settled'
    lastDocumentSwitchApplyAttemptRef.current = { sig: nextSig, atMs: nowMs }
    documentSwitchApplyInFlightSigRef.current = nextSig
    try {
      const applied = await applyActiveMarkdownDocumentPayload({
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        name: applyArgs.activeDocumentKey,
        text: applyArgs.text,
        canonicalMarkdownText: args.canonicalMarkdownText,
        sourceUrl: applyArgs.sourceUrl,
        autoEnableFrontmatter: true,
        applyViewPreset: true,
        applyToGraph: true,
        forceApplyToGraph: true,
        canvasWorkspacePreset: resolveWorkspaceDocumentSwitchCanvasPreset({
          activeDocumentKey: applyArgs.activeDocumentKey,
          text: applyArgs.text,
        }),
        normalizeWebpageFrontmatterToMarkdown: false,
      })
      if (applied === true) {
        lastDocumentSwitchApplySigRef.current = nextSig
        return 'applied'
      }
      return 'deferred'
    } finally {
      if (documentSwitchApplyInFlightSigRef.current === nextSig) {
        documentSwitchApplyInFlightSigRef.current = ''
      }
    }
  }, [args.canonicalMarkdownText, args.setActiveMarkdownDocument])

  React.useLayoutEffect(() => {
    const prime = args.prime
    const pendingSwitchPath = args.readPendingSwitchNextPath()
    if (!pendingSwitchPath) {
      primedSwitchPathRef.current = null
      return
    }
    if (primedSwitchPathRef.current === pendingSwitchPath) return
    if (!prime || !shouldPrimeWorkspaceDocumentSwitchCanvas({
      activePath: args.activePath,
      pendingSwitchPath,
      activeEntryKind: prime.activeEntryKind,
      activeDocumentKey: prime.activeDocumentKey,
      inlineText: prime.inlineText,
    })) return
    primedSwitchPathRef.current = pendingSwitchPath
    void applySelectedWorkspaceDocumentToCanvas({
      activeDocumentKey: prime.activeDocumentKey,
      text: '',
      sourceUrl: prime.activeDocumentSourceUrl,
      updatedAtMs: prime.updatedAtMs,
      graphDataSource: prime.graphDataSource,
      markdownDocumentName: prime.markdownDocumentName,
      markdownDocumentText: prime.markdownDocumentText,
      canvas2dRenderer: prime.canvas2dRenderer,
    })
  }, [args.activePath, args.prime, args.readPendingSwitchNextPath, applySelectedWorkspaceDocumentToCanvas])

  return {
    applySelectedWorkspaceDocumentToCanvas,
    clearDocumentSwitchApplyRetry,
    documentSwitchApplyRetryTick,
    scheduleDocumentSwitchApplyRetry,
  }
}
