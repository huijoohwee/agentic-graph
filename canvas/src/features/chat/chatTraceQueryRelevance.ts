import { analyzeAgenticOsRequest, sanitizeRequestIntent } from './chatAgenticOsRequestProfile'

export type ChatTraceQueryRelevance = {
  intent: string
  focus: string
  requestedSections: string[]
  namedTerms: string[]
}

const REQUESTED_SECTION_LABELS: Record<string, string> = {
  useCase: 'Use Case',
  problem: 'Problem',
  solution: 'Solution',
  userFlow: 'User Flow',
  workflow: 'Work Flow',
  dataFlow: 'Data Flow',
  goals: 'Goals',
  userStories: 'User Stories',
  monetization: 'Monetization',
  integrations: 'Integration',
}

const uniqueText = (values: readonly string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  values.forEach(value => {
    const text = String(value || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(text)
  })
  return out
}

const clampText = (value: unknown, maxLength: number): string => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...` : text
}

export const buildChatTraceQueryRelevance = (requestText: string): ChatTraceQueryRelevance => {
  const profile = analyzeAgenticOsRequest(requestText)
  const intent = sanitizeRequestIntent(profile.intent, 320) || 'Prompt unavailable.'
  const requestedSections = Object.entries(profile.requestedSections)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => REQUESTED_SECTION_LABELS[key] || key)
  const focusParts = uniqueText([
    intent,
    profile.domain ? `Domain: ${profile.domain}` : '',
    requestedSections.length > 0 ? `Requested Sections: ${requestedSections.join(', ')}` : '',
    ...profile.topics,
  ])
  return {
    intent,
    focus: clampText(focusParts.join(' | '), 260) || intent,
    requestedSections,
    namedTerms: [],
  }
}
