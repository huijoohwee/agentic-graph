import { EVIDENCE_OPERATIONS } from '../evidence-analysis/tools/evidenceCatalog.mjs'
import { executeEvidence } from '../evidence-analysis/tools/executeEvidence.mjs'
import type { WebMcpTool } from './webMcpRuntimeTypes'

export function buildEvidenceAnalysisWebMcpToolBuilders(): Record<string, () => WebMcpTool> {
  return Object.fromEntries(EVIDENCE_OPERATIONS.map(({ operation, name, webName, invocation, ...contract }) => [name, () => ({
    ...contract, name: webName, execute: (input?: Record<string, unknown>) => executeEvidence(operation, input),
  })]))
}
