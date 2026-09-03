import { analyzeAgenticOsRequest, sanitizeRequestIntent, sanitizeScalar } from './chatAgenticOsRequestProfile'
import {
  CHAT_STORYBOARD_TEMPLATE_BINDING_ROUTES,
  CHAT_STORYBOARD_TEMPLATE_SCHEMA,
  CHAT_STORYBOARD_TEMPLATE_SEMANTIC_ROUTES,
  CHAT_STORYBOARD_TEMPLATE_SLASH_ROUTES,
} from './chatStoryboardTemplateContract'
import { buildResponseStatus } from './chatHistoryWorkspace.agenticOs.responseProjection'

type AgenticOsProfile = ReturnType<typeof analyzeAgenticOsRequest>

type Stage = {
  id: string
  lane: string
  command: string
  bindings: readonly string[]
  semantics: readonly string[]
  output: string
  nodeType: string
  label: string
  summary: string
  inPort?: string
  outPort: string
  signal: string
  x: number
}

const stages: readonly Stage[] = [
  { id: 'source', lane: 'Source', command: '/source.normalize', bindings: ['@source.frontmatter', '@source.body'], semantics: ['#frontmatter', '#no-hardcode'], output: 'normalized source brief', nodeType: 'SourceBriefWidget', label: 'Source', summary: 'Operator-owned source fields are normalized before ideation.', outPort: 'normalized_source', signal: 'storyboard_source_signal', x: 0 },
  { id: 'ideation', lane: 'Ideation', command: '/memory.seed', bindings: ['@source.frontmatter', '@source.body'], semantics: ['#frontmatter', '#token-economics'], output: 'paraphrased storyboard hypotheses', nodeType: 'AgenticInvocationWidget', label: 'Ideation', summary: 'Zero-spend ideation creates paraphrased storyboard hypotheses.', inPort: 'normalized_source', outPort: 'candidate_beats', signal: 'storyboard_plan_signal', x: 320 },
  { id: 'invocation', lane: 'Invocation', command: '/harness.define', bindings: ['@local-harness', '@cost-log'], semantics: ['#harness', '#approval-gate'], output: 'typed run manifest and cost bounds', nodeType: 'HarnessPlanWidget', label: 'Invocation', summary: 'Typed harness manifest gates cost, approval, and bounds before execution.', inPort: 'candidate_beats', outPort: 'bounded_manifest', signal: 'storyboard_plan_signal', x: 640 },
  { id: 'projection', lane: 'Storyboard', command: '/canvas.project', bindings: ['@canvas', '@runtime-proof'], semantics: ['#canvas', '#runtime-ready'], output: 'frontmatter-owned Storyboard cards', nodeType: 'StoryboardProjectionWidget', label: 'Storyboard', summary: 'Storyboard renderer projects frontmatter-owned cards without owning source data.', inPort: 'bounded_manifest', outPort: 'storyboard_cards', signal: 'storyboard_runtime_signal', x: 960 },
  { id: 'validation', lane: 'Runtime', command: '/runtime-ready.check', bindings: ['@runtime-proof', '@dev-only'], semantics: ['#runtime-ready', '#dev-only'], output: 'local proof path or blocked status', nodeType: 'RuntimeGateWidget', label: 'Runtime', summary: 'Local runtime proof is required before any live provider evidence claim.', inPort: 'storyboard_cards', outPort: 'runtime_proof', signal: 'storyboard_runtime_signal', x: 1280 },
  { id: 'deploy_guard', lane: 'Publish', command: '/deploy.guard', bindings: ['@operator', '@dev-only'], semantics: ['#approval-gate', '#dev-only'], output: 'local-only release boundary', nodeType: 'DeployGuardWidget', label: 'Publish', summary: 'Publish remains local-only until explicit operator approval opens Prod or Cloudflare.', inPort: 'runtime_proof', outPort: 'local_only_boundary', signal: 'storyboard_publish_signal', x: 1600 },
] as const

const semanticHtmlLandmarks = ['main', 'section', 'article', 'header', 'nav', 'aside', 'figure', 'figcaption', 'table'] as const

const q = (value: unknown): string => JSON.stringify(value)

const renderList = (indent: string, values: readonly string[]): string[] =>
  values.map(value => `${indent}- ${q(value)}`)

const typedInline = (field: string, type: string, value: unknown): string =>
  `{key: ${q(field)}, type: ${type}, value: ${q(value)}}`

const buildStageLines = (): string[] => stages.flatMap(stage => [
  `    - id: ${q(stage.id)}`,
  `      lane: ${q(stage.lane)}`,
  `      command: ${q(stage.command)}`,
  `      bindings: ${q(stage.bindings)}`,
  `      semantics: ${q(stage.semantics)}`,
  `      output: ${q(stage.output)}`,
  '      paid_call_count: 0',
])

const buildFlowNodeLines = (): string[] => stages.flatMap(stage => {
  const handles = stage.inPort
    ? { target: [stage.inPort], source: [stage.outPort] }
    : { source: [stage.outPort] }
  const portTypes = stage.inPort
    ? { in: { [stage.inPort]: stages.find(candidate => candidate.outPort === stage.inPort)?.signal || stage.signal }, out: { [stage.outPort]: stage.signal } }
    : { out: { [stage.outPort]: stage.signal } }
  return [
    `    - id: ${typedInline('id', 'string', stage.id)}`,
    `      type: ${typedInline('type', 'string', stage.nodeType)}`,
    `      label: ${typedInline('label', 'string', stage.label)}`,
    `      lane: ${typedInline('lane', 'string', stage.lane)}`,
    `      position: ${typedInline('position', 'object', { x: stage.x, y: 0 })}`,
    `      handles: ${typedInline('handles', 'object', handles)}`,
    `      command: ${typedInline('command', 'string', stage.command)}`,
    `      semantics: ${typedInline('semantics', 'array', stage.semantics)}`,
    `      bindings: ${typedInline('bindings', 'array', stage.bindings)}`,
    `      "flow:portTypes": ${typedInline('flow:portTypes', 'object', portTypes)}`,
    '      "frontmatter:primitive": {key: "frontmatter:primitive", type: string, value: "node"}',
    `      "agentic-os:readingSummary": ${typedInline('agentic-os:readingSummary', 'string', stage.summary)}`,
  ]
})

const buildFlowEdgeLines = (): string[] => stages.slice(1).flatMap((stage, index) => {
  const previous = stages[index]
  return [
    `    - ${q({ id: `edge_${previous.id}_to_${stage.id}`, source: previous.id, sourceHandle: previous.outPort, target: stage.id, targetHandle: stage.inPort || previous.outPort, label: previous.output, type: previous.signal })}`,
  ]
})

const buildStoryboardElements = (): string[] => stages.flatMap((stage, index) => [
  `    - id: ${q(`${stage.id}-card`)}`,
  '      sourceUnitId: "chat-response-source"',
  `      label: ${q(stage.label)}`,
  `      lane: ${q(stage.lane)}`,
  `      order: ${index + 1}`,
  '      provider: "agentic-graph"',
  `      prompt: ${q(`${stage.command} ${stage.semantics.join(' ')} ${stage.bindings.join(' ')}`)}`,
  `      action: ${q(stage.output)}`,
  `      summary: ${q(stage.summary)}`,
])

export const buildStoryboardTemplateProjectionFrontmatterLines = (args: {
  profile: AgenticOsProfile
  assistantText: string
}): string[] => {
  const targetBrief = sanitizeScalar(sanitizeRequestIntent(args.profile.intent, 260), 260) || 'Create source-backed storyboard cards, reusable elements, a local runtime proof path, and a visible deploy guard.'
  return [
    `schema: ${q(CHAT_STORYBOARD_TEMPLATE_SCHEMA)}`,
    'source_reference: "huijoohwee.github.io/template/agentic-graph-2d-renderer-storyboard-template.md"',
    'template_policy: "Universal, neutral, provider-agnostic Storyboard seed; runtime outputs stay blank until operator-approved runs return evidence."',
    'validation_input_forbid_hardcode_in_repo: "true"',
    'deployed_api_claim: "false"',
    'kgStrybldrStoryboard: true',
    'kgBottomPanelOpen: true',
    'kgBottomPanelTab: "timeline"',
    'runtime_readiness:',
    '  status: "template-ready"',
    '  default_runtime: "local-dry-run-first"',
    '  paid_call_count: 0',
    '  publish_scope: "local-only"',
    '  provider_job_id: ""',
    '  stream_url: ""',
    '  generated_asset_url: ""',
    '  runtime_proof_path: ""',
    '  prod_mirror: "blocked until operator instruction"',
    '  cloudflare: "blocked until operator instruction"',
    'agentic_os_contract:',
    '  version: "agentic-os-invocation-grammar/v1"',
    '  docs_root: "agentic-canvas-os/docs"',
    '  slash_routes:',
    ...renderList('    ', CHAT_STORYBOARD_TEMPLATE_SLASH_ROUTES),
    '  semantic_routes:',
    ...renderList('    ', CHAT_STORYBOARD_TEMPLATE_SEMANTIC_ROUTES),
    '  binding_routes:',
    ...renderList('    ', CHAT_STORYBOARD_TEMPLATE_BINDING_ROUTES),
    'shared_renderer_contract:',
    '  version: "shared-renderer-contract/v1"',
    '  semantic_identity: "buildScopedGraphSemanticKey"',
    '  renderer_id: "storyboard"',
    '  renderer_policy: "Frontmatter and authored source payloads own data; Storyboard projects view state only."',
    '  surfaces: ["2D Renderer: Storyboard","Cards","Widgets","Rich Media Panels","BottomPanel Timeline"]',
    '  edge_model: "Explicit flow.edges are source-owned SSOT; visible connectors are renderer projections."',
    '  no_legacy_aliases: true',
    '  no_downstream_patches: true',
    'semantic_html_projection:',
    '  version: "semantic-html-projection/v1"',
    '  required_landmarks:',
    ...renderList('    ', semanticHtmlLandmarks),
    '  forbidden_generic_wrapper_policy: "Use generic div only for layout-only wrappers that have no semantic role; never use it as the primary surface boundary."',
    'storyboard_template_inputs:',
    '  source_url: ""',
    '  source_title: "Chat response source"',
    '  source_author: ""',
    '  operator_notes: ""',
    `  target_brief: ${q(targetBrief)}`,
    '  approval_state: "draft"',
    '  live_generation_approval: "blocked"',
    'runtime_pipeline:',
    '  version: "storyboard-runtime-pipeline/v1"',
    '  status: "spec-complete"',
    '  response_status: ' + q(buildResponseStatus(args.assistantText)),
    '  stages:',
    ...buildStageLines(),
    'socket_types:',
    '  storyboard_source_signal: {color: "#14b8a6", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [storyboard_source_signal]}',
    '  storyboard_plan_signal: {color: "#38bdf8", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [storyboard_plan_signal]}',
    '  storyboard_runtime_signal: {color: "#f59e0b", edgeWidthPx: 3, handleStrokeWidthPx: 3, accepts: [storyboard_runtime_signal]}',
    '  storyboard_publish_signal: {color: "#22c55e", edgeWidthPx: 3, handleStrokeWidthPx: 3, accepts: [storyboard_publish_signal]}',
    'flow:',
    '  direction: {key: direction, type: string, value: "LR"}',
    '  edgeType: {key: edgeType, type: string, value: "smoothstep"}',
    '  balancedViewportPreset: {key: balancedViewportPreset, type: string, value: "widgetFrontmatter"}',
    '  computed: {key: computed, type: boolean, value: true}',
    '  snapToGrid: {key: snapToGrid, type: boolean, value: true}',
    '  nodes:',
    ...buildFlowNodeLines(),
    '  edges:',
    ...buildFlowEdgeLines(),
    'flow_diagrams:',
    '  key: "flow_diagrams"',
    '  type: "object"',
    '  value:',
    '    storyboard_flowchart:',
    '      key: "storyboard_flowchart"',
    '      type: "mermaid_flowchart"',
    '      floatingPanelView: "flowchart"',
    '      bottomPanelTab: "flowchart"',
    '      value: "flowchart LR\\n  source --> ideation --> invocation --> projection --> validation --> deploy_guard"',
    'strybldr_storyboard:',
    '  version: "1"',
    '  runId: "chat-response-storyboard-template"',
    '  notes: "Neutral Storyboard renderer seed; provider IDs, URLs, and generated asset paths remain blank without evidence."',
    '  workflow:',
    '    stages: ["Source","Ideation","Invocation","Storyboard","Runtime","Publish"]',
    '    publish:',
    '      id: "local-publish-packet"',
    '      label: "Local publish packet"',
    '      policy: "Write local packet fields only; do not claim Prod, Cloudflare, provider IDs, or stream URLs without explicit operator approval and returned evidence."',
    '  sources:',
    '    - sourceUnitId: "chat-response-source"',
    '      workspacePath: ""',
    '      relativePath: ""',
    '      originalName: "Chat response source"',
    '      mediaKind: "doc"',
    '      mimeHint: "text/markdown"',
    '      mediaUrl: ""',
    '  elements:',
    ...buildStoryboardElements(),
    '  cards: []',
  ]
}
