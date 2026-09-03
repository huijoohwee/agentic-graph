import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph.core'
import type { GraphNode } from '@/lib/graph/types'
import { captureVisibleCanvasPngBlobFromDom, wrapPngBlobAsSvgMarkup } from '@/lib/graph/svgSnapshot'
import { analyzeAgenticOsRequest } from './chatAgenticOsRequestProfile'
import type { RunGenerationConfig } from './byteplusRunGeneration'
import {
  generateRunImageWithBytePlus,
  generateRunMarkdownWithProvider,
  generateRunVideoWithBytePlus,
} from './byteplusRunGeneration'
import {
  writeAgenticOsCompanionOutputBlob,
  writeAgenticOsCompanionOutputText,
} from './chatHistoryWorkspace.output'
import { buildNamedTermSummary } from './chatHistoryWorkspace.agenticOs.fallbackSections'
import { mergeAgenticOsCanonicalSection } from './chatAgenticOsConsolidatedArtifacts'

export type AgenticOsRunOutputKind = 'markdown' | 'png' | 'svg' | 'video'

export type AgenticOsRunOutputPreference = {
  kind: AgenticOsRunOutputKind
  extension: 'md' | 'png' | 'svg' | 'mp4'
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov'])

const readNodeData = (node: GraphNode): Record<string, unknown> => {
  const properties = (node.properties || null) as Record<string, unknown> | null
  const data = properties && typeof properties.data === 'object' && properties.data !== null && !Array.isArray(properties.data)
    ? (properties.data as Record<string, unknown>)
    : null
  return data || {}
}

const extractMarkdownBody = (markdown: string): string => {
  const text = String(markdown || '').replace(/^\uFEFF/, '')
  if (!text.trimStart().startsWith('---')) return text.trim()
  const lines = text.split(/\r?\n/)
  let lead = 0
  while (lead < lines.length && !String(lines[lead] || '').trim()) lead += 1
  if (String(lines[lead] || '').trim() !== '---') return text.trim()
  for (let i = lead + 1; i < lines.length; i += 1) {
    if (String(lines[i] || '').trim() === '---') {
      return lines.slice(i + 1).join('\n').trim()
    }
  }
  return text.trim()
}

const extractFrontmatterBlock = (markdown: string): string => {
  const text = String(markdown || '').replace(/^\uFEFF/, '')
  if (!text.trimStart().startsWith('---')) return ''
  const lines = text.split(/\r?\n/)
  let lead = 0
  while (lead < lines.length && !String(lines[lead] || '').trim()) lead += 1
  if (String(lines[lead] || '').trim() !== '---') return ''
  for (let i = lead + 1; i < lines.length; i += 1) {
    if (String(lines[i] || '').trim() === '---') {
      return lines.slice(lead + 1, i).join('\n')
    }
  }
  return ''
}

const stripBalancedQuotes = (value: string): string => {
  const trimmed = String(value || '').trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

const readFrontmatterScalar = (frontmatter: string, key: string): string => {
  const rx = new RegExp(`^${key}:\\s*(.+)$`, 'm')
  const match = rx.exec(frontmatter)
  return match?.[1] ? stripBalancedQuotes(String(match[1])) : ''
}

const normalizeRunOutputTitle = (title: string, product: string, artifact: string): string => {
  const raw = String(title || '').trim()
  if (raw) {
    return raw
      .replace(/\s*[·-]\s*AI Pipeline\b/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  if (product && artifact) return `${product} - ${artifact}`
  return artifact || product || 'Generated Output'
}

const includesHeading = (markdownBody: string, heading: string): boolean => {
  const rx = new RegExp(`^#{2,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi')
  return rx.test(markdownBody)
}

const buildRunOutputRequestText = (args: {
  frontmatter: string
  body: string
  title: string
  product: string
  subject: string
  artifact: string
  objective: string
  domain: string
}): string => {
  const requestedSections = [
    includesHeading(args.body, 'Use Case') ? 'Use Case' : '',
    includesHeading(args.body, 'Problem') ? 'Problem' : '',
    includesHeading(args.body, 'Solution') ? 'Solution' : '',
    includesHeading(args.body, 'User Flow') ? 'User Flow' : '',
    includesHeading(args.body, 'Work Flow') ? 'Work Flow' : '',
    includesHeading(args.body, 'Data Flow') ? 'Data Flow' : '',
    includesHeading(args.body, 'Monetization Surface') ? 'Monetization' : '',
    includesHeading(args.body, 'Integration Boundaries') ? 'Integration' : '',
  ].filter(Boolean)
  const parts = [
    args.title,
    args.product,
    args.subject,
    args.artifact,
    args.objective,
    args.domain,
    requestedSections.length ? requestedSections.join(' | ') : '',
    readFrontmatterScalar(args.frontmatter, 'doc_type'),
  ].filter(Boolean)
  return parts.join('; ')
}

const buildRecommendationSummary = (requestText: string, profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const namedTerms = buildNamedTermSummary(profile)
  const clauses = [
    profile.signals.zeroBudget ? 'zero-budget' : '',
    profile.signals.bootstrap ? 'bootstrap-first' : '',
    profile.signals.organicGrowth ? 'organic-growth' : '',
    profile.product ? `${profile.product}` : '',
    !profile.product && namedTerms ? namedTerms : '',
    profile.signals.mcp ? 'MCP offer' : '',
    profile.signals.externalUsers ? 'for external users' : '',
    profile.signals.openClaw ? 'with OpenClaw distribution' : (profile.signals.marketplace ? 'with marketplace distribution' : ''),
  ].filter(Boolean)
  const prefix = clauses.length ? clauses.join(' ') : (profile.artifact || 'the requested deliverable')
  const objective = String(profile.objective || requestText).trim()
  return `This output focuses on ${prefix}. It turns the runnable AGENTIC_OS request into a reader-facing deliverable centered on ${objective}.`
}

const buildUseCaseText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const focus = buildNamedTermSummary(profile) || profile.product || 'the active request terms'
  return `${profile.subject || 'The primary user'} needs ${profile.artifact || 'a working deliverable'} that translates the request into a usable handoff. The output should stay grounded in ${focus} and remain useful for ${profile.signals.externalUsers ? 'external-user delivery' : 'the intended audience'}.`
}

const buildProblemText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const constraints = [
    profile.signals.zeroBudget ? 'zero budget' : '',
    profile.signals.bootstrap ? 'bootstrap execution' : '',
    profile.signals.organicGrowth ? 'organic growth pressure' : '',
    profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion ? 'clear monetization choices' : '',
    profile.signals.stripe || profile.signals.payments ? 'payment and checkout transitions' : '',
  ].filter(Boolean)
  const joined = constraints.length ? ` under ${constraints.join(', ')}` : ''
  const focus = buildNamedTermSummary(profile) || profile.product || 'the active request terms'
  const assumptionScope = profile.signals.stripe || profile.signals.payments || profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion
    ? 'commercial, entitlement, or integration assumptions'
    : 'handoff, render, or integration assumptions'
  return `${profile.subject || 'The user'} needs ${profile.artifact || 'an output'} for ${focus}${joined}. A generic scaffold is not enough because the result has to stay specific to the request, show what gets delivered, and keep ${assumptionScope} explicit.`
}

const buildSolutionText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const channels = [
    profile.signals.mcp ? 'MCP distribution' : '',
    profile.signals.openClaw ? 'OpenClaw marketplace entry' : '',
    profile.signals.marketplace ? 'skills marketplace discovery' : '',
    profile.signals.stripe ? 'Stripe checkout' : '',
    profile.signals.rxdb ? 'RxDB local-first state' : '',
    profile.signals.maplibre ? 'MapLibre spatial presentation' : '',
  ].filter(Boolean)
  const focus = buildNamedTermSummary(profile) || profile.product || 'the active request terms'
  return `Shape a lean, execution-oriented response that packages ${focus} into ${profile.artifact || 'the requested deliverable'}. Keep the plan concrete across ${channels.join(', ') || 'the requested surfaces'} and prioritize decisions that move the request toward usable output rather than describing the AGENTIC_OS pipeline itself.`
}

const buildUserFlowText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  if (profile.signals.stripe || profile.signals.payments || profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion) {
    return `A target user discovers ${profile.product || 'the offer'}, evaluates the initial value proposition, reaches the requested activation or paid action, completes the required entitlement or checkout step, and then receives the promised capability or artifact.`
  }
  return `A target user opens the workspace, reviews the generated text and connected render outputs, edits source assumptions inline, and receives updated cards, widgets, or Rich Media Panels from the same source values.`
}

const buildWorkflowText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  return `${profile.subject || 'The owner'} defines scope, shapes the deliverable, validates fit, and then routes the output into publication, iteration, or delivery. The workflow should stay short, low-friction, and aligned with ${profile.objective || 'the active objective'}.`
}

const buildDataFlowText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const inputs = [
    profile.product || '',
    profile.domain || '',
    profile.objective || '',
    buildNamedTermSummary(profile),
  ].filter(Boolean).join('; ')
  return `Request inputs, workspace context, and delivery assumptions are condensed into a structured working brief. That brief becomes generated output plus optional render handles such as output, imageUrl, audioUrl, videoUrl, or outputSrcDoc. The final artifact preserves only the data needed for follow-up review, delivery, or downstream rendering. ${inputs ? `Key context includes ${inputs}.` : ''}`
}

const buildMonetizationText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const monetization = [
    profile.signals.subscriptions ? 'subscriptions' : '',
    profile.signals.payPerUse ? 'pay-per-use actions' : '',
    profile.signals.conversion ? 'conversion-oriented commerce events' : '',
  ].filter(Boolean)
  const monetizationLabel = monetization.length ? monetization.join(', ') : 'the stated monetization or value-exchange options'
  const handoff = profile.signals.stripe
    ? 'Stripe checkout and fulfillment'
    : (profile.signals.payments ? 'payment completion' : 'the requested fulfillment handoff')
  return `Monetization should stay tied to actual user actions rather than abstract pricing language. Compare ${monetizationLabel}, show where value is unlocked, and keep the handoff into ${handoff} explicit.`
}

const buildIntegrationText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const terms = [
    profile.signals.openClaw ? 'OpenClaw for listing and discovery' : '',
    profile.signals.stripe ? 'Stripe for checkout and payment confirmation' : '',
    profile.signals.rxdb ? 'RxDB for local-first state and draft persistence' : '',
    profile.signals.maplibre ? 'MapLibre for spatial presentation where location adds value' : '',
  ].filter(Boolean)
  return terms.length
    ? `Use integrations only where they materially change delivery or user value: ${terms.join('; ')}.`
    : 'Keep integrations bounded to what the request actually needs; do not introduce extra platform assumptions.'
}

const buildCreativeScriptOutput = (args: {
  title: string
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  date: string
}): string => {
  const lines = [
    `# ${args.title}`,
    '',
    args.date ? `Prepared ${args.date}` : '',
    '',
    `## Creative Direction`,
    `${args.profile.subject || 'The requester'} needs ${args.profile.artifact || 'a script deliverable'} that stays original, readable, and production-ready.`,
    '',
    `## Tone And Atmosphere`,
    `${args.profile.objective || 'Keep the narrative tone aligned with the request while avoiding direct trademark or franchise references.'}`,
    '',
    `## Structure`,
    `Open with a clear hook, build momentum through escalating beats, and end on a payoff that leaves room for iteration, production notes, or storyboarding.`,
    '',
    `## Production Notes`,
    buildIntegrationText(args.profile),
  ].filter(Boolean)
  return `${lines.join('\n')}\n`
}

const buildAgenticOsRunMarkdownOutput = (canonicalText: string): string => {
  const frontmatter = extractFrontmatterBlock(canonicalText)
  const body = extractMarkdownBody(canonicalText)
  const title = readFrontmatterScalar(frontmatter, 'title')
  const product = readFrontmatterScalar(frontmatter, 'product')
  const subject = readFrontmatterScalar(frontmatter, 'subject')
  const artifact = readFrontmatterScalar(frontmatter, 'artifact')
  const objective = readFrontmatterScalar(frontmatter, 'objective')
  const domain = readFrontmatterScalar(frontmatter, 'domain')
  const date = readFrontmatterScalar(frontmatter, 'date')
  const requestText = buildRunOutputRequestText({ frontmatter, body, title, product, subject, artifact, objective, domain })
  const profile = analyzeAgenticOsRequest(requestText)
  const normalizedTitle = normalizeRunOutputTitle(title, product || profile.product, artifact || profile.artifact)

  if (profile.signals.creativeScript) {
    return buildCreativeScriptOutput({ title: normalizedTitle, profile, date })
  }

  const include = {
    useCase: profile.requestedSections.useCase || includesHeading(body, 'Use Case'),
    problem: profile.requestedSections.problem || includesHeading(body, 'Problem'),
    solution: profile.requestedSections.solution || includesHeading(body, 'Solution'),
    userFlow: profile.requestedSections.userFlow || includesHeading(body, 'User Flow'),
    workflow: profile.requestedSections.workflow || includesHeading(body, 'Work Flow'),
    dataFlow: profile.requestedSections.dataFlow || includesHeading(body, 'Data Flow'),
    monetization: profile.requestedSections.monetization || includesHeading(body, 'Monetization Surface'),
    integrations: profile.requestedSections.integrations || includesHeading(body, 'Integration Boundaries'),
  }

  const lines = [
    `# ${normalizedTitle}`,
    '',
    [subject || profile.subject, date].filter(Boolean).join(' · '),
    '',
    buildRecommendationSummary(requestText, {
      ...profile,
      product: product || profile.product,
      subject: subject || profile.subject,
      artifact: artifact || profile.artifact,
      objective: objective || profile.objective,
      domain: domain || profile.domain,
    }),
    '',
  ]

  const resolvedProfile = {
    ...profile,
    product: product || profile.product,
    subject: subject || profile.subject,
    artifact: artifact || profile.artifact,
    objective: objective || profile.objective,
    domain: domain || profile.domain,
  }

  if (include.useCase) lines.push('## Use Case', buildUseCaseText(resolvedProfile), '')
  if (include.problem) lines.push('## Problem', buildProblemText(resolvedProfile), '')
  if (include.solution) lines.push('## Solution', buildSolutionText(resolvedProfile), '')
  if (include.userFlow) lines.push('## User Flow', buildUserFlowText(resolvedProfile), '')
  if (include.workflow) lines.push('## Work Flow', buildWorkflowText(resolvedProfile), '')
  if (include.dataFlow) lines.push('## Data Flow', buildDataFlowText(resolvedProfile), '')
  if (include.monetization) lines.push('## Monetization Surface', buildMonetizationText(resolvedProfile), '')
  if (include.integrations) lines.push('## Integration Boundaries', buildIntegrationText(resolvedProfile), '')

  const filtered = lines.filter((line, index, items) => {
    if (line !== '') return true
    return items[index - 1] !== ''
  })
  return `${filtered.join('\n').trim()}\n`
}

const buildAgenticOsRunGenerationPrompt = (canonicalText: string): string => {
  const frontmatter = extractFrontmatterBlock(canonicalText)
  const body = extractMarkdownBody(canonicalText)
  const title = readFrontmatterScalar(frontmatter, 'title')
  const product = readFrontmatterScalar(frontmatter, 'product')
  const subject = readFrontmatterScalar(frontmatter, 'subject')
  const artifact = readFrontmatterScalar(frontmatter, 'artifact')
  const objective = readFrontmatterScalar(frontmatter, 'objective')
  const domain = readFrontmatterScalar(frontmatter, 'domain')
  const requestText = buildRunOutputRequestText({ frontmatter, body, title, product, subject, artifact, objective, domain })
  const profile = analyzeAgenticOsRequest(requestText)
  const draft = buildAgenticOsRunMarkdownOutput(canonicalText)
  const requestedSections = [
    profile.requestedSections.useCase ? 'Use Case' : '',
    profile.requestedSections.problem ? 'Problem' : '',
    profile.requestedSections.solution ? 'Solution' : '',
    profile.requestedSections.userFlow ? 'User Flow' : '',
    profile.requestedSections.workflow ? 'Work Flow' : '',
    profile.requestedSections.dataFlow ? 'Data Flow' : '',
    profile.requestedSections.monetization ? 'Monetization Surface' : '',
    profile.requestedSections.integrations ? 'Integration Boundaries' : '',
  ].filter(Boolean)
  return [
    `Generate the final user-facing deliverable for this request.`,
    `Title: ${title || product || artifact || 'Generated Output'}`,
    requestText ? `Request context: ${requestText}` : '',
    objective ? `Primary objective: ${objective}` : '',
    requestedSections.length ? `Requested sections: ${requestedSections.join(', ')}` : '',
    `Avoid repeating or explaining the AGENTIC_OS pipeline, frontmatter, flow graph, or internal document scaffold.`,
    `Keep the output specific to the user query and the requested artifact.`,
    `Return only markdown.`,
    '',
    `Reference draft structure:`,
    draft,
  ].filter(Boolean).join('\n')
}

const buildAgenticOsRunMediaPrompt = (canonicalText: string, kind: 'image' | 'video'): string => {
  const frontmatter = extractFrontmatterBlock(canonicalText)
  const body = extractMarkdownBody(canonicalText)
  const title = readFrontmatterScalar(frontmatter, 'title')
  const product = readFrontmatterScalar(frontmatter, 'product')
  const subject = readFrontmatterScalar(frontmatter, 'subject')
  const artifact = readFrontmatterScalar(frontmatter, 'artifact')
  const objective = readFrontmatterScalar(frontmatter, 'objective')
  const domain = readFrontmatterScalar(frontmatter, 'domain')
  const requestText = buildRunOutputRequestText({ frontmatter, body, title, product, subject, artifact, objective, domain })
  const profile = analyzeAgenticOsRequest(requestText)
  const medium = kind === 'video' ? 'video' : 'image'
  const focus = [
    title || '',
    product || profile.product || '',
    artifact || profile.artifact || '',
    objective || profile.objective || '',
    domain || profile.domain || '',
  ].filter(Boolean).join('; ')
  return [
    `Create a single ${medium} deliverable that is directly responsive to this request.`,
    focus,
    requestText,
    profile.subject ? `Primary audience or actor: ${profile.subject}` : '',
    kind === 'video'
      ? 'Make the sequence coherent, visually specific, and presentation-ready. Do not add unrelated scenes.'
      : 'Make the composition presentation-ready, visually specific, and aligned with the request. Avoid unrelated decorative elements.',
    'Do not mention AGENTIC_OS, frontmatter, flow graph, or internal pipeline mechanics.',
  ].filter(Boolean).join('\n')
}

const normalizeOutputExtension = (value: string): AgenticOsRunOutputPreference | null => {
  const raw = String(value || '').replace(/^\./, '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'md' || raw === 'markdown') return { kind: 'markdown', extension: 'md' }
  if (raw === 'png') return { kind: 'png', extension: 'png' }
  if (raw === 'svg') return { kind: 'svg', extension: 'svg' }
  if (raw === 'image' || raw === 'img') return { kind: 'png', extension: 'png' }
  if (raw === 'video' || VIDEO_EXTENSIONS.has(raw)) return { kind: 'video', extension: 'mp4' }
  return null
}

const resolveOutputPreferenceFromNode = (node: GraphNode): AgenticOsRunOutputPreference | null => {
  const data = readNodeData(node)
  const fileValue = String(data.file || '').trim()
  if (fileValue) {
    const match = /\.([a-z0-9]+)$/i.exec(fileValue)
    const fromFile = match?.[1] ? normalizeOutputExtension(String(match[1])) : null
    if (fromFile) return fromFile
  }
  const formatKeys = [
    data.format,
    data.output_type,
    data.outputType,
    data.media_kind,
    data.mediaKind,
  ]
  for (const candidate of formatKeys) {
    const resolved = normalizeOutputExtension(String(candidate || ''))
    if (resolved) return resolved
  }
  if (typeof data.video === 'string' || typeof data.videoUrl === 'string') {
    return { kind: 'video', extension: 'mp4' }
  }
  if (typeof data.svg === 'string') {
    return { kind: 'svg', extension: 'svg' }
  }
  if (typeof data.image === 'string' || typeof data.imageUrl === 'string') {
    return { kind: 'png', extension: 'png' }
  }
  return null
}

export const resolveAgenticOsRunOutputPreference = (args: {
  canonicalPath: string
  canonicalText: string
}): AgenticOsRunOutputPreference => {
  const parsed = tryParseMarkdownFrontmatterFlowGraph(args.canonicalPath.split('/').pop() || 'agenticOs.md', args.canonicalText)
  const nodes = Array.isArray(parsed?.graphData?.nodes) ? parsed!.graphData.nodes : []
  for (const node of nodes) {
    if (String(node?.type || '').trim().toLowerCase() !== 'output') continue
    const resolved = resolveOutputPreferenceFromNode(node as GraphNode)
    if (resolved) return resolved
  }
  return { kind: 'markdown', extension: 'md' }
}

export const emitAgenticOsRunOutput = async (args: {
  canonicalPath: string
  canonicalText: string
  generationConfig?: RunGenerationConfig | null
  getStore: () => {
    captureCanvasPngSnapshot: () => Promise<Blob | null>
    captureCanvasSvgSnapshot: () => Promise<string | null>
  }
}): Promise<{ path: string | null; kind: AgenticOsRunOutputKind; degraded: boolean }> => {
  const preference = resolveAgenticOsRunOutputPreference(args)
  if (preference.kind === 'markdown') {
    const providerMarkdown = args.generationConfig
      ? await generateRunMarkdownWithProvider({
          config: args.generationConfig,
          prompt: buildAgenticOsRunGenerationPrompt(args.canonicalText),
        }).catch(() => null)
      : null
    const path = await mergeAgenticOsCanonicalSection({
      workspacePath: args.canonicalPath,
      sectionKey: 'run-output:markdown',
      title: 'AGENTIC_OS Run Output',
      text: providerMarkdown || buildAgenticOsRunMarkdownOutput(args.canonicalText),
    })
    return { path, kind: 'markdown', degraded: false }
  }
  if (preference.kind === 'png') {
    const generatedPng = args.generationConfig
      ? await generateRunImageWithBytePlus({
          config: args.generationConfig,
          prompt: buildAgenticOsRunMediaPrompt(args.canonicalText, 'image'),
        }).catch(() => null)
      : null
    const rawPng = generatedPng || (await args.getStore().captureCanvasPngSnapshot()) || (await captureVisibleCanvasPngBlobFromDom())
    if (!rawPng) return { path: null, kind: 'png', degraded: false }
    const pngBlob = String(rawPng.type || '').trim() === 'image/png'
      ? rawPng
      : new Blob([await rawPng.arrayBuffer()], { type: 'image/png' })
    const path = await writeAgenticOsCompanionOutputBlob({
      workspacePath: args.canonicalPath,
      extension: 'png',
      blob: pngBlob,
    })
    return { path, kind: 'png', degraded: false }
  }
  if (preference.kind === 'svg') {
    const generatedPng = args.generationConfig
      ? await generateRunImageWithBytePlus({
          config: args.generationConfig,
          prompt: buildAgenticOsRunMediaPrompt(args.canonicalText, 'image'),
        }).catch(() => null)
      : null
    const rawSvg = String(await args.getStore().captureCanvasSvgSnapshot() || '').trim()
    if (rawSvg) {
      const path = await writeAgenticOsCompanionOutputText({
        workspacePath: args.canonicalPath,
        extension: 'svg',
        text: rawSvg,
      })
      return { path, kind: 'svg', degraded: false }
    }
    const rawPng = generatedPng || (await args.getStore().captureCanvasPngSnapshot()) || (await captureVisibleCanvasPngBlobFromDom())
    if (!rawPng) return { path: null, kind: 'svg', degraded: false }
    const wrappedSvg = await wrapPngBlobAsSvgMarkup(rawPng, { includeXmlDeclaration: true })
    if (!String(wrappedSvg || '').trim()) return { path: null, kind: 'svg', degraded: false }
    const path = await writeAgenticOsCompanionOutputText({
      workspacePath: args.canonicalPath,
      extension: 'svg',
      text: wrappedSvg,
    })
    return { path, kind: 'svg', degraded: false }
  }
  const generatedVideo = args.generationConfig
    ? await generateRunVideoWithBytePlus({
        config: args.generationConfig,
        prompt: buildAgenticOsRunMediaPrompt(args.canonicalText, 'video'),
      }).catch(() => null)
    : null
  if (generatedVideo) {
    const path = await writeAgenticOsCompanionOutputBlob({
      workspacePath: args.canonicalPath,
      extension: 'mp4',
      blob: generatedVideo,
    })
    return { path, kind: 'video', degraded: false }
  }
  const fallbackMarkdown = args.generationConfig
    ? await generateRunMarkdownWithProvider({
        config: args.generationConfig,
        prompt: buildAgenticOsRunGenerationPrompt(args.canonicalText),
      }).catch(() => null)
    : null
  const path = await mergeAgenticOsCanonicalSection({
    workspacePath: args.canonicalPath,
    sectionKey: 'run-output:video-fallback',
    title: 'AGENTIC_OS Run Output',
    text: fallbackMarkdown || buildAgenticOsRunMarkdownOutput(args.canonicalText),
  })
  return { path, kind: 'video', degraded: true }
}
