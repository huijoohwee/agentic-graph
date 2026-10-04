import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readYamlFrontmatterMermaidCode } from '@/lib/markdown/frontmatter'
import {
  parseMermaidDiagramCodeModel,
  readFrontmatterMermaidDiagramCodes,
  readYamlFrontmatterMermaidDiagramCodes,
} from '@/lib/mermaid/mermaidDiagramCode'
import { readFrontmatterMermaidCode } from '@/lib/mermaid/mermaidFrontmatterCode'
import { resolveMermaidGanttCode } from '@/lib/mermaid/mermaidGitGraph'
import {
  filterVideoSequenceMediaEditorGanttCode,
  filterVideoSequenceWorkflowGanttCode,
} from '@/components/timeline/videoSequenceTimeline'
import { readStrybldrWorkflowGanttCodesFromMarkdown } from '@/features/strybldr/strybldrStoryboard'

export type MermaidGanttDocumentPurpose = 'any' | 'media' | 'workflow'

const resolveGanttCandidatesForPurpose = (
  candidates: readonly string[],
  purpose: MermaidGanttDocumentPurpose,
): readonly string[] => {
  if (purpose === 'any') return candidates
  if (purpose === 'media') {
    return candidates
      .map(filterVideoSequenceMediaEditorGanttCode)
      .filter((code): code is string => !!code)
  }
  return candidates
    .map(filterVideoSequenceWorkflowGanttCode)
    .filter((code): code is string => !!code)
}

export function useMermaidGanttDocument({
  purpose = 'any',
}: {
  purpose?: MermaidGanttDocumentPurpose
} = {}) {
  const graphData = useActiveGraphRenderData(true)
  const { graphDataRevision, markdownDocumentText, themeMode } = useGraphStore(
    useShallow(state => ({
      graphDataRevision: state.graphDataRevision,
      markdownDocumentText: state.markdownDocumentText,
      themeMode: (state.resolvedThemeMode || 'light') as 'light' | 'dark',
    })),
  )
  const code = React.useMemo(
    () => {
      const strybldrWorkflowGanttCodes = purpose === 'media'
        ? []
        : readStrybldrWorkflowGanttCodesFromMarkdown(markdownDocumentText || '')
      const candidates = [
        ...strybldrWorkflowGanttCodes,
        ...readYamlFrontmatterMermaidDiagramCodes(markdownDocumentText || '', 'gantt'),
        readYamlFrontmatterMermaidCode(markdownDocumentText || ''),
        ...readFrontmatterMermaidDiagramCodes(graphData, 'gantt'),
        readFrontmatterMermaidCode(graphData),
      ]
      return resolveMermaidGanttCode(resolveGanttCandidatesForPurpose(candidates, purpose))
    },
    [graphData, markdownDocumentText, purpose],
  )
  const ganttModel = React.useMemo(() => parseMermaidDiagramCodeModel(code, 'gantt'), [code])

  return {
    code,
    ganttModel,
    graphData,
    graphDataRevision,
    themeMode,
  }
}
