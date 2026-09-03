import { normalizeAgenticOsAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { extractChatResponseStructuredSurface } from '@/features/chat/chatResponseStructuredContent'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'

export function testChatResponseNeutralCardRemainsResponseOnly() {
  const assistantText = [
    'A passive response card with no executable behavior.',
    '',
    '```yaml',
    'response:',
    '  structuredContent:',
    '    cards:',
    '      - id: neutral-card',
    '        label: Neutral Card',
    '        kind: text',
    '        output: "This answer remains a response surface."',
    '```',
  ].join('\n')

  const surface = extractChatResponseStructuredSurface(assistantText)
  const card = surface?.nodes.find(node => node.id === 'mcp-response-neutral-card')
  if (
    !card
    || card.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    || surface?.edges.some(edge => edge.source !== 'n-deliver')
  ) {
    throw new Error(`Expected a passive Rich Media card with delivery-only topology, got: ${JSON.stringify(surface)}`)
  }

  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 24, 12, 0, 0),
    workspacePath: '/workspace/chat/20260724T120000Z/agenticOs_20260724T120000Z.md',
    requestText: 'Summarize the answer.',
    assistantText,
  })
  if (!markdown.includes('$schema: "agentic-os-response/v1"') || !markdown.includes('agenticOsResponseOnly: true')) {
    throw new Error(`Expected a passive Rich Media card to remain response-only, got: ${markdown}`)
  }
}

export function testChatResponseExecutablePanelUsesPipeline() {
  const assistantText = [
    'An executable response panel owns flow runtime behavior.',
    '',
    '```yaml',
    'response:',
    '  structuredContent:',
    '    panels:',
    '      - id: executable-panel',
    '        label: Executable Panel',
    '        nodeTypeId: TextGeneration',
    '        formId: textGeneration',
    '        kind: text',
    '        prompt: "Generate a runtime-owned response."',
    '        flow:compute: "inputs => ({ text_out: String(inputs.prompt_in || \'\') })"',
    '```',
  ].join('\n')

  const surface = extractChatResponseStructuredSurface(assistantText)
  const panel = surface?.nodes.find(node => node.id === 'mcp-response-executable-panel')
  if (
    !panel
    || panel.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || typeof panel.properties['flow:compute'] !== 'string'
  ) {
    throw new Error(`Expected executable panel capability to survive extraction, got: ${JSON.stringify(panel)}`)
  }

  const markdown = normalizeAgenticOsAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 6, 24, 12, 1, 0),
    workspacePath: '/workspace/chat/20260724T120100Z/agenticOs_20260724T120100Z.md',
    requestText: 'Summarize the answer.',
    assistantText,
  })
  if (!markdown.includes('$schema: "agentic-os-pipeline/v1"') || markdown.includes('agenticOsResponseOnly: true')) {
    throw new Error(`Expected executable TextGeneration panel to use the pipeline contract, got: ${markdown}`)
  }
}
