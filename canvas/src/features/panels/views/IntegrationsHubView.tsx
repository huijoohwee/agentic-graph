import React from 'react'
import SettingsView from '@/features/panels/views/SettingsView'
import TradingTickerFixture from './TradingTickerFixture'
import TradingCalendarFixture from './TradingCalendarFixture'
import TradingProviderCoverage from './TradingProviderCoverage'

export default function IntegrationsHubView({
  searchQuery = '',
  requestedAnchorId,
  requestedAnchorSeq,
  onRegisterActions,
}: {
  searchQuery?: string
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  onRegisterActions?: (a: {
    apply: () => void
    reset: () => void
    globalReset?: () => void
    collapseAll?: () => void
    expandAll?: () => void
    allCollapsed?: boolean
  }) => void
}) {
  return (
    <>
      {(!searchQuery.trim() || 'trading ticker fixture synthetic quote read.ticker receipt moomoo'.includes(searchQuery.trim().toLowerCase())) && <TradingTickerFixture />}
      {(!searchQuery.trim() || 'trading ticker provider signed quote read.ticker receipt moomoo'.includes(searchQuery.trim().toLowerCase())) && <TradingTickerFixture provider />}
      {(!searchQuery.trim() || 'trading earnings calendar fixture read.calendar rest receipt moomoo'.includes(searchQuery.trim().toLowerCase())) && <TradingCalendarFixture />}
      {(!searchQuery.trim() || 'moomoo openapi coverage feature families earnings calendar rest mcp integration'.includes(searchQuery.trim().toLowerCase())) && <TradingProviderCoverage />}
      <SettingsView
        searchQuery={searchQuery}
        requestedAnchorId={requestedAnchorId}
        requestedAnchorSeq={requestedAnchorSeq}
        mode="integrations"
        onRegisterActions={onRegisterActions}
      />
    </>
  )
}
