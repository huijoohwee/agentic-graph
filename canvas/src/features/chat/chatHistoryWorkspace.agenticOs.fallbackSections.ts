import { analyzeAgenticOsRequest, sanitizeScalar } from './chatAgenticOsRequestProfile'

type AgenticOsFallbackProfile = ReturnType<typeof analyzeAgenticOsRequest>

export const fallbackActor = (subject: string): string => subject || '{{subject}}'
export const fallbackProduct = (product: string): string => product || '{{product}}'
export const fallbackArtifact = (artifact: string): string => artifact || 'Chat Response'
export const fallbackDomain = (domain: string, topics: string[]): string => domain || topics.join(' + ') || '{{domain}}'
export const fallbackObjective = (objective: string): string => objective || '{{objective}}'
export const fallbackOwner = (owner: string): string => owner || '{{owner}}'
export const fallbackStatus = (status: string): string => status || '{{status}}'

export const buildNamedTermSummary = (profile: AgenticOsFallbackProfile): string => profile.namedTerms.join(', ')

export const buildSnapshotRows = (args: {
  profile: AgenticOsFallbackProfile
  outputTarget: string
  objectiveSummary: string
}): Array<[string, string, string]> => {
  const { profile, outputTarget, objectiveSummary } = args
  if (profile.signals.creativeScript) {
    return [
      ['Deliverable', '`{{artifact}}`', 'keeps the requested output format explicit'],
      ['Creative mode', 'original script package', 'keeps the body focused on content creation rather than planning prose'],
      ['Tone source', 'high-level inspiration only', 'keeps atmosphere without copying named properties'],
      ['Distinctiveness guard', profile.signals.trademarkAvoidance ? 'avoid direct trademark or franchise references' : 'keep the draft original', 'keeps the output safely differentiated'],
      ['Output target', outputTarget, 'keeps the handoff destination visible'],
      ['Validation focus', 'clarity, originality, and body/frontmatter linkage', 'keeps persistence requirements aligned with the document contract'],
    ]
  }
  const discoverySurface = profile.signals.openClaw
    ? 'OpenClaw and skills marketplace discovery'
    : (profile.signals.marketplace ? 'skills marketplace discovery' : 'active delivery surface')
  const monetizedActions = [
    profile.signals.subscriptions ? 'subscriptions' : '',
    profile.signals.payPerUse ? 'pay-per-use usage' : '',
    profile.signals.conversion ? 'commerce-like conversion actions' : '',
  ].filter(Boolean).join(', ') || 'active request actions'
  const stackBoundaries = [
    profile.signals.rxdb ? 'RxDB local-first state' : '',
    profile.signals.maplibre ? 'MapLibre spatial presentation' : '',
  ].filter(Boolean).join(', ') || 'the stated implementation boundaries'
  const checkoutStep = profile.signals.stripe
    ? 'Stripe checkout and payment completion'
    : (profile.signals.payments ? 'checkout completion' : 'handoff or transition moment')
  const namedTerms = buildNamedTermSummary(profile)
  return [
    ['Primary subject', '`{{product}}`', 'keeps the central subject consistent across body and frontmatter'],
    ['Named terms', namedTerms || '`{{domain}}`', 'keeps request-specific terms visible without family-specific fallback prose'],
    ['Audience or surface', profile.signals.externalUsers ? `external users through ${discoverySurface}` : discoverySurface, 'keeps the addressed surface tied to the request'],
    ['Deliverable', '`{{artifact}}`', 'keeps the stored output aligned with the requested artifact'],
    ['Canonical output path', outputTarget, 'keeps companion output naming aligned with the stored AGENTIC_OS document'],
    ['Operating constraints', objectiveSummary || fallbackObjective(profile.objective), 'keeps the active objective and constraints visible'],
    ['Action surfaces', monetizedActions, 'keeps user actions tied to the stated request context'],
    ['Transition step', checkoutStep, 'keeps handoff or transition moments explicit when present'],
    ['Implementation boundaries', stackBoundaries, 'keeps implementation references bounded to relevant surfaces'],
  ]
}

export const buildOpenQuestions = (args: {
  artifact: string
  topics: string[]
  namedTerms: string[]
  requestedSections: AgenticOsFallbackProfile['requestedSections']
  signals: AgenticOsFallbackProfile['signals']
  outputFile: string
  defaultOutputTarget: string
}): Array<{ id: string; question: string; status: string }> => {
  const artifact = args.artifact || 'the deliverable'
  if (args.signals.creativeScript) {
    const creativeQuestions = [
      `Which review criteria determine whether ${artifact} is clear, original, and complete enough to persist?`,
      args.outputFile
        ? `Should the final body optimize for the target handoff file \`${args.outputFile}\` or stay generic across script destinations?`
        : `Should the final body optimize for the companion output file \`${args.defaultOutputTarget}\` or stay generic across creative handoff surfaces?`,
      args.signals.trademarkAvoidance
        ? 'Which tone or atmosphere cues are allowed while still avoiding direct trademark, franchise, or character references?'
        : 'Which tone or atmosphere cues should remain explicit instead of being inferred?',
      'Which sections should stay compact versus cinematic if the script needs another generation pass?',
    ]
    return creativeQuestions.map((question, index) => ({
      id: `OQ-0${index + 1}`,
      question,
      status: index === 0 ? '`#D85A30:blocking`' : 'medium',
    }))
  }
  const questions = [
    `Which acceptance criteria determine whether ${artifact} is complete enough to persist without another validation pass?`,
    args.namedTerms.length
      ? `Which named request terms must remain explicit in the final response: ${args.namedTerms.join(', ')}?`
      : args.topics.length
      ? `Which topic constraints must remain explicit in the final response: ${args.topics.join(', ')}?`
      : 'Which context constraints must remain explicit in the final response instead of being inferred?',
    args.requestedSections.integrations
      ? args.signals.stripe
        ? 'Which integrations are required at generation time versus documented later, especially OpenClaw discovery, Stripe checkout, RxDB state, and MapLibre presentation?'
        : 'Which integrations are required at generation time versus documented as later implementation work?'
      : 'Which dependencies belong in the current answer versus a later implementation phase?',
    args.requestedSections.monetization
      ? args.signals.stripe
        ? 'Which user action should trigger Stripe checkout, and what entitlement or fulfillment should follow payment completion?'
        : 'Which monetization or conversion decision points are requirements versus open evaluation items?'
      : 'Which delivery and ownership decisions still need confirmation before downstream automation runs?',
  ]
  return questions.map((question, index) => ({
    id: `OQ-0${index + 1}`,
    question,
    status: index === 0 ? '`#D85A30:blocking`' : 'medium',
  }))
}

export const buildGuardrailRows = (profile: AgenticOsFallbackProfile): Array<[string, string, string]> => {
  if (profile.signals.creativeScript) {
    return [
      ['Originality', 'Keep the draft distinct from named source properties', 'preserves safety and usefulness'],
      ['Shared terms', 'Reuse `{{artifact}}`, `{{subject}}`, and `{{objective}}` from frontmatter', 'keeps body and YAML aligned'],
      ['Persistence', 'Store only validated output', 'keeps retries bounded and artifacts reusable'],
    ]
  }
  const rows: Array<[string, string, string]> = [
    ['Request scope', 'Keep the draft bounded to the explicit request and workspace context', 'prevents template drift'],
    ['Shared terms', 'Reuse `{{artifact}}`, `{{subject}}`, and `{{objective}}` from frontmatter', 'keeps body and YAML aligned'],
    ['Persistence', 'Store only validated output', 'keeps retries bounded and artifacts reusable'],
  ]
  if (profile.namedTerms.length > 0) {
    rows.splice(1, 0, [
      'Term coverage',
      `Keep named request terms visible: ${sanitizeScalar(buildNamedTermSummary(profile), 180)}`,
      'prevents non-query-responsive fallback output',
    ])
  }
  return rows
}
