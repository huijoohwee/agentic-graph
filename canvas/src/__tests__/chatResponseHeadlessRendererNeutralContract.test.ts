import { CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT } from '@/features/chat/chatResponseBaseContract'

export function testChatResponseContractPromptRequiresHeadlessRendererNeutralOutput() {
  const text = CHAT_BASE_AGENTIC_OS_RESPONSE_CONTRACT_PROMPT
  const requiredSnippets = [
    'headless and renderer-neutral',
    'portable frontmatter plus Markdown data',
    'text, image, audio, video, card, widget, and edge semantics as data',
    'Editor Workspace, Storyboard, Strybldr, Rich Media Panels, Cards, and Edges',
    'inline-edit through shared owners',
    'response.structuredContent.frontmatter',
    'metadata projection never becomes a graph backfill channel',
    'storytree branches',
    'kgStrybldrStoryboard',
    'storytree.nodes[].parentNodeId',
    'candidateRuns[].parentNodeId',
    'never paste static connector geometry',
    'input/card/story output handles feed a compute widget',
  ]
  requiredSnippets.forEach(snippet => {
    if (!text.includes(snippet)) throw new Error(`Expected AGENTIC_OS response contract to require neutral shared-surface output: ${snippet}`)
  })
}
