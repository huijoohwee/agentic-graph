import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import LocalPoiDirectory from '@/features/maps/LocalPoiDirectory'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export default function NearbyPlacesPanel({ onSelectMapFeature, selectedMapFeatureId, selectionSource }: {
  onSelectMapFeature?: (featureId: string) => boolean | Promise<boolean>
  selectedMapFeatureId?: string | null
  selectionSource?: string | null
}) {
  return (
    <CollapsibleSection
      title="Nearby Places"
      defaultCollapsed={false}
      stickyHeader={false}
      className={`border-b ${UI_THEME_TOKENS.panel.border}`}
      flushTop
    >
      <LocalPoiDirectory
        onSelectMapFeature={onSelectMapFeature}
        selectedMapFeatureId={selectedMapFeatureId}
        selectionSource={selectionSource}
      />
    </CollapsibleSection>
  )
}
