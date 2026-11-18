import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import LocalPoiDirectory from '@/features/maps/LocalPoiDirectory'

export default function NearbyPlacesPanel({ onSelectMapFeature, selectedMapFeatureId, selectionSource }: {
  onSelectMapFeature?: (featureId: string) => boolean | Promise<boolean>
  selectedMapFeatureId?: string | null
  selectionSource?: string | null
}) {
  return (
    <CollapsibleSection
      headingAs="h2"
      title="Nearby Places"
      defaultCollapsed={false}
      stickyHeader={false}
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
