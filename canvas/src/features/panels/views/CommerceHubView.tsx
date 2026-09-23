import React from 'react'
import SettingsView from '@/features/panels/views/SettingsView'
import { CommerceTransferRehearsal } from './CommerceTransferRehearsal'
import { AGENTIC_COMMERCE_MAIN_PANEL_READINESS, AGENTIC_COMMERCE_ROUTE_PATHS } from 'grph-shared/payments/agenticCommerceSsot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  clearLocalCommerceReadinessSurfaceSnapshot,
  publishLocalCommerceReadinessSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'

type CommerceHubActions = {
  apply: () => void
  reset: () => void
  globalReset?: () => void
  collapseAll?: () => void
  expandAll?: () => void
  allCollapsed?: boolean
}

export const COMMERCE_ROUTE_READINESS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'

export const COMMERCE_ROUTE_READINESS_ROW_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-[minmax(5rem,0.35fr)_minmax(0,1fr)] sm:gap-2'

const CommerceRouteReadiness = () => (
  <section
    id="commerce-overview"
    className="mb-3 min-w-0"
    aria-label="Commerce readiness"
    data-kg-commerce-readiness-key={AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey}
  >
    <section className={COMMERCE_ROUTE_READINESS_GRID_CLASS_NAME}>
      {AGENTIC_COMMERCE_MAIN_PANEL_READINESS.sections.map(section => (
        <section
          key={section.id}
          className={`min-w-0 border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} rounded p-2`}
          data-kg-commerce-readiness-section={section.id}
        >
          <h3 className={`truncate text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>{section.title}</h3>
          <dl className="mt-2 space-y-1">
            {section.rows.map(row => (
              <section
                key={row.semanticKey}
                className={COMMERCE_ROUTE_READINESS_ROW_GRID_CLASS_NAME}
              >
                <dt className={`truncate text-[11px] ${UI_THEME_TOKENS.text.tertiary}`}>{row.label}</dt>
                <dd className={`min-w-0 truncate text-right font-mono text-[11px] ${UI_THEME_TOKENS.text.secondary}`}>{row.value}</dd>
              </section>
            ))}
          </dl>
        </section>
      ))}
    </section>
  </section>
)

export default function CommerceHubView({
  searchQuery = '',
  requestedAnchorId,
  requestedAnchorSeq,
  onRegisterActions,
}: {
  searchQuery?: string
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  onRegisterActions?: (a: CommerceHubActions) => void
}) {
  React.useEffect(() => {
    publishLocalCommerceReadinessSurfaceSnapshot(AGENTIC_COMMERCE_MAIN_PANEL_READINESS)
    return () => {
      clearLocalCommerceReadinessSurfaceSnapshot()
    }
  }, [])

  return (
    <>
      <nav aria-label="Commerce sections" className="mb-3 flex flex-wrap gap-2 text-xs">
        <a href="#commerce-overview">Overview</a>
        <a href="#commerce-transfer">Pay / transfer</a>
        <a href="#commerce-activity">Activity</a>
        <a href="#commerce-developer">Developer</a>
      </nav>
      <CommerceRouteReadiness />
      <CommerceTransferRehearsal />
      <h2 className={`mb-2 truncate text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>Payments</h2>
      <SettingsView
        searchQuery={searchQuery}
        requestedAnchorId={requestedAnchorId}
        requestedAnchorSeq={requestedAnchorSeq}
        mode="payments"
        onRegisterActions={onRegisterActions}
      />
      <section id="commerce-developer" aria-label="Commerce developer entry" className={`mt-3 rounded border p-3 text-xs ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
        <h2 className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Developer</h2>
        <p className={`mt-1 ${UI_THEME_TOKENS.text.secondary}`}>Existing read-only discovery paths; the local rehearsal adds no transfer API or tool.</p>
        <dl className="mt-2 space-y-1">
          <div><dt className={UI_THEME_TOKENS.text.tertiary}>ACP discovery</dt><dd className={`break-all font-mono ${UI_THEME_TOKENS.text.secondary}`}>{AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery}</dd></div>
          <div><dt className={UI_THEME_TOKENS.text.tertiary}>MPP OpenAPI</dt><dd className={`break-all font-mono ${UI_THEME_TOKENS.text.secondary}`}>{AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi}</dd></div>
        </dl>
      </section>
    </>
  )
}
