import React from 'react'
import SettingsView from '@/features/panels/views/SettingsView'
import SiteSelectionWidget from '@/features/maps/SiteSelectionWidget'

export default function MapsHubView({
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
    <section className="flex flex-col min-h-full" aria-label="Maps">
      <section className="sr-only" aria-label="GrabMaps backend guidance">
        <p>Style loading uses Bearer auth against https://maps.grab.com/api/style.json.</p>
        <p>Directions default to lng,lat coordinate order unless lat_first is enabled.</p>
        <p>Use overview=full when you need route geometry suitable for animation or media prompts.</p>
      </section>
      <SiteSelectionWidget />
      <SettingsView
        searchQuery={searchQuery}
        requestedAnchorId={requestedAnchorId}
        requestedAnchorSeq={requestedAnchorSeq}
        mode="maps"
        onRegisterActions={onRegisterActions}
      />
    </section>
  )
}
