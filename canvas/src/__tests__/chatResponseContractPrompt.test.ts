import { readFileSync } from 'node:fs'
import { CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT, CHAT_BASE_RESPONSE_CONTRACT_PROMPT, CHAT_RESPONSE_BASE_PARAMETER_KEYS_GENERIC } from '@/features/chat/chatResponseBaseContract'
import { CHAT_SKILL_OPTIONS, parseChatSkillSlashInvocation } from '@/features/chat/chatSkillRegistry'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'
import { isAgenticOsStructuredMarkdown, normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { extractAgenticOsBlockFromAssistantText } from '@/features/chat/floatingPanelChat/floatingPanelChatAgenticOsPayload'
import { resolveChatAgenticGraphAttempt, resolveAgenticOsCorrectionInvalidMarkdown } from '@/features/chat/floatingPanelChat/floatingPanelChatAgenticOsAttempt'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { buildChatSubmitRequestContext } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import { buildCanonicalAgenticOsTemplateFixtureDocument, buildNeutralAgenticOsFixtureDocument } from '@/__tests__/helpers/neutralAgenticOsFixture'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'

export const readComputingFlowSample = (): string => {
  const p = resolveRepoTestDataPath('markdown-syntax-computing-flow-sample.md')
  return readFileSync(p, 'utf8')
}

export const buildBaseTemplateSample = (): string => {
  return buildCanonicalAgenticOsTemplateFixtureDocument()
}

export function testChatResponseContractPromptIncludesMarkdownGuidelineAndSurfaceKeys() {
  const prompt = CHAT_BASE_RESPONSE_CONTRACT_PROMPT

  const requiredSnippets = [
    'markdown syntax guidelines',
    'Storyboard Widget (2D), Multi-dimensional Table, and Kanban',
    '@edge:src:handle→tgt:handle',
    'ONE fenced yaml block with',
    'root key response:',
    'Tier B keys: product, domain, subject, objective, artifact, owner, version, status.',
    'Table cells: never empty',
    'TBD (unknown) or — (not applicable)', 'Persist every generated table or multi-dimensional table', 'YAML block scalar (`output: |-`)', 'Never author or persist table HTML', '`tables[]` records with neutral `columns` and `rows` data', 'V-10 generated tables',
    'Every streamed paragraph must remain relevant to the active query',
    'never output placeholder or example links',
    'GitGraph, Gantt, and Geospatial outputs follow the same rule',
    'typed `flow_diagrams` data (`mermaid_gitgraph`, `mermaid_gantt`)',
    'GeoJSON/FeatureCollection data may live in neutral `geoJson`/`geojson`/coordinate fields',
    'source/card/widget -> safe compute -> Rich Media Panel `outputSrcDoc`',
    'D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode outputs use neutral frontmatter data',
    '`kgCanvas2dRenderer`, `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas3dMode`, and `kgAsset*`',
    'do not mix them with document version-control GitGraph state, renderer-local Timeline UI, or Geospatial Mode toggles',
  ]
  requiredSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected chat response contract prompt to include: ${snippet}`)
    }
  })

  for (const snippet of [
    'GitGraph, Gantt, and Geospatial requests are dataflow too',
    '`type: mermaid_gitgraph` / `type: mermaid_gantt`',
    'GeoJSON/FeatureCollection payloads',
    'instead of emitting a static copied panel as authority',
    'D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode requests are frontmatter data too',
  ]) {
    if (!CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT.includes(snippet)) {
      throw new Error(`Expected AGENTIC_OS response contract prompt to include: ${snippet}`)
    }
  }

  CHAT_RESPONSE_BASE_PARAMETER_KEYS_GENERIC.forEach(key => {
    if (!prompt.includes(`\`${key}\``)) {
      throw new Error(`Expected chat response contract prompt to include response key: ${key}`)
    }
  })
}

export async function testChatStorybuildingSkillPromptIsModularAndPathNeutral() {
  const requiredVariantCommands = ['/storybuilding', '/investment-research-agent', '/sme-care-agent', '/video-agent']
  const resolvedVariantCommands = requiredVariantCommands.map(command => {
    const invocation = parseChatSkillSlashInvocation(`${command} build a useful artifact`)
    return invocation?.query === 'build a useful artifact' ? invocation.skill.slashCommand : null
  })
  if (resolvedVariantCommands.join('|') !== requiredVariantCommands.join('|')) {
    throw new Error(`Expected registered chatResponseBaseContract slash variants, got ${JSON.stringify(resolvedVariantCommands)}`)
  }
  const storybuilding = CHAT_SKILL_OPTIONS.find(option => option.id === 'storybuilding')
  if (!storybuilding) throw new Error('Expected Storybuilding chat skill to be registered')
  const invocation = parseChatSkillSlashInvocation('/storybuilding build source-backed demo')
  if (invocation?.skill.id !== 'storybuilding' || invocation.query !== 'build source-backed demo') {
    throw new Error(`Expected /storybuilding to resolve to Storybuilding with the remaining query, got ${JSON.stringify(invocation)}`)
  }
  if (parseChatSkillSlashInvocation('/unknown build source-backed demo')) {
    throw new Error('Expected unknown slash commands not to resolve a chat skill')
  }
  const prompt = storybuilding.systemPrompt
  for (const snippet of [
    'Variant: Storybuilding.',
    'Treat `/storybuilding` as a chatResponseBaseContract variant invocation',
    'source-backed storybuilding runbook',
    'story/card lineage',
    'validation checklist',
    'existing chat-log/AGENTIC_OS artifact flow', 'YAML block scalar (`output: |-`)', 'Never author or persist table HTML',
  ]) {
    if (!prompt.includes(snippet)) throw new Error(`Expected Storybuilding skill prompt to include: ${snippet}`)
  }
  const forbiddenDemoPath = [
    '',
    'Users',
    'huijoohwee',
    'Documents',
    'GitHub',
    'huijoohwee',
    'docs',
    ['agentic-graph', 'strybldr', 'demo.md'].join('-'),
  ].join('/')
  const forbiddenVideoId = ['77FAn', 'T935', '1E'].join('')
  const forbiddenCredentialKeys = [
    ['VIDEO', 'DB_API', 'KEY'].join('_'),
    ['SENSE', 'NOVA_API', 'KEY'].join('_'),
  ]
  for (const forbidden of [forbiddenDemoPath, forbiddenVideoId, ...forbiddenCredentialKeys]) {
    if (prompt.includes(forbidden)) throw new Error(`Storybuilding prompt must not hardcode demo fixture detail: ${forbidden}`)
  }

  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [
      { id: 'assistant-pending', role: 'assistant', content: '' },
      { id: 'user-1', role: 'user', content: '/storybuilding Generate a Strybldr storybuilding demo runbook from selected source evidence.' },
    ],
    assistantMessageId: 'assistant-pending',
  })
  if (!context.systemMessages.some(message => message.content.includes(prompt) && message.content.includes('chatAgenticGraph AGENTIC_OS contract'))) {
    throw new Error('Expected chatAgenticGraph request context to include the /storybuilding variant prompt')
  }
  const researchContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatHistory' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: '/investment-research-agent compile claims from these notes' }],
    assistantMessageId: 'assistant-pending',
  })
  if (!researchContext.systemMessages.some(message => message.content.includes('/investment-research-agent') && message.content.includes('plain Markdown chat contract'))) {
    throw new Error('Expected plain chat request context to include the /investment-research-agent variant prompt')
  }
  const inactiveSkillContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Plain AGENTIC_OS chat' }],
    assistantMessageId: 'assistant-pending',
  })
  if (inactiveSkillContext.systemMessages.some(message => message.content.includes(prompt) || message.content.includes('/storybuilding'))) {
    throw new Error('Expected Storybuilding variant prompt to require an explicit slash invocation')
  }

  const chatHistoryContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatHistory' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: '/video-agent build a transcript timeline' }],
    assistantMessageId: 'assistant-pending',
  })
  if (!chatHistoryContext.systemMessages.some(message => message.content.includes('/video-agent') && message.content.includes('source metadata, transcript windows, frame evidence'))) {
    throw new Error('Expected /video-agent variant prompt to work with plain chat history')
  }
}

export function testChatResponseContractPromptStaysCompatibleWithComputingFlowSample() {
  const sample = readComputingFlowSample()
  const prompt = CHAT_BASE_RESPONSE_CONTRACT_PROMPT

  const sampleSnippets = ['flow:', '@node:', '@edge:', '{{subject}}', 'TBD']
  sampleSnippets.forEach(snippet => {
    if (!sample.includes(snippet)) {
      throw new Error(`Expected computing-flow sample fixture to include snippet: ${snippet}`)
    }
  })

  const promptSnippets = ['flow blocks', '@node:id', '@edge:src:handle→tgt:handle', 'Tier B sentinel keys', 'TBD (unknown)', 'not applicable']
  promptSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected chat response contract prompt to cover sample-compatible token: ${snippet}`)
    }
  })
}

export function testChatAgenticOsResponseContractPromptEnforcesComputingFlowShape() {
  const prompt = CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT
  const template = buildBaseTemplateSample()

  const requiredPromptSnippets = [
    'use canonical structure, not canonical wording',
    'schema guidance only',
    'Stream the final document progressively',
    'Every streamed chunk must stay relevant to the active query',
    'Do not widen a narrow request into a stock "PRD + TAD", "monetization pipeline", or similarly prepackaged deliverable',
    'never emit example, placeholder, or fixture URLs',
    'the answer itself must be the AGENTIC_OS document',
    'exactly one standalone AGENTIC_OS document',
    'Do not return prose plus a partial AGENTIC_OS fragment',
    'do not downgrade to a minimal canvas-preset-only document', 'materialize a neutral dataflow',
    'Do not emit stock labels such as "Request Intent"',
    'graphId, doc_type, date, ai_model, and lang MUST be concrete resolved strings.',
    'title SHOULD resolve when product context is known',
    'Mention stack, payments, geospatial, workflow, or distribution details only when present',
    'pipeline[*].node / flow.nodes[*].id / mermaid: node IDs not in exact sync',
    'flow.subgraphs[*]',
    'flow.subgraphs is the only grouping authoring surface',
    'parser projects flow.subgraphs into kg:subgraphs metadata',
    'Do not add a second grouping registry such as group:, layer:, or clusters: beside flow.subgraphs.',
    'Do not instruct any downstream local graph patch layer to reinterpret the document',
    'Never duplicate headings or restate the same requested subsection twice under different labels',
    'Canvas-preset-only fallback output that omits canonical AGENTIC_OS structural blocks',
    'Parallel grouping channels such as retired `clusters:` or duplicate group registries beside flow.subgraphs',
    'n-trigger, n-pack, n-process, n-validate, n-deliver',
    'V-07', 'V-10', 'Generated tables persist as YAML block-scalar GitHub-flavored Markdown pipe tables.',
    '## Customization Guide',
  ]
  requiredPromptSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected AGENTIC_OS response contract prompt to include: ${snippet}`)
    }
  })

  const requiredTemplateSnippets = [
    '$schema: "agentic-os-pipeline/v1"',
    'runtime:',
    'pipeline:',
    'mermaid: |',
    'flow:',
    '## Customization Guide',
    '@edge:n-validate:correction→n-process:correction',
    '{{runtime.maxRetry}}',
  ]
  requiredTemplateSnippets.forEach(snippet => {
    if (!template.includes(snippet)) {
      throw new Error(`Expected base template fixture to include snippet: ${snippet}`)
    }
  })
}

export function testBaseTemplateFixturePassesAgenticOsStructuredAndValidation() {
  const md = buildBaseTemplateSample()
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error('Expected base template fixture to satisfy AGENTIC_OS structured markdown detection')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new Error(`Expected base template fixture to validate, got ${first?.ruleId}: ${first?.message}`)
  }
  const parsed = tryParseMarkdownFrontmatterFlowGraph('agentic-os-canonical-template-fixture.md', md)
  if (!parsed) throw new Error('Expected base template fixture to parse as a frontmatter flow graph')
}

export function testValidateChatMarkdownRejectsWrappedAgenticOsPreamble() {
  const wrapped = [
    'Here is your AGENTIC_OS document:',
    '',
    buildBaseTemplateSample(),
  ].join('\n')
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: wrapped })
  const validation = validateChatMarkdown({ markdown: wrapped, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected validator to reject prose-wrapped AGENTIC_OS output')
  }
  if (validation.failedRuleId !== 'V-03') {
    throw new Error(`Expected wrapped AGENTIC_OS to fail V-03, got ${validation.failedRuleId || 'unknown'}`)
  }
  if (!validation.errors[0]?.message.includes('start immediately with YAML frontmatter')) {
    throw new Error(`Expected wrapped AGENTIC_OS validation message to mention the frontmatter envelope, got: ${validation.errors[0]?.message || 'unknown error'}`)
  }
}

export function testValidateChatMarkdownRejectsCanvasPresetOnlyFallback() {
  const md = [
    '---',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentSemanticMode: "document"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '# Thin fallback',
    '## Note',
    'This shell mentions `{{subject}}` but omits the canonical AGENTIC_OS contract.',
  ].join('\n')
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected validator to reject a canvas-preset-only AGENTIC_OS fallback')
  }
  if (validation.failedRuleId !== 'V-03') {
    throw new Error(`Expected thin canvas-preset fallback to fail V-03, got ${validation.failedRuleId || 'unknown'}`)
  }
  if (!validation.errors[0]?.message.includes('minimal canvas-preset-only')) {
    throw new Error(`Expected thin canvas-preset fallback message to mention minimal fallback, got: ${validation.errors[0]?.message || 'unknown error'}`)
  }
}

export function testValidateChatMarkdownRejectsParallelGroupingChannelsBesideFlowSubgraphs() {
  const md = buildBaseTemplateSample().replace(
    'flow:\n',
    [
      'kg:subgraphs:',
      '  - {id: invalid-sg, kind: subgraph, label: "Invalid", memberNodeIds: ["n-trigger"], parentId: null}',
      'flow:',
      '',
    ].join('\n'),
  )
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected validator to reject parallel grouping channels beside flow.subgraphs')
  }
  if (validation.failedRuleId !== 'V-03') {
    throw new Error(`Expected duplicate grouping channels to fail V-03, got ${validation.failedRuleId || 'unknown'}`)
  }
  if (!validation.errors[0]?.message.includes('flow.subgraphs as the only grouping source of truth')) {
    throw new Error(`Expected duplicate grouping validation message to mention flow.subgraphs SSOT, got: ${validation.errors[0]?.message || 'unknown error'}`)
  }
}

export function testValidateChatMarkdownAcceptsCanonicalFlowSubgraphsWithoutParallelGroupingChannels() {
  const md = buildBaseTemplateSample()
  if (/(^|\n)kg:subgraphs\s*:/m.test(md) || /(^|\n)(?:clusters|groups?|layers?)\s*:/m.test(md)) {
    throw new Error('Expected base template fixture to avoid parallel top-level grouping aliases')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    throw new Error(`Expected canonical flow.subgraphs-only AGENTIC_OS to validate, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testNormalizeAgenticOsAssistantBodyForStorageSalvagesWrappedStructuredDocument() {
  const wrapped = [
    'Here is your corrected AGENTIC_OS document.',
    '',
    '```markdown',
    buildBaseTemplateSample().trim(),
    '```',
  ].join('\n')
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 4, 22, 16, 10, 0),
    workspacePath: '/chat-log/20260522T161000Z/agenticOs_20260522T161000Z.md',
    requestText: '',
    assistantText: wrapped,
  })
  if (!md.startsWith('---\n')) {
    throw new Error('Expected wrapped structured AGENTIC_OS salvage to start directly with YAML frontmatter')
  }
  if (md.includes('Here is your corrected AGENTIC_OS document.')) {
    throw new Error('Expected wrapped structured AGENTIC_OS salvage to strip wrapper prose before persistence')
  }
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error('Expected wrapped structured AGENTIC_OS salvage to remain structurally parseable')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    throw new Error(`Expected wrapped structured AGENTIC_OS salvage to validate, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testNormalizeAgenticOsAssistantBodyForStorageRejectsParallelGroupingStructuredDocument() {
  const invalid = buildBaseTemplateSample().replace(
    'flow:\n',
    [
      'kg:subgraphs:',
      '  - {id: invalid-sg, kind: subgraph, label: "Invalid", memberNodeIds: ["n-trigger"], parentId: null}',
      'flow:',
      '  clusters:',
      '    - id: invalid-cluster',
      '      label: "Invalid cluster"',
      '      memberNodeIds: ["n-process"]',
      '',
    ].join('\n'),
  )
  const md = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 4, 22, 16, 12, 0),
    workspacePath: '/chat-log/20260522T161200Z/agenticOs_20260522T161200Z.md',
    requestText: 'Create a clean response contract for FloatingPanel Chat.',
    assistantText: invalid,
  })
  if (md.includes('invalid-sg') || md.includes('invalid-cluster') || /(^|\n)kg:subgraphs\s*:/m.test(md) || /\n\s+clusters:\s*\n/.test(md)) {
    throw new Error('Expected invalid parallel grouping payload to be rejected instead of mutated into storage')
  }
  if (!isAgenticOsStructuredMarkdown(md)) {
    throw new Error('Expected rejected parallel grouping payload to rebuild a structurally parseable AGENTIC_OS')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    throw new Error(`Expected canonical rebuilt AGENTIC_OS to validate, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testExtractAgenticOsBlockFromAssistantTextSalvagesWrappedStructuredMarkdownDocument() {
  const wrapped = [
    'Here is your corrected AGENTIC_OS document.',
    '',
    '```markdown',
    buildBaseTemplateSample().trim(),
    '```',
  ].join('\n')
  const extracted = extractAgenticOsBlockFromAssistantText(wrapped)
  if (!extracted.agenticOs || !extracted.agenticOs.startsWith('---\n')) {
    throw new Error('Expected wrapped markdown response to yield a direct structured AGENTIC_OS candidate')
  }
  if (extracted.agenticOs.includes('Here is your corrected AGENTIC_OS document.')) {
    throw new Error('Expected wrapped markdown recovery to strip wrapper prose from the AGENTIC_OS candidate')
  }
  if (!isAgenticOsStructuredMarkdown(extracted.agenticOs)) {
    throw new Error('Expected wrapped markdown recovery candidate to remain structurally parseable')
  }
  if (extracted.answer !== 'Here is your corrected AGENTIC_OS document.') {
    throw new Error(`Expected wrapped markdown recovery to preserve only the prose wrapper as answer, got: ${extracted.answer || 'empty'}`)
  }
}

export function testExtractAgenticOsBlockFromAssistantTextPreservesParallelGroupingForValidation() {
  const invalid = buildBaseTemplateSample().replace(
    'flow:\n',
    [
      'kg:subgraphs:',
      '  - {id: invalid-sg, kind: subgraph, label: "Invalid", memberNodeIds: ["n-trigger"], parentId: null}',
      'flow:',
      '  groups:',
      '    - id: invalid-group',
      '      label: "Invalid group"',
      '      memberNodeIds: ["n-process"]',
      '',
    ].join('\n'),
  )
  const extracted = extractAgenticOsBlockFromAssistantText(invalid)
  if (!extracted.agenticOs) {
    throw new Error('Expected invalid structured document to keep a recovered AGENTIC_OS candidate for validation')
  }
  if (!/(^|\n)kg:subgraphs\s*:/m.test(extracted.agenticOs) || !/\n\s+groups:\s*\n/.test(extracted.agenticOs)) {
    throw new Error('Expected recovery to preserve invalid grouping for validator rejection')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: extracted.agenticOs })
  const validation = validateChatMarkdown({ markdown: extracted.agenticOs, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected preserved parallel grouping candidate to fail validation')
  }
  if (!validation.errors[0]?.message.includes('flow.subgraphs as the only grouping source of truth')) {
    throw new Error(`Expected validation to reject parallel grouping, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testResolveAgenticOsCorrectionInvalidMarkdownPrefersRecoveredStructuredAgenticOsCandidate() {
  const wrapped = [
    'Here is your corrected AGENTIC_OS document.',
    '',
    '```markdown',
    buildBaseTemplateSample().trim(),
    '```',
  ].join('\n')
  const extracted = extractAgenticOsBlockFromAssistantText(wrapped)
  const invalidMarkdown = resolveAgenticOsCorrectionInvalidMarkdown({
    rawAssistantText: wrapped,
    extracted,
  })
  if (!invalidMarkdown.startsWith('---\n')) {
    throw new Error('Expected correction invalid-markdown source to start with the recovered AGENTIC_OS document')
  }
  if (invalidMarkdown.includes('Here is your corrected AGENTIC_OS document.')) {
    throw new Error('Expected correction invalid-markdown source to avoid raw wrapper prose when a structured AGENTIC_OS candidate was recovered')
  }
}

export function testResolveAgenticOsCorrectionInvalidMarkdownFallsBackToTrimmedAnswerWhenNoAgenticOsRecovered() {
  const raw = [
    'Here is my explanation first.',
    '',
    'The model did not return a standalone AGENTIC_OS document yet.',
    '',
    'Please retry.',
  ].join('\n')
  const extracted = extractAgenticOsBlockFromAssistantText(raw)
  const invalidMarkdown = resolveAgenticOsCorrectionInvalidMarkdown({
    rawAssistantText: raw,
    extracted,
  })
  if (invalidMarkdown !== raw.trim()) {
    throw new Error(`Expected correction invalid-markdown fallback to use the trimmed extracted answer, got: ${invalidMarkdown}`)
  }
}

export function testResolveChatAgenticGraphAttemptRetriesUsingRecoveredStructuredCandidate() {
  const thinWrapped = [
    'Please fix this AGENTIC_OS document.',
    '',
    '```markdown',
    '---',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentSemanticMode: "document"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '# Thin fallback',
    '## Note',
    'This shell omits the canonical AGENTIC_OS contract.',
    '```',
  ].join('\n')
  const result = resolveChatAgenticGraphAttempt({
    assistantText: thinWrapped,
    packedFrontmatter: null,
    attempt: 1,
    maxValidationAttempts: 2,
  })
  if (result.kind !== 'retry') {
    throw new Error(`Expected thin wrapped AGENTIC_OS attempt to request retry, got ${result.kind}`)
  }
  if (result.correctionPrompt.includes('Please fix this AGENTIC_OS document.')) {
    throw new Error('Expected retry correction prompt to use the recovered AGENTIC_OS candidate, not the raw wrapper prose')
  }
  if (!result.correctionPrompt.includes('kgFrontmatterModeEnabled: true')) {
    throw new Error('Expected retry correction prompt to include the recovered thin AGENTIC_OS candidate for reference')
  }
}

export function testResolveChatAgenticGraphAttemptFinalizesValidatedCanonicalAgenticOs() {
  const canonical = buildNeutralAgenticOsFixtureDocument({
    timestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
    workspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
    requestText: 'Generate a canonical AGENTIC_OS document and apply it to Canvas.',
    assistantText: 'Create a neutral AGENTIC_OS document that finalizes through chatAgenticGraph validation.',
    expectationLabel: 'neutral validated AGENTIC_OS fixture',
  })
  const result = resolveChatAgenticGraphAttempt({
    assistantText: canonical,
    packedFrontmatter: null,
    attempt: 1,
    maxValidationAttempts: 2,
  })
  if (result.kind !== 'final') {
    throw new Error(`Expected canonical AGENTIC_OS attempt to finalize, got ${result.kind}`)
  }
  if (!result.validatedAgenticOs || !result.validatedAgenticOs.startsWith('---\n')) {
    throw new Error('Expected canonical AGENTIC_OS attempt to return validated AGENTIC_OS markdown')
  }
  if (result.finalAssistantText !== canonical) {
    throw new Error('Expected canonical AGENTIC_OS attempt to preserve the assistant text on successful validation')
  }
}
