import { createMenusFixture } from './panelSemanticContract/sourceFixture'
import { assertPhase1 } from './panelSemanticContract/assertions1'
import { assertPhase2 } from './panelSemanticContract/assertions2'

// Preserve the registry's stable entry point and run every assertion phase exactly once.
export function testResponsiveMenusAndDataViewSurfacesStayBounded() {
  const fixture = createMenusFixture()
  assertPhase1(fixture)
  assertPhase2(fixture)
}

export * from './panelSemanticContract/contracts1'

export * from './panelSemanticContract/contracts2'

export * from './panelSemanticContract/contracts3'
