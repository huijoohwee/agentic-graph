import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { buildChatSubmitRequestContext } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import { analyzeKgcRequest } from '@/features/chat/chatKgcRequestProfile'
import { isKgcStructuredMarkdown, normalizeKgcAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import {
  CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT,
  CHAT_BASE_RESPONSE_CONTRACT_PROMPT,
} from '@/features/chat/chatResponseBaseContract'
import { buildStreamArtifactQueryRelevance, renderChatStreamArtifacts } from '@/features/chat/chatStreamArtifacts'
import {
  resolveChatRuntimeInvocationQuery,
  resolveChatRuntimeInvocationResponsiveQueryText,
} from '@/features/chat/chatRuntimeInvocationQuery'
import { buildOpenAiResponsesInput } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenAiResponsesInput'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'

const NO_SLASH_IMAGE_PROMPT = 'what ![strybldr-starter-source.png](http://localhost:5181/api/storage/media/airvio/runs/upload-017d1e965528642f/image/strybldr-starter-source-017d1e965528642f.png?kg_media_token=secret)'
const NO_SLASH_WHATS_IMAGE_PROMPT = "what's ![1920s_Singapore_Malaya_202606190937.jpeg](http://localhost:5180/api/storage/media/airvio/runs/upload-170a76238422bb27/image/1920s_singapore_malaya_202606190937-170a76238422bb27.jpeg?kg_media_token=secret)"
const NO_SLASH_WHATS_IN_IMAGE_PROMPT = "what's in ![1920s_Singapore_Malaya_202606190937.jpeg](http://localhost:5180/api/storage/media/airvio/runs/upload-170a76238422bb27/image/1920s_singapore_malaya_202606190937-170a76238422bb27.jpeg?kg_media_token=secret)"
const NO_SLASH_WHY_IMAGE_PROMPT = "why there's ![1920s_Singapore_Malaya_202606190937.jpeg](http://localhost:5180/api/storage/media/airvio/runs/upload-170a76238422bb27/image/1920s_singapore_malaya_202606190937-170a76238422bb27.jpeg?kg_media_token=secret)"
const MEDIA_ONLY_IMAGE_PROMPT = NO_SLASH_IMAGE_PROMPT.replace(/^what\s+/, '')
const TRACE_ONLY_ASSISTANT_TEXT = [
  '## Provider Stream Trace',
  '',
  'The provider stream is active. Incoming reasoning, tool, and assistant deltas are appended below.',
  '',
  '### Stream Transcript',
  '',
  '[signal]',
  '- Stream events are arriving.',
  '',
  '### Terminal Metadata',
  '',
  '- SSE events: 5',
].join('\n')
const REPEATED_PARTIAL_RESPONSE_YAML = [
  '```yaml',
  'response:',
  '  intent: "Provide a neutral visual description of the attached media."',
  '  domain_vars: {}',
  '  context_scope: "image-analysis:attached image"',
  '  structuredContent:',
  '    cards:',
  '      - id: attached-image-analysis',
  '        label: "Attached image analysis"',
  '        kind: "description"',
  '        output:',
  '          - "The attached image contains a source object that should be described without inventing unavailable context."',
  '  table:',
  '    - id: image-attachment',
  '      field: description',
  '      value: "partial',
  '```yaml',
  'response:',
  '  intent: "Provide a neutral visual description of the attached media."',
  '  domain_vars: {}',
  '  context_scope: "image-analysis:attached image"',
  '  structuredContent:',
  '    cards:',
  '      - id: attached-image-analysis',
  '        label: "Attached image analysis"',
  '        kind: "description"',
  '        output:',
  '          - "The attached image contains a source object that should be described without inventing unavailable context."',
  '  table:',
  '    - id: image-attachment',
  '      field: description',
  '      value: "partial',
].join('\n')

const readStoryboardTemplateContract = (): string =>
  readFileSync(resolve(process.cwd(), '..', '..', 'huijoohwee.github.io', 'template', 'agentic-graph-2d-renderer-storyboard-template.md'), 'utf8')

export function testFloatingPanelChatResponseContractsAdhereToStoryboardTemplate() {
  const template = readStoryboardTemplateContract()
  for (const templateSnippet of [
    'schema: "kgc-2d-renderer-storyboard-template/v1"',
    'kgCanvas2dRenderer: "storyboard"',
    'runtime_readiness:',
    'agentic_os_contract:',
    'semantic_html_projection:',
    '/source.normalize',
    '/runtime-ready.check',
    '@operator',
    '#frontmatter',
  ]) {
    if (!template.includes(templateSnippet)) {
      throw new Error(`Expected storyboard template to expose ${templateSnippet}`)
    }
  }

  for (const contract of [CHAT_BASE_RESPONSE_CONTRACT_PROMPT, CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT]) {
    for (const required of [
      'kgc-2d-renderer-storyboard-template/v1',
      '`kgCanvas2dRenderer: "storyboard"`',
      '`runtime_readiness.status` cannot become runtime-ready without local proof',
      'Prod mirror and Cloudflare remain blocked until explicit operator instruction',
      'Semantic HTML projection uses `main`, `section`, `article`, `header`, `nav`, `aside`, `figure`, `figcaption`, and `table`',
      'no hardcoded source-specific media IDs',
    ]) {
      if (!contract.includes(required)) throw new Error(`Expected response contract to include storyboard template rule: ${required}`)
    }
    for (const forbidden of [`/${'Users'}/huijoohwee`, 'kg_media_token=', 'generated_asset_url: "http']) {
      if (contract.includes(forbidden)) throw new Error(`Expected response contract to avoid local/runtime hardcode: ${forbidden}`)
    }
  }
}

export async function testFloatingPanelChatNoSlashImagePromptKeepsRuntimeInvocationPromptsClean() {
  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: NO_SLASH_IMAGE_PROMPT }],
    assistantMessageId: 'assistant-pending',
  })
  const systemText = context.systemMessages.map(message => message.content).join('\n\n')
  if (context.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('Expected no-slash chatAgenticGraph request to use the plain response base contract')
  }
  for (const required of [
    'Plain no-slash chat stays Markdown/`response:` YAML',
    'kgc-2d-renderer-storyboard-template/v1',
    'Semantic HTML projection uses',
    'runtime_readiness.status',
  ]) {
    if (!systemText.includes(required)) {
      throw new Error(`Expected no-slash plain contract to retain storyboard template rule: ${required}`)
    }
  }
  for (const forbidden of [
    'chatResponseBaseContract slash variant:',
    'agentic-graph vdeoxpln execution contract:',
    'Agentic OS invocation contract:',
    'Storyboard template Agentic OS directive context:',
    'For chatAgenticGraph output',
    'kgc-pipeline/v1',
    'kgc-computing-flow/v1',
    'Computing Flow Definition',
    '/storybuilding',
    'kg_media_token=secret',
  ]) {
    if (systemText.includes(forbidden)) {
      throw new Error(`Expected no-slash image prompt to stay clean of ${forbidden}`)
    }
  }
}

export async function testFloatingPanelChatPrdTadSlashUsesStructuredKgcContract() {
  const userQuery = `/prd-tad.create ${NO_SLASH_WHATS_IMAGE_PROMPT}`
  const runtimeQuery = resolveChatRuntimeInvocationQuery(userQuery)
  if (runtimeQuery.leadingRoute?.token !== '/prd-tad.create') {
    throw new Error(`Expected /prd-tad.create to resolve as leading route, got ${JSON.stringify(runtimeQuery.leadingRoute)}`)
  }
  if (runtimeQuery.query !== NO_SLASH_WHATS_IMAGE_PROMPT) {
    throw new Error(`Expected /prd-tad.create route to keep the remaining request separate, got ${runtimeQuery.query}`)
  }
  const slashProfile = analyzeKgcRequest(userQuery)
  if (slashProfile.product || slashProfile.namedTerms.length > 0 || slashProfile.intent !== "what's [attached image]") {
    throw new Error(`Expected /prd-tad.create profile to treat route as metadata, got ${JSON.stringify({
      intent: slashProfile.intent,
      product: slashProfile.product,
      namedTerms: slashProfile.namedTerms,
    })}`)
  }
  if (slashProfile.artifact !== 'PRD + TAD' || slashProfile.invocation?.token !== '/prd-tad.create') {
    throw new Error(`Expected /prd-tad.create profile to retain PRD/TAD route defaults, got ${JSON.stringify({
      artifact: slashProfile.artifact,
      invocation: slashProfile.invocation,
    })}`)
  }
  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: userQuery }],
    assistantMessageId: 'assistant-pending',
  })
  const systemText = context.systemMessages.map(message => message.content).join('\n\n')
  if (context.systemMessages[0]?.content !== CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('Expected /prd-tad.create chatAgenticGraph request to use the structured KGC base contract')
  }
  const userConversationMessage = context.conversationMessages.find(message => message.role === 'user')
  if (userConversationMessage?.content !== NO_SLASH_WHATS_IMAGE_PROMPT) {
    throw new Error(`Expected provider-facing /prd-tad.create message to use the remaining request, got ${JSON.stringify(userConversationMessage)}`)
  }
  const responsesInput = await buildOpenAiResponsesInput(context.conversationMessages, {
    fetchFn: async () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { status: 200 }),
  })
  const userInputMessage = responsesInput.find(message => message.role === 'user')
  const userInputText = userInputMessage?.content.find(part => part.type === 'input_text')
  const userInputImage = userInputMessage?.content.find(part => part.type === 'input_image')
  const userInputTextValue = userInputText?.type === 'input_text' ? userInputText.text : ''
  const userInputImageUrl = userInputImage?.type === 'input_image' ? userInputImage.image_url : ''
  if (!userInputTextValue || userInputTextValue.includes('/prd-tad.create') || userInputTextValue !== "what's [attached image]") {
    throw new Error(`Expected Responses input_text to match no-slash remaining request, got ${JSON.stringify(userInputText)}`)
  }
  if (!userInputImageUrl.startsWith('data:image/png;base64,')) {
    throw new Error(`Expected Responses input_image to preserve local media attachment, got ${JSON.stringify(userInputMessage?.content)}`)
  }
  for (const required of [
    'For chatAgenticGraph output',
    'Recognized leading invocation tokens such as `/prd-tad.create` are routing metadata',
    '- Leading route: /prd-tad.create (PRD/TAD create).',
    "- Remaining request: what's [attached image].",
    'kgc-pipeline/v1',
    'kgc-computing-flow/v1',
    'Computing Flow Definition',
    'agentic-graph vdeoxpln execution contract:',
    'Runtime invocation routing contract:',
    'Agentic OS invocation contract:',
    'Storyboard template Agentic OS directive context:',
    'Slash routes: /memory.seed, /source.normalize, /harness.define, /canvas.project, /runtime-ready.check, /validation.run, /deploy.guard.',
    'Semantic routes: #frontmatter, #harness, #token-economics, #runtime-ready, #canvas, #approval-gate, #dev-only, #no-hardcode.',
    'Binding routes: @source.frontmatter, @source.body, @local-harness, @runtime-proof, @cost-log, @canvas, @operator, @dev-only.',
    'kgc-2d-renderer-storyboard-template/v1',
    '/prd-tad.create',
  ]) {
    if (!systemText.includes(required)) {
      throw new Error(`Expected /prd-tad.create system prompt to include ${required}`)
    }
  }
  for (const forbidden of [
    'kg_media_token=secret',
    'localhost:5180/api/storage/media',
    'upload-170a76238422bb27',
    '1920s_singapore_malaya_202606190937-170a76238422bb27',
  ]) {
    if (systemText.includes(forbidden)) {
      throw new Error(`Expected /prd-tad.create system prompt to sanitize local media detail: ${forbidden}`)
    }
  }
}

export async function testFloatingPanelChatPrdTadSlashTextQueryMatchesNoSlashProviderPayload() {
  const remainingQuery = 'Draft a concise token economics and TCO plan for a solo dev AI-native harness using FOSS-first runtime choices.'
  const slashQuery = `/prd-tad.create ${remainingQuery}`
  const slashRuntimeQuery = resolveChatRuntimeInvocationQuery(slashQuery)
  if (slashRuntimeQuery.query !== remainingQuery) throw new Error(`Expected /prd-tad.create to preserve remaining text query, got ${slashRuntimeQuery.query}`)
  const slashProfile = analyzeKgcRequest(slashQuery)
  if (slashProfile.intent !== remainingQuery || slashProfile.product === '/prd-tad.create' || slashProfile.namedTerms.includes('/prd-tad.create')) {
    throw new Error(`Expected slash text profile to stay query-responsive, got ${JSON.stringify(slashProfile)}`)
  }

  const noSlashContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: remainingQuery }],
    assistantMessageId: 'assistant-pending',
  })
  const slashContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: slashQuery }],
    assistantMessageId: 'assistant-pending',
  })
  if (noSlashContext.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) throw new Error('Expected no-slash query to keep the plain response contract')
  if (slashContext.systemMessages[0]?.content !== CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT) throw new Error('Expected /prd-tad.create query to select the KGC route contract')
  const slashUserMessage = slashContext.conversationMessages.find(message => message.role === 'user')
  if (slashUserMessage?.content !== remainingQuery) throw new Error(`Expected slash provider message to contain only the remaining query, got ${JSON.stringify(slashUserMessage)}`)
  const responsesInput = await buildOpenAiResponsesInput(slashContext.conversationMessages)
  const userText = responsesInput.find(message => message.role === 'user')?.content.find(part => part.type === 'input_text')
  if (userText?.type !== 'input_text' || userText.text !== remainingQuery || userText.text.includes('/prd-tad.create')) {
    throw new Error(`Expected Responses input_text to match no-slash query text, got ${JSON.stringify(userText)}`)
  }
}

export async function testFloatingPanelChatPrdTadSlashMediaOnlyProviderPayloadCompilesRoute() {
  const placeholderQuery = '/prd-tad.create [attached image]'
  const placeholderResponsiveQuery = resolveChatRuntimeInvocationResponsiveQueryText(placeholderQuery)
  if (placeholderResponsiveQuery !== "what's [attached image]") {
    throw new Error(`Expected sparse slash media query to synthesize no-slash image question, got ${placeholderResponsiveQuery}`)
  }
  const placeholderContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: placeholderQuery }],
    assistantMessageId: 'assistant-pending',
  })
  if (placeholderContext.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('Expected sparse /prd-tad.create media query to use the plain response contract')
  }
  const placeholderUserMessage = placeholderContext.conversationMessages.find(message => message.role === 'user')
  if (
    placeholderUserMessage?.content.includes('/prd-tad.create') ||
    !placeholderUserMessage?.content.startsWith("what's [attached image]?") ||
    !placeholderUserMessage.content.includes('Use the answer as source context for PRD/TAD create.') ||
    !placeholderUserMessage.content.includes('Produce or refresh the combined PRD/TAD contract from validated context.') ||
    placeholderUserMessage.content.startsWith('PRD/TAD create.')
  ) {
    throw new Error(`Expected sparse media slash query to keep a visible user question for provider, got ${JSON.stringify(placeholderUserMessage)}`)
  }

  const slashMediaQuery = `/prd-tad.create ${MEDIA_ONLY_IMAGE_PROMPT}`
  const profile = analyzeKgcRequest(slashMediaQuery)
  if (profile.intent !== "what's [attached image]" || profile.product || profile.namedTerms.length > 0 || profile.artifact !== 'PRD + TAD') {
    throw new Error(`Expected media-only slash profile to keep KGC clean route metadata, got ${JSON.stringify({
      intent: profile.intent,
      product: profile.product,
      namedTerms: profile.namedTerms,
      artifact: profile.artifact,
    })}`)
  }
  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: slashMediaQuery }],
    assistantMessageId: 'assistant-pending',
  })
  const systemText = context.systemMessages.map(message => message.content).join('\n\n')
  if (context.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('Expected media-only slash provider context to use the plain response contract')
  }
  for (const forbidden of ['For chatAgenticGraph output', 'validated KGC Markdown', 'kgc-pipeline/v1']) {
    if (systemText.includes(forbidden)) {
      throw new Error(`Expected media-only slash prompt to avoid KGC-only response contract text: ${forbidden}`)
    }
  }
  const slashUserMessage = context.conversationMessages.find(message => message.role === 'user')
  if (
    slashUserMessage?.content.includes('/prd-tad.create') ||
    !slashUserMessage?.content.startsWith(`what's ${MEDIA_ONLY_IMAGE_PROMPT}?`) ||
    !slashUserMessage.content.includes('Use the answer as source context for PRD/TAD create.') ||
    !slashUserMessage.content.includes('Produce or refresh the combined PRD/TAD contract from validated context.')
  ) {
    throw new Error(`Expected media-only slash provider message to keep media markdown inside a user question, got ${JSON.stringify(slashUserMessage)}`)
  }
  const responsesInput = await buildOpenAiResponsesInput(context.conversationMessages, {
    fetchFn: async () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { status: 200 }),
  })
  const userInputMessage = responsesInput.find(message => message.role === 'user')
  const userInputText = userInputMessage?.content.find(part => part.type === 'input_text')
  const userInputImage = userInputMessage?.content.find(part => part.type === 'input_image')
  if (
    userInputText?.type !== 'input_text' ||
    userInputText.text.includes('/prd-tad.create') ||
    !userInputText.text.startsWith("what's [attached image]?") ||
    !userInputText.text.includes('Use the answer as source context for PRD/TAD create.') ||
    !userInputText.text.includes('Produce or refresh the combined PRD/TAD contract from validated context.')
  ) {
    throw new Error(`Expected Responses input_text to keep sparse slash media query responsive, got ${JSON.stringify(userInputText)}`)
  }
  if (userInputImage?.type !== 'input_image' || !userInputImage.image_url.startsWith('data:image/png;base64,')) {
    throw new Error(`Expected Responses input_image to preserve local media attachment, got ${JSON.stringify(userInputMessage?.content)}`)
  }
}

export function testKgcPrdTadSlashTraceUsesResponseOnlyNoBackfill() {
  const sparseProfile = analyzeKgcRequest('/prd-tad.create [attached image]')
  if (
    sparseProfile.intent !== "what's [attached image]" ||
    sparseProfile.product ||
    sparseProfile.namedTerms.length > 0 ||
    sparseProfile.artifact !== 'PRD + TAD'
  ) {
    throw new Error(`Expected sparse /prd-tad.create prompt to keep attached media as query, got ${JSON.stringify({
      intent: sparseProfile.intent,
      product: sparseProfile.product,
      namedTerms: sparseProfile.namedTerms,
      artifact: sparseProfile.artifact,
    })}`)
  }
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 7, 23, 51, 40),
    workspacePath: '/chat-log/20260707T235140Z/kgc_20260707T235140Z.md',
    requestText: `/prd-tad.create ${NO_SLASH_WHY_IMAGE_PROMPT}`,
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  if (!isKgcStructuredMarkdown(md)) throw new Error('Expected /prd-tad.create trace KGC to stay structured')
  for (const required of [
    '$schema: "kgc-response/v1"',
    'title: "Chat Response"',
    'doc_type: "Chat Response"',
    'kgcResponseOnly: true',
    '# Chat Response',
    'For the request "why there\'s [attached image]"',
    'no answer is backfilled',
  ]) {
    if (!md.includes(required)) throw new Error(`Expected /prd-tad.create storage output to include ${required}`)
  }
  for (const forbidden of [
    '$schema: "kgc-pipeline/v1"',
    'AI Pipeline',
    'Computing Flow Definition',
    'PRD — Product Requirements',
    'TAD — Technical Architecture',
    'title: "PRD/TAD create',
    'doc_type: "PRD + TAD"',
    'artifact: "PRD + TAD"',
    'product: "/prd-tad.create',
    'Product: /prd-tad.create',
    'Named terms: /prd-tad.create',
    'request_scope: /prd-tad.create',
    'For the request "/prd-tad.create',
    'kg_media_token',
    'localhost:5180',
    'upload-170a76238422bb27',
  ]) {
    if (md.includes(forbidden)) throw new Error(`Expected /prd-tad.create storage output to avoid ${forbidden}`)
  }
  const sparseMd = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 8, 5, 35, 27),
    workspacePath: '/chat-log/20260708T053527Z/kgc_20260708T053527Z.md',
    requestText: '/prd-tad.create [attached image]',
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  if (!isKgcStructuredMarkdown(sparseMd)) throw new Error('Expected sparse /prd-tad.create trace KGC to stay structured')
  for (const required of [
    '$schema: "kgc-response/v1"',
    'kgcResponseOnly: true',
    '# Chat Response',
    'For the request "what\'s [attached image]"',
    'no answer is backfilled',
  ]) {
    if (!sparseMd.includes(required)) throw new Error(`Expected sparse /prd-tad.create output to include ${required}`)
  }
  for (const forbidden of [
    '$schema: "kgc-pipeline/v1"',
    'AI Pipeline',
    'Computing Flow Definition',
    'PRD — Product Requirements',
    'TAD — Technical Architecture',
    'title: "PRD/TAD create',
    'doc_type: "PRD + TAD"',
    'artifact: "PRD + TAD"',
    'objective: "deliver PRD + TAD"',
  ]) {
    if (sparseMd.includes(forbidden)) throw new Error(`Expected sparse /prd-tad.create output not to backfill ${forbidden}`)
  }
  const relevance = buildStreamArtifactQueryRelevance(`/prd-tad.create ${NO_SLASH_WHY_IMAGE_PROMPT}`)
  if (
    relevance.intent !== "why there's [attached image]" ||
    relevance.namedTerms.length > 0 ||
    !relevance.focus.startsWith("why there's [attached image]") ||
    relevance.focus.includes('Artifact: PRD + TAD') ||
    relevance.focus.includes('/prd-tad.create') ||
    relevance.focus.includes('deliver PRD + TAD')
  ) {
    throw new Error(`Expected /prd-tad.create trace relevance to focus on remaining request, got ${JSON.stringify(relevance)}`)
  }
  const sparseRelevance = buildStreamArtifactQueryRelevance('/prd-tad.create [attached image]')
  if (
    sparseRelevance.intent !== "what's [attached image]" ||
    sparseRelevance.namedTerms.length > 0 ||
    !sparseRelevance.focus.startsWith("what's [attached image]") ||
    sparseRelevance.focus.includes('Artifact: PRD + TAD') ||
    sparseRelevance.focus.includes('/prd-tad.create') ||
    sparseRelevance.focus.includes('deliver PRD + TAD')
  ) {
    throw new Error(`Expected sparse /prd-tad.create trace relevance to stay query scoped, got ${JSON.stringify(sparseRelevance)}`)
  }
}

export function testKgcAttachedMediaResponsesUseStoryboardTemplateContract() {
  const cases = [
    {
      label: 'no-slash',
      requestText: "what's in [attached image]",
    },
    {
      label: 'slash',
      requestText: '/prd-tad.create [attached image]',
    },
  ] as const
  for (const entry of cases) {
    const md = normalizeKgcAssistantBodyForStorage({
      timestampMs: Date.UTC(2026, 6, 8, 7, 40, 37),
      workspacePath: `/chat-log/regression/kgc_${entry.label}.md`,
      requestText: entry.requestText,
      assistantText: REPEATED_PARTIAL_RESPONSE_YAML,
    })
    if (!isKgcStructuredMarkdown(md)) throw new Error(`Expected ${entry.label} attached-media response to remain structured`)
    parseYaml(md.split('\n---\n')[0]?.replace(/^---\n/, '') || '')
    for (const required of [
      '$schema: "kgc-response/v1"',
      'kgcResponseOnly: true',
      'schema: "kgc-2d-renderer-storyboard-template/v1"',
      'runtime_readiness:',
      'paid_call_count: 0',
      'prod_mirror: "blocked until operator instruction"',
      'cloudflare: "blocked until operator instruction"',
      'agentic_os_contract:',
      'shared_renderer_contract:',
      'semantic_html_projection:',
      'runtime_pipeline:',
      'flow_diagrams:',
      'strybldr_storyboard:',
      'kgCanvas2dRenderer: "storyboard"',
      '# Chat Response',
      '## Response',
    ]) {
      if (!md.includes(required)) throw new Error(`Expected ${entry.label} attached-media response to include ${required}`)
    }
    for (const forbidden of [
      'schema: "kgc-computing-flow/v1"',
      'template_flow_demo',
      'source_input',
      'compute_summary',
      'Rich Media Panel - Text Output',
      'PRD — Product Requirements',
      'TAD — Technical Architecture',
      'Product: /prd-tad.create',
      'Named terms: /prd-tad.create',
      'kg_media_token',
      'localhost:5180',
    ]) {
      if (md.includes(forbidden)) throw new Error(`Expected ${entry.label} attached-media response to avoid ${forbidden}`)
    }
    const responseFenceCount = (md.match(/```yaml\s+response:/g) || []).length
    if (responseFenceCount > 2) {
      throw new Error(`Expected ${entry.label} attached-media response to collapse duplicate response YAML fences, got ${responseFenceCount}`)
    }
  }
}

export function testKgcNoSlashWhatsImagePromptStaysQueryResponsiveAndCleanSlate() {
  for (const prompt of [NO_SLASH_WHATS_IMAGE_PROMPT, NO_SLASH_WHATS_IN_IMAGE_PROMPT, NO_SLASH_WHY_IMAGE_PROMPT]) {
    const profile = analyzeKgcRequest(prompt)
    if (profile.product || profile.namedTerms.length > 0) {
      throw new Error(`Expected attached-image question not to become product/named terms, got ${JSON.stringify({ product: profile.product, namedTerms: profile.namedTerms })}`)
    }
  }

  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 7, 23, 15, 58),
    workspacePath: '/chat-log/20260707T231558Z/kgc_20260707T231558Z.md',
    requestText: NO_SLASH_WHATS_IMAGE_PROMPT,
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  if (!isKgcStructuredMarkdown(md)) throw new Error('Expected no-slash image trace KGC to stay structured')
  for (const required of ['title: "Chat Response"', 'kgcResponseOnly: true', '# Chat Response', 'For the request "what\'s [attached image]"']) {
    if (!md.includes(required)) throw new Error(`Expected clean KGC storage output to include ${required}`)
  }
  for (const forbidden of ['AI Pipeline', 'Computing Flow Definition', 'PRD — Product Requirements', 'TAD — Technical Architecture', 'Recovered partial assistant signal', 'Product: what', 'Named terms: what', 'kg_media_token', 'localhost:5180', 'upload-170a76238422bb27']) {
    if (md.includes(forbidden)) throw new Error(`Expected clean KGC storage output to avoid ${forbidden}`)
  }

  const relevance = buildStreamArtifactQueryRelevance(NO_SLASH_WHATS_IMAGE_PROMPT)
  if (relevance.focus !== "what's [attached image]" || relevance.namedTerms.length > 0) {
    throw new Error(`Expected trace relevance to stay on neutral request intent, got ${JSON.stringify(relevance)}`)
  }
  const whatsInRelevance = buildStreamArtifactQueryRelevance(NO_SLASH_WHATS_IN_IMAGE_PROMPT)
  if (whatsInRelevance.focus !== "what's in [attached image]" || whatsInRelevance.namedTerms.length > 0) {
    throw new Error(`Expected whats-in-image trace relevance to stay on neutral request intent, got ${JSON.stringify(whatsInRelevance)}`)
  }
  const whatsInMd = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 7, 23, 59, 20),
    workspacePath: '/chat-log/20260707T235920Z/kgc_20260707T235920Z.md',
    requestText: NO_SLASH_WHATS_IN_IMAGE_PROMPT,
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  for (const required of ['title: "Chat Response"', '$schema: "kgc-response/v1"', 'kgcResponseOnly: true', 'For the request "what\'s in [attached image]"']) {
    if (!whatsInMd.includes(required)) throw new Error(`Expected clean whats-in-image KGC storage output to include ${required}`)
  }
  for (const forbidden of ['AI Pipeline', '$schema: "kgc-pipeline/v1"', 'Computing Flow Definition', 'Product: what', 'Named terms: what', 'kg_media_token', 'localhost:5180']) {
    if (whatsInMd.includes(forbidden)) throw new Error(`Expected clean whats-in-image KGC storage output to avoid ${forbidden}`)
  }

  const whyMd = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 7, 23, 51, 40),
    workspacePath: '/chat-log/20260707T235140Z/kgc_20260707T235140Z.md',
    requestText: NO_SLASH_WHY_IMAGE_PROMPT,
    assistantText: TRACE_ONLY_ASSISTANT_TEXT,
  })
  if (!isKgcStructuredMarkdown(whyMd)) throw new Error('Expected no-slash why-image trace KGC to stay structured')
  for (const required of ['title: "Chat Response"', '$schema: "kgc-response/v1"', 'kgcResponseOnly: true', '# Chat Response', 'For the request "why there\'s [attached image]"']) {
    if (!whyMd.includes(required)) throw new Error(`Expected clean why-image KGC storage output to include ${required}`)
  }
  for (const forbidden of ['AI Pipeline', '$schema: "kgc-pipeline/v1"', 'Computing Flow Definition', 'PRD — Product Requirements', 'TAD — Technical Architecture', 'Product: why', 'Named terms: why', 'kg_media_token', 'localhost:5180', 'upload-170a76238422bb27']) {
    if (whyMd.includes(forbidden)) throw new Error(`Expected clean why-image KGC storage output to avoid ${forbidden}`)
  }
  const whyRelevance = buildStreamArtifactQueryRelevance(NO_SLASH_WHY_IMAGE_PROMPT)
  if (whyRelevance.focus !== "why there's [attached image]" || whyRelevance.namedTerms.length > 0) {
    throw new Error(`Expected why-image trace relevance to stay on neutral request intent, got ${JSON.stringify(whyRelevance)}`)
  }
}

export function testKgcNoSlashStructuredResponseRejectsDanglingFlowPatchYaml() {
  const repeatedStructuredAnswer = [
    '```yaml',
    'response:',
    '  intent: "Describe the attached image."',
    '  structuredContent:',
    '    panels:',
    '      - id: panel-1',
    '        label: "Image Description"',
    '        kind: "RichMediaPanel"',
    '        output: "A historical coastal street scene with people, a rickshaw, arcades, palm trees, and harbor traffic."',
    '        outputSrcDoc: "A concise visual description for the current image."',
    '```',
    '```yaml',
    'response:',
    '  intent: "Describe the attached image."',
    '  structuredContent:',
    '    panels:',
    '      - id: panel-1',
    '        label: "Image Description"',
    '        kind: "RichMediaPanel"',
    '        output: "A historical coastal street scene with people, a rickshaw, arcades, palm trees, and harbor traffic."',
    '        outputSrcDoc: "A concise visual description for the current image."',
    '```',
  ].join('\n')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 8, 2, 9, 58),
    workspacePath: '/chat-log/20260708T020958Z/kgc_20260708T020958Z.md',
    requestText: "what's this [attached image] about?",
    assistantText: repeatedStructuredAnswer,
  })
  if (!isKgcStructuredMarkdown(md)) throw new Error('Expected malformed-provider response to normalize into structured KGC')
  const frontmatter = md.split('\n---\n')[0]?.replace(/^---\n/, '') || ''
  parseYaml(frontmatter)
  if (md.includes('\n    - {id: "e-mcp-response-')) {
    throw new Error('Expected response-only structured content not to append dangling flow edge rows')
  }
  for (const required of [
    'title: "what\'s this [attached image] about? · Chat Response"',
    'kgcResponseOnly: true',
    'flow:widgetRegistry:',
    'Describe the attached image.',
    'historical coastal street scene',
  ]) {
    if (!md.includes(required)) throw new Error(`Expected normalized no-slash YAML output to include ${required}`)
  }
}

export async function testFloatingPanelChatNoSlashTraceArtifactsSanitizeLocalMediaPrompt() {
  const rendered = await renderChatStreamArtifacts({
    workspacePath: '/chat-log/20260707T232315Z/kgc_20260707T232315Z.md',
    timestampMs: Date.UTC(2026, 6, 7, 23, 23, 15),
    defaultLocalRootPath: '/chat-log',
    traceId: 'trace-no-slash-media',
    providerSummary: 'OpenAI · Global · gpt-5-nano',
    modelId: 'gpt-5-nano',
    requestText: NO_SLASH_WHATS_IMAGE_PROMPT,
    rawAssistantText: TRACE_ONLY_ASSISTANT_TEXT,
    workspaceAssistantText: '',
    usageSummary: null,
    finishReason: null,
    reasoningSteps: [],
    rawSseEvents: [
      JSON.stringify({
        type: 'response.output_text.delta',
        delta: `source ${NO_SLASH_WHATS_IMAGE_PROMPT}`,
      }),
    ],
    status: 'error',
  })
  if (rendered.observedUrls.length > 0) {
    throw new Error(`Expected local media access URLs not to become persisted observed URLs, got ${JSON.stringify(rendered.observedUrls)}`)
  }
  if (!rendered.logText.includes("what's [attached image]")) {
    throw new Error('Expected stream log to preserve neutral attached-image prompt intent')
  }
  for (const forbidden of ['kg_media_token', 'localhost:5180', 'upload-170a76238422bb27', '1920s_Singapore_Malaya_202606190937.jpeg']) {
    if (rendered.logText.includes(forbidden)) throw new Error(`Expected stream log to sanitize local media detail: ${forbidden}`)
  }
}
