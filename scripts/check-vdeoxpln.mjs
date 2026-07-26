import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  buildKnowgrphVdeoxplnAgentSkillDefinitions,
  buildKnowgrphVdeoxplnMarkdown,
  buildKnowgrphVdeoxplnRegistry,
  buildKnowgrphVdeoxplnRoutingPlan,
  KNOWGRPH_VDEOXPLN_IDS,
  validateKnowgrphVdeoxplnRegistry,
} from '../canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs'
import {
  buildKnowgrphLocalMcpToolDefinitions,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
} from '../mcp/local-tool-contract.js'

const repoRoot = process.cwd()
const registry = buildKnowgrphVdeoxplnRegistry()
const validation = validateKnowgrphVdeoxplnRegistry(registry)
const errors = [...validation.errors]

const fail = (message) => errors.push(message)

for (const vdeoxpln of registry) {
  for (const owner of vdeoxpln.owners) {
    const ownerPath = path.resolve(repoRoot, owner)
    if (!existsSync(ownerPath)) fail(`${vdeoxpln.id}: owner does not exist: ${owner}`)
  }
  const markdown = buildKnowgrphVdeoxplnMarkdown(vdeoxpln)
  if (!markdown.includes(`Vdeoxpln id: \`${vdeoxpln.id}\``)) {
    fail(`${vdeoxpln.id}: generated markdown missing canonical id`)
  }
  if (!markdown.includes(`Semantic key: \`${vdeoxpln.semanticKey}\``)) {
    fail(`${vdeoxpln.id}: generated markdown missing semantic key`)
  }
  if (/PaperMotion source|examples\/<demo>|legacy remap/i.test(markdown)) {
    fail(`${vdeoxpln.id}: generated markdown includes forbidden copied/stale wording`)
  }
  if (/compatibility alias/i.test(markdown) && !markdown.includes('Do not add compatibility aliases')) {
    fail(`${vdeoxpln.id}: generated markdown mentions compatibility aliases outside the guardrail`)
  }
  const graphMaterialization = String(vdeoxpln.artifactPolicy?.graphMaterialization || 'none')
  if (graphMaterialization !== 'none' && graphMaterialization !== 'tool-owned') {
    const ownerText = vdeoxpln.owners.join('\n')
    if (!ownerText.includes('workspace') && !ownerText.includes('source-files')) {
      fail(`${vdeoxpln.id}: graph-producing vdeoxpln must include workspace or Source Files owner`)
    }
    if (!ownerText.includes('semanticKey')) {
      fail(`${vdeoxpln.id}: graph-producing vdeoxpln must include shared semantic-key owner`)
    }
  }
}

const definitions = buildKnowgrphVdeoxplnAgentSkillDefinitions(registry)
if (definitions.length !== registry.length) {
  fail(`agent skill definitions length ${definitions.length} does not match registry length ${registry.length}`)
}
for (const definition of definitions) {
  if (definition.name !== definition.vdeoxpln.id) {
    fail(`${definition.name}: agent skill name must equal canonical vdeoxpln id`)
  }
  if (!definition.path.endsWith(`/${definition.name}.md`)) {
    fail(`${definition.name}: agent skill path must be canonical, got ${definition.path}`)
  }
}

const localToolNames = buildKnowgrphLocalMcpToolDefinitions().map((tool) => tool.name)
if (!localToolNames.includes(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.vdeoxplnList)) {
  fail('local MCP tool contract must expose knowgrph.vdeoxpln.list')
}
for (const name of [KNOWGRPH_LOCAL_MCP_TOOL_NAMES.applicationCatalog, KNOWGRPH_LOCAL_MCP_TOOL_NAMES.applicationPlan, KNOWGRPH_LOCAL_MCP_TOOL_NAMES.applicationExecute]) {
  if (!localToolNames.includes(name)) fail(`local MCP tool contract must expose ${name}`)
}
if (!localToolNames.includes(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.voiceStudio)) fail('local MCP tool contract must expose knowgrph.voice.studio')
const voiceStudio = registry.find((entry) => entry.id === KNOWGRPH_VDEOXPLN_IDS.voiceStudio)
const canonicalVoiceRoutes = [
  ['/voice.studio', '#voice-clone', '@audio', '@voice-profile', '@approval-gate', '@cost-log', '@runtime-proof'],
  ['/voice.studio', '#speech-to-text', '@audio', '@text', '@approval-gate', '@cost-log', '@runtime-proof'],
  ['/voice.studio', '#text-to-speech', '@text', '@voice-profile', '@audio', '@approval-gate', '@cost-log', '@runtime-proof'],
]
const canonicalVoiceTriggerTokens = [...new Set(canonicalVoiceRoutes.flat())]
if (!voiceStudio || canonicalVoiceTriggerTokens.some(token => !voiceStudio.triggers.includes(token))) {
  fail('voice studio vdeoxpln aggregate triggers must contain the canonical command, semantics, and bindings; route ordering is parser-test-owned')
}
const applicationComposition = registry.find((entry) => entry.id === KNOWGRPH_VDEOXPLN_IDS.applicationComposition)
const canonicalApplicationInvocation = ['/application.compose', '#application-composition', '@application-manifest', '@component-catalog', '@integration-profile', '@runtime-proof']
if (!applicationComposition || canonicalApplicationInvocation.some((token) => !applicationComposition.triggers.includes(token))) fail('application composition vdeoxpln must expose the exact canonical / # @ invocation')
const applicationPlan = buildKnowgrphVdeoxplnRoutingPlan({ intentText: canonicalApplicationInvocation.join(' '), requestedOutputs: ['immutable application-composition-plan/v1'] })
if (applicationPlan.status !== 'selected' || applicationPlan.selectedVdeoxplnId !== KNOWGRPH_VDEOXPLN_IDS.applicationComposition) fail(`application composition routing expected ${KNOWGRPH_VDEOXPLN_IDS.applicationComposition}, got ${applicationPlan.selectedVdeoxplnId || applicationPlan.status}`)
if (applicationPlan.executionStages.some((stage) => stage.id === 'floating-panel-chat' || stage.kind === 'ai-assisted')) fail('application composition must route only through its exact local MCP owners without a second AI stage')

const routeOnlyPlan = buildKnowgrphVdeoxplnRoutingPlan({
  routePath: '/knowgrph/.well-known/agent-skills/knowgrph-chat-to-canvas.md',
  filePath: 'demo.md',
})
if (routeOnlyPlan.status !== 'declined') {
  fail(`route-only vdeoxpln routing must decline, got ${routeOnlyPlan.status}`)
}

const chatPlan = buildKnowgrphVdeoxplnRoutingPlan({
  intentText: 'Generate a graph from source evidence and apply validated KGC markdown to the canvas.',
  chatStorageTarget: 'chatKnowgrph',
  contentTypes: ['workspace document markdown', 'source evidence'],
  requestedOutputs: ['validated KGC Markdown', 'workspace artifact', 'GraphData', 'canvas topology snapshot'],
  stateSignals: ['FloatingPanel Chat', 'KGC validation', 'Source Files', 'Canvas apply'],
  sourceFileCount: 1,
  hasGraphData: true,
  hasWorkspaceDocument: true,
})
if (chatPlan.status !== 'selected' || chatPlan.selectedVdeoxplnId !== KNOWGRPH_VDEOXPLN_IDS.chatToCanvas) {
  fail(`chat-to-canvas neutral routing expected ${KNOWGRPH_VDEOXPLN_IDS.chatToCanvas}, got ${chatPlan.selectedVdeoxplnId || chatPlan.status}`)
}
const chatStageIds = new Set((chatPlan.executionStages || []).map((stage) => String(stage?.id || '')))
for (const requiredStage of ['source-backed-artifact', 'source-files', 'floating-panel-chat', 'kgc-validation', 'canvas-apply']) {
  if (!chatStageIds.has(requiredStage)) fail(`chat-to-canvas routing plan missing stage ${requiredStage}`)
}
const staleChatArtifactPath = path.resolve(repoRoot, 'canvas/src/features/chat/knowgrphVdeoxplnChatArtifacts.ts')
if (existsSync(staleChatArtifactPath)) {
  fail('obsolete vdeoxpln chat artifact helper must stay removed from canonical KGC finalization')
}

if (errors.length > 0) {
  console.error('[knowgrph] vdeoxpln check failed:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`[knowgrph] vdeoxpln check passed: ${registry.length}/${registry.length} vdeoxpln entries`)
