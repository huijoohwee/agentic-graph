import React from 'react'
import type { ChatMessage } from '../FloatingPanelChatSections'
import type { UiToastInput } from '@/hooks/store/types'
import {
  appendChatHistoryWorkspaceFile,
  isAgenticOsStructuredMarkdown,
} from '../chatHistoryWorkspace'
import {
  extractAgenticOsBlockFromAssistantText,
  pickBestErrorFallbackSource,
  toConciseBulletText,
} from './floatingPanelChatAgenticOsPayload'
import { persistChatExchangeLog } from './floatingPanelChatRuntime'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { applyChatAgenticOsWorkspaceDocumentToCanvas } from '@/features/chat/chatAgenticOsCanvasApply'
import { publishLocalChatPipelineFinalizeSnapshot } from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { persistChatStreamArtifacts } from '@/features/chat/chatStreamArtifacts'
import {
  buildWorkspacePromotionFailureNote,
  buildWorkspacePromotionRetryCommand,
  buildWorkspacePromotionRetryHint,
  buildWorkspacePromotionRetryToast,
  normalizeAssistantWorkspacePath,
  promoteGeneratedChatWorkspacePaths,
  toWorkspaceArtifactPromotion,
  type PromoteGeneratedChatWorkspacePathsResult,
  type WorkspaceArtifactPromotion,
} from './chatWorkspaceArtifactPromotion'
import type { HeadlessResponseRunResult } from '../headlessResponseCoordinator'
import { projectHeadlessResponseRunToChatMessage } from '../headlessResponseChatProjection'

const WORKSPACE_MARKDOWN_LINK_RE = /\[[^\]]+\]\(((?:workspace:)?\/[^\s)]+\.md)\)/g
const WORKSPACE_RESULT_PATH_RE = /(?:^|[\s{,[])(?:["']?(?:workspace_document_path|workspace_path|workspacePath)["']?)\s*[:=]\s*["']?((?:workspace:)?\/[^"'`\s,)]+\.md)/gim
type WorkspaceArtifactStatus = 'APPLIED' | 'SAVED' | 'GENERATED'

const classifyWorkspaceArtifactType = (workspacePath: string): 'USER_MODEL' | 'TRACE' | 'REPORT' | 'OUTPUT' | 'AGENTIC_OS' | 'DOC' => {
  const normalized = normalizeAssistantWorkspacePath(workspacePath).toLowerCase()
  const base = normalized.split('/').filter(Boolean).slice(-1)[0] || ''
  if (normalized.includes('/user-models/') || base.includes('user-model')) return 'USER_MODEL'
  if (normalized.includes('/trace') || base.startsWith('agentic-os-trace_') || base.includes('--trace')) return 'TRACE'
  if (base.startsWith('agentic-os-output_') || normalized.includes('/output')) return 'OUTPUT'
  if (normalized.includes('/report') || base.includes('report')) return 'REPORT'
  if (base.startsWith('agenticOs_')) return 'AGENTIC_OS'
  return 'DOC'
}

const workspaceArtifactPriority = (workspacePath: string): number => {
  const artifactType = classifyWorkspaceArtifactType(workspacePath)
  if (artifactType === 'USER_MODEL') return 0
  if (artifactType === 'AGENTIC_OS') return 1
  if (artifactType === 'REPORT') return 2
  if (artifactType === 'DOC') return 3
  if (artifactType === 'OUTPUT') return 4
  return 5
}

const collectWorkspaceMarkdownLinkPaths = (text: unknown): string[] => {
  const content = String(text || '')
  const paths: string[] = []
  WORKSPACE_MARKDOWN_LINK_RE.lastIndex = 0
  for (;;) {
    const match = WORKSPACE_MARKDOWN_LINK_RE.exec(content)
    if (!match?.[1]) break
    const normalized = normalizeAssistantWorkspacePath(match[1])
    if (normalized) paths.push(normalized)
  }
  return paths
}

const collectWorkspaceResultPaths = (text: unknown): string[] => {
  const content = String(text || '')
  const paths: string[] = []
  WORKSPACE_RESULT_PATH_RE.lastIndex = 0
  for (;;) {
    const match = WORKSPACE_RESULT_PATH_RE.exec(content)
    if (!match?.[1]) break
    const normalized = normalizeAssistantWorkspacePath(match[1])
    if (normalized) paths.push(normalized)
  }
  return paths
}

const workspaceArtifactStatusRank = (line: string): number => {
  if (/\bAPPLIED\b/u.test(line)) return 2
  if (/\bSAVED\b/u.test(line)) return 1
  if (/\bGENERATED\b/u.test(line)) return 0
  return -1
}

const workspaceArtifactPromotionRank = (line: string): number => {
  if (/\bMIRRORED_GITHUB\+STORAGE\b/u.test(line)) return 4
  if (/\bMIRRORED_GITHUB\b/u.test(line)) return 3
  if (/\bMIRRORED_STORAGE\b/u.test(line)) return 2
  if (/\bLOCAL_ONLY\b/u.test(line)) return 1
  if (/\bPROMOTION_FAILED\b/u.test(line)) return 0
  return -1
}

const buildWorkspaceSourceLinkLine = (
  workspacePath: string,
  status: WorkspaceArtifactStatus = 'GENERATED',
  promotion: WorkspaceArtifactPromotion | null = null,
): string => {
  const label = workspacePath.split('/').filter(Boolean).slice(-1)[0] || 'workspace.md'
  const artifactType = classifyWorkspaceArtifactType(workspacePath)
  const qualifiers: Array<WorkspaceArtifactStatus | WorkspaceArtifactPromotion> = [status]
  if (promotion) qualifiers.push(promotion)
  return `- ${qualifiers.join(' · ')} · [Open ${artifactType} in Source Files: ${label}](${workspacePath})`
}

const workspaceSourceLinkLineRank = (line: string): number => {
  if (/\bOpen (?:USER_MODEL|TRACE|REPORT|OUTPUT|AGENTIC_OS|DOC) in Source Files:/u.test(line)) return 100 + (workspaceArtifactStatusRank(line) * 10) + workspaceArtifactPromotionRank(line)
  if (/\bOpen in Source Files:/u.test(line)) return (workspaceArtifactStatusRank(line) * 10) + workspaceArtifactPromotionRank(line)
  return -1
}

const dedupeWorkspaceSourceLinkLines = (text: string): string => {
  const lines = String(text || '').split('\n')
  const keptLines: string[] = []
  const keptIndicesByPath = new Map<string, number>()
  for (const line of lines) {
    const paths = collectWorkspaceMarkdownLinkPaths(line)
    if (!paths.length) {
      keptLines.push(line)
      continue
    }
    const path = paths[0]
    const existingIndex = keptIndicesByPath.get(path)
    if (existingIndex == null) {
      keptIndicesByPath.set(path, keptLines.length)
      keptLines.push(line)
      continue
    }
    const existingLine = keptLines[existingIndex] || ''
    if (workspaceSourceLinkLineRank(line) > workspaceSourceLinkLineRank(existingLine)) {
      keptLines[existingIndex] = line
    }
  }
  return keptLines.join('\n')
}

const canonicalizeWorkspaceSourceLinkLines = (
  text: string,
  statusByPath: ReadonlyMap<string, WorkspaceArtifactStatus>,
  promotionByPath: ReadonlyMap<string, WorkspaceArtifactPromotion>,
): string => {
  return String(text || '')
    .split('\n')
    .map(line => {
      const path = collectWorkspaceMarkdownLinkPaths(line)[0]
      if (!path) return line
      return buildWorkspaceSourceLinkLine(path, statusByPath.get(path) || 'GENERATED', promotionByPath.get(path) || null)
    })
    .join('\n')
}

const groupWorkspaceSourceLinkLines = (text: string): string => {
  const bodyLines: string[] = []
  const workspaceLinkLines: string[] = []
  for (const line of String(text || '').split('\n')) {
    if (collectWorkspaceMarkdownLinkPaths(line).length) {
      workspaceLinkLines.push(line)
      continue
    }
    bodyLines.push(line)
  }
  if (!workspaceLinkLines.length) return text
  const trimmedBody = bodyLines.join('\n').trimEnd()
  const artifactsBlock = ['Artifacts:', ...workspaceLinkLines].join('\n')
  return trimmedBody ? `${trimmedBody}\n\n${artifactsBlock}` : artifactsBlock
}

const appendDiscoveredWorkspaceSourceLinks = (
  text: string,
  candidateTexts: ReadonlyArray<unknown>,
  excludedPaths: ReadonlyArray<string> = [],
  promotionByPath: ReadonlyMap<string, WorkspaceArtifactPromotion> = new Map(),
): string => {
  const existingLinkPaths = new Set(collectWorkspaceMarkdownLinkPaths(text))
  const excluded = new Set(excludedPaths.map(normalizeAssistantWorkspacePath).filter(Boolean))
  const discovered = [...new Set(candidateTexts.flatMap(value => collectWorkspaceResultPaths(value)))]
    .filter(path => path && !existingLinkPaths.has(path) && !excluded.has(path))
    .map((path, index) => ({ path, index, priority: workspaceArtifactPriority(path) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(entry => entry.path)
  if (!discovered.length) return text
  return `${String(text || '').trimEnd()}\n${discovered.map(path => buildWorkspaceSourceLinkLine(path, 'GENERATED', promotionByPath.get(path) || null)).join('\n')}`
}

export const useFinalizeAssistantSuccess = (args: {
  chatStorageTarget: 'chatHistory' | 'chatAgenticGraph'
  chatProviderSummary: string
  chatAgenticGraphWorkspacePath: string | null
  chatHistoryWorkspacePath: string | null
  chatLocalStorageRootPath: string
  setChatAgenticGraphWorkspacePath: (path: string) => void
  setChatHistoryWorkspacePath: (path: string) => void
  followWorkspaceMarkdownPath: (path: string, options?: { forceReveal?: boolean }) => void
  pushChatExchangeLog: (payload: {
    request: string
    response: string
    status: 'ok' | 'error' | 'aborted'
    model: string | null
    tsMs: number
  }) => void
  upsertUiToast?: (toast: UiToastInput) => void
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setStreamingAssistant: React.Dispatch<React.SetStateAction<{ id: string; text: string } | null>>
  streamFollowRef: React.MutableRefObject<{ path: string; atMs: number } | null>
  streamDraftTextRef: React.MutableRefObject<{ path: string; text: string } | null>
}) => {
  return React.useCallback(async (
    payload: {
      assistantMessageId: string
      requestText: string
      modelId: string
      rawAssistantText: string
      runResult?: HeadlessResponseRunResult
      validatedAgenticOs?: string | null
      timestampMs: number
      traceId?: string
      knownAgenticGraphPath?: string | null
      status?: 'ok' | 'error'
      finalAssistantOverride?: string | null
      applyWorkspaceDocumentToCanvas?: boolean
      streamUsageSummary?: string | null
      streamFinishReason?: string | null
      streamReasoningSteps?: string[]
      rawSseEvents?: string[]
    },
  ) => {
    const { assistantMessageId, requestText, modelId, timestampMs, knownAgenticGraphPath } = payload
    const rawAssistantText = payload.runResult?.responseText ?? payload.rawAssistantText
    const status = payload.status === 'error' ? 'error' : 'ok'
    const applyWorkspaceDocumentToCanvas = payload.applyWorkspaceDocumentToCanvas !== false
    const traceId = String(payload.traceId || '').trim() || `trace-${timestampMs}-${assistantMessageId}`
    const extracted = args.chatStorageTarget === 'chatAgenticGraph'
      ? extractAgenticOsBlockFromAssistantText(rawAssistantText)
      : { answer: rawAssistantText, agenticOs: null }
    const validationFailureNote = [
      'Validation failed after retry exhaustion.',
      'Keep the leading AGENTIC_OS document canonical and inspect the chat history trail for the failed attempt context.',
    ].join(' ')

    const validatedAgenticOs = typeof payload.validatedAgenticOs === 'string' ? payload.validatedAgenticOs.trim() : ''
    const streamReasoningSteps = Array.isArray(payload.streamReasoningSteps)
      ? payload.streamReasoningSteps.filter(step => typeof step === 'string').map(step => String(step).trim()).filter(Boolean)
      : []
    const rawSseEvents = Array.isArray(payload.rawSseEvents)
      ? payload.rawSseEvents.filter(step => typeof step === 'string').map(step => String(step))
      : []
    const assistantTextForAgenticOs = status === 'error'
      ? pickBestErrorFallbackSource({
        rawAssistantText,
        extractedAnswer: extracted.answer,
        extractedAgenticOs: extracted.agenticOs,
        fallbackNote: validationFailureNote,
      })
      : (validatedAgenticOs && isAgenticOsStructuredMarkdown(validatedAgenticOs))
        ? validatedAgenticOs
        : rawAssistantText

    const storagePromotionPaths: string[] = []
    const resolvedAgenticGraphPath = await appendChatHistoryWorkspaceFile({
      storageType: 'chatAgenticGraph',
      title: 'Knowledge Graph Canvas Storage',
      traceId,
      requestedPath: knownAgenticGraphPath || args.chatAgenticGraphWorkspacePath,
      defaultLocalRootPath: args.chatLocalStorageRootPath,
      onResolvedPath: p => args.setChatAgenticGraphWorkspacePath(p),
      timestampMs,
      providerSummary: args.chatProviderSummary,
      userText: requestText,
      assistantText: assistantTextForAgenticOs,
    })
    storagePromotionPaths.push(resolvedAgenticGraphPath)

    const persistedStreamArtifacts = await persistChatStreamArtifacts({
      workspacePath: resolvedAgenticGraphPath,
      timestampMs,
      defaultLocalRootPath: args.chatLocalStorageRootPath,
      traceId,
      providerSummary: args.chatProviderSummary,
      modelId,
      requestText,
      rawAssistantText,
      workspaceAssistantText: assistantTextForAgenticOs,
      usageSummary: payload.streamUsageSummary || null,
      finishReason: payload.streamFinishReason || null,
      reasoningSteps: streamReasoningSteps,
      rawSseEvents,
      status,
    })
    storagePromotionPaths.push(...persistedStreamArtifacts.createdArtifactPaths)

    const resolvedHistoryPath = args.chatStorageTarget === 'chatHistory'
      ? await appendChatHistoryWorkspaceFile({
        storageType: 'chatHistory',
        title: 'Chat History Storage',
        traceId,
        requestedPath: args.chatHistoryWorkspacePath,
        defaultLocalRootPath: args.chatLocalStorageRootPath,
        onResolvedPath: p => args.setChatHistoryWorkspacePath(p),
        timestampMs,
        providerSummary: args.chatProviderSummary,
        userText: requestText,
        assistantText: rawAssistantText,
      })
      : null

    const agenticGraphRawPath = String(resolvedAgenticGraphPath || args.chatAgenticGraphWorkspacePath || '').trim()
    const agenticGraphPath = agenticGraphRawPath ? normalizeWorkspacePath(agenticGraphRawPath) : ''
    let canvasApplied: boolean | null = null
    let canvasApplyError: string | null = null
    try {
      if (args.chatStorageTarget === 'chatAgenticGraph' && agenticGraphPath) {
        canvasApplied = false
        if (applyWorkspaceDocumentToCanvas) {
          args.followWorkspaceMarkdownPath(agenticGraphPath, { forceReveal: true })
          canvasApplied = await applyChatAgenticOsWorkspaceDocumentToCanvas(agenticGraphPath)
        }
        publishLocalChatPipelineFinalizeSnapshot({
          stage: canvasApplied ? 'applied' : 'skipped',
          traceId,
          modelId,
          finalStatus: status,
          persistedAgenticGraphPath: agenticGraphPath,
          applied: canvasApplied,
          message: canvasApplied
            ? 'Canonical AGENTIC_OS workspace document was persisted and applied to the active canvas graph.'
            : applyWorkspaceDocumentToCanvas
              ? 'Canonical AGENTIC_OS workspace document was persisted, but graph apply was skipped by import/apply policy or returned false.'
              : 'Canonical AGENTIC_OS workspace document was persisted without replacing the active source-backed execution graph.',
          failureNote: null,
          retryHint: null,
          retryCommand: null,
        })
      } else {
        publishLocalChatPipelineFinalizeSnapshot({
          stage: args.chatStorageTarget === 'chatAgenticGraph' ? 'skipped' : 'persisted',
          traceId,
          modelId,
          finalStatus: status,
          persistedAgenticGraphPath: agenticGraphPath || null,
          applied: args.chatStorageTarget === 'chatAgenticGraph' ? false : null,
          message: args.chatStorageTarget === 'chatAgenticGraph'
            ? 'Canonical AGENTIC_OS workspace document was persisted, but no normalized agentic-graph workspace path was available for canvas apply.'
            : 'Assistant response was persisted to chat history only; canvas apply is reserved for chatAgenticGraph storage.',
          failureNote: null,
          retryHint: null,
          retryCommand: null,
        })
      }
    } catch (error: unknown) {
      canvasApplied = false
      canvasApplyError = error instanceof Error ? error.message : String(error || 'Canvas apply failed.')
      publishLocalChatPipelineFinalizeSnapshot({
        stage: 'error',
        traceId,
        modelId,
        finalStatus: status,
        persistedAgenticGraphPath: agenticGraphPath || null,
        applied: false,
        message: canvasApplyError,
        failureNote: null,
        retryHint: null,
        retryCommand: null,
      })
      if (args.chatStorageTarget === 'chatAgenticGraph') {
        try {
          await promoteGeneratedChatWorkspacePaths(storagePromotionPaths)
        } catch {
          void 0
        }
      }
      throw error
    }
    let promotionResult: PromoteGeneratedChatWorkspacePathsResult | null = null
    if (args.chatStorageTarget === 'chatAgenticGraph') {
      promotionResult = await promoteGeneratedChatWorkspacePaths(storagePromotionPaths)
    }
    const agenticGraphLabel = agenticGraphPath ? (agenticGraphPath.split('/').filter(Boolean).slice(-1)[0] || 'agenticOs.md') : ''
    const conciseSource =
      args.chatStorageTarget === 'chatAgenticGraph'
        ? (extracted.answer || 'Structured AGENTIC_OS response saved to workspace.')
        : rawAssistantText
    const concise = toConciseBulletText(conciseSource, agenticGraphPath ? 49 : 50)
    const lines = [`- ${concise}`]
    if (args.chatStorageTarget === 'chatAgenticGraph' && agenticGraphPath) {
      lines.push(buildWorkspaceSourceLinkLine(agenticGraphPath, canvasApplied ? 'APPLIED' : 'SAVED'))
    }
    const promotionFailureNote = buildWorkspacePromotionFailureNote(promotionResult)
    const promotionRetryHint = buildWorkspacePromotionRetryHint(promotionResult)
    const promotionRetryCommand = buildWorkspacePromotionRetryCommand(promotionResult)
    const promotionRetryToast = buildWorkspacePromotionRetryToast(promotionResult)
    if (args.chatStorageTarget === 'chatAgenticGraph') {
      publishLocalChatPipelineFinalizeSnapshot({
        stage: agenticGraphPath ? (canvasApplied ? 'applied' : 'skipped') : 'skipped',
        traceId,
        modelId,
        finalStatus: status,
        persistedAgenticGraphPath: agenticGraphPath || null,
        applied: agenticGraphPath ? canvasApplied : false,
        message: agenticGraphPath
          ? (
              canvasApplied
                ? 'Canonical AGENTIC_OS workspace document was persisted and applied to the active canvas graph.'
                : 'Canonical AGENTIC_OS workspace document was persisted, but graph apply was skipped by import/apply policy or returned false.'
            )
          : 'Canonical AGENTIC_OS workspace document was persisted, but no normalized agentic-graph workspace path was available for canvas apply.',
        failureNote: promotionFailureNote,
        retryHint: promotionRetryHint,
        retryCommand: promotionRetryCommand,
      })
    }
    if (promotionRetryToast) args.upsertUiToast?.(promotionRetryToast)
    if (promotionFailureNote) lines.push(promotionFailureNote)
    if (promotionRetryHint) lines.push(promotionRetryHint)
    if (promotionRetryCommand) lines.push(promotionRetryCommand)
    const baseFinalAssistantText = typeof payload.finalAssistantOverride === 'string' && payload.finalAssistantOverride.trim()
      ? payload.finalAssistantOverride
      : lines.join('\n')
    const workspaceStatusByPath = new Map<string, WorkspaceArtifactStatus>()
    const workspacePromotionByPath = new Map<string, WorkspaceArtifactPromotion>()
    if (agenticGraphPath) {
      workspaceStatusByPath.set(agenticGraphPath, canvasApplied ? 'APPLIED' : 'SAVED')
    }
    const promotion = toWorkspaceArtifactPromotion(promotionResult)
    if (promotionResult?.paths?.length && promotion) {
      for (const path of promotionResult.paths) {
        workspacePromotionByPath.set(normalizeAssistantWorkspacePath(path), promotion)
      }
    }
    const finalAssistantText = groupWorkspaceSourceLinkLines(dedupeWorkspaceSourceLinkLines(appendDiscoveredWorkspaceSourceLinks(
      canonicalizeWorkspaceSourceLinkLines(
        (promotionFailureNote || promotionRetryHint || promotionRetryCommand) && typeof payload.finalAssistantOverride === 'string' && payload.finalAssistantOverride.trim()
          ? `${baseFinalAssistantText}${promotionFailureNote ? `\n${promotionFailureNote}` : ''}${promotionRetryHint ? `\n${promotionRetryHint}` : ''}${promotionRetryCommand ? `\n${promotionRetryCommand}` : ''}`
          : baseFinalAssistantText,
        workspaceStatusByPath,
        workspacePromotionByPath,
      ),
      [rawAssistantText, payload.finalAssistantOverride, assistantTextForAgenticOs],
      [agenticGraphPath],
      workspacePromotionByPath,
    )))
    const runArtifactPath = args.chatStorageTarget === 'chatHistory'
      ? (resolvedHistoryPath ? normalizeWorkspacePath(resolvedHistoryPath) : '')
      : agenticGraphPath

    args.setMessages(prev => {
      let found = false
      const next = prev.map(m => {
        if (m.id !== assistantMessageId) return m
        found = true
        return projectHeadlessResponseRunToChatMessage({
          message: m,
          content: finalAssistantText,
          runResult: payload.runResult,
          artifactPath: runArtifactPath || null,
        })
      })
      return found ? next : [...next, projectHeadlessResponseRunToChatMessage({
        message: { id: assistantMessageId, role: 'assistant', content: '' },
        content: finalAssistantText,
        runResult: payload.runResult,
        artifactPath: runArtifactPath || null,
      })]
    })
    args.setStreamingAssistant(null)
    args.streamFollowRef.current = null
    args.streamDraftTextRef.current = null

    args.pushChatExchangeLog({
      request: requestText,
      response: finalAssistantText,
      status,
      model: modelId,
      tsMs: timestampMs,
    })
    void persistChatExchangeLog({
      request: requestText,
      response: finalAssistantText,
      status,
      model: modelId,
      timestampMs,
    })
  }, [
    args.chatHistoryWorkspacePath,
    args.chatAgenticGraphWorkspacePath,
    args.chatLocalStorageRootPath,
    args.chatProviderSummary,
    args.chatStorageTarget,
    args.followWorkspaceMarkdownPath,
    args.pushChatExchangeLog,
    args.upsertUiToast,
    args.setChatHistoryWorkspacePath,
    args.setChatAgenticGraphWorkspacePath,
    args.setMessages,
    args.setStreamingAssistant,
    args.streamDraftTextRef,
    args.streamFollowRef,
  ])
}
