// Source locations only. Persisted Graph document identities are a separate contract.
export const AGENT_DOCS_REPOSITORY = 'huijoohwee/agentic-os';
export const AGENT_DICTIONARY_ROOT = 'catalog/dictionaries';
export const AGENT_HISTORY_MANIFEST = 'runtime/agents/MIGRATION-DOCS.json';
export const AGENT_DOC_PATHS = Object.freeze({
  'AGENTS.md': 'AGENTS.md',
  'RUNTIME-PROOF.md': 'guides/DURABLE-WORKFLOWS.md',
  'LIVE-AGENT-PROVIDER-PROOF.md': 'runtime/agents/history/LIVE-AGENT-PROVIDER-PROOF.md',
});
export const GRAPH_DOC_PATHS = Object.freeze({
  'REPOSITORY-PACKING.md': 'docs/repository-packing-runtime.md',
  'APPLICATION-COMPOSITION.md': 'docs/agent-application-composition.md',
  'SKILL-EVOLUTION.md': 'docs/skill-evolution-runtime.md',
  'VOICE-STUDIO.md': 'docs/documents/agentic-graph-ai-voice-studio-prd-tad-adr-mvp-gtm.md',
  'schemas/production-runtime-readiness.v2.schema.json': 'schemas/production-runtime-readiness.v2.schema.json',
});
const AGENT_DOC_NAMES = new Set(['AGENT-DEFINITIONS.md', 'AGENT-ORCHESTRATION.md',
  'AGENT-RUNTIME-COMPOSITION.md', 'AGENT-SWARM.md', 'AGENT-TOOLKIT.md', 'RUNNING-AGENTS.md',
  'PROGRESSIVE-AGENTS.md', 'CACHE-CONTEXT.md', 'FUNCTION-CALLING.md', 'GUARDRAILS-HUMAN-REVIEW.md',
  'MODELS-AND-PROVIDERS.md', 'SANDBOX-AGENTS.md', 'SANDBOX-RUNTIME.md', 'PROGRAMMATIC-TOOL-CALLING.md',
  'TOOL-SEARCH.md', 'AUTONOMOUS-RUNTIME.md', 'SKILLS.md', 'PROMPT-PRESETS.md', 'AGENT-TEAM.md',
  'UPSTREAM-DEPENDENCY-ADMISSION.md']);
export function agentDocSourcePath(name) {
  if (/^DICTIONARY-(COMMAND|SEMANTIC|BINDING)\.md$/.test(name)) return `${AGENT_DICTIONARY_ROOT}/${name}`;
  if (Object.hasOwn(AGENT_DOC_PATHS, name)) return AGENT_DOC_PATHS[name];
  if (AGENT_DOC_NAMES.has(name)) return `runtime/agents/docs/${name}`;
  throw new Error(`Unknown Agentic OS document: ${name}`);
}
