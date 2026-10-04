import type { GraphState } from '@/hooks/store/types'

type HistoryEntry = GraphState['history'][number]

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
