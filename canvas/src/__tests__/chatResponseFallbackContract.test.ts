import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'
import { isAgenticOsStructuredMarkdown, normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { normalizeAgenticOsFrontmatterIdentityToFileName } from '@/features/chat/chatHistoryWorkspace.agenticOs.normalize'
import { createNewChatHistoryWorkspaceFilePath, ensureChatHistoryWorkspaceFilePath, toCanonicalAgenticOsWorkspacePath, toAgenticOsOutputWorkspacePath, toAgenticOsTraceWorkspacePath } from '@/features/chat/chatHistoryWorkspace.paths'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { splitLeadingFrontmatterAndBody } from '@/features/chat/chatAgenticOsFrontmatter'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { buildBaseTemplateSample } from '@/__tests__/chatResponseContractPrompt.test'

const assertResponseOnlyFallback = (markdown: string, answer: string) => {
  const parts = splitLeadingFrontmatterAndBody(markdown)
  if (!parts || !/^agenticOsResponseOnly: true$/m.test(parts.frontmatter)
    || !parts.frontmatter.includes('agentic-os-response/v1')) throw new Error('Expected response-only schema and marker')
  const response = parts.body.split('## Response\n')[1]?.trim()
  if (response !== answer) throw new Error(`Expected the authored answer without injected prose, got: ${response}`)
  for (const section of ['## Computing Flow Definition', '## Pipeline', '## PRD', '## TAD', '### Request Snapshot']) {
    if (parts.body.includes(section)) throw new Error(`Unexpected unrequested workflow section: ${section}`)
  }
  const validation = validateChatMarkdown({ markdown, resolvableVarKeys: buildResolvableVarKeySet({ frontmatter: null, markdown }) })
  if (!validation.ok) throw new Error(`Invalid response-only fallback: ${validation.errors[0]?.message}`)
}

export function testAgenticOsDeterministicFallbackIsStructuredAndValid() {
  const requestIntent = 'Solo founder bootstrap GTM with Stripe payment checkout integration'
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 19, 12, 34, 56),
    requestText: requestIntent,
    assistantText: 'Focus on external adoption, conversion path, and a reusable planning package.',
  })
  if (!md.includes('subject: "solo founder"')) {
    throw new Error('Expected deterministic fallback to infer a neutral subject when it is explicit in the request')
  }
  if (!md.includes('owner: "solo founder"')) {
    throw new Error('Expected deterministic fallback to project explicit owner from the named actor')
  }
  if (!md.includes('bootstrap execution') || !md.includes('Stripe payment') || !md.includes('checkout')) {
    throw new Error('Expected deterministic fallback to derive a normalized query-shaped objective')
  }
  if (!md.includes('Stripe') || !md.includes('solo founder')) {
    throw new Error('Expected deterministic fallback body to stay request-shaped for actor and payment context')
  }
  assertResponseOnlyFallback(md, 'Focus on external adoption, conversion path, and a reusable planning package.')
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error('Expected deterministic fallback to satisfy AGENTIC_OS structured markdown detection')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new Error(`Expected deterministic fallback to validate, got ${first?.ruleId}: ${first?.message}`)
  }
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-fallback.md', md)
  if (!parsed) throw new Error('Expected deterministic fallback to parse as a frontmatter flow graph')
}

export function testAgenticOsDeterministicFallbackProjectsHeadlessStrybldrResponseFirst() {
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 5, 23, 46, 28),
    workspacePath: '/chat-log/20260605T234628Z/agenticOs_20260605T234628Z.md',
    requestText: 'Create a headless structured MCP response for 2D Renderer: Storyboard with gitGraph, Gantt frontmatter, inline compute runner, dataflow, and Rich Media Panels.',
    assistantText: [
      '## Provider Stream Trace',
      '',
      'The provider returned reasoning or tool-call trace events but did not return final assistant text.',
      '',
      '- Model: model-a',
      '- SSE events: 12',
      '',
      '### Reasoning and Tool Signals',
      '',
      '- Evaluate Strybldr workflow dataflow and Rich Media Panel outputSrcDoc handoff.',
    ].join('\n'),
  })
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error('Expected headless Strybldr fallback to remain a structured AGENTIC_OS document')
  }
  const responseIndex = md.indexOf('## Response')
  const workflowIndex = md.indexOf('## Computing Flow Definition')
  if (responseIndex < 0 || workflowIndex < 0 || responseIndex > workflowIndex) {
    throw new Error('Expected fallback body to lead with query response projection before workflow metadata')
  }
  const requiredSnippets = [
    'kgCanvas2dRenderer: "storyboard"',
    'kgStrybldrStoryboard: true',
    'response:',
    'status: "trace_only"',
    'markdown_body:',
    'renderer: "storyboard"',
    'This document does not invent the missing answer',
    'mcp-response-headless-compute',
    'mcp-response-rich-media-panel',
    'type: mermaid_gitgraph',
    'type: mermaid_gantt',
    'render_on: [flow_editor, storyboard, strybldr',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected headless Strybldr fallback to include: ${snippet}`)
    }
  })
  const forbiddenDemoBasename = ['agentic-graph', 'strytree', 'demo'].join('-') + '.md'
  const absoluteDemoPathPattern = new RegExp(`/Users/[^\\s\`]+/.*/${forbiddenDemoBasename.replace('.', '\\.')}`)
  if (absoluteDemoPathPattern.test(md)) {
    throw new Error('Expected fallback to avoid hardcoded sample artifact paths')
  }
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-headless-strybldr.md', md)
  if (!parsed) throw new Error('Expected headless Strybldr fallback to parse as a frontmatter flow graph')
  if (!parsed.graphData.edges.some(edge => edge.source === 'mcp-response-headless-compute'
    && edge.target === 'mcp-response-rich-media-panel' && edge.properties?.['flow:sourcePortKey'] === 'output' && edge.properties?.['flow:targetPortKey'] === 'output')) {
    throw new Error('Expected the parsed headless text response to connect output to the panel text output')
  }
  const nodeIds = new Set(parsed.graphData.nodes.map(node => String(node.id || '')))
  if (!nodeIds.has('mcp-response-headless-compute') || !nodeIds.has('mcp-response-rich-media-panel')) {
    throw new Error(`Expected parsed graph to include headless compute and Rich Media Panel nodes, got: ${Array.from(nodeIds).join(', ')}`)
  }
}

export function testChatAgenticOsFinalizeAppliesSavedWorkspaceDocumentToCanvas() {
  const finalizeText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'floatingPanelChat', 'useFinalizeAssistantSuccess.ts'), 'utf8')
  const applyText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'chatAgenticOsCanvasApply.ts'), 'utf8')
  const requiredFinalizeSnippets = [
    'applyChatAgenticOsWorkspaceDocumentToCanvas',
    'await applyChatAgenticOsWorkspaceDocumentToCanvas(agenticGraphPath)',
  ]
  requiredFinalizeSnippets.forEach(snippet => {
    if (!finalizeText.includes(snippet)) throw new Error(`Expected AGENTIC_OS finalize path to include: ${snippet}`)
  })
  const requiredApplySnippets = [
    'applyWorkspaceImportToCanvas', 'shouldApplyImportedCanvasDocumentToGraph',
    'skipComposedGraphApply: true', 'setActiveMarkdownDocument({',
    'applyViewPreset: true',
    'applyToGraph: true',
    'forceApplyToGraph: true',
  ]
  requiredApplySnippets.forEach(snippet => {
    if (!applyText.includes(snippet)) throw new Error(`Expected AGENTIC_OS canvas apply bridge to include: ${snippet}`)
  })
}

export function testAgenticOsIdentityNormalizationEnforcesBaseTemplateScalars() {
  const template = buildBaseTemplateSample().replace(/\r\n/g, '\n')
  const mutated = template
    .replace(/^product:\s+".*"$/m, 'product: "Knowledge Graph Canvas"')
    .replace(/^title:\s+".*"$/m, 'title: "Stale authored title"')
    .replace(/^graphId:\s+".*"$/m, 'graphId: "md:agentic-os-20260419180222-pipeline"')
    .replace(/^ai_model:\s+".*"$/m, 'ai_model: "model-test-authored"')
    .replace(/date:\s+"{{date}}"/, 'date: "2026-04-19"')
    .replace('# {{product}} · AI Pipeline', '# Knowledge Graph Canvas · AI Pipeline')
    .replace('owner `{{owner}}` · {{date}}', 'owner `{{owner}}` · 2026-04-19')

  const normalized = normalizeAgenticOsFrontmatterIdentityToFileName({
    markdown: mutated,
    workspacePath: '/chat-log/20260419T180222Z/agenticOs_20260419T180222Z.md',
    timestampMs: Date.UTC(2026, 3, 19, 18, 2, 22),
  })

  if (!normalized.includes('product: "Knowledge Graph Canvas"')) {
    throw new Error('Expected normalized AGENTIC_OS product to preserve authored content')
  }
  if (!normalized.includes('title: "Knowledge Graph Canvas · AI Pipeline — response"')) {
    throw new Error('Expected normalized AGENTIC_OS title to derive from canonical product and doc type')
  }
  if (!normalized.includes('graphId: "md:agenticos-20260419t180222z-pipeline"')) {
    throw new Error('Expected normalized AGENTIC_OS graphId to derive from the storage filename')
  }
  if (!normalized.includes('2026-04-19')) {
    throw new Error('Expected normalized AGENTIC_OS date to derive from the storage timestamp')
  }
  if (!normalized.includes('model-test-authored')) {
    throw new Error('Expected normalized AGENTIC_OS ai_model to preserve the authored model identifier')
  }
  if (!normalized.includes('en-US')) {
    throw new Error('Expected normalized AGENTIC_OS lang to preserve the authored language')
  }
  if (!normalized.includes('agenticOs_20260419T180222Z.md')) {
    throw new Error('Expected normalized AGENTIC_OS self_ref to match workspace filename')
  }
  if (!normalized.includes('# Knowledge Graph Canvas · AI Pipeline')) {
    throw new Error('Expected normalized body H1 to preserve authored body content')
  }
  if (!normalized.includes('owner `{{owner}}` · 2026-04-19')) {
    throw new Error('Expected normalized body meta line to preserve authored body content')
  }
}

export function testAgenticOsWorkspacePathCanonicalizationMapsTraceAndOutputToCanonical() {
  const tracePath = '/chat-log/20260419T180222Z/agentic-os-trace_20260419T180222Z.md'
  const outputPath = '/chat-log/20260419T180222Z/agentic-os-output_20260419T180222Z.svg'

  if (toCanonicalAgenticOsWorkspacePath(tracePath) !== '/chat-log/20260419T180222Z/agenticOs_20260419T180222Z.md') {
    throw new Error('Expected trace path to canonicalize to the runnable AGENTIC_OS markdown path')
  }
  if (toCanonicalAgenticOsWorkspacePath(outputPath) !== '/chat-log/20260419T180222Z/agenticOs_20260419T180222Z.md') {
    throw new Error('Expected output companion path to canonicalize back to the runnable AGENTIC_OS markdown path')
  }
  if (toAgenticOsTraceWorkspacePath('/chat-log/20260419T180222Z/agenticOs_20260419T180222Z.md') !== tracePath) {
    throw new Error('Expected canonical AGENTIC_OS path to derive a matching trace companion path')
  }
  if (toAgenticOsOutputWorkspacePath(tracePath, 'png') !== '/chat-log/20260419T180222Z/agentic-os-output_20260419T180222Z.png') {
    throw new Error('Expected trace path to derive a matching output companion path')
  }
  if (toAgenticOsOutputWorkspacePath(tracePath, 'html', { variant: 'viewer' }) !== '/chat-log/20260419T180222Z/agentic-os-output_20260419T180222Z-viewer.html') {
    throw new Error('Expected trace path to derive a stable variant output companion path')
  }

  const normalized = normalizeAgenticOsFrontmatterIdentityToFileName({
    markdown: buildBaseTemplateSample(),
    workspacePath: tracePath,
    timestampMs: Date.UTC(2026, 3, 19, 18, 2, 22),
  })
  if (!normalized.includes('agenticOs_20260419T180222Z.md')) {
    throw new Error('Expected identity normalization to use the canonical AGENTIC_OS filename even when the workspace path points at a trace file')
  }
}

export async function testChatAgenticGraphRejectsLegacyDocsWorkspacePath() {
  resetWorkspaceFsForTests()
  const sessionPath = await createNewChatHistoryWorkspaceFilePath(Date.UTC(2026, 4, 27, 13, 15, 14), {
    storageType: 'chatAgenticGraph', defaultLocalRootPath: '/chat-log',
  })
  const resolved = await ensureChatHistoryWorkspaceFilePath({
    requestedPath: '/docs/20260527T131514Z/agenticOs_20260527T131514Z.md',
    timestampMs: Date.UTC(2026, 4, 27, 13, 15, 14),
    storageType: 'chatAgenticGraph',
    defaultLocalRootPath: '/chat-log',
  })
  if (resolved !== sessionPath || !/^\/chat-log\/20260527T1315\d{2}Z\/agenticOs_20260527T1315\d{2}Z\.md$/.test(resolved)) {
    throw new Error(`expected stale docs AGENTIC_OS path to be ignored in favor of chat-log session path, got ${resolved}`)
  }
}

export function testAgenticOsFallbackWithNonEmptyQueryIsNotByteEqualToCanonicalTemplate() {
  const canonicalTemplate = buildBaseTemplateSample().replace(/\r\n/g, '\n').trimEnd()
  const generated = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 19, 20, 14, 10),
    workspacePath: '/chat-log/20260419T201410Z/agenticOs_20260419T201410Z.md',
    requestText: 'Solo founder bootstrap growth with Stripe checkout and RxDB MapLibre stack',
    assistantText: 'invalid fallback trigger',
  }).replace(/\r\n/g, '\n').trimEnd()

  if (generated === canonicalTemplate) {
    throw new Error('Expected fallback output with non-empty query to differ from canonical template bytes')
  }
}

export function testStructuredAgenticOsIsEnforcedQueryResponsiveBeforePersistence() {
  const canonicalTemplate = buildBaseTemplateSample().replace(/\r\n/g, '\n')
  const requestText = 'Solo founder bootstrap growth with Stripe checkout, RxDB, MapLibre, MCP marketplace'
  const generated = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 19, 21, 1, 10),
    workspacePath: '/chat-log/20260419T210110Z/agenticOs_20260419T210110Z.md',
    requestText,
    assistantText: canonicalTemplate,
  })
  if (!generated.includes('subject: "solo founder"')) {
    throw new Error('Expected structured AGENTIC_OS to resolve an explicit subject from the request')
  }
  if (!generated.includes('domain: "MCP distribution') || !generated.includes('user-action monetization')) {
    throw new Error('Expected structured AGENTIC_OS to resolve a concise domain from the request')
  }
  if (generated.includes('Request Intent:') || generated.includes('Monetization Focus:') || generated.includes('Stack: ')) {
    throw new Error('Expected structured AGENTIC_OS persistence normalization to avoid stale canned body injections')
  }
  if (generated === canonicalTemplate) {
    throw new Error('Expected structured AGENTIC_OS to differ from the untouched template when request context can resolve Tier B fields')
  }
}

export function testAgenticOsDeterministicFallbackShapesLatestRecommendationQuery() {
  const requestText = 'RECOMMEND: Solo founder; zero budget, bootstrap, organic growth; **Knowledge Graph Canvas** product as MCP for external users, OpenClaw, skills marketplace; Pitch Deck+PRD+TAD, TCO; Use Case -> Problem -> Solution; User Flow+Work Flow+Data Flow; B2C monetization ideas; monetize user actions (subscriptions, pay-per-use, and commerce-like conversion); FOSS RxDB, MapLibre; expose integration with **Stripe payment** flow (payments/checkout)'
  const assistantText = [
    '---',
    'title: "agent-graph-canvas · AI Pipeline — PRD + TAD"',
    'graphId: "agentic-os-agent-graph-canvas-prd-tad"',
    '$schema: "agentic-os-pipeline/v1"',
    'pipeline:',
    'flow:',
  ].join('\n')
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 20, 10, 54, 32),
    workspacePath: '/chat-log/20260420T105432Z/agenticOs_20260420T105432Z.md',
    requestText,
    assistantText,
  })
  const requiredSnippets = [
    'product: "Knowledge Graph Canvas"',
    'artifact: "Pitch Deck + PRD + TAD + TCO"',
    'owner: "solo founder"',
    'status: "recommended"',
    'doc_type: "Pitch Deck + PRD + TAD + TCO"',
    'title: "Knowledge Graph Canvas · AI Pipeline — Pitch Deck + PRD + TAD + TCO"',
    '## Pitch Deck + PRD + TAD + TCO',
    'label: "trigger / input"',
    'label: "context pack"',
    'label: "generate / process"',
    'label: "review / validate"',
    'label: "deliver / persist"',
    'actor: ["{{subject}}", "system"]',
    'actor: ["{{subject}}", "AI"]',
    'user_action: "{{subject}} selects scope; states the active request objective and constraints"',
    'Request injected as user turn; {{subject}} reviews streamed output for fit and clarity',
    'feedback_arcs:',
    'forward_edges:',
    'direction:  {key: direction,  type: string,  value: LR}',
    'computed:   {key: computed,   type: boolean, value: true}',
    'click n-trigger  "#pipeline" "S01 · trigger / input"',
    'click n-deliver  "#pipeline" "S05 · deliver / persist"',
    'seq:    R01',
    'seq:    R06',
    'retry ≤ {{runtime.maxRetry}}× via @edge:n-validate:correction→n-process:correction',
    '### Variable Link Map',
    '### Request Snapshot',
    '`{{product}}`',
    '`{{artifact}}`',
    '`{{subject}}`',
    '### Use Case',
    '### Problem',
    '### Solution',
    '### User Flow',
    '### Work Flow',
    '### Data Flow',
    '### Monetization Surface',
    '### Integration Boundaries',
    'OpenClaw',
    'Stripe',
    'RxDB',
    'MapLibre',
    'subscriptions',
    'pay-per-use',
    'conversion',
    'external users',
    'Stripe can cover checkout, payment confirmation, and post-payment handoff',
    'OpenClaw can cover marketplace listing and demand capture',
    'A user discovers the `{{product}}` offer',
    'unlocks the paid entitlement or action',
    '### Request Snapshot',
    'Canonical output path',
    'agenticOs_20260420T105432Z.md',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected latest recommendation fallback to include: ${snippet}`)
    }
  })
  if (!md.includes('domain: "MCP distribution + skills marketplace delivery + user-action monetization')) {
    throw new Error('Expected latest recommendation fallback to resolve a bounded but query-shaped domain')
  }
  if (
    !md.includes('objective: "support zero-budget execution; prioritize bootstrap execution; favor organic growth; package Knowledge Graph Canvas as an MCP offer; serve external users; support OpenClaw marketplace packaging; deliver Pitch Deck + PRD + TAD + TCO; evaluate B2C monetization; compare subscription, pay-per-use, and conversion monetization; expose Stripe payment and checkout integration') &&
    !md.includes('integrate Stripe checkout and payment flow')
  ) {
    throw new Error('Expected latest recommendation fallback to resolve a synthesized objective without clipped raw query fragments')
  }
  if (!md.includes('Which user action should trigger Stripe checkout, and what entitlement or fulfillment should follow payment completion?')) {
    throw new Error('Expected latest recommendation fallback to replace generic open questions with request-shaped ones')
  }
  if (!md.includes('S01 captures the active request brief for `{{product}}`')) {
    throw new Error('Expected latest recommendation fallback workflow wording to stay request-first rather than recommendation-first')
  }
  if (!md.includes('The execution contract below supports the current request:')) {
    throw new Error('Expected latest recommendation fallback computing-flow intro to stay request-facing')
  }
  if (md.includes('Recovered partial response signal:') || md.includes('Working response signal:')) {
    throw new Error('Expected malformed structured assistant fragments to be excluded from fallback prose')
  }
  if (md.includes('## {{doc_type}}') || md.includes('Edit Tier B variables (product, domain, subject, objective, artifact, owner, version, status)') || md.includes('This fallback preserves')) {
    throw new Error('Expected latest recommendation fallback to avoid placeholder body projections and generic template carryover')
  }
}

export function testAgenticOsDeterministicFallbackShapesCreativeScriptQueryWithoutTrademarkCarryover() {
  const requestText = 'generate video script inspired by prometheus + jurassic park (FORBID mention/infringe trademark) `video-script-promessic.md`'
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 20, 19, 20, 54),
    workspacePath: '/chat-log/20260420T192054Z/agenticOs_20260420T192054Z.md',
    requestText,
    assistantText: 'Need a cinematic script draft with awe and danger.',
  })

  assertResponseOnlyFallback(md, 'Need a cinematic script draft with awe and danger.')
  const requiredSnippets = [
    'artifact: "video script"',
    'objective: "develop video script; keep the output original and production-ready; avoid direct trademark or franchise references; translate inspiration into high-level tone, pacing, and atmosphere only"',
    'video-script-promessic.md',
    'avoid direct trademark or franchise references',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected creative script fallback to include: ${snippet}`)
    }
  })

  const forbiddenSnippets = [
    'Recommendation Snapshot',
    'OpenClaw marketplace distribution',
    'B2C monetization',
    'prometheus',
    'jurassic park',
  ]
  forbiddenSnippets.forEach(snippet => {
    if (md.toLowerCase().includes(snippet.toLowerCase())) {
      throw new Error(`Expected creative script fallback to avoid: ${snippet}`)
    }
  })
}

export function testAgenticOsDeterministicFallbackStaysNeutralForGenericRequest() {
  const requestText = 'Draft a concise implementation memo for improving offline sync conflict visibility in a local-first workspace'
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 20, 21, 46, 8),
    workspacePath: '/chat-log/20260420T214608Z/agenticOs_20260420T214608Z.md',
    requestText,
    assistantText: 'Need a short memo with implementation direction and constraints.',
  })

  assertResponseOnlyFallback(md, 'Need a short memo with implementation direction and constraints.')
  const requiredSnippets = [
    '`{{artifact}}`',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected generic fallback to include: ${snippet}`)
    }
  })

  const forbiddenSnippets = [
    '### Use Case',
    '### Monetization Surface',
    '### Integration Boundaries',
    'recommendation package',
    'OpenClaw',
    'Stripe',
    'video-script-promessic.md',
    'This document turns one request into one reusable pipeline artifact.',
  ]
  forbiddenSnippets.forEach(snippet => {
    if (md.includes(snippet)) {
      throw new Error(`Expected generic fallback to avoid: ${snippet}`)
    }
  })
}
