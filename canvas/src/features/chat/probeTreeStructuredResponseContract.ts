import {
  AGENTICGRAPH_PROBE_TREE_GENERATE_TOOL_NAME,
  AGENTICGRAPH_PROBE_TREE_INVOCATION_TOKENS,
  AGENTICGRAPH_PROBE_TREE_MAX_DEPTH,
  AGENTICGRAPH_PROBE_TREE_SELECT_TOOL_NAME,
  buildAgenticGraphProbeTreePromptPreset,
} from '@/features/agentic-os/probeTreePromptPreset'
import {
  PROBE_TREE_CARD_VARIANTS,
  PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
  normalizeProbeTreeContextAnchors,
  normalizeProbeTreeSelectionOptions,
} from '@/features/agent-ready/probeTreeContract.mjs'
import { FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import type { JSONValue } from '@/lib/graph/types'
import {
  PROBE_TREE_TYPE_TWO_LAYOUT_ID,
  buildWidgetCardLayoutSeed,
} from '@/lib/storyboardWidget/widgetCardLayoutVariants'
import { readFieldValue, readFirstString } from './chatResponseStructuredRecord'

export { PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION } from '@/features/agent-ready/probeTreeContract.mjs'

const PROBE_TREE_DIRECT_TOOL_PATTERN = /\bagenticgraph\.probe\.(?:generate|select)\b/i

const hasProbeTreeInvocation = (userQuery: string): boolean => {
  if (PROBE_TREE_DIRECT_TOOL_PATTERN.test(userQuery)) return true
  const tokens = new Set(
    [...String(userQuery || '').matchAll(/(^|\s)([/#@][A-Za-z0-9_.-]+)/g)]
      .map(match => String(match[2] || '').toLowerCase()),
  )
  return AGENTICGRAPH_PROBE_TREE_INVOCATION_TOKENS.some(token => tokens.has(token.toLowerCase()))
}

export function buildProbeTreeCardMaterializationPrompt(userQuery: string): string {
  if (!hasProbeTreeInvocation(userQuery)) return ''
  return [
    'Probe-Tree LLM response contract:',
    `- Contract: ${PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION}.`,
    '- Treat the active request or selected card as the current probe node.',
    '- Resolve authored /agenticgraph.probe-tree, #agenticgraph.probe-tree, or @agenticgraph.probe-tree metadata through agenticgraph.agentic_canvas_os.docs.invoke when that MCP tool is connected.',
    '- When the local agenticgraph MCP tools are connected, invoke agenticgraph.probe.generate once with thread_root_id, current_node_id, context_text, k between 2 and 4, and the bounded token_budget.',
    '- Accept a literal MCP result at result.structuredContent.response.structuredContent; otherwise produce the same response.structuredContent shape without claiming that a tool ran.',
    '- Return 2-4 concrete, context-specific next questions; do not emit generic process cards such as "Clarify probe", "Generate branches", or "Select handoff".',
    '- Reject every canned wrapper: scope/priority/constraint over the whole query, pairwise relationship questions, evidence/decision-basis/deliverable templates, and choices such as compare current evidence, resolve the dependency, or choose the decision order. Ask only about concrete missing parameters that materially change this request.',
    '- Never copy or paraphrase the active request as a card question. Each question must introduce a concrete missing decision variable while keeping the request subject and named entities intact; conservative morphological variants are allowed.',
    '- Treat named entities and alternatives already supplied by the user as subjects to clarify, not as a ready-made answer list. Suggested answers may introduce plausible user preferences for the missing variable but must not assert invented facts.',
    '- An explicit Probe-Tree invocation is an explicit request for questions or branches. Its topic remains a clarification topic when it begins with an action verb such as recommend, compare, assess, or plan; do not reinterpret that wording as a terminal generation request.',
    '- The runtime resolves terminal continuation answers such as an explicit request to generate the report before entering this card contract. Never return an empty cards array merely because the active Probe-Tree topic is phrased imperatively.',
    '- The local no-model MCP path never synthesizes clarification cards or restates the source query. Widget Run sends the selected context and literal MCP result to the configured chat LLM; if no configured model yields 2-4 distinct cards, fail closed as insufficient context.',
    '- Give every card a different request-specific decision variable; reject reused choice labels, repeated selection sets, and subset or superset variants of another card.',
    '- Make every selectionOptions item a context-relevant suggested clarification answer to its exact card question; never split, copy, or relabel the selected focus. Reject the complete card if any answer is only a number, range, unit, named entity, or similarly mechanical label. Every answer must express a semantic preference, tradeoff, or consequence, and number-bearing answers must explain what the quantity means for the decision.',
    '- For a provider-authored response, include one fenced JSON block rooted at `response.structuredContent` with `contractVersion` and only 2-4 records in `response.structuredContent.cards`; the runtime owns the source Widget, Rich Media ledger, edges, lineage ids, depth, selection mode, Other, and empty user Output.',
    '- Each provider card must include only id, question, rationale, evidenceNeeded, probeTreeCardVariant: probe-tree-type-2, and 2-4 concise string selectionOptions. The runtime derives source-verbatim contextAnchors from semantic overlap between each accepted question and the selected user input.',
    '- Mention the request subject plus at least one named entity or distinctive request term in every question. Do not emit contextAnchors. Do not emit widgets, panels, edges, parentNodeId, candidateOptionId, probeTreeDepth, selectionMode, allowOther, nextAction, or output.',
    '- A literal MCP result retains its complete source Widget, cards, Rich Media ledger, and edge envelope; the runtime validates that envelope but never asks the configured provider to reproduce it.',
    `- Put the model-generated probe question in question so the card renders it as Summary; the runtime derives bounded depth at or below ${AGENTICGRAPH_PROBE_TREE_MAX_DEPTH}, leaves output empty for the user-owned selection, and makes every numbered choice a concise answer to that card's question.`,
    '- On continuation, the selected child card and its committed multi-selection own the next topic. The runtime persists that commitment through agenticgraph.probe.select; the provider must not emit the action. Use preceding cards only as lineage context and never substitute the thread root or a same-id root alias.',
    '- The runtime assigns the selected child as parentNodeId and infers candidateOption edges after acceptance; the provider supplies semantic card content only.',
    '- Describe proposed tool handoffs without claiming execution, persistence, paid calls, approval, or MCP invocation unless a real tool result is present.',
  ].join('\n')
}

export function isProbeTreeStructuredResponseCard(
  record: Record<string, unknown>,
  role: string,
): boolean {
  if (role !== 'card') return false
  if (!readFirstString(record, ['question'])) return false
  if (readFirstString(record, ['probeTreeCardVariant']) !== PROBE_TREE_CARD_VARIANTS.boundedMultiSelect) return false
  if (normalizeProbeTreeSelectionOptions(readFieldValue(record, 'selectionOptions')).length < 2) return false
  if (!readFirstString(record, ['rationale'])) return false
  if (!readFirstString(record, ['evidenceNeeded', 'evidence_needed'])) return false
  return true
}

export function resolveProbeTreeStructuredResponseNodeTypeId(args: {
  record: Record<string, unknown>
  role: string
  fallbackNodeTypeId: string
}): string {
  return isProbeTreeStructuredResponseCard(args.record, args.role)
    ? FLOW_TEXT_GENERATION_NODE_TYPE_ID
    : args.fallbackNodeTypeId
}

const readProbeTreeDepth = (record: Record<string, unknown>): number => {
  const raw = readFieldValue(record, 'probeTreeDepth') ?? readFieldValue(record, 'probe_tree_depth')
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw || ''))
  if (!Number.isFinite(value)) return 1
  return Math.min(AGENTICGRAPH_PROBE_TREE_MAX_DEPTH, Math.max(1, Math.floor(value)))
}

export function buildProbeTreeStructuredResponseProperties(args: {
  record: Record<string, unknown>
  role: string
  index: number
}): Record<string, JSONValue> {
  if (!isProbeTreeStructuredResponseCard(args.record, args.role)) return {}
  const parentNodeId = readFirstString(args.record, ['parentNodeId', 'parent_node_id', 'parentId', 'parent_id'])
  const candidateOptionId = readFirstString(args.record, ['candidateOptionId', 'candidate_option_id']) || `candidate-${args.index + 1}`
  const question = readFirstString(args.record, ['question'])
  const rationale = readFirstString(args.record, ['rationale'])
  const evidenceNeeded = readFirstString(args.record, ['evidenceNeeded', 'evidence_needed'])
  const confidence = readFirstString(args.record, ['confidence']) || 'unspecified'
  const nextAction = readFirstString(args.record, ['nextAction', 'next_action']) || AGENTICGRAPH_PROBE_TREE_SELECT_TOOL_NAME
  const selectionOptions = normalizeProbeTreeSelectionOptions(readFieldValue(args.record, 'selectionOptions'))
  const contextAnchors = normalizeProbeTreeContextAnchors(readFieldValue(args.record, 'contextAnchors'))
  const action = evidenceNeeded
    ? `Verify ${evidenceNeeded}, then review ${nextAction}.`
    : `Review this branch, then ${nextAction}.`
  const layoutSeed = buildWidgetCardLayoutSeed(PROBE_TREE_TYPE_TWO_LAYOUT_ID)
  return {
    ...(layoutSeed?.properties as Record<string, JSONValue> | undefined),
    selectionOptions,
    contextAnchors,
    probeTreeUserInputAnchors: contextAnchors,
    lane: 'PROBE',
    index: `P${args.index + 1}`,
    summary: question,
    action,
    prompt: buildAgenticGraphProbeTreePromptPreset([question, rationale].filter(Boolean).join(' ')),
    invocationTokens: [...AGENTICGRAPH_PROBE_TREE_INVOCATION_TOKENS],
    invocation: AGENTICGRAPH_PROBE_TREE_GENERATE_TOOL_NAME,
    responseContractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
    responseStructuredContentKind: 'cards',
    responseMaterialization: 'response.structuredContent.cards',
    probeTreeResponseMode: 'llm-contract',
    probeTreeCandidateKey: candidateOptionId,
    probeTreeTool: nextAction,
    nextAction,
    probeTreeDepth: readProbeTreeDepth(args.record),
    parentGraphNodeId: parentNodeId,
    parentNodeId,
    candidateStatus: 'selectable',
    branchStatus: 'candidate',
    rationale,
    evidenceNeeded,
    confidence,
    tags: ['probe-tree', 'candidateOption', 'llm-contract'],
  }
}
