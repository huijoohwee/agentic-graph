import { isKgcStructuredMarkdown, normalizeKgcAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function testKgcTurnGenerationIsParseableAndStable() {
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 16, 16, 49, 20),
    requestText: 'Generate a base-template KGC document for chatAgenticGraph persistence',
    assistantText: 'not a KGC document',
  })

  assert(isKgcStructuredMarkdown(md), 'expected generated KGC markdown to be structurally parseable')

  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  assert(validation.ok, `expected generated KGC markdown to pass validation, got: ${validation.errors[0]?.message || 'unknown error'}`)
}

