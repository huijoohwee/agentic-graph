import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphState } from '@/hooks/store/types'
import {
  isActiveMarkdownSourceFile,
  writeActiveMarkdownDocumentTextIfPresent,
  writeWorkspaceSourceTextIfPresent,
} from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { readYamlFrontmatterMermaidCode } from '@/lib/markdown/frontmatter'
import {
  readFrontmatterMermaidDiagramCodes,
  readYamlFrontmatterMermaidDiagramCodes,
} from '@/lib/mermaid/mermaidDiagramCode'
import { readFrontmatterMermaidCode } from '@/lib/mermaid/mermaidFrontmatterCode'
import { resolveMermaidGitGraphCode } from '@/lib/mermaid/mermaidGitGraph'
import {
  parseMermaidGitGraphModel,
  replaceMermaidGitGraphCodeInMarkdown,
} from '@/lib/mermaid/mermaidGitGraphEdit'

const normalizeGitGraphDocumentPath = (value: unknown): string => {
  return String(value || '').trim().replace(/^\/+/, '')
}

const readGitGraphSourceFilePath = (file: { source?: { path?: string }; name?: string } | null | undefined): string => {
  return normalizeGitGraphDocumentPath(file?.source?.path || file?.name || '')
}

const findGitGraphSourceFileIndex = (
  state: GraphState,
  sourceFiles: GraphState['sourceFiles'],
  previousText: string,
): number => {
  const activeIndex = sourceFiles.findIndex(file => isActiveMarkdownSourceFile(state, file))
  if (activeIndex >= 0) return activeIndex
  const documentPath = normalizeGitGraphDocumentPath(state.markdownDocumentName)
  if (documentPath) {
    const pathIndex = sourceFiles.findIndex(file => readGitGraphSourceFilePath(file) === documentPath)
    if (pathIndex >= 0) return pathIndex
  }
  const flaggedIndex = sourceFiles.findIndex(file => (file as { active?: unknown } | null | undefined)?.active === true)
  if (flaggedIndex >= 0) return flaggedIndex
  if (previousText.trim()) {
    return sourceFiles.findIndex(file => String(file?.text || '') === previousText)
  }
  return -1
}

export function useMermaidGitGraphDocument() {
  const graphData = useActiveGraphRenderData(true)
  const { graphDataRevision, markdownDocumentText, themeMode } = useGraphStore(
    useShallow(state => ({
      graphDataRevision: state.graphDataRevision,
      markdownDocumentText: state.markdownDocumentText,
      themeMode: (state.resolvedThemeMode || 'light') as 'light' | 'dark',
    })),
  )
  const code = React.useMemo(
    () =>
      resolveMermaidGitGraphCode([
        ...readYamlFrontmatterMermaidDiagramCodes(markdownDocumentText || '', 'gitgraph'),
        readYamlFrontmatterMermaidCode(markdownDocumentText || ''),
        ...readFrontmatterMermaidDiagramCodes(graphData, 'gitgraph'),
        readFrontmatterMermaidCode(graphData),
      ]),
    [graphData, markdownDocumentText],
  )
  const gitGraphModel = React.useMemo(() => parseMermaidGitGraphModel(code), [code])
  const commitGitGraphCode = React.useCallback((nextCode: string, actionLabel: string): boolean => {
    const store = useGraphStore.getState()
    const currentText = String(store.markdownDocumentText || '')
    const nextText = replaceMermaidGitGraphCodeInMarkdown(currentText, nextCode)
    if (nextText === currentText) return false
    store.addHistory(`Before GitGraph ${actionLabel}`)
    const documentName = store.markdownDocumentName
    const sourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
    const matchedSourceFileIndex = findGitGraphSourceFileIndex(store, sourceFiles, currentText)
    store.setMarkdownDocument(documentName, nextText, {
      autoEnableFrontmatter: true,
      applyViewPreset: false,
    })
    const stateAfterDocumentUpdate = useGraphStore.getState()
    const latestSourceFiles = Array.isArray(stateAfterDocumentUpdate.sourceFiles) ? stateAfterDocumentUpdate.sourceFiles : []
    const effectiveSourceFileIndex = matchedSourceFileIndex >= 0
      ? matchedSourceFileIndex
      : findGitGraphSourceFileIndex(stateAfterDocumentUpdate, latestSourceFiles, currentText)
    const matchedSourceFile = effectiveSourceFileIndex >= 0 ? latestSourceFiles[effectiveSourceFileIndex] : null
    const nextSourceFiles = matchedSourceFile
      ? latestSourceFiles.map((file, index) => index === effectiveSourceFileIndex
        ? {
            ...file,
            text: nextText,
            parsedTextHash: '',
          }
        : file)
      : latestSourceFiles
    const nextMatchedSourceFile = matchedSourceFile ? nextSourceFiles[effectiveSourceFileIndex] : null
    useGraphStore.setState(state => ({
      ...(nextMatchedSourceFile ? { sourceFiles: nextSourceFiles } : {}),
      graphContentRevision: (state.graphContentRevision || 0) + 1,
      docLocationRevision: (state.docLocationRevision || 0) + 1,
    }))
    if (nextMatchedSourceFile) {
      writeWorkspaceSourceTextIfPresent(nextMatchedSourceFile, nextText, `GitGraph ${actionLabel}`, 'gitGraph')
    } else {
      writeActiveMarkdownDocumentTextIfPresent({
        state: stateAfterDocumentUpdate,
        sourceFiles: latestSourceFiles,
        text: nextText,
        label: `GitGraph ${actionLabel}`,
        source: 'gitGraph',
      })
    }
    useGraphStore.getState().scheduleHistory(`GitGraph ${actionLabel}`)
    return true
  }, [])

  return {
    code,
    commitGitGraphCode,
    gitGraphModel,
    graphData,
    graphDataRevision,
    themeMode,
  }
}
