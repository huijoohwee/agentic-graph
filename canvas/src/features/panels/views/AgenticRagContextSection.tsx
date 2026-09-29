import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from '@/features/panels/ui/Tooltip'
import { ORCHESTRATOR_AGENTIC_COPY, RENDER_PANEL_SECTION_COPY } from '@/features/panels/config'
import { AGENTIC_RAG_CONTEXT_URL } from '@/lib/agenticrag'
import {
  AGENTIC_RAG_CONTEXT_AND_IGNORE_FILTERS_LABEL,
  AGENTIC_RAG_CONTEXT_LABEL,
  IGNORE_CODEBASE_PATHS_LABEL,
} from '@/lib/config'
import {
  getAgenticRagContextComparison,
  getAgenticRagIgnoreFiltersSummary,
  type AgenticRagIgnoreFiltersSummary,
} from '@/lib/graph/jsonld/index'
import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getPillClass } from '@/lib/ui/icons'
import { UI_RESPONSIVE_BADGE_CHIP_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface AgenticRagContextSectionProps {
  collapsed: boolean
  onToggle: (next: boolean) => void
  graphData: GraphData | null
}

export default function AgenticRagContextSection({
  collapsed,
  onToggle,
  graphData,
}: AgenticRagContextSectionProps) {
  const agenticContext = React.useMemo(
    () => getAgenticRagContextComparison(graphData),
    [graphData],
  )
  const ignoreFilters = React.useMemo(
    () => getAgenticRagIgnoreFiltersSummary(graphData),
    [graphData],
  )

  return (
    <CollapsibleSection
      title={(
        <Tooltip
          content={ORCHESTRATOR_AGENTIC_COPY.contextSectionTooltip}
          maxWidthPx={260}
          contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
        >
          <span className="inline-flex items-center gap-1">
            <span>{AGENTIC_RAG_CONTEXT_AND_IGNORE_FILTERS_LABEL}</span>
          </span>
        </Tooltip>
      )}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <AgenticContextSummary agenticContext={agenticContext} />
      <AgenticRagIgnoreFiltersSummaryView
        ignoreFilters={ignoreFilters}
        className="mb-1"
      />
    </CollapsibleSection>
  )
}

interface AgenticContextSummaryProps {
  agenticContext: ReturnType<typeof getAgenticRagContextComparison> | null
}

function AgenticContextSummary({ agenticContext }: AgenticContextSummaryProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  return (
    <section
      className={[
        `mt-2 mb-1 ${UI_THEME_TOKENS.text.tertiary}`,
        uiPanelKeyValueTextSizeClass,
        uiPanelTextFontClass,
      ].join(' ')}
    >
      {AGENTIC_RAG_CONTEXT_LABEL}
      {' '}
      {agenticContext && agenticContext.graphContextUrl ? (
        <>
          <span className={`${uiPanelMonospaceTextClass} break-all`}>
            {agenticContext.graphContextUrl}
          </span>
          {agenticContext.isCanonicalMatch === true && ' (matches)'}
          {agenticContext.isCanonicalMatch === false && ' (differs)'}
        </>
      ) : (
        <span className={`${uiPanelMonospaceTextClass} break-all`}>
          {AGENTIC_RAG_CONTEXT_URL}
        </span>
      )}
    </section>
  )
}

export type AgenticRagIgnoreFiltersSummaryVariant = 'summary' | 'debug'

export interface AgenticRagIgnoreFiltersSummaryViewProps {
  ignoreFilters: AgenticRagIgnoreFiltersSummary | null
  className?: string
  variant?: AgenticRagIgnoreFiltersSummaryVariant
}

export function AgenticRagIgnoreFiltersSummaryView({
  ignoreFilters,
  className,
  variant,
}: AgenticRagIgnoreFiltersSummaryViewProps) {
  const uiIconPillBadgeTextSizeClass = useGraphStore(s => s.uiIconPillBadgeTextSizeClass)
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  if (!ignoreFilters) return null
  const mode: AgenticRagIgnoreFiltersSummaryVariant = variant ?? 'summary'
  const containerClassName = className
    ? [
        className,
        UI_THEME_TOKENS.text.tertiary,
        uiPanelKeyValueTextSizeClass,
        uiPanelTextFontClass,
      ].join(' ')
    : [
        UI_THEME_TOKENS.text.tertiary,
        uiPanelKeyValueTextSizeClass,
        uiPanelTextFontClass,
      ].join(' ')
  const baseBadgeLabel = RENDER_PANEL_SECTION_COPY.codebaseIndexPipeline.badge
  const badgeLabel = mode === 'debug' ? `${baseBadgeLabel} debug` : baseBadgeLabel
  const rawText = ignoreFilters.rawPatterns.join(', ') || 'none'
  const resolvedText = ignoreFilters.resolvedPatterns.join(', ') || 'none'

  return (
    <section className={containerClassName}>
      <span
        className={getPillClass('badge', {
          baseClass:
            `inline-flex items-center ${UI_RESPONSIVE_BADGE_CHIP_CLASSNAME} mr-1 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg}`,
          badgeTextSizeClass: uiIconPillBadgeTextSizeClass,
          textColorClass: UI_THEME_TOKENS.text.secondary,
        })}
      >
        {badgeLabel}
      </span>
      {IGNORE_CODEBASE_PATHS_LABEL}
      {': '}
      <span className={`${uiPanelMonospaceTextClass} break-all`}>
        {rawText}
      </span>
      {' '}
      →
      {' '}
      <span className={`${uiPanelMonospaceTextClass} break-all`}>
        {resolvedText}
      </span>
    </section>
  )
}
