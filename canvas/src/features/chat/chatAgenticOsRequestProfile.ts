import {
  resolveChatRuntimeInvocationQuery,
  resolveChatRuntimeInvocationResponsiveQueryText,
} from './chatRuntimeInvocationQuery'

export const AGENTIC_OS_TIER_B_KEYS = [
  'product',
  'domain',
  'subject',
  'objective',
  'artifact',
  'owner',
  'version',
  'status',
] as const

export type AgenticOsTierBKey = (typeof AGENTIC_OS_TIER_B_KEYS)[number]

export type AgenticOsRequestedSections = {
  useCase: boolean
  problem: boolean
  solution: boolean
  userFlow: boolean
  workflow: boolean
  dataFlow: boolean
  goals: boolean
  userStories: boolean
  monetization: boolean
  integrations: boolean
}

export type AgenticOsRequestProfile = {
  intent: string
  invocation: {
    token: string
    label: string
    query: string
  } | null
  product: string
  domain: string
  subject: string
  objective: string
  artifact: string
  owner: string
  version: string
  status: string
  topics: string[]
  namedTerms: string[]
  outputFile: string
  signals: AgenticOsRequestSignals
  requestedSections: AgenticOsRequestedSections
}

export type AgenticOsRequestSignals = {
  recommendation: boolean
  computingFlow: boolean
  creativeScript: boolean
  trademarkAvoidance: boolean
  headlessStructured: boolean
  strybldr: boolean
  storytree: boolean
  gitGraph: boolean
  gantt: boolean
  richMediaPanels: boolean
  zeroBudget: boolean
  bootstrap: boolean
  organicGrowth: boolean
  mcp: boolean
  externalUsers: boolean
  marketplace: boolean
  openClaw: boolean
  b2c: boolean
  subscriptions: boolean
  payPerUse: boolean
  conversion: boolean
  payments: boolean
  stripe: boolean
  foss: boolean
  rxdb: boolean
  maplibre: boolean
}

const SUBJECT_CANDIDATES = [
  'solo founder',
  'founder',
  'product manager',
  'project manager',
  'researcher',
  'analyst',
  'developer',
  'designer',
  'operator',
  'planner',
  'student',
  'teacher',
  'marketer',
  'architect',
] as const

const ARTIFACT_PATTERNS: Array<{ rx: RegExp; label: string }> = [
  { rx: /\bpitch deck\b/i, label: 'Pitch Deck' },
  { rx: /\bprd\b/i, label: 'PRD' },
  { rx: /\btad\b/i, label: 'TAD' },
  { rx: /\btco\b/i, label: 'TCO' },
  { rx: /\brfc\b/i, label: 'RFC' },
  { rx: /\bmemo\b/i, label: 'memo' },
  { rx: /\bbrief\b/i, label: 'brief' },
  { rx: /\bplan\b/i, label: 'plan' },
  { rx: /\broadmap\b/i, label: 'roadmap' },
  { rx: /\bworkflow\b/i, label: 'workflow' },
  { rx: /\bspec(?:ification)?\b/i, label: 'specification' },
  { rx: /\bproposal\b/i, label: 'proposal' },
  { rx: /\breport\b/i, label: 'report' },
  { rx: /\bresponse\b/i, label: 'response' },
  { rx: /\barchitecture\b/i, label: 'architecture' },
  { rx: /\bvideo script\b/i, label: 'video script' },
  { rx: /\bscript\b/i, label: 'script' },
  { rx: /\bstoryboard\b/i, label: 'storyboard' },
]

const TOPIC_PATTERNS: Array<{ rx: RegExp; label: string }> = [
  { rx: /\bmcp\b/i, label: 'MCP distribution' },
  { rx: /\bmarketplace\b/i, label: 'marketplace delivery' },
  { rx: /\bsubscription\b|\bpricing\b|\bmonetization\b|\bmoneti[sz]e\b|\bmake money\b|\bpay[- ]?per[- ]?use\b|\busage\b/i, label: 'usage monetization' },
  { rx: /\bconversion\b|\bcheckout\b|\bpayment\b|\bpayments\b|\bcommerce\b/i, label: 'conversion workflow' },
  { rx: /\blocal-first\b|\boffline\b|\bsync\b|\brxdb\b|\bstorage\b/i, label: 'local-first state' },
  { rx: /\bmaplibre\b|\bgeospatial\b|\bspatial\b|\bmap\b/i, label: 'spatial workflows' },
  { rx: /\bapi\b|\bintegration\b|\bintegrations\b|\btool\b|\btools\b/i, label: 'tool integration' },
  { rx: /\bvideo\b|\bscript\b|\bscene\b|\bstory\b|\bnarrative\b|\btrailer\b/i, label: 'narrative scripting' },
]

export const sanitizeRequestIntent = (raw: string, maxChars = 240): string => {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' [attached image] ')
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
    .replace(/\bhttps?:\/\/\S+/gi, ' [url] ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

export const sanitizeScalar = (raw: string, maxChars = 120): string => {
  return String(raw || '')
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .trim()
    .slice(0, maxChars)
}

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)))

const inferSubject = (lowered: string): string => {
  return SUBJECT_CANDIDATES.find(role => lowered.includes(role)) || ''
}

const TERM_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'as',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
])

const NEUTRAL_ATTACHED_MEDIA_QUESTION_LEADS = new Set([
  'what',
  'what in',
  'what s',
  'what s in',
  'whats',
  'whats in',
  'what is',
  'what is in',
  'what are',
  'what does',
  'which',
  'who',
  'where',
  'when',
])

const NEUTRAL_ATTACHED_MEDIA_INSPECTION_LEADS = new Set([
  'analyse',
  'analyze',
  'describe',
  'explain',
  'identify',
  'inspect',
  'read',
  'review',
  'summarise',
  'summarize',
])

const NEUTRAL_ATTACHED_MEDIA_INSPECTION_RX = /^(?:analyse|analyze|describe|explain|identify|inspect|read|review|summari[sz]e)(?:\s+(?:about|briefly|content|contents|for me|image|in detail|it|media|object|photo|picture|scene|that|the|this|visually))*$/

export const isAttachedImageQuestionTerm = (raw: string): boolean => {
  const normalized = String(raw || '')
    .toLowerCase()
    .replace(/['\u2019]/g, ' ')
    .replace(/[?!.]+/g, ' ')
    .replace(/[\[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const attachedMediaRx = /\battached (?:image|video|audio|media)\b/g
  if (!/\battached (?:image|video|audio|media)\b/.test(normalized)) return false
  const lead = normalized
    .replace(attachedMediaRx, ' ')
    .replace(/\bthere\s+s\b/g, 'theres')
    .replace(/\s+/g, ' ')
    .trim()
  if (!lead) return true
  if (NEUTRAL_ATTACHED_MEDIA_QUESTION_LEADS.has(lead)) return true
  if (NEUTRAL_ATTACHED_MEDIA_INSPECTION_LEADS.has(lead)) return true
  if (NEUTRAL_ATTACHED_MEDIA_INSPECTION_RX.test(lead)) return true
  return /^(?:why(?:\s+(?:is|are|does|do|did|there\s+is|there's|theres))?|how(?:\s+(?:is|are|does|do|did|can|would))?)$/.test(lead)
}

const normalizeNamedTerm = (raw: string, maxChars = 90): string => {
  const cleaned = sanitizeScalar(raw, maxChars)
    .replace(/^[\s:;,.()[\]{}"'`]+|[\s:;,.()[\]{}"'`]+$/g, '')
    .replace(/^(?:please|draft|write|create|generate|build|make|fix|improve|enhance|finetune|recommend)\s+/i, '')
    .replace(/^(?:and|or|plus)\s+/i, '')
    .replace(/^(?:a|an|the)\s+(?:concise\s+|neutral\s+|short\s+|detailed\s+)?(?:implementation\s+|technical\s+|product\s+)?(?:memo|brief|report|response|plan|specification|proposal|draft)\s+for\s+/i, '')
    .replace(/^.*\binspired by\s+/i, '')
    .replace(/\s+(?:please|thanks)$/i, '')
    .trim()
  if (!cleaned) return ''
  const attachedImageProbe = cleaned
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (isAttachedImageQuestionTerm(attachedImageProbe)) return ''
  if (/^(?:forbid|avoid|no trademark|non[- ]?infring)/i.test(cleaned)) return ''
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 1 && TERM_STOPWORDS.has(words[0])) return ''
  if (words.length > 0 && words.every(word => TERM_STOPWORDS.has(word))) return ''
  return cleaned
}

const addTerm = (terms: string[], raw: string, maxChars = 90): void => {
  const term = normalizeNamedTerm(raw, maxChars)
  if (!term || term.length < 2) return
  const wordCount = term.split(/\s+/).length
  const highSignal = /[A-Z]{2,}|[A-Z][a-z]+[A-Z]|[0-9]|[-/]|%/.test(term)
  if (wordCount === 1 && !highSignal) return
  terms.push(term)
}

const splitTermConnectors = (raw: string): string[] => {
  return String(raw || '')
    .split(/\s+(?:vs\.?|versus)\s+|\s+\+\s+|\s+\/\s+|\s+(?:and|or)\s+/i)
    .map(term => term.trim())
    .filter(Boolean)
}

const inferGenericNamedTerms = (intent: string): string[] => {
  const terms: string[] = []
  for (const match of String(intent || '').matchAll(/\*\*([^*]{2,100})\*\*|`([^`\n]{2,100})`|"([^"\n]{2,100})"/g)) {
    addTerm(terms, match[1] || match[2] || match[3] || '')
  }
  for (const match of String(intent || '').matchAll(/\b[A-Z][A-Z0-9]{1,9}\b/g)) addTerm(terms, match[0], 32)
  for (const match of String(intent || '').matchAll(/\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b/g)) addTerm(terms, match[0], 48)
  for (const match of String(intent || '').matchAll(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g)) addTerm(terms, match[0], 48)
  for (const match of String(intent || '').matchAll(/\b\d+\s*[–-]\s*\d+\s*(?:day|week|month|quarter|year)s?\s+(?:horizon|window|range)\b/gi)) {
    addTerm(terms, match[0], 64)
  }
  const chunks = String(intent || '')
    .replace(/\([^)]{2,120}\)/g, match => `; ${match.slice(1, -1)}; `)
    .split(/[;,\n—]|(?:\s+-\s+)/g)
  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    const colonParts = trimmed.split(/\s*:\s*/g).filter(Boolean)
    for (const part of colonParts) {
      addTerm(terms, part)
      for (const connectorTerm of splitTermConnectors(part)) addTerm(terms, connectorTerm)
    }
  }
  for (const match of String(intent || '').matchAll(/\b(?:about|around|for|on|using|via|with)\s+([^,.;\n]{3,100})/gi)) {
    addTerm(terms, match[1] || '')
  }
  return unique(terms).slice(0, 16)
}

const normalizeTermForComparison = (raw: string): string => {
  return String(raw || '')
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const inferTrademarkAvoidanceExcludedTerms = (intent: string): string[] => {
  const excluded: string[] = []
  for (const match of String(intent || '').matchAll(/\binspired by\s+([^.;\n`(]{2,160})/gi)) {
    const span = match[1] || ''
    addTerm(excluded, span)
    for (const connectorTerm of splitTermConnectors(span)) addTerm(excluded, connectorTerm)
  }
  return unique(excluded).map(normalizeTermForComparison).filter(Boolean)
}

const filterTrademarkAvoidanceTerms = (intent: string, terms: string[]): string[] => {
  const excludedTerms = inferTrademarkAvoidanceExcludedTerms(intent)
  if (excludedTerms.length <= 0) return terms
  return terms.filter(term => {
    const normalizedTerm = normalizeTermForComparison(term)
    return !excludedTerms.some(excluded => {
      return normalizedTerm === excluded || normalizedTerm.includes(excluded) || excluded.includes(normalizedTerm)
    })
  })
}

const sanitizeTrademarkAvoidanceIntent = (intent: string): string => {
  return sanitizeRequestIntent(intent, 900)
    .replace(/\binspired by\s+([^.;\n`(]{2,160})/gi, 'inspired by high-level tone, pacing, and atmosphere')
    .replace(/\s+/g, ' ')
    .trim()
}

const inferProduct = (intent: string, namedTerms: string[]): string => {
  const boldMatch = /\*\*([^*]{2,80})\*\*/.exec(intent)
  if (boldMatch?.[1]) return sanitizeScalar(boldMatch[1], 80)
  const quotedMatch = /"([^"\n]{2,80})"/.exec(intent)
  if (quotedMatch?.[1]) return sanitizeScalar(quotedMatch[1], 80)
  const firstTerm = namedTerms.find(term => /\S/.test(term) && !/^\d+\s*[–-]\s*\d+/.test(term))
  return firstTerm ? sanitizeScalar(firstTerm, 80) : ''
}

const inferArtifact = (lowered: string): string => {
  const matches = unique(ARTIFACT_PATTERNS
    .filter(entry => entry.rx.test(lowered))
    .map(entry => entry.label))
    .sort((a, b) => b.length - a.length)
  const reduced = matches.filter((label, index) => {
    return !matches.some((other, otherIndex) => otherIndex < index && other.includes(label))
  })
  return sanitizeScalar(reduced.join(' + '), 120)
}

const inferTopics = (lowered: string): string[] => {
  return unique(
    TOPIC_PATTERNS
      .filter(entry => entry.rx.test(lowered))
      .map(entry => entry.label),
  )
}

const inferSignals = (lowered: string): AgenticOsRequestSignals => ({
  recommendation: /\brecommend(?:ed|ation)?\b/.test(lowered),
  computingFlow: /\bflow editor\b|\bcomputing flow\b|\bcompute_summary\b|\bktv\b|\bkey\s*\/\s*type\s*\/\s*value\b|\bbody[- ]?tokens?\b|\brun all\b/.test(lowered),
  creativeScript: /\bvideo script\b|\bscript\b|\bstoryboard\b|\bscene\b|\bnarrative\b/.test(lowered),
  trademarkAvoidance: /\bforbid mention\b|\bforbid.*trademark\b|\bavoid.*trademark\b|\bno trademark\b|\bnon[- ]infring/i.test(lowered),
  headlessStructured: /\bheadless\b|\bun[- ]?opini(?:on|ated)\b|\bstructured(?:content| content| response)?\b|\btool result\b/.test(lowered),
  strybldr: /\bstrybldr\b|\bstoryboard\b|\bstorytree\b|\bstrytree\b/.test(lowered),
  storytree: /\bstorytree\b|\bstrytree\b/.test(lowered),
  gitGraph: /\bgitgraph\b|\bgit graph\b/.test(lowered),
  gantt: /\bgantt\b/.test(lowered),
  richMediaPanels: /\brich media panels?\b|\brichmediapanel\b|\boutputsrcdoc\b|\bsrcdoc\b/.test(lowered),
  zeroBudget: /\bzero budget\b|\bno budget\b/.test(lowered),
  bootstrap: /\bbootstrap\b/.test(lowered),
  organicGrowth: /\borganic growth\b/.test(lowered),
  mcp: /\bmcp\b/.test(lowered),
  externalUsers: /\bexternal users?\b/.test(lowered),
  marketplace: /\bmarketplace\b/.test(lowered),
  openClaw: /\bopenclaw\b/.test(lowered),
  b2c: /\bb2c\b/.test(lowered),
  subscriptions: /\bsubscription(s)?\b/.test(lowered),
  payPerUse: /\bpay[- ]?per[- ]?use\b/.test(lowered),
  conversion: /\bconversion\b|\bcommerce\b/.test(lowered),
  payments: /\bpayments?\b|\bcheckout\b/.test(lowered),
  stripe: /\bstripe\b/.test(lowered),
  foss: /\bfoss\b|\bopen source\b/.test(lowered),
  rxdb: /\brxdb\b/.test(lowered),
  maplibre: /\bmaplibre\b/.test(lowered),
})

const inferNamedTerms = (signals: AgenticOsRequestSignals, intent: string): string[] => {
  const terms = unique([
    signals.openClaw ? 'OpenClaw' : '',
    signals.stripe ? 'Stripe payment flow' : '',
    signals.rxdb ? 'RxDB' : '',
    signals.maplibre ? 'MapLibre' : '',
    ...inferGenericNamedTerms(intent),
  ])
  return signals.trademarkAvoidance ? filterTrademarkAvoidanceTerms(intent, terms) : terms
}

const inferOutputFile = (intent: string): string => {
  const match = /`([^`\n]+?\.[a-z0-9]+)`/i.exec(intent)
  return match?.[1] ? sanitizeScalar(match[1], 120) : ''
}

const inferDomain = (topics: string[], signals: AgenticOsRequestSignals): string => {
  const parts = [
    signals.creativeScript ? 'narrative scripting' : '',
    signals.mcp ? 'MCP distribution' : '',
    signals.marketplace ? 'skills marketplace delivery' : '',
    signals.subscriptions || signals.payPerUse || signals.conversion || signals.payments || signals.b2c
      ? 'user-action monetization'
      : '',
    signals.rxdb || signals.maplibre ? 'local-first spatial workflows' : '',
    !signals.marketplace && topics.includes('tool integration') ? 'tool integration' : '',
  ]
  return sanitizeScalar(unique(parts).join(' + '), 220)
}

const inferObjective = (intent: string, signals: AgenticOsRequestSignals, artifact: string, product: string): string => {
  if (signals.creativeScript) {
    const parts = [
      artifact ? `develop ${artifact}` : 'develop a script deliverable',
      'keep the output original and production-ready',
      signals.trademarkAvoidance ? 'avoid direct trademark or franchise references' : '',
      /inspired by/i.test(intent) ? 'translate inspiration into high-level tone, pacing, and atmosphere only' : '',
    ].filter(Boolean)
    return sanitizeScalar(parts.join('; '), 520)
  }
  const parts = [
    signals.zeroBudget ? 'support zero-budget execution' : '',
    signals.bootstrap ? 'prioritize bootstrap execution' : '',
    signals.organicGrowth ? 'favor organic growth' : '',
    product && signals.mcp ? `package ${product} as an MCP offer` : '',
    signals.externalUsers ? 'serve external users' : '',
    signals.openClaw ? 'support OpenClaw marketplace packaging' : (signals.marketplace ? 'support marketplace packaging' : ''),
    artifact ? `deliver ${artifact}` : '',
    signals.b2c ? 'evaluate B2C monetization' : '',
    signals.subscriptions || signals.payPerUse || signals.conversion
      ? 'compare subscription, pay-per-use, and conversion monetization'
      : '',
    signals.stripe ? 'expose Stripe payment and checkout integration' : (signals.payments ? 'expose payment and checkout integration' : ''),
    signals.foss && (signals.rxdb || signals.maplibre) ? 'stay compatible with FOSS local-first and spatial components' : '',
  ].filter(Boolean)
  if (parts.length > 0) return sanitizeScalar(parts.join('; '), 520)
  const cleaned = sanitizeRequestIntent(intent, 320)
    .replace(/^#?\s*adhere to\b[^-]*-\s*/i, '')
    .replace(/^\s*(enhance|finetune|refine|improve|fix|generate|create|draft|write)\b[:\s-]*/i, '')
    .trim()
  return sanitizeScalar(cleaned, 520)
}

const inferStatus = (lowered: string): string => {
  if (!lowered) return ''
  if (/\brecommend(?:ed|ation)?\b/.test(lowered)) return 'recommended'
  if (/\bplan(?:ned)?\b/.test(lowered)) return 'planned'
  if (/\bdraft\b/.test(lowered)) return 'draft'
  return ''
}

const inferRequestedSections = (lowered: string): AgenticOsRequestedSections => ({
  useCase: /\buse case\b/.test(lowered),
  problem: /\bproblem\b/.test(lowered),
  solution: /\bsolution\b/.test(lowered),
  userFlow: /\buser flow\b/.test(lowered),
  workflow: /\bwork flow\b/.test(lowered),
  dataFlow: /\bdata flow\b/.test(lowered),
  goals: /\bgoals?\b/.test(lowered),
  userStories: /\buser stories\b|\bstories\b/.test(lowered),
  monetization: /\bmonetization\b|\bmoneti[sz]e\b|\bmake money\b|\bpricing\b|\bsubscription\b|\bpayment\b|\bcheckout\b|\bconversion\b/.test(lowered),
  integrations: /\bintegration\b|\bintegrations\b|\brxdb\b|\bmaplibre\b|\bmcp\b|\bapi\b/.test(lowered),
})

const applyInvocationSignals = (
  signals: AgenticOsRequestSignals,
  invocation: ReturnType<typeof resolveChatRuntimeInvocationQuery>['leadingRoute'],
): AgenticOsRequestSignals => {
  if (!invocation) return signals
  if (invocation.token === '/computing-flow') return { ...signals, computingFlow: true }
  return signals
}

const inferInvocationArtifact = (
  artifact: string,
  invocation: ReturnType<typeof resolveChatRuntimeInvocationQuery>['leadingRoute'],
): string => {
  if (artifact) return artifact
  if (!invocation) return ''
  if (invocation.token === '/prd-tad.create') return 'PRD + TAD'
  if (invocation.token === '/computing-flow') return 'computing-flow'
  return ''
}

export const analyzeAgenticOsRequest = (requestText: string): AgenticOsRequestProfile => {
  const runtimeInvocation = resolveChatRuntimeInvocationQuery(requestText)
  const rawIntent = sanitizeRequestIntent(resolveChatRuntimeInvocationResponsiveQueryText(requestText), 900)
  const lowered = rawIntent.toLowerCase()
  const signals = applyInvocationSignals(inferSignals(lowered), runtimeInvocation.leadingRoute)
  const topics = inferTopics(lowered)
  const namedTerms = inferNamedTerms(signals, rawIntent)
  const artifact = inferInvocationArtifact(inferArtifact(lowered), runtimeInvocation.leadingRoute)
  const subject = sanitizeScalar(inferSubject(lowered), 60)
  const product = inferProduct(rawIntent, namedTerms)
  const intent = signals.trademarkAvoidance ? sanitizeTrademarkAvoidanceIntent(rawIntent) : rawIntent
  return {
    intent,
    invocation: runtimeInvocation.leadingRoute
      ? {
          token: runtimeInvocation.leadingRoute.token,
          label: runtimeInvocation.leadingRoute.label,
          query: rawIntent,
        }
      : null,
    product,
    domain: inferDomain(topics, signals),
    subject,
    objective: inferObjective(rawIntent, signals, artifact, product),
    artifact,
    owner: subject,
    version: '',
    status: inferStatus(lowered),
    topics,
    namedTerms,
    outputFile: inferOutputFile(rawIntent),
    signals,
    requestedSections: inferRequestedSections(lowered),
  }
}
