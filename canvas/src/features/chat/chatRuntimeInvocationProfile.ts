import {
  findAgenticOsInvocationByToken,
  type AgenticOsResolvedInvocation,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { parseChatInvocationDirectives } from './chatInvocationRegistry'
import { parseChatSkillSlashInvocation } from './chatSkillRegistry'
import {
  resolveChatRuntimeInvocationQuery,
  resolveChatRuntimeInvocationResponsiveQueryText,
  sanitizeRuntimeInvocationQueryText,
} from './chatRuntimeInvocationQuery'
import { CHAT_STORYBOARD_TEMPLATE_AGENTIC_OS_DIRECTIVE_PROMPT } from './chatStoryboardTemplateContract'
import { buildProbeTreeCardMaterializationPrompt } from './probeTreeStructuredResponseContract'

export const collectAgenticOsRuntimeInvocations = (userQuery: string): AgenticOsResolvedInvocation[] => {
  const found = new Map<string, AgenticOsResolvedInvocation>()
  const text = String(userQuery || '')
  for (const match of text.matchAll(/(^|\s)([/#@][A-Za-z0-9_.-]+)/g)) {
    const invocation = findAgenticOsInvocationByToken(match[2])
    if (invocation) found.set(invocation.token.toLowerCase(), invocation)
  }
  return [...found.values()]
}

export const hasRecognizedChatRuntimeInvocation = (userQuery: string): boolean => {
  if (parseChatSkillSlashInvocation(userQuery)) return true
  if (parseChatInvocationDirectives(userQuery).length > 0) return true
  if (/\bagentic-graph\.probe\.(?:generate|select)\b/i.test(userQuery)) return true
  return collectAgenticOsRuntimeInvocations(userQuery).length > 0
}

export const buildAgenticOsRuntimeInvocationSystemPrompt = (userQuery: string): string => {
  const invocations = collectAgenticOsRuntimeInvocations(userQuery)
  const probeTreePrompt = buildProbeTreeCardMaterializationPrompt(userQuery)
  if (invocations.length === 0 && !probeTreePrompt) return ''
  const runtimeQuery = resolveChatRuntimeInvocationQuery(userQuery)
  const remainingRequest = sanitizeRuntimeInvocationQueryText(resolveChatRuntimeInvocationResponsiveQueryText(userQuery))
  return [
    'Agentic OS invocation contract:',
    `- Directives: ${invocations.map(invocation => invocation.token).join(', ')}`,
    runtimeQuery.leadingRoute
      ? `- Leading route: ${runtimeQuery.leadingRoute.token} (${runtimeQuery.leadingRoute.label}).`
      : '',
    `- Remaining request: ${remainingRequest || '(empty; ask one focused clarifying question if needed)'}.`,
    ...invocations.map(invocation => (
      `- ${invocation.token}: ${invocation.label}; ${invocation.summary}; Source: ${invocation.sourcePath}`
    )),
    '- Treat source documents as reference context only; this does not authorize Prod mirror or Cloudflare deployment.',
    '- Keep command outputs inside the active response contract; PRD/TAD and computing-flow commands use the structured AGENTIC_OS scaffold when that contract is selected.',
    probeTreePrompt,
    CHAT_STORYBOARD_TEMPLATE_AGENTIC_OS_DIRECTIVE_PROMPT,
  ].filter(Boolean).join('\n')
}

export const buildRuntimeInvocationRoutingSystemPrompt = (userQuery: string): string => {
  const runtimeQuery = resolveChatRuntimeInvocationQuery(userQuery)
  if (!runtimeQuery.leadingRoute) return ''
  const remainingRequest = sanitizeRuntimeInvocationQueryText(resolveChatRuntimeInvocationResponsiveQueryText(userQuery))
  return [
    'Runtime invocation routing contract:',
    `- Leading route: ${runtimeQuery.leadingRoute.token} (${runtimeQuery.leadingRoute.label}).`,
    `- Route summary: ${runtimeQuery.leadingRoute.summary}`,
    `- Remaining request: ${remainingRequest || '(empty; ask one focused clarifying question if needed)'}.`,
    '- Treat the leading route as response-shape and capability metadata only.',
    '- Keep the final answer, evidence search, trace focus, requested sections, and generated body prose centered on the remaining request.',
    '- If the remaining request is only an attached-media placeholder, use the attached media payload as the query subject; do not substitute a stock route scaffold.',
    '- If the provider/tool stream has no final assistant text or no accessible media payload, mark trace-only/no-backfill instead of inventing missing content.',
  ].join('\n')
}
