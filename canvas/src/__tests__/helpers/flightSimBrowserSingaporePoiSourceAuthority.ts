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
  assert.match(
    geoXrLayoutVerifier,
    /proof\.id === 'marina-bay-sands:tower-2'/,
  )

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
    'hasExactGeoXrRendererEvidence(city, false)',
    'city?.canvasStable === true',
    'city?.flightR3fVisualCount === 0',
  ]) {
    assert.ok(
      cityEvidenceValidator.includes(requirement),
      `expected retained inactive City renderer evidence: ${requirement}`,
    )
  }
  const rendererEvidenceValidator = evidenceValidator.slice(
    evidenceValidator.indexOf('function hasExactGeoXrRendererEvidence'),
    evidenceValidator.indexOf('const CITY_REGIONAL_POI_PROFILE_ID'),
  )
  for (const requirement of [
    'view?.geoXrSurfaceCount === 1',
    'view?.threeCanvasOwnerCount === 1',
    'view?.threeCanvasActiveCount === (active ? 1 : 0)',
    'view?.threeCanvasInactiveCount === (active ? 0 : 1)',
    'view?.rendererPointerTransparent === true',
    'view?.rendererSurfaceVisible === active',
  ]) assert.ok(rendererEvidenceValidator.includes(requirement))
  for (const requirement of [
    'hasExactGeoXrRendererEvidence(before, true)',
    'hasExactGeoXrRendererEvidence(restored, true)',
    'hasExactGeoXrRendererEvidence(reopened, true)',
  ]) assert.ok(cityHandoffEvidence.includes(requirement))
  assert.ok(evidenceValidator.includes(
    'hasExactGeoXrRendererEvidence(view, true)',
  ))
  assert.ok(evidenceValidator.includes(
    'hasViewportScopedRegionalPoiRendering(view)',
  ))
  assert.ok(evidenceValidator.includes(
    'evidence?.geoXrPresentation?.restoredView, true',
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
