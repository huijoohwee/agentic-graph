import React from 'react'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { applyActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import type { MarkdownWorkspaceRuntimeSetActiveDocument } from './markdownWorkspaceRuntime.types'
import { shouldRejectMarkdownDocumentPayload } from '@/lib/markdown/markdownDocumentPayloadGuards'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { normalizeMarkdownWorkspaceSelectionPath } from './markdownWorkspaceSelectionPath'
import {
  parseCanvasWorkspaceFrontmatterPreset,
  type CanvasWorkspaceFrontmatterPreset,
} from '@/lib/markdown/frontmatter'
import { isWorkspaceDocumentCanvasGraphApplyDisabled } from '@/lib/markdown/workspaceDocumentCanvasApplyPolicy'
import { resolveWorkspaceDocumentCanvasPreset } from '@/features/workspace-fs/workspaceAuthoredNoteDocument'
import type { WorkspaceSourceTextSnapshot } from '@/features/workspace-fs/workspaceSourceTextTransaction'

export function resolveWorkspaceDocumentSwitchCanvasPreset(args: {
  activeDocumentKey: string
  text: string
}): CanvasWorkspaceFrontmatterPreset | null {
  return resolveWorkspaceDocumentCanvasPreset({
    documentName: args.activeDocumentKey,
    rawText: args.text,
  })
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

export function shouldApplyWorkspaceDocumentSwitchSnapshot(args: {
  activePath: WorkspacePath | null
  pendingSwitchPath: WorkspacePath | null
  activeEntryKind: string
  activeDocumentKey?: string | null
  snapshot: WorkspaceSourceTextSnapshot<string>
}): boolean {
  const activePath = normalizeMarkdownWorkspaceSelectionPath(args.activePath)
  const pendingSwitchPath = normalizeMarkdownWorkspaceSelectionPath(args.pendingSwitchPath)
  const snapshotPath = normalizeMarkdownWorkspaceSelectionPath(args.snapshot.revision.path)
  if (!activePath || pendingSwitchPath !== activePath || snapshotPath !== activePath) return false
  if (!args.snapshot.current) return false
  return shouldAcceptWorkspaceDocumentSelectionText({
    activePath,
    activeEntryKind: args.activeEntryKind,
    activeDocumentKey: args.activeDocumentKey,
    text: args.snapshot.value,
  })
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
  userEditedActiveText?: boolean
  markdownDocumentName: string
  markdownDocumentText: string
  graphDataSource?: string | null
  canvas2dRenderer?: string | null
}): boolean {
  if (args.userEditedActiveText === true) return false
  if (isWorkspaceDocumentCanvasGraphApplyDisabled(args.nextText)) return false
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

export function resolveStableWorkspaceSelectionSyncDecision(args: {
  activePath: WorkspacePath | null
  activeEntryKind: string
  activeDocumentKey?: string | null
  currentText: string
  nextText: string
  lastLoadedPath?: WorkspacePath | null
  userEditedActiveText: boolean
  markdownDocumentName: string
  markdownDocumentText: string
  graphDataSource?: string | null
  canvas2dRenderer?: string | null
}): { hydrateText: boolean; applyToCanvas: boolean } {
  const hydrateText = shouldHydrateStableWorkspaceSelectionText(args)
  if (args.userEditedActiveText) {
    return { hydrateText: false, applyToCanvas: false }
  }
  return {
    hydrateText,
    applyToCanvas: shouldApplyStableWorkspaceSelectionToCanvas(args),
  }
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
  if (isWorkspaceDocumentCanvasGraphApplyDisabled(args.text)) return true
  return !isWorkspaceGraphSourceStaleForDocument({
    activeDocumentKey,
    graphDataSource: args.graphDataSource,
  })
}

export function shouldForceWorkspaceDocumentSwitchGraphApply(args: {
  activeDocumentKey?: string | null
  pendingSwitchPath?: WorkspacePath | null
}): boolean {
  const activeDocumentPath = normalizeMarkdownWorkspaceSelectionPath(args.activeDocumentKey || null)
  const pendingSwitchPath = normalizeMarkdownWorkspaceSelectionPath(args.pendingSwitchPath || null)
  return !!activeDocumentPath && pendingSwitchPath === activeDocumentPath
}

export type WorkspaceDocumentSwitchApplyStatus = 'applied' | 'settled' | 'deferred'

export function useMarkdownWorkspaceDocumentSwitchApply(args: {
  activePath: WorkspacePath | null
  readPendingSwitchNextPath: () => WorkspacePath | null
  setActiveMarkdownDocument: MarkdownWorkspaceRuntimeSetActiveDocument
}) {
  const lastDocumentSwitchApplySigRef = React.useRef<string>('')
  const documentSwitchApplyInFlightSigRef = React.useRef<string>('')
  const lastDocumentSwitchApplyAttemptRef = React.useRef<{ sig: string; atMs: number }>({ sig: '', atMs: 0 })
  const documentSwitchApplyRetryTimerRef = React.useRef<number | null>(null)
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
    const canvasGraphApplyDisabled = isWorkspaceDocumentCanvasGraphApplyDisabled(applyArgs.text)
    const forcePendingSwitchGraphApply = shouldForceWorkspaceDocumentSwitchGraphApply({
      activeDocumentKey: applyArgs.activeDocumentKey,
      pendingSwitchPath: args.readPendingSwitchNextPath(),
    })
    if (!forcePendingSwitchGraphApply && isWorkspaceDocumentSwitchApplySettled({
      activeDocumentKey: applyArgs.activeDocumentKey,
      text: applyArgs.text,
      markdownDocumentName: applyArgs.markdownDocumentName,
      markdownDocumentText: applyArgs.markdownDocumentText,
      graphDataSource: applyArgs.graphDataSource,
      canvas2dRenderer: applyArgs.canvas2dRenderer,
    })) {
      return 'settled'
    }
    if (canvasGraphApplyDisabled) {
      const applied = await applyActiveMarkdownDocumentPayload({
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        name: applyArgs.activeDocumentKey,
        text: applyArgs.text,
        canonicalMarkdownText: applyArgs.markdownDocumentText,
        expectedCurrentDocumentName: applyArgs.markdownDocumentName,
        expectedCurrentDocumentText: applyArgs.markdownDocumentText,
        sourceUrl: applyArgs.sourceUrl,
        autoEnableFrontmatter: false,
        applyViewPreset: false,
        applyToGraph: false,
        forceApplyToGraph: false,
        normalizeWebpageFrontmatterToMarkdown: false,
      })
      return applied === true ? 'applied' : 'deferred'
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
    const shouldReplayCompletedApply =
      shouldReplayCompletedApplyForMarkdownConflict || forcePendingSwitchGraphApply
    if (!shouldReplayCompletedApply && lastDocumentSwitchApplySigRef.current === nextSig) return 'settled'
    lastDocumentSwitchApplyAttemptRef.current = { sig: nextSig, atMs: nowMs }
    documentSwitchApplyInFlightSigRef.current = nextSig
    try {
      const applied = await applyActiveMarkdownDocumentPayload({
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        name: applyArgs.activeDocumentKey,
        text: applyArgs.text,
        canonicalMarkdownText: applyArgs.markdownDocumentText,
        expectedCurrentDocumentName: applyArgs.markdownDocumentName,
        expectedCurrentDocumentText: applyArgs.markdownDocumentText,
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
  }, [args.setActiveMarkdownDocument])

  return {
    applySelectedWorkspaceDocumentToCanvas,
    clearDocumentSwitchApplyRetry,
    documentSwitchApplyRetryTick,
    scheduleDocumentSwitchApplyRetry,
  }
}
