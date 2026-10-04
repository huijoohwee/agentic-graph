import type { GraphState } from '@/hooks/store/types'
import { normalizeComposedSourcePath } from '@/features/source-files/composedSourceSelection'

type HistoryEntry = GraphState['history'][number]

// Keep owner indexes: a document's versions can be interleaved in shared history.
export const selectDocumentVersionHistory = (
  history: readonly HistoryEntry[],
  documentName: string | null | undefined,
): { entry: HistoryEntry; index: number }[] => {
  const path = normalizeComposedSourcePath(documentName)
  return history.flatMap((entry, index) => {
    const entryPath = normalizeComposedSourcePath(entry.markdownDocumentName)
    return !path || entryPath === path ? [{ entry, index }] : []
  })
}

const escapeMermaidLabel = (value: unknown): string => String(value || '')
  .replace(/["\r\n]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const buildVersionHistoryGitGraphCode = (history: readonly HistoryEntry[]): string => {
  if (!history.length) return ''
  return [
    'gitGraph',
    ...history.map((entry, index) => {
      const label = escapeMermaidLabel(entry.label) || `Version ${index + 1}`
      return `  commit id:"version_${index + 1}" tag:"${label}"`
    }),
  ].join('\n')
}

export const readVersionHistoryIndexFromCommitId = (commitId: string | null | undefined): number => {
  const match = /^version_(\d+)$/.exec(String(commitId || '').trim())
  if (!match) return -1
  const oneBasedIndex = Number(match[1])
  return Number.isSafeInteger(oneBasedIndex) && oneBasedIndex > 0 ? oneBasedIndex - 1 : -1
}
