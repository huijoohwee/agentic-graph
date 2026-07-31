import assert from 'node:assert/strict'

type SingaporePoiBrowserAuthoritySources = Readonly<{
  evidenceValidator: string
  geoXrLayoutVerifier: string
  geoXrRequirementsVerifier: string
}>

export function assertFlightSimBrowserSingaporePoiSourceAuthority({
  evidenceValidator,
  geoXrLayoutVerifier,
  geoXrRequirementsVerifier,
}: SingaporePoiBrowserAuthoritySources): void {
  assert.match(
    geoXrRequirementsVerifier,
    /environment\.stageFootprintAuthoredMeters/,
  )
  assert.match(
    geoXrRequirementsVerifier,
    /environment\.majorPoiGeographicMeters/,
  )
  assert.match(geoXrRequirementsVerifier, /environment\.majorPoiIds/)
  assert.match(
    geoXrRequirementsVerifier,
    /environment\.renderedMajorPoiSubset/,
  )
  assert.match(geoXrRequirementsVerifier, /height_meters=0\.08/)
  assert.match(geoXrRequirementsVerifier, /width_meters=32/)
  assert.match(geoXrRequirementsVerifier, /height_meters=193/)
  assert.match(geoXrRequirementsVerifier, /width_meters=71\.82/)
  assert.match(geoXrRequirementsVerifier, /depth_meters=76\.45/)
  assert.doesNotMatch(geoXrLayoutVerifier, /heightMeters >= 20/)
  assert.match(geoXrLayoutVerifier, /environmentExtrusionContractExact/)
  assert.doesNotMatch(geoXrLayoutVerifier, /environmentExtrusionVisible/)
  assert.doesNotMatch(geoXrLayoutVerifier, /marina-bay-sands:tower-2/)

  for (const requirement of [
    "CITY_REGIONAL_POI_PROFILE_ID = 'adm0:SGP:major-pois/v1'",
    "CITY_REGIONAL_POI_PROFILE_REVISION = '2026-07-31.1'",
    'CITY_REGIONAL_POI_SURFACE_COUNT = 9',
    'CITY_REGIONAL_POI_LOCATOR_COUNT = 3',
    'CITY_REGIONAL_POI_LAYER_COUNT = 5',
    'regionalPoi?.profileRevision === CITY_REGIONAL_POI_PROFILE_REVISION',
    'regionalPoi?.datasetProfileRevision',
    'regionalPoi?.profileFeatureCount === CITY_REGIONAL_POI_SURFACE_COUNT',
    'regionalPoi?.featureCount === CITY_REGIONAL_POI_FEATURE_COUNT',
    'regionalPoi?.datasetFeatureCount === CITY_REGIONAL_POI_FEATURE_COUNT',
    'regionalPoi?.locatorCount === CITY_REGIONAL_POI_LOCATOR_COUNT',
    'hasExactCityRegionalPoiIds(regionalPoi?.locatorPois)',
    'hasExactCityRegionalPoiVisualProof(regionalPoi?.poiVisualProof)',
  ]) {
    assert.ok(
      evidenceValidator.includes(requirement),
      `expected exact saved regional POI evidence requirement: ${requirement}`,
    )
  }
  const cityHandoffEvidence = evidenceValidator.slice(
    evidenceValidator.indexOf('export function hasExactCityHandoffEvidence'),
    evidenceValidator.indexOf('function hasExactInitialReadyFrameEvidence'),
  )
  assert.ok(
    cityHandoffEvidence.includes(
      'hasExactCityRegionalPoiEvidence(regionalPoi)',
    ),
    'expected saved City handoff evidence to require the active regional POI snapshot',
  )
  for (const teardownEvidenceName of [
    'regionalPoiAfterCityExit',
    'regionalPoiAfterFlightReopen',
  ]) {
    assert.ok(
      cityHandoffEvidence.includes(teardownEvidenceName),
      `expected saved City handoff evidence to require ${teardownEvidenceName}`,
    )
  }
  assert.equal(
    cityHandoffEvidence.match(/hasExactCityRegionalPoiTeardownEvidence\(/g)
      ?.length,
    2,
    'expected saved City handoff evidence to validate both regional POI teardown snapshots',
  )

  const cityEvidenceValidator = evidenceValidator.slice(
    evidenceValidator.indexOf(
      'export function hasExactCityMapLibreSurfaceEvidence',
    ),
    evidenceValidator.indexOf('function hasExactCityHandoffEvidence'),
  )
  for (const requirement of [
    "hasExactGeoXrRendererLifecycleEvidence(city, 'retained-inactive')",
    "hasExactGeoXrRendererLifecycleEvidence(city, 'absent')",
    'city?.canvasStable === true',
    'city?.flightR3fVisualCount === 0',
  ]) {
    assert.ok(
      cityEvidenceValidator.includes(requirement),
      `expected retained inactive City renderer evidence: ${requirement}`,
    )
  }
  for (const requirement of [
    "hasExactGeoXrRendererLifecycleEvidence(before, 'active')",
    "hasExactGeoXrRendererLifecycleEvidence(restored, 'active')",
    "hasExactGeoXrRendererLifecycleEvidence(reopened, 'active')",
  ]) assert.ok(cityHandoffEvidence.includes(requirement))
  assert.ok(evidenceValidator.includes(
    "hasExactGeoXrRendererLifecycleEvidence(view, 'active')",
  ))
  assert.ok(evidenceValidator.includes(
    'hasViewportScopedRegionalPoiRendering(view)',
  ))
  assert.ok(evidenceValidator.includes(
    "evidence?.geoXrPresentation?.restoredView,\n      'active'",
  ))
  for (const checkpoint of ['restored', 'reopened']) {
    for (const requirement of [
      'citySemanticSurfaceActive === false',
      "cityMapLibreCanvasAriaLabelledBy === ''",
      "cityMapLibreCanvasAccessibleName === 'Map'",
      'cityMapLibreCanvasAriaHidden === false',
      "cityMapLibreCanvasSelectableMarker === ''",
      'cityMapLibreCanvasSelectableOwnerIsCanvas === false',
      "cityMapLibreCanvasSelectableOwnerNodeName === ''",
      'cityMapLibreOwnerCount === 0',
      'citySourcePresent === false',
      'citySourceFeatures === 0',
      'cityLayerCount === 0',
      'cityLayersReady === false',
    ]) {
      assert.ok(
        cityHandoffEvidence.includes(`${checkpoint}?.${requirement}`),
        `expected ${checkpoint} City teardown evidence: ${requirement}`,
      )
    }
  }

}
