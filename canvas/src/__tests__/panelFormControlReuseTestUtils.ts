export function assertLocalPoiDirectoryContract(args: {
  nearbyPlacesPanelText: string
  mapsHubViewText: string
  geoViewText: string
}): void {
  const { nearbyPlacesPanelText, mapsHubViewText, geoViewText } = args
  const invalid = !nearbyPlacesPanelText.includes("import LocalPoiDirectory from '@/features/maps/LocalPoiDirectory'")
    || !nearbyPlacesPanelText.includes('title="Nearby Places"')
    || !nearbyPlacesPanelText.includes('<LocalPoiDirectory />')
    || !geoViewText.includes("React.lazy(() => import('@/features/maps/NearbyPlacesPanel'))")
    || !geoViewText.includes('<NearbyPlacesPanelLazy')
    || mapsHubViewText.includes('NearbyPlacesPanel')
    || mapsHubViewText.includes('SiteSelectionWidget')
    || ['dailyCustomers', 'baseRent', 'handleRunDCF', 'Candidate Site Comparison'].some(text => nearbyPlacesPanelText.includes(text))
  if (invalid) throw new Error('expected one local POI directory in FloatingPanel Geo and no stale Maps Hub mount or unsupported candidate/DCF assumptions')
}
