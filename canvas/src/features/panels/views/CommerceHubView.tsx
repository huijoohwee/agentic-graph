import React from 'react'
import { MainPanelField, observedFieldHelp } from '../ui/MainPanelField'
import CollapsibleSection from '../ui/CollapsibleSection'
import { KeyTypeValueHeader, KeyTypeValueSectionStack } from 'grph-shared/react/keyTypeValueLayout'
import { usePanelTypography } from '@/lib/ui/panelTypography'
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



const CommerceRouteReadiness = () => (
  <section id="commerce-overview" aria-label="Commerce readiness" data-kg-commerce-readiness-key={AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey}>
    <KeyTypeValueHeader />
    <KeyTypeValueSectionStack>
      {AGENTIC_COMMERCE_MAIN_PANEL_READINESS.sections.map((section, index) => (
        <CollapsibleSection key={section.id} title={section.title} defaultCollapsed={false} flushTop={index === 0}>
          <section data-kg-commerce-readiness-section={section.id}>
            {section.rows.map(row => <MainPanelField key={row.semanticKey} label={row.label} help={observedFieldHelp('Commerce operator', row.label, 'inspect source-owned route readiness before choosing an operation')}>
              <span className="min-w-0 break-words text-right">{row.value}</span>
            </MainPanelField>)}
          </section>
        </CollapsibleSection>
      ))}
    </KeyTypeValueSectionStack>
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
  const typography = usePanelTypography()
  React.useEffect(() => {
    publishLocalCommerceReadinessSurfaceSnapshot(AGENTIC_COMMERCE_MAIN_PANEL_READINESS)
    return () => {
      clearLocalCommerceReadinessSurfaceSnapshot()
    }
  }, [])

  return (
    <>
      <nav aria-label="Commerce sections" className={`mb-2 flex flex-wrap gap-2 ${typography.panelTextClass}`}>
        <a href="#commerce-overview">Overview</a>
        <a href="#commerce-transfer">Pay / transfer</a>
        <a href="#commerce-activity">Activity</a>
        <a href="#commerce-developer">Developer</a>
      </nav>
      <CommerceRouteReadiness />
      <CommerceTransferRehearsal />
      <h2 className={`mb-2 truncate font-semibold ${UI_THEME_TOKENS.text.primary}`}>Payments</h2>
      <SettingsView
        searchQuery={searchQuery}
        requestedAnchorId={requestedAnchorId}
        requestedAnchorSeq={requestedAnchorSeq}
        mode="payments"
        onRegisterActions={onRegisterActions}
      />
      <section id="commerce-developer" aria-label="Commerce developer entry" className={`mt-3 border-t py-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}>
        <h2 className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Developer</h2>
        <p className={`mt-1 ${UI_THEME_TOKENS.text.secondary}`}>Existing read-only discovery paths; the local rehearsal adds no transfer API or tool.</p>
        <MainPanelField label="ACP discovery" type="url" help={observedFieldHelp('Developer', 'ACP discovery', 'locate the source-owned discovery endpoint')}><code className={typography.monospaceTextClass}>{AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery}</code></MainPanelField>
        <MainPanelField label="MPP OpenAPI" type="url" help={observedFieldHelp('Developer', 'MPP OpenAPI', 'locate the source-owned API contract')}><code className={typography.monospaceTextClass}>{AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi}</code></MainPanelField>
      </section>
    </>
  )
}
