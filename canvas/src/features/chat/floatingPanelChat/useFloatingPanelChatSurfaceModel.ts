import React from 'react'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { SourceFile } from '@/hooks/store/types'
import { resolveWorkspaceContextCacheStatus } from '../chatPromptHelpers'
import {
  buildFloatingPanelChatSourceFilesSignature,
  buildFloatingPanelChatWorkspaceContextCacheKey,
  countEnabledChatSourceFiles,
  createFloatingPanelChatContextItems,
  createFloatingPanelChatPipelineStages,
  createFloatingPanelChatQuickActions,
  resolveChatWorkspaceLabel,
} from './floatingPanelChatSurfaceState'
import { openFloatingPanelChatWithSeed } from './floatingPanelChatOpenSeed'

type SurfaceModelArgs = {
  chatContextScope: string
  markdownDocumentName: string | null
  markdownText: string | null
  docLocationRevision: unknown
  sourceFiles: SourceFile[]
  graphData: GraphData | null
  workspaceViewMode: 'canvas' | 'editor'
  chatAgenticGraphWorkspacePath: string | null
  chatHistoryWorkspacePath: string | null
  currentNode: GraphNode | null
  messageCount: number
  isLoading: boolean
}

export const useFloatingPanelChatSurfaceModel = (args: SurfaceModelArgs) => {
  const sourceFilesSignature = React.useMemo(
    () => buildFloatingPanelChatSourceFilesSignature(args.sourceFiles),
    [args.sourceFiles],
  )
  const workspaceContextCacheKey = React.useMemo(() => buildFloatingPanelChatWorkspaceContextCacheKey({
    chatContextScope: args.chatContextScope,
    markdownDocumentName: args.markdownDocumentName,
    docLocationRevision: args.docLocationRevision,
    markdownText: args.markdownText,
    sourceFilesSignature,
  }), [args.chatContextScope, args.docLocationRevision, args.markdownDocumentName, args.markdownText, sourceFilesSignature])
  const activeWorkspaceLabel = React.useMemo(() => resolveChatWorkspaceLabel({
    markdownDocumentName: args.markdownDocumentName,
    chatAgenticGraphWorkspacePath: args.chatAgenticGraphWorkspacePath,
    chatHistoryWorkspacePath: args.chatHistoryWorkspacePath,
  }), [args.chatHistoryWorkspacePath, args.chatAgenticGraphWorkspacePath, args.markdownDocumentName])
  const workspaceContextCacheStatus = React.useMemo(
    () => resolveWorkspaceContextCacheStatus(workspaceContextCacheKey),
    [args.isLoading, args.messageCount, workspaceContextCacheKey],
  )
  const contextItems = React.useMemo(() => createFloatingPanelChatContextItems({
    chatContextScope: args.chatContextScope,
    enabledSourceFileCount: countEnabledChatSourceFiles(args.sourceFiles),
    activeWorkspaceLabel,
    currentNode: args.currentNode,
    messageCount: args.messageCount,
    workspaceContextCacheStatus,
  }), [activeWorkspaceLabel, args.chatContextScope, args.currentNode, args.messageCount, args.sourceFiles, workspaceContextCacheStatus])
  const quickActions = React.useMemo(
    () => createFloatingPanelChatQuickActions({
      activeWorkspaceLabel,
      currentNode: args.currentNode,
      sourceFiles: args.sourceFiles,
      graphData: args.graphData,
      messageCount: args.messageCount,
    }),
    [activeWorkspaceLabel, args.currentNode, args.graphData, args.messageCount, args.sourceFiles],
  )
  const pipelineStages = React.useMemo(() => createFloatingPanelChatPipelineStages({
    sourceFiles: args.sourceFiles,
    graphData: args.graphData,
    workspaceViewMode: args.workspaceViewMode,
  }), [args.graphData, args.sourceFiles, args.workspaceViewMode])
  const appendPrompt = React.useCallback((prompt: string) => {
    const text = String(prompt || '')
    if (!text) return
    openFloatingPanelChatWithSeed({ text, mode: 'append', delivery: 'appendEvent' })
  }, [])

  return { appendPrompt, contextItems, pipelineStages, quickActions, workspaceContextCacheKey }
}
