import { readDocsSsotFixtureText } from '@/tests/lib/docsSsotFixture'

const HACKAMAP_DOC_BASENAME = 'agentic-graph-hackamap.md'

export async function testHackamapDocsFixtureForbidsHardcodedVolatileLiterals() {
  const fixtureText = readDocsSsotFixtureText(HACKAMAP_DOC_BASENAME)
  if (!fixtureText.trim()) throw new Error('expected hackamap docs fixture text')

  const forbiddenLiterals = [
    '(141 nodes)',
    '(142 nodes)',
    'agentic-graph-hackamap.json',
    '(33K lines)',
    '/Users/',
  ]
  const matched = forbiddenLiterals.filter(literal => fixtureText.includes(literal))
  if (matched.length > 0) {
    throw new Error(
      `expected hackamap docs fixture to avoid hardcoded volatile literals; found: ${matched.join(', ')}`,
    )
  }
}

export async function testHackamapDocsFixtureDeclaresPainPointDemoProductSemanticMapping() {
  const fixtureText = readDocsSsotFixtureText(HACKAMAP_DOC_BASENAME)
  if (!fixtureText.trim()) throw new Error('expected hackamap docs fixture text')

  const requiredLiterals = [
    'kgCanvas2dRenderer: "d3"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    'semanticKey: "hackamap:painpoint-demo-product"',
    'scope: "PainPoint-Demo-Product"',
    'nodePriority: [Demo, PainPoint, Product]',
    'D -->|addresses| P[PainPoint]:::painpoint',
    'D -->|produces| R[Product]:::product',
  ]
  const missing = requiredLiterals.filter(literal => !fixtureText.includes(literal))
  if (missing.length > 0) {
    throw new Error(
      `expected hackamap docs fixture to include painpoint-demo-product semantic mapping literals; missing: ${missing.join(', ')}`,
    )
  }
}
