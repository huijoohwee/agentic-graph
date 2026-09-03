import { listAgentDefinitions } from '../../../../contracts/agent-runtime.schema.js'
import { CHAT_TABLE_PERSISTENCE_CONTRACT_PROMPT } from './chatTablePersistenceContract'

export type ChatSkillId = string

export type ChatSkillOption = {
  id: ChatSkillId
  label: string
  slashCommand: string
  summary: string
  keywords: readonly string[]
  systemPrompt: string
}

const STORYBUILDING_SKILL: ChatSkillOption = {
    id: 'storybuilding',
    label: 'Storybuilding',
    slashCommand: '/storybuilding',
    summary: 'Source-backed storybuilding response contract for storyboard, Strybldr, and runtime-ready story flows.',
    keywords: ['story', 'storyboard', 'strybldr', 'storytree', 'runbook'],
    systemPrompt: [
      'Variant: Storybuilding.',
      'Treat `/storybuilding` as a chatResponseBaseContract variant invocation and answer the remaining request.',
      'When the user asks for a demo, storyboard, Strybldr/storytree artifact, or runtime-ready story flow, produce a source-backed storybuilding runbook.',
      'Use the active workspace/source-file context as evidence. Treat any demo or runbook already present in context as structural guidance only; do not clone its prose, fixture IDs, fixture URLs, media handles, credentials, or local filesystem paths.',
      'The response must be runtime-ready: declare portable frontmatter or response.structuredContent data, story/card lineage, neutral renderer intent, explicit dataflow edges, validation inputs, and human-readable body sections derived from the declared data.',
      'Prefer universal storybuilding semantics: proof goal, source evidence, import/input lanes, text/image/video generation lanes, storyboard card lineage, validation checklist, acceptance criteria, and unresolved open questions.',
      'Never hardcode repository paths, sibling publication paths, fixture media URLs, fixture media ids, API keys, or browser-stored secrets. If a concrete value is missing from current context, leave a neutral placeholder or open question instead of inventing it.',
      'Persist the final answer through the existing chat-log/AGENTIC_OS artifact flow; do not ask for a separate downstream patch layer or local backfill.',
      CHAT_TABLE_PERSISTENCE_CONTRACT_PROMPT,
    ].join('\n'),
  }

const buildAgentChatSkillOptions = (): ChatSkillOption[] => listAgentDefinitions().map(definition => ({
  id: definition.id.replace(/^agent\./, '') + '-agent',
  label: definition.title,
  slashCommand: definition.invocation,
  summary: definition.summary,
  keywords: Array.from(new Set([
    ...definition.id.replace(/^agent\./, '').split('-'),
    ...definition.capabilities.flatMap(capability => capability.split(/[.-]/)),
  ])).filter(Boolean),
  systemPrompt: [
    `Variant: ${definition.title}.`,
    `Treat \`${definition.invocation}\` as a chatResponseBaseContract agent invocation and answer the remaining request.`,
    `Agent definition: ${definition.id}@${definition.version}. Plan profile: ${definition.planProfile}.`,
    ...definition.promptContract,
    `Fallback: ${definition.fallback}`,
    `Policy references: ${definition.policyRefs.join(', ')}.`,
    'Use available workspace/source context first. Mark missing evidence as unknown instead of fabricating citations, metrics, URLs, provenance, or media artifacts.',
    'For chatAgenticGraph output, express the result as a complete AGENTIC_OS document. For plain chat, keep Markdown concise and use response.structuredContent only for renderable cards, panels, nodes, edges, media, or tables.',
    CHAT_TABLE_PERSISTENCE_CONTRACT_PROMPT,
  ].join('\n'),
}))

export const CHAT_SKILL_OPTIONS: ChatSkillOption[] = [
  STORYBUILDING_SKILL,
  ...buildAgentChatSkillOptions(),
]

const normalizeSlashCommandToken = (value: unknown): string =>
  String(value || '').trim().toLowerCase().replace(/^\/+/, '')

export const resolveChatSkillBySlashCommand = (value: unknown): ChatSkillOption | null => {
  const command = normalizeSlashCommandToken(value)
  if (!command) return null
  return CHAT_SKILL_OPTIONS.find(option => normalizeSlashCommandToken(option.slashCommand) === command) || null
}

export const parseChatSkillSlashInvocation = (raw: unknown): {
  skill: ChatSkillOption
  query: string
} | null => {
  const text = String(raw || '').trim()
  if (!text.startsWith('/')) return null
  const match = text.match(/^\/([A-Za-z0-9_.-]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null
  const skill = resolveChatSkillBySlashCommand(match[1])
  if (!skill) return null
  return {
    skill,
    query: String(match[2] || '').trim(),
  }
}

export const buildChatSkillInvocationSystemPrompt = (args: {
  invocation: { skill: ChatSkillOption; query: string }
  chatStorageTarget: 'chatHistory' | 'chatAgenticGraph'
}): string => {
  const targetContract = args.chatStorageTarget === 'chatAgenticGraph'
    ? 'chatAgenticGraph AGENTIC_OS contract'
    : 'plain Markdown chat contract'
  return [
    'chatResponseBaseContract slash variant:',
    `- Slash variant: ${args.invocation.skill.slashCommand} (${args.invocation.skill.label}).`,
    `- Active base contract: ${targetContract}.`,
    `- Remaining request: ${args.invocation.query || '(empty; ask one focused clarifying question if needed)'}.`,
    '- Apply this as a narrow extension of the active base response contract. If no slash variant is present, use the plain vanilla base contract only.',
    args.invocation.skill.systemPrompt,
  ].join('\n')
}
