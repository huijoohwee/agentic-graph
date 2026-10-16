import { EVIDENCE_OPERATIONS } from '../evidence-analysis/tools/evidenceCatalog.mjs';
export { isEvidenceToolName } from '../evidence-analysis/tools/evidenceCatalog.mjs';
export const EVIDENCE_ANALYSIS_TOOL_IDS = Object.freeze(Object.fromEntries(EVIDENCE_OPERATIONS.map(tool => [tool.operation, tool.name])));
export function buildEvidenceAnalysisAgentReadyToolContracts() {
  return EVIDENCE_OPERATIONS.map(({ operation, invocation, ...tool }) => ({ ...tool, description: `${tool.description} Local deterministic analysis; no operational clearance. Invocation: ${invocation}.` }));
}
