import React from 'react'
import { formatTimestamp } from '@/features/panels/utils/time'
import { InteractiveMermaidDiagram, type InteractiveMermaidSelectionRow } from '@/lib/diagram/InteractiveMermaidDiagram'
import {
  UI_RESPONSIVE_COMPACT_DOCUMENT_VERSION_GITGRAPH_VIEWPORT_CLASSNAME,
  UI_RESPONSIVE_DOCUMENT_VERSION_GITGRAPH_SURFACE_CLASSNAME,
  UI_RESPONSIVE_DOCUMENT_VERSION_GITGRAPH_VIEWPORT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  buildDocumentVersionGitGraphRows,
  buildDocumentVersionPathSummaries,
  buildDocumentVersionReviewModel,
  buildDocumentVersionsGitGraphCode,
  normalizeDocumentVersionPath,
  type DocumentVersionEntry,
  type DocumentVersionGitGraphRow,
} from './documentVersioning'
import { useDocumentVersionRecords } from './useDocumentVersions'

const formatGitGraphRowLabel = (row: DocumentVersionGitGraphRow): string => {
  const sourceLabel = String(row.entry.label || row.entry.source || 'Saved').trim()
  return sourceLabel ? `v${row.versionNumber} ${sourceLabel}` : `v${row.versionNumber}`
}

const normalizeDocumentVersionDiagramLabel = (value: string | null | undefined): string => {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const readDocumentVersionDiagramLabels = (row: DocumentVersionGitGraphRow | null | undefined): string[] => {
  if (!row) return []
  return [
    row.graphId,
    row.tag,
    row.entry.label,
    row.entry.source,
    `v${row.versionNumber}`,
    formatGitGraphRowLabel(row),
  ].map(label => String(label || '').trim()).filter(Boolean)
}

const documentVersionDiagramLabelMatchesRow = (
  label: string,
  row: DocumentVersionGitGraphRow,
): boolean => {
  const normalizedLabel = normalizeDocumentVersionDiagramLabel(label)
  if (!normalizedLabel) return false
  return readDocumentVersionDiagramLabels(row).some(candidate => {
    const normalizedCandidate = normalizeDocumentVersionDiagramLabel(candidate)
    if (!normalizedCandidate) return false
    return normalizedLabel === normalizedCandidate || normalizedLabel.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedLabel)
  })
}

export function DocumentVersionGitGraphPanel({
  activePath,
  className = '',
  compact = false,
  emptyLabel = 'No document versions.',
  fallbackToLatest = true,
  themeMode,
}: {
  activePath?: string | null
  className?: string
  compact?: boolean
  emptyLabel?: string
  fallbackToLatest?: boolean
  themeMode: 'light' | 'dark'
}) {
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const documentVersionSnapshot = useDocumentVersionRecords()
  const summaries = React.useMemo(
    () => buildDocumentVersionPathSummaries(documentVersionSnapshot.entries),
    [documentVersionSnapshot.entries],
  )
  const normalizedActivePath = React.useMemo(() => normalizeDocumentVersionPath(activePath), [activePath])
  const selectedPath = React.useMemo(() => {
    if (normalizedActivePath && summaries.some(row => row.path === normalizedActivePath)) return normalizedActivePath
    return fallbackToLatest ? summaries[0]?.path || '' : normalizedActivePath
  }, [fallbackToLatest, normalizedActivePath, summaries])
  const selectedVersions = React.useMemo(
    () => documentVersionSnapshot.entries
      .filter((entry): entry is DocumentVersionEntry => !!entry && entry.path === selectedPath)
      .sort((a, b) => a.timestamp - b.timestamp),
    [documentVersionSnapshot.entries, selectedPath],
  )
  const selectedSummary = summaries.find(row => row.path === selectedPath) || null
  const gitGraphCode = React.useMemo(() => buildDocumentVersionsGitGraphCode(selectedVersions), [selectedVersions])
  const gitGraphRows = React.useMemo(() => buildDocumentVersionGitGraphRows(selectedVersions), [selectedVersions])

  React.useEffect(() => {
    setSelectedVersionId(current => {
      if (current && selectedVersions.some(entry => entry.id === current)) return current
      return selectedVersions[selectedVersions.length - 1]?.id || null
    })
  }, [selectedVersions])

  const selectedVersionIndex = React.useMemo(() => {
    const index = selectedVersions.findIndex(entry => entry.id === selectedVersionId)
    return index >= 0 ? index : selectedVersions.length - 1
  }, [selectedVersionId, selectedVersions])
  const selectedVersion = selectedVersionIndex >= 0 ? selectedVersions[selectedVersionIndex] || null : null
  const selectedPreviousVersion = selectedVersionIndex > 0 ? selectedVersions[selectedVersionIndex - 1] || null : null
  const selectedReview = React.useMemo(
    () => buildDocumentVersionReviewModel(selectedPreviousVersion, selectedVersion),
    [selectedPreviousVersion, selectedVersion],
  )
  const selectedRow = React.useMemo(() => {
    if (!selectedVersion) return null
    return gitGraphRows.find(row => row.entry.id === selectedVersion.id) || null
  }, [gitGraphRows, selectedVersion])
  const selectedDiagramLabels = React.useMemo(() => readDocumentVersionDiagramLabels(selectedRow), [selectedRow])
  const selectionRows = React.useMemo<InteractiveMermaidSelectionRow[]>(() => {
    return gitGraphRows.map(row => ({
      key: row.entry.id,
      labels: readDocumentVersionDiagramLabels(row),
      kind: 'document-version',
      lineNumber: row.versionNumber,
    }))
  }, [gitGraphRows])
  const selectedPatchText = selectedReview?.diff.patch || 'No text changes.'

  const handleSelectedVersionRowKeyChange = React.useCallback((rowKey: string | null) => {
    const nextId = String(rowKey || '').trim()
    if (nextId && gitGraphRows.some(row => row.entry.id === nextId)) {
      setSelectedVersionId(nextId)
      return
    }
    if (!nextId) setSelectedVersionId(null)
  }, [gitGraphRows])
  const handleSvgSelectedLabelChange = React.useCallback((label: string) => {
    const row = gitGraphRows.find(candidate => documentVersionDiagramLabelMatchesRow(label, candidate)) || null
    if (row) setSelectedVersionId(row.entry.id)
  }, [gitGraphRows])

  if (!selectedVersions.length || !selectedSummary) {
    return (
      <section
        className={`min-w-0 rounded px-3 py-2 text-xs ${UI_THEME_TOKENS.border.outline} ${UI_THEME_TOKENS.text.tertiary} ${className}`.trim()}
        data-kg-document-version-gitgraph-panel="1"
        data-kg-document-version-gitgraph-empty="1"
      >
        {emptyLabel}
      </section>
    )
  }

  return (
    <section
      className={`flex h-full max-h-full min-h-0 min-w-0 flex-col overflow-hidden rounded ${UI_THEME_TOKENS.border.outline} ${className}`.trim()}
      data-kg-document-version-gitgraph-panel="1"
      data-kg-document-version-gitgraph-path={selectedPath}
      data-kg-document-version-gitgraph-selected-version={selectedVersion?.id || ''}
    >
      <header className={`flex shrink-0 min-w-0 items-center gap-2 border-b px-3 text-xs ${UI_THEME_TOKENS.control.height} ${UI_THEME_TOKENS.panel.divider}`}>
        <span className={`font-medium ${UI_THEME_TOKENS.text.primary}`}>Version Graph</span>
        <span className={`min-w-0 flex-1 truncate ${UI_THEME_TOKENS.text.secondary}`} title={selectedPath}>{selectedPath}</span>
        <span className={UI_THEME_TOKENS.text.tertiary}>{`v${selectedSummary.count}`}</span>
        <time className={`min-w-0 truncate ${UI_THEME_TOKENS.text.tertiary}`} title={formatTimestamp(selectedSummary.latest.timestamp)}>{formatTimestamp(selectedSummary.latest.timestamp)}</time>
      </header>
      <section
        className={compact ? UI_RESPONSIVE_COMPACT_DOCUMENT_VERSION_GITGRAPH_VIEWPORT_CLASSNAME : UI_RESPONSIVE_DOCUMENT_VERSION_GITGRAPH_VIEWPORT_CLASSNAME}
        data-kg-document-version-gitgraph-viewport="1"
      >
        <section
          className={UI_RESPONSIVE_DOCUMENT_VERSION_GITGRAPH_SURFACE_CLASSNAME}
          role="group"
          aria-label="Document version graph"
          data-kg-document-version-gitgraph-surface="1"
          data-kg-document-version-gitgraph-direct-selection="1"
        >
          <InteractiveMermaidDiagram
            code={gitGraphCode}
            ariaLabel="Document version graph"
            rootThemeMode={themeMode}
            svgSurfaceKey="document-version-graph"
            selectedLabels={selectedDiagramLabels}
            selectionRows={selectionRows}
            selectedRowKey={selectedVersion?.id || ''}
            dimUnselected={!!selectedRow}
            onSelectedLabelChange={handleSvgSelectedLabelChange}
            onSelectedRowKeyChange={handleSelectedVersionRowKeyChange}
          />
        </section>
      </section>
      {selectedReview && selectedVersion ? (
        <section
          className={`min-h-0 min-w-0 flex-1 overflow-auto border-t ${UI_THEME_TOKENS.panel.divider}`}
          data-kg-document-version-gitgraph-selected-review="1"
          data-kg-document-version-gitgraph-selected-review-version={selectedVersion.id}
        >
          <header className={`sticky top-0 z-10 flex min-w-0 items-center gap-2 px-3 text-xs ${UI_THEME_TOKENS.control.height} ${UI_THEME_TOKENS.panel.bg}`}>
            <span className={`font-medium ${UI_THEME_TOKENS.text.primary}`}>
              {selectedRow ? `v${selectedRow.versionNumber}` : 'Selected'}
            </span>
            <span className={selectedReview.diff.changed ? 'text-emerald-700 dark:text-emerald-300' : UI_THEME_TOKENS.text.tertiary}>
              {selectedReview.summary}
            </span>
            <span className={`min-w-0 flex-1 truncate ${UI_THEME_TOKENS.text.secondary}`} title={selectedVersion.label}>
              {selectedVersion.label}
            </span>
            <time className={`min-w-0 truncate ${UI_THEME_TOKENS.text.tertiary}`} title={formatTimestamp(selectedVersion.timestamp)}>{formatTimestamp(selectedVersion.timestamp)}</time>
          </header>
          <pre className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-3 pb-2 font-mono text-xs leading-4 ${UI_THEME_TOKENS.text.primary}`}>
            {selectedPatchText}
          </pre>
        </section>
      ) : null}
    </section>
  )
}
