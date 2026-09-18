import { unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import {
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  normalizeAgenticOsDocsMcpInvocationTokens,
  type AgenticOsDocsMcpBridgeSuccess,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { extractChatResponseStructuredSurface } from '@/features/chat/chatResponseStructuredContent'
import { containsMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { splitSlides } from '@/features/markdown/ui/markdownPreviewSlides'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'

export const RICH_MEDIA_DELIVERABLES_MODE_PROPERTY = 'richMediaDeliverablesMode'
export const RICH_MEDIA_SLIDE_DECK_OUTPUT_KEY = 'markdown-slide-deck'
export const RICH_MEDIA_FINANCIAL_MODEL_OUTPUT_KEY = 'financial-model-spreadsheet'
const RICH_MEDIA_DELIVERABLES_MAX_SOURCE_CHARS = 40_000
const RICH_MEDIA_DELIVERABLES_MAX_INSTRUCTION_CHARS = 4_000

export type RichMediaDeliverablesResult = {
  slideDeckMarkdown: string
  financialModelMarkdown: string
}

export function isRichMediaDeliverablesWidget(properties: Record<string, unknown>): boolean {
  const raw = properties[RICH_MEDIA_DELIVERABLES_MODE_PROPERTY]
  const value = unwrapKeyTypeValue(raw)
  return value === true || String(value || '').trim().toLowerCase() === 'true'
}

export function collectRichMediaDeliverablesInvocationTokens(instructions: string): string[] {
  return normalizeAgenticOsDocsMcpInvocationTokens(
    splitInvocationTokenSegments(String(instructions || ''))
      .filter(segment => segment.kind === 'token')
      .map(segment => segment.value),
  )
}

const boundedMcpEvidence = (response: AgenticOsDocsMcpBridgeSuccess | null): string => {
  if (!response) return 'No MCP invocation tokens were requested.'
  return JSON.stringify({
    tool: response.tool,
    mcpInvoked: response.mcpInvoked,
    invocations: response.invocations.map(invocation => ({
      token: invocation.token,
      ok: invocation.ok,
      kind: invocation.kind,
      label: invocation.label,
      summary: invocation.summary,
      sourcePath: invocation.sourcePath,
      error: invocation.error,
    })),
  })
}

export function buildRichMediaDeliverablesGenerationPrompt(args: {
  sourceMarkdown: string
  instructions: string
  mcpResponse: AgenticOsDocsMcpBridgeSuccess | null
}): string {
  return [
    'You generate exactly two reusable Rich Media deliverables from the connected source.',
    'Return JSON only. Do not wrap it in prose or a Markdown fence.',
    'The required shape is:',
    '{"structuredContent":{"panels":[{"id":"slide-deck","title":"Slide Deck","kind":"text","richMediaDeliverableKind":"slide-deck","output":"# Slide 1\\n\\n---\\n\\n# Slide 2"}],"tables":[{"id":"financial-model","title":"Financial Model","kind":"table","richMediaDeliverableKind":"financial-model","columns":["Metric","Base case","Downside","Upside","Source / assumption"],"rows":[["Example","...","...","...","..."]] }]}}',
    'Deck requirements: at least two non-empty Markdown slides separated by a line containing only ---.',
    'Financial-model requirements: return columns and rows suitable for a Markdown pipe table; preserve currency and unit labels.',
    'Ground every claim and number in the connected source. Mark missing values as TBD and state assumptions explicitly.',
    '',
    'Authored instructions:',
    String(args.instructions || '').trim().slice(0, RICH_MEDIA_DELIVERABLES_MAX_INSTRUCTION_CHARS),
    '',
    `MCP evidence (${AGENTIC_OS_DOCS_MCP_TOOL_NAME}):`,
    boundedMcpEvidence(args.mcpResponse),
    '',
    'Connected Rich Media source:',
    String(args.sourceMarkdown || '').trim().slice(0, RICH_MEDIA_DELIVERABLES_MAX_SOURCE_CHARS),
  ].join('\n')
}

const readNodeString = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function parseRichMediaDeliverablesResponse(responseText: string): RichMediaDeliverablesResult {
  const surface = extractChatResponseStructuredSurface(responseText)
  if (!surface) throw new Error('Deliverables generation returned no structured Rich Media content.')
  const slideNode = surface.nodes.find(node => (
    readNodeString(node.properties.richMediaDeliverableKind).toLowerCase() === 'slide-deck'
    || /slide[ -]?deck/i.test(`${node.id} ${node.label}`)
  ))
  const financialNode = surface.nodes.find(node => (
    readNodeString(node.properties.richMediaDeliverableKind).toLowerCase() === 'financial-model'
    || /financial[ -]?model|spreadsheet/i.test(`${node.id} ${node.label}`)
  ))
  const slideDeckMarkdown = readNodeString(slideNode?.properties.output)
  const financialModelMarkdown = readNodeString(financialNode?.properties.output)
  const nonEmptySlides = splitSlides(slideDeckMarkdown).slides.filter(slide => slide.text.trim())
  if (nonEmptySlides.length < 2) {
    throw new Error('Deliverables generation must return at least two non-empty Markdown slides.')
  }
  if (!containsMarkdownPipeTable(financialModelMarkdown)) {
    throw new Error('Deliverables generation must return the financial model as a Markdown pipe table.')
  }
  return { slideDeckMarkdown, financialModelMarkdown }
}
