import { buildPackedContextSystemPrompt } from '@/features/chat/chatContextPack'
import { buildChatSubmitRequestContext } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import { analyzeAgenticOsRequest } from '@/features/chat/chatAgenticOsRequestProfile'
import { CHAT_BASE_RESPONSE_CONTRACT_PROMPT } from '@/features/chat/chatResponseBaseContract'
import { resolveChatRuntimeInvocationResponsiveQueryText } from '@/features/chat/chatRuntimeInvocationQuery'
import { buildOpenAiResponsesInput } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenAiResponsesInput'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { NO_SLASH_IMAGE_PROMPT, MEDIA_ONLY_IMAGE_PROMPT } from './helpers/floatingPanelChatNoSlashFixtures'

const WORKSPACE_SCHEMA_EVIDENCE = '---\n$schema: agentic-os-pipeline/v1\n---\nworkspace-evidence-7ca2'

const readGeneratedInstructionText = (context: Awaited<ReturnType<typeof buildChatSubmitRequestContext>>): string => {
  const instructions = context.headlessPreparation.systemMessages
  const packedEvidence = buildPackedContextSystemPrompt(context.packedContext)
  const evidence = context.systemMessages.filter(message => message.content === packedEvidence
    || (message.content.startsWith('Workspace-wide context is available from Explorer files, Source Files, and Workspace Editor.')
      && message.content.includes('workspace-evidence-7ca2')))
  if (context.headlessPreparation.responseContract !== 'plain'
    || !instructions.every(message => context.systemMessages.includes(message))
    || evidence.length !== 2
    || evidence[0].content !== buildPackedContextSystemPrompt(context.packedContext)
    || !evidence[1].content.includes('workspace-evidence-7ca2')
    || !evidence[1].content.includes('agentic-os-pipeline/v1')) {
    throw new Error(`expected plain instructions plus packed and workspace evidence, got ${JSON.stringify({ contract: context.headlessPreparation.responseContract, instructions: instructions.length, evidence: evidence.map(message => message.content.slice(0, 100)) })}`)
  }
  return context.systemMessages.filter(message => !evidence.includes(message)).map(message => message.content).join('\n\n')
}

export async function testFloatingPanelChatNoSlashImagePromptKeepsRuntimeInvocationPromptsClean() {
  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph', markdownText: WORKSPACE_SCHEMA_EVIDENCE }),
    nextMessages: [{ id: 'user-1', role: 'user', content: NO_SLASH_IMAGE_PROMPT }],
    assistantMessageId: 'assistant-pending',
  })
  const systemText = readGeneratedInstructionText(context)
  if (context.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('Expected no-slash chatAgenticGraph request to use the plain response base contract')
  }
  for (const required of [
    'Plain no-slash chat stays Markdown/`response:` YAML',
    'agentic-os-2d-renderer-storyboard-template/v1',
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
    'agentic-os-pipeline/v1',
    'agentic-os-computing-flow/v1',
    'Computing Flow Definition',
    '/storybuilding',
    'agentic_os_media_token=secret',
  ]) {
    if (systemText.includes(forbidden)) {
      throw new Error(`Expected no-slash image prompt to stay clean of ${forbidden}`)
    }
  }
}

export async function testFloatingPanelChatPrdTadSlashMediaOnlyProviderPayloadCompilesRoute() {
  const placeholderQuery = '/prd-tad.create [attached image]'
  const placeholderResponsiveQuery = resolveChatRuntimeInvocationResponsiveQueryText(placeholderQuery)
  if (placeholderResponsiveQuery !== "what's [attached image]") {
    throw new Error(`Expected sparse slash media query to synthesize no-slash image question, got ${placeholderResponsiveQuery}`)
  }
  const placeholderContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph', markdownText: WORKSPACE_SCHEMA_EVIDENCE }),
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
  const profile = analyzeAgenticOsRequest(slashMediaQuery)
  if (profile.intent !== "what's [attached image]" || profile.product || profile.namedTerms.length > 0 || profile.artifact !== 'PRD + TAD') {
    throw new Error(`Expected media-only slash profile to keep AGENTIC_OS clean route metadata, got ${JSON.stringify({
      intent: profile.intent,
      product: profile.product,
      namedTerms: profile.namedTerms,
      artifact: profile.artifact,
    })}`)
  }
  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph', markdownText: WORKSPACE_SCHEMA_EVIDENCE }),
    nextMessages: [{ id: 'user-1', role: 'user', content: slashMediaQuery }],
    assistantMessageId: 'assistant-pending',
  })
  const systemText = readGeneratedInstructionText(context)
  if (context.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('Expected media-only slash provider context to use the plain response contract')
  }
  for (const forbidden of ['For chatAgenticGraph output', 'validated AGENTIC_OS Markdown', 'agentic-os-pipeline/v1']) {
    if (systemText.includes(forbidden)) {
      throw new Error(`Expected media-only slash prompt to avoid AGENTIC_OS-only response contract text: ${forbidden}`)
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
