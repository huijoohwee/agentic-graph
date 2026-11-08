import { DESIGN_ICONS } from '@agentic-base/views-react/controls'
const { Bot, Brain, Film, Hash, HeartPulse, Link2, Search, SquareTerminal, Users } = DESIGN_ICONS
import type { MainPanelTypeIconComponent } from './mainPanelHelpIconLibrary'

export const MAIN_PANEL_INVOCATION_SUBJECT_ICON_KEYS = [
  'invocation.prefix.slash',
  'invocation.prefix.hash',
  'invocation.prefix.at',
  'invocation.subject.agent',
  'invocation.subject.story',
  'invocation.subject.video',
  'invocation.subject.research',
  'invocation.subject.memory',
  'invocation.subject.profile',
  'invocation.subject.care',
] as const

export type MainPanelInvocationSubjectIconKey = (typeof MAIN_PANEL_INVOCATION_SUBJECT_ICON_KEYS)[number]

export const MAIN_PANEL_INVOCATION_SUBJECT_ICON_META_BY_KEY = {
  'invocation.prefix.slash': { category: 'Invocation subject', label: 'Slash command', Icon: SquareTerminal },
  'invocation.prefix.hash': { category: 'Invocation subject', label: 'Semantic keyword', Icon: Hash },
  'invocation.prefix.at': { category: 'Invocation subject', label: 'Binding reference', Icon: Link2 },
  'invocation.subject.agent': { category: 'Invocation subject', label: 'Agent command', Icon: Bot },
  'invocation.subject.story': { category: 'Invocation subject', label: 'Story command', Icon: Film },
  'invocation.subject.video': { category: 'Invocation subject', label: 'Video command', Icon: Film },
  'invocation.subject.research': { category: 'Invocation subject', label: 'Research command', Icon: Search },
  'invocation.subject.memory': { category: 'Invocation subject', label: 'Memory command', Icon: Brain },
  'invocation.subject.profile': { category: 'Invocation subject', label: 'Profile command', Icon: Users },
  'invocation.subject.care': { category: 'Invocation subject', label: 'Care command', Icon: HeartPulse },
} satisfies Record<
  MainPanelInvocationSubjectIconKey,
  Readonly<{
    category: string
    label: string
    Icon: MainPanelTypeIconComponent
  }>
>

export type MainPanelInvocationSubjectIconInput = Readonly<{
  label?: unknown
  token?: unknown
  summary?: unknown
  group?: unknown
  kind?: unknown
  sourcePath?: unknown
  keywords?: readonly unknown[]
}>

const normalizeInvocationIconText = (value: unknown): string =>
  String(value || '').trim().toLowerCase()

const readInvocationIconHaystack = (input: MainPanelInvocationSubjectIconInput): string => [
  input.label,
  input.token,
  input.summary,
  input.group,
  input.kind,
  input.sourcePath,
  ...(input.keywords || []),
].map(normalizeInvocationIconText).join(' ')

export function resolveMainPanelInvocationSubjectIconKey(
  input: MainPanelInvocationSubjectIconInput,
): MainPanelInvocationSubjectIconKey {
  const token = normalizeInvocationIconText(input.token)
  const labelToken = `${normalizeInvocationIconText(input.label)} ${token}`
  const haystack = readInvocationIconHaystack(input)

  if (/\bagent\b/.test(labelToken) || /(?:^|[/.:-])agent(?:$|[/.:-])/.test(token) || /-agent\b/.test(token)) return 'invocation.subject.agent'
  if (/\b(care|health|medical|clinical)\b/.test(labelToken)) return 'invocation.subject.care'
  if (/\b(profile|personality|persona|user|moa)\b/.test(labelToken)) return 'invocation.subject.profile'
  if (/\b(memory|session|soul|remember|compact)\b/.test(labelToken)) return 'invocation.subject.memory'
  if (/\b(research|thesis|search|query|evidence)\b/.test(labelToken)) return 'invocation.subject.research'
  if (/\b(video|film|camera|media|animatic|render)\b/.test(labelToken)) return 'invocation.subject.video'
  if (/\b(story|storyboard|storybuilding|script|narrative|strybldr)\b/.test(labelToken)) return 'invocation.subject.story'
  if (/\b(care|health|medical|clinical)\b/.test(haystack)) return 'invocation.subject.care'
  if (/\b(profile|personality|persona|user|moa)\b/.test(haystack)) return 'invocation.subject.profile'
  if (/\b(video|film|camera|media|animatic|render)\b/.test(haystack)) return 'invocation.subject.video'
  if (/\b(story|storyboard|storybuilding|script|narrative|strybldr)\b/.test(haystack)) return 'invocation.subject.story'
  if (/\b(research|thesis|search|query|evidence)\b/.test(haystack)) return 'invocation.subject.research'
  if (/\b(memory|session|soul|remember|compact)\b/.test(haystack)) return 'invocation.subject.memory'
  if (token.startsWith('#')) return 'invocation.prefix.hash'
  if (token.startsWith('@')) return 'invocation.prefix.at'
  return 'invocation.prefix.slash'
}
