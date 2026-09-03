import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readTokenEconomicsDocs(): string {
  const docsRoot = resolve(process.cwd(), '..', 'docs/documents')
  return [
    'agentic-graph-token-economics-model-prd-tad.md',
    'agentic-graph-token-economics-model-prd-tad.companion.md',
  ]
    .map(fileName => readFileSync(resolve(docsRoot, fileName), 'utf8'))
    .join('\n')
}

export function testTokenEconomicsPrdTadUsesAgenticOsSemanticOwners(): void {
  const docs = readTokenEconomicsDocs()
  const required = [
    'version: "0.2.0"',
    'status: "Accepted implemented baseline; ingestion and NLQ extensions planned"',
    'canvas/src/features/parsers/agenticOsSemanticGraph.ts',
    'canvas/src/lib/graph/agenticOsSemanticQuery.ts',
    'parseAgenticOsSemanticGraphFromMarkdown()',
    'bfsAgenticOsSemanticPath({ graphData, startId, endId })',
    'parser.agenticOsSemantic.typedSigilsNoLegacyRemap',
    'parser.agenticOsSemantic.queryEnginePathFilterSearch',
    'Cost-log ingestion, budget alerts, NLQ, and specialized renderer features remain planned extensions that must reuse this shared semantic graph owner',
  ]
  for (const token of required) {
    if (!docs.includes(token)) {
      throw new Error(`Expected token economics PRD/TAD docs to include ${JSON.stringify(token)}`)
    }
  }

  const stale = [
    'status: "Draft"',
    'version: "0.1.0"',
    'src/tem/',
    'test/tem/',
    'tem-schema-parser',
    'tem-query-engine',
    'tem-graph-store',
    'tem-canvas-renderer',
    'tem-nlq-harness',
    'Implemented (prior session)',
    'hard-coded BFS query chips',
  ]
  for (const token of stale) {
    if (docs.includes(token)) {
      throw new Error(`Expected token economics PRD/TAD docs to remove stale TEM owner token ${JSON.stringify(token)}`)
    }
  }
}
