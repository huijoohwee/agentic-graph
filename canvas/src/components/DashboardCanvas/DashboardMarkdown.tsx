import React from 'react'
import { replaceMarkdownLineRange } from 'grph-shared/markdown/lineEditing'
import { DASHBOARD_WIDGETS_PATH } from './dashboardWidgetToolContract.mjs'
const MarkdownPreview = React.lazy(() => import('@/features/markdown/ui/MarkdownPreview'))
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import type { DashboardCard } from './dashboardModel'

export function dashboardTableMarkdown(card: DashboardCard) {
  return serializeMarkdownPipeTable({ columns: ['Label', 'Value', 'Details'],
    rows: card.rows.map(row => [row.label, row.value, row.detail ?? '']) }).join('\n')
}
export function DashboardMarkdown({ text, label = 'Widget Markdown', onChange }: { text: string; label?: string; onChange?: (next: string) => void }) {
  return <section aria-label={label} className="min-w-0 text-sm"><React.Suspense fallback={<span>{text}</span>}>
    <MarkdownPreview markdownText={text} activeDocumentPath={DASHBOARD_WIDGETS_PATH} markdownTokenStoreSync={false}
      onReplaceLineRange={onChange ? range => { const next = replaceMarkdownLineRange({ markdownText: text, ...range }); if (next !== text) onChange(next) } : undefined}
      highlightedLineRange={null} markdownWordWrap markdownPresentationMode={false} markdownTextHighlight={false}
      uiPanelTextFontClass="font-sans" uiPanelMonospaceTextClass="font-mono text-xs" previewOverlayScope="container"
      previewOverlayPortalTarget={null} previewScrollable={false} showSidebar={false} markdownViewerWidthMode="wide"
      contentClassName="w-full max-w-none mx-0 min-w-0 px-0" markdownCardPreviewMode={!onChange} markdownForcePlainTables />
  </React.Suspense></section>
}
