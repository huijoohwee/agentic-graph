import React from 'react'
import SettingsView from '@/features/panels/views/SettingsView'
import TradingTickerFixture from './TradingTickerFixture'

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
