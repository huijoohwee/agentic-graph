import {
  analyzeAgenticOsRequest,
  AGENTIC_OS_TIER_B_KEYS,
  sanitizeRequestIntent,
} from './chatAgenticOsRequestProfile'
import { buildDeterministicBaseTemplateAgenticOsTurn } from './chatHistoryWorkspace.agenticOs.baseFallback'
import { toCanonicalAgenticOsWorkspacePath } from './chatHistoryWorkspace.paths'
import { hasResponseOnlyAgenticOsMarker } from './chatAgenticOsResponseOnlyContract'

const splitLeadingFrontmatterAndBody = (raw: string): { frontmatter: string; body: string } | null => {
  const text = String(raw || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  let lead = 0
  while (lead < lines.length && !String(lines[lead] || '').trim()) lead += 1
  if (!/^---\s*$/.test(String(lines[lead] || ''))) return null
  for (let index = lead + 1; index < lines.length; index += 1) {
    if (!/^---\s*$/.test(String(lines[index] || ''))) continue
    return {
      frontmatter: lines.slice(lead + 1, index).join('\n'),
      body: lines.slice(index + 1).join('\n').trim(),
    }
  }
  return null
}

const isBaseTemplateFrontmatter = (frontmatter: string): boolean => {
  const normalized = `\n${String(frontmatter || '')}`
  return normalized.includes('\nruntime:') &&
    normalized.includes('\npipeline:') &&
    normalized.includes('\nmermaid:') &&
    normalized.includes('\nflow:') &&
    normalized.includes('\nlinks:') &&
    normalized.includes('\n$schema:')
}

const extractTopLevelScalar = (frontmatter: string, key: string): string => {
  const rx = new RegExp(`^${key}:\\s*(.*)$`, 'm')
  const match = rx.exec(String(frontmatter || ''))
  if (!match) return ''
  return String(match[1] || '').trim()
}

const stripYamlScalarDecorators = (raw: string): string => {
  return String(raw || '')
    .replace(/\s+#.*$/g, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim()
}

const isSentinelValue = (scalar: string, key: string): boolean => {
  return stripYamlScalarDecorators(scalar) === `{{${key}}}`
}

const replaceTopLevelScalarOrBlock = (frontmatter: string, key: string, value: string): string => {
  const lines = String(frontmatter || '').replace(/\r\n/g, '\n').split('\n')
  const keyLabel = `${String(key || '').trim()}:`
  const index = lines.findIndex(line => String(line || '').startsWith(keyLabel))
  const rendered = `${keyLabel} ${JSON.stringify(value)}`
  if (index < 0) return `${frontmatter.trimEnd()}\n${rendered}\n`
  const rawValue = String(lines[index] || '').slice(keyLabel.length).trim()
  if (rawValue !== '|') {
    lines[index] = rendered
    return `${lines.join('\n').trimEnd()}\n`
  }
  const next: string[] = []
  for (let cursor = 0; cursor < lines.length; cursor += 1) {
    if (cursor !== index) {
      next.push(lines[cursor] || '')
      continue
    }
    next.push(rendered)
    for (let nested = cursor + 1; nested < lines.length; nested += 1) {
      const line = String(lines[nested] || '')
      if (!line.trim()) continue
      if (/^\s+/.test(line)) {
        cursor = nested
        continue
      }
      cursor = nested - 1
      break
    }
  }
  return `${next.join('\n').trimEnd()}\n`
}

const replaceNestedScalarLine = (frontmatter: string, key: string, value: string): string => {
  const rx = new RegExp(`^(\\s*${key}:\\s*).*$`, 'm')
  if (!rx.test(frontmatter)) return frontmatter
  return frontmatter.replace(rx, `$1${JSON.stringify(value)}`)
}

const replaceExactLine = (body: string, from: string, to: string): string => {
  const normalizedBody = String(body || '')
  const normalizedFrom = String(from || '').trim()
  if (!normalizedFrom) return normalizedBody
  const escaped = normalizedFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(`(^|\\n)${escaped}(?=\\n|$)`, 'm')
  return rx.test(normalizedBody)
    ? normalizedBody.replace(rx, (_match, prefix: string) => `${prefix}${to}`)
    : normalizedBody
}

const replaceBodyMetaLine = (body: string, replacement: string): string => {
  const rx = /^`bg#E1F5EE:version .*$/m
  return rx.test(String(body || ''))
    ? String(body || '').replace(rx, replacement)
    : String(body || '')
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const toTimestampToken = (timestampMs: number): string => {
  const date = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now())
  const yyyy = String(date.getUTCFullYear())
  const mm = pad2(date.getUTCMonth() + 1)
  const dd = pad2(date.getUTCDate())
  const hh = pad2(date.getUTCHours())
  const min = pad2(date.getUTCMinutes())
  const sec = pad2(date.getUTCSeconds())
  return `${yyyy}${mm}${dd}${hh}${min}${sec}`
}

const toIsoDate = (timestampMs: number): string => {
  const date = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now())
  const yyyy = String(date.getUTCFullYear())
  const mm = pad2(date.getUTCMonth() + 1)
  const dd = pad2(date.getUTCDate())
  return `${yyyy}-${mm}-${dd}`
}

const toFileName = (workspacePath: string, timestampMs: number): string => {
  const cleaned = String(workspacePath || '').trim()
  if (cleaned) {
    const canonicalPath = toCanonicalAgenticOsWorkspacePath(cleaned)
    const parts = canonicalPath.split('/').filter(Boolean)
    const fileName = String(parts[parts.length - 1] || '').trim()
    if (fileName) return fileName
  }
  return `agenticOs_${toTimestampToken(timestampMs)}.md`
}

const countMatches = (text: string, rx: RegExp): number => {
  const matches = String(text || '').match(rx)
  return Array.isArray(matches) ? matches.length : 0
}

const extractFileNameFromWorkspacePath = (workspacePath?: string): string => {
  const cleaned = String(workspacePath || '').trim()
  if (!cleaned) return 'agenticOs.md'
  const canonicalPath = toCanonicalAgenticOsWorkspacePath(cleaned)
  const parts = canonicalPath.split('/').filter(Boolean)
  return String(parts[parts.length - 1] || '').trim() || 'agenticOs.md'
}

const needsRequestedSection = (body: string, enabled: boolean, heading: string): boolean => {
  return Boolean(enabled && !String(body || '').includes(heading))
}

const containsAny = (body: string, values: string[]): boolean => {
  const loweredBody = String(body || '').toLowerCase()
  return values.some(value => {
    const cleaned = String(value || '').trim().toLowerCase()
    return cleaned ? loweredBody.includes(cleaned) : false
  })
}

const normalizeCoverageText = (value: string): string => {
  return String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const missingImportantTerms = (body: string, values: string[]): string[] => {
  const normalizedBody = normalizeCoverageText(body)
  return values.filter(value => {
    const cleaned = normalizeCoverageText(value)
    return cleaned ? !normalizedBody.includes(cleaned) : false
  })
}

const containsHeading = (body: string, heading: string): boolean => {
  return String(body || '').includes(heading)
}

const STALE_COMMERCE_FALLBACK_SNIPPETS = [
  'external discovery channels',
  'the stated revenue actions',
  'the monetized conversion trigger',
  'user-action monetization',
  'monetized user actions',
  'commercialization and integration assumptions',
]

const MCP_STRUCTURED_RESPONSE_HEADING = '### MCP Structured Response Projection'
const COMPUTE_MAPPING_HEADING = '### Compute Inline Mapping Spec'

const extractMcpStructuredResponseProjectionBlock = (body: string): string => {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(line => String(line || '').trim() === MCP_STRUCTURED_RESPONSE_HEADING)
  if (start < 0) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = String(lines[index] || '').trim()
    if (/^#{1,3}\s+/.test(line)) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

const preserveMcpStructuredResponseProjectionBlock = (args: {
  originalBody: string
  nextBody: string
}): string => {
  const block = extractMcpStructuredResponseProjectionBlock(args.originalBody)
  const nextBody = String(args.nextBody || '').replace(/\r\n/g, '\n').trim()
  if (!block || nextBody.includes(MCP_STRUCTURED_RESPONSE_HEADING)) return nextBody
  const marker = `\n${COMPUTE_MAPPING_HEADING}`
  if (nextBody.includes(marker)) return nextBody.replace(marker, `\n${block}\n${marker}`)
  return `${nextBody.trimEnd()}\n\n${block}`.trim()
}

const shouldRegenerateQueryResponsiveFrontmatter = (args: {
  frontmatter: string
  requestText: string
}): boolean => {
  const frontmatter = String(args.frontmatter || '').replace(/\r\n/g, '\n').trim()
  const requestIntent = sanitizeRequestIntent(args.requestText)
  if (!requestIntent) return false
  if (!frontmatter) return true
  const profile = analyzeAgenticOsRequest(args.requestText)
  const requiredSnippets = [
    'feedback_arcs:',
    'forward_edges:',
    'direction:  {key: direction',
    'computed:   {key: computed',
    'compute:\n        key: compute',
    'click n-trigger',
    'seq:    R01',
  ]
  if (requiredSnippets.some(snippet => !frontmatter.includes(snippet))) return true
  if (profile.signals.openClaw && !containsAny(frontmatter, ['openclaw'])) return true
  if (profile.signals.stripe && !containsAny(frontmatter, ['stripe', 'checkout'])) return true
  if (profile.signals.subscriptions && !containsAny(frontmatter, ['subscription'])) return true
  if (profile.signals.payPerUse && !containsAny(frontmatter, ['pay-per-use'])) return true
  if (profile.signals.conversion && !containsAny(frontmatter, ['conversion'])) return true
  if (profile.signals.rxdb && !containsAny(frontmatter, ['rxdb'])) return true
  if (profile.signals.maplibre && !containsAny(frontmatter, ['maplibre'])) return true
  if (profile.signals.externalUsers && !containsAny(frontmatter, ['external-user', 'external users'])) return true
  if (missingImportantTerms(frontmatter, profile.namedTerms).length > 0) return true
  if (
    !(profile.signals.b2c || profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion || profile.signals.payments)
    && STALE_COMMERCE_FALLBACK_SNIPPETS.some(snippet => containsAny(frontmatter, [snippet]))
  ) {
    return true
  }
  return false
}

const shouldRegenerateQueryResponsiveBody = (args: {
  body: string
  requestText: string
  workspacePath?: string
}): boolean => {
  const body = String(args.body || '').replace(/\r\n/g, '\n').trim()
  const requestIntent = sanitizeRequestIntent(args.requestText)
  if (!requestIntent) return false
  if (!body) return true
  const profile = analyzeAgenticOsRequest(args.requestText)
  const placeholderRefs = countMatches(body, /\{\{(?:product|doc_type|subject|domain|objective|artifact|owner|version|status)\}\}/g)
  if (placeholderRefs >= 4) return true
  if (
    body.includes('> **This document is the pipeline.**') ||
    body.includes('The sections below — Flow Graph, Pipeline, PRD, TAD') ||
    body.includes('This document is dual-layered: the YAML frontmatter **is** the computing flow.') ||
    body.includes('This document turns one request into one reusable pipeline artifact.') ||
    body.includes('The canonical five-node pipeline is applied to the current request:') ||
    body.includes('This section projects `pipeline:` into a readable sequence')
  ) {
    return true
  }
  if (!body.includes('### Variable Link Map')) return true
  if (!body.includes('### Request Snapshot')) return true
  if (!containsAny(body, ['`{{product}}`', '`{{artifact}}`', '`{{subject}}`'])) return true
  if (!profile.requestedSections.useCase && containsHeading(body, '### Use Case')) return true
  if (!profile.requestedSections.problem && containsHeading(body, '### Problem')) return true
  if (!profile.requestedSections.solution && containsHeading(body, '### Solution')) return true
  if (!profile.requestedSections.userFlow && containsHeading(body, '### User Flow')) return true
  if (!profile.requestedSections.workflow && containsHeading(body, '### Work Flow')) return true
  if (!profile.requestedSections.dataFlow && containsHeading(body, '### Data Flow')) return true
  if (!profile.requestedSections.monetization && containsHeading(body, '### Monetization Surface')) return true
  if (!profile.requestedSections.integrations && containsHeading(body, '### Integration Boundaries')) return true
  if (needsRequestedSection(body, profile.requestedSections.useCase, '### Use Case')) return true
  if (needsRequestedSection(body, profile.requestedSections.problem, '### Problem')) return true
  if (needsRequestedSection(body, profile.requestedSections.solution, '### Solution')) return true
  if (needsRequestedSection(body, profile.requestedSections.userFlow, '### User Flow')) return true
  if (needsRequestedSection(body, profile.requestedSections.workflow, '### Work Flow')) return true
  if (needsRequestedSection(body, profile.requestedSections.dataFlow, '### Data Flow')) return true
  if (profile.requestedSections.monetization && !containsAny(body, ['### Monetization Surface', 'subscription', 'pay-per-use', 'checkout', 'conversion'])) return true
  if (profile.requestedSections.integrations && !containsAny(body, ['### Integration Boundaries', ...profile.namedTerms])) return true
  if (profile.signals.subscriptions && !containsAny(body, ['subscription'])) return true
  if (profile.signals.payPerUse && !containsAny(body, ['pay-per-use'])) return true
  if (profile.signals.conversion && !containsAny(body, ['conversion', 'checkout'])) return true
  if (profile.signals.openClaw && !containsAny(body, ['openclaw'])) return true
  if (profile.signals.stripe && !containsAny(body, ['stripe', 'checkout'])) return true
  if (profile.signals.rxdb && !containsAny(body, ['rxdb'])) return true
  if (profile.signals.maplibre && !containsAny(body, ['maplibre'])) return true
  if (profile.signals.externalUsers && !containsAny(body, ['external users'])) return true
  if (profile.artifact && !containsAny(body, [profile.artifact])) return true
  if (missingImportantTerms(body, profile.namedTerms).length > 0) return true
  if (
    !(profile.signals.b2c || profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion || profile.signals.payments)
    && STALE_COMMERCE_FALLBACK_SNIPPETS.some(snippet => containsAny(body, [snippet]))
  ) {
    return true
  }
  if (profile.namedTerms.length > 0 && !containsAny(body, profile.namedTerms)) return true
  return false
}

const toGraphId = (fileName: string): string => {
  const stem = String(fileName || '')
    .replace(/\.[^.]+$/g, '')
    .trim()
  const slug = stem
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'agenticOs'
  return slug.endsWith('-pipeline') ? `md:${slug}` : `md:${slug}-pipeline`
}

export const enforceAgenticOsQueryResponsiveContent = (args: {
  markdown: string
  requestText: string
  workspacePath?: string
  assistantText?: string
}): string => {
  const requestIntent = sanitizeRequestIntent(args.requestText)
  if (!requestIntent) return args.markdown
  const text = String(args.markdown || '').replace(/\r\n/g, '\n').trim()
  const parsed = splitLeadingFrontmatterAndBody(text)
  if (!parsed || !isBaseTemplateFrontmatter(parsed.frontmatter)) return args.markdown

  const profile = analyzeAgenticOsRequest(args.requestText)
  let nextFrontmatter = parsed.frontmatter
  let generatedParsed: { frontmatter: string; body: string } | null = null
  const ensureGeneratedParsed = (): { frontmatter: string; body: string } | null => {
    if (generatedParsed) return generatedParsed
    const generated = buildDeterministicBaseTemplateAgenticOsTurn({
      timestampMs: Date.now(),
      fileName: extractFileNameFromWorkspacePath(args.workspacePath),
      requestText: args.requestText,
      assistantText: args.assistantText || '',
    })
    generatedParsed = splitLeadingFrontmatterAndBody(generated)
    return generatedParsed
  }
  if (shouldRegenerateQueryResponsiveFrontmatter({
    frontmatter: nextFrontmatter,
    requestText: args.requestText,
  })) {
    const generated = ensureGeneratedParsed()
    if (generated?.frontmatter.trim()) {
      nextFrontmatter = generated.frontmatter.trim()
    }
  }
  const existingProduct = stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'product'))
  const existingDocType = stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'doc_type'))
  for (const key of AGENTIC_OS_TIER_B_KEYS) {
    const inferred = String(profile[key] || '').trim()
    if (!inferred) continue
    const current = extractTopLevelScalar(nextFrontmatter, key)
    if (!isSentinelValue(current, key)) continue
    nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, key, inferred)
  }
  const artifactDocType = String(profile.artifact || '').trim()
  const resolvedProduct = String(profile.product || existingProduct || '').trim()
  if (artifactDocType && (!existingDocType || existingDocType === 'Chat Response' || existingDocType === '{{doc_type}}')) {
    nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'doc_type', artifactDocType)
    if (resolvedProduct && resolvedProduct !== '{{product}}') {
      nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'title', `${resolvedProduct} · AI Pipeline — ${artifactDocType}`)
    }
  }

  let nextBody = parsed.body.trim()
  if (!hasResponseOnlyAgenticOsMarker(nextFrontmatter) && shouldRegenerateQueryResponsiveBody({
    body: nextBody,
    requestText: args.requestText,
    workspacePath: args.workspacePath,
  })) {
    const generated = ensureGeneratedParsed()
    if (generated?.body.trim()) {
      nextBody = generated.body.trim()
    }
  }
  if (artifactDocType) {
    nextBody = replaceExactLine(nextBody, '## {{doc_type}}', `## ${artifactDocType}`)
    nextBody = replaceExactLine(nextBody, '## Chat Response', `## ${artifactDocType}`)
  }
  nextBody = preserveMcpStructuredResponseProjectionBlock({
    originalBody: parsed.body,
    nextBody,
  })

  return ['---', nextFrontmatter.trimEnd(), '---', nextBody].join('\n').trimEnd() + '\n'
}

export const normalizeAgenticOsFrontmatterIdentityToFileName = (args: {
  markdown: string
  workspacePath: string
  timestampMs: number
}): string => {
  const text = String(args.markdown || '').replace(/\r\n/g, '\n').trim()
  if (!text.startsWith('---\n')) return text
  const parsed = splitLeadingFrontmatterAndBody(text)
  if (!parsed) return text
  if (!isBaseTemplateFrontmatter(parsed.frontmatter)) return text

  const fileName = toFileName(args.workspacePath, args.timestampMs)
  let nextFrontmatter = parsed.frontmatter
  const product = stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'product'))
  const docType = stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'doc_type')) || 'Chat Response'
  const owner = stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'owner'))
  const status = stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'status'))
  nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'graphId', toGraphId(fileName))
  nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'date', toIsoDate(args.timestampMs))
  if (!stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'doc_type'))) {
    nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'doc_type', 'Chat Response')
  }
  if (!stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'ai_model'))) {
    nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'ai_model', 'model-unknown')
  }
  if (!stripYamlScalarDecorators(extractTopLevelScalar(nextFrontmatter, 'lang'))) {
    nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'lang', 'en')
  }
  if (product && product !== '{{product}}') {
    nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, 'title', `${product} · AI Pipeline — ${docType}`)
  }
  nextFrontmatter = replaceTopLevelScalarOrBlock(nextFrontmatter, '$schema', 'agentic-os-pipeline/v1')
  nextFrontmatter = replaceNestedScalarLine(nextFrontmatter, 'self_ref', fileName)
  const resolvedDate = toIsoDate(args.timestampMs)
  let nextBody = parsed.body.trim()
  if (product && product !== '{{product}}') {
    nextBody = replaceExactLine(nextBody, '# {{product}} · AI Pipeline', `# ${product} · AI Pipeline`)
  }
  nextBody = replaceExactLine(nextBody, '## {{doc_type}}', `## ${docType}`)
  nextBody = replaceBodyMetaLine(
    nextBody,
    `\`bg#E1F5EE:version {{version}}\` · \`bg#FAEEDA:status ${status && status !== '{{status}}' ? status : '{{status}}'}\` · owner \`${owner && owner !== '{{owner}}' ? owner : '{{owner}}'}\` · ${resolvedDate}`
  )

  return ['---', nextFrontmatter.trimEnd(), '---', nextBody].join('\n').trimEnd() + '\n'
}
