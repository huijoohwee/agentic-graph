export function hasExactGeoXrRendererLifecycleEvidence(view, lifecycle) {
  const expected = {
    active: {
      activeCount: 1,
      inactiveCount: 0,
      ownerCount: 1,
      surfaceVisible: true,
    },
    absent: {
      activeCount: 0,
      inactiveCount: 0,
      ownerCount: 0,
      surfaceVisible: false,
    },
    'retained-inactive': {
      activeCount: 0,
      inactiveCount: 1,
      ownerCount: 1,
      surfaceVisible: false,
    },
  }[lifecycle]
  return Boolean(
    expected
    && view?.geoXrSurfaceActive === true
    && view?.geoXrSurfaceCount === 1
    && view?.threeCanvasOwnerCount === expected.ownerCount
    && view?.threeCanvasActiveCount === expected.activeCount
    && view?.threeCanvasInactiveCount === expected.inactiveCount
    && view?.rendererPointerTransparent === true
    && view?.rendererSurfaceVisible === expected.surfaceVisible
  )
}
