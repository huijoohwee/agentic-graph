import type { JSONValue } from '@/lib/graph/types'
import { collectComputingFlowBodyVarKeys, findUndeclaredComputingFlowBodyRef, hasComputingFlowContract, readComputingFlowBodyRefKey } from './chatComputingFlowContract'
import { extractSecondLevelYamlKeys, isFrontmatterVarKeyDeclared } from './chatKgcFrontmatter'
import { isResponseOnlyKgcFrontmatter, readResponseOnlyKgcVariableLinkError } from './chatKgcResponseOnlyContract'
import { validateNoAuthoredHtmlTables } from './chatMarkdownTableValidation'; export type ChatMarkdownValidationRuleId =
  | 'V-01'
  | 'V-02'
  | 'V-03'
  | 'V-04'
  | 'V-05'
  | 'V-06'
  | 'V-07' | 'V-10'

export type ChatMarkdownValidationError = {
  ruleId: ChatMarkdownValidationRuleId
  message: string
}

export type ChatMarkdownValidationResult = {
  ok: boolean
  errors: ChatMarkdownValidationError[]
  failedRuleId: ChatMarkdownValidationRuleId | null
}

const CANONICAL_KGC_REQUIRED_FRONTMATTER_KEYS = [
  'title',
  'graphId',
  'doc_type',
  'date',
  'ai_model',
  'lang',
  '$schema',
  'spec',
  'runner',
  'links',
  'canvas',
  'graph_meta',
  'product',
  'domain',
  'subject',
  'objective',
  'artifact',
  'owner',
  'version',
  'status',
  'runtime',
  'pipeline',
  'mermaid',
  'flow',
] as const
const CANVAS_PRESET_ONLY_FRONTMATTER_KEYS = [
  'kgFrontmatterModeEnabled',
  'kgDocumentSemanticMode',
  'kgCanvasSurfaceMode',
  'kgCanvas2dRenderer',
] as const
const PARALLEL_GROUPING_TOP_LEVEL_KEYS = [
  'kg:subgraphs',
  'clusters',
  'cluster',
  'groups',
  'group',
  'layers',
  'layer',
] as const

const HEX6_UPPER_RE = /^#[0-9A-F]{6}$/
const SIGIL_RE = /^(#[0-9a-fA-F]{6})?(\|?bg#[0-9a-fA-F]{6})?:(.+)$/

const extractInlineCodeSpans = (md: string): string[] => {
  const text = String(md || '')
  const out: string[] = []
  const rx = /`([^`\n]+)`/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(text))) {
    const inner = String(m[1] || '')
    if (inner) out.push(inner)
  }
  return out
}

const validateSigilsUpperHex = (md: string): ChatMarkdownValidationError | null => {
  const inlineCodes = extractInlineCodeSpans(md)
  for (const code of inlineCodes) {
    if (!code.includes('#')) continue
    const normalized = code.replace(/\\\|/g, '|')
    const match = normalized.match(SIGIL_RE)
    if (!match) continue
    if (match[1] && !HEX6_UPPER_RE.test(String(match[1] || ''))) {
      return {
        ruleId: 'V-01',
        message: 'Annotation sigil color must be exactly 6 uppercase hex digits.',
      }
    }
    if (match[2]) {
      const bg = String(match[2] || '').replace('|', '').replace('bg', '')
      if (!HEX6_UPPER_RE.test(bg)) {
        return {
          ruleId: 'V-01',
          message: 'Annotation sigil background must be exactly 6 uppercase hex digits.',
        }
      }
    }
  }
  return null
}

const validateLongQuotes = (md: string): ChatMarkdownValidationError | null => {
  const parsed = extractLeadingFrontmatterAndBody(md)
  const text = parsed ? parsed.body : String(md || '')
  const spans: string[] = []
  const doubleRx = /"([^"]+)"/g
  const singleRx = /'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = doubleRx.exec(text))) spans.push(String(m[1] || ''))
  while ((m = singleRx.exec(text))) spans.push(String(m[1] || ''))
  for (const span of spans) {
    const words = span.trim().split(/\s+/).filter(Boolean)
    if (words.length >= 15) {
      return {
        ruleId: 'V-02',
        message: 'Avoid quoted spans >= 15 words. Summarize instead of quoting long passages.',
      }
    }
  }
  return null
}

const validateKgcEnvelopeStartsAtFrontmatter = (md: string): ChatMarkdownValidationError | null => {
  const text = String(md || '').replace(/\r\n/g, '\n').trim()
  if (!text) return null
  if (text.startsWith('---\n')) return null
  if (text.startsWith('```') && text.includes('\n---\n')) {
    return {
      ruleId: 'V-03',
      message: 'Return the KGC document directly, not wrapped in fenced markdown or commentary.',
    }
  }
  if (text.includes('\n---\n')) {
    return {
      ruleId: 'V-03',
      message: 'KGC output must start immediately with YAML frontmatter. Remove any wrapper prose or preamble before `---`.',
    }
  }
  return null
}

const extractInlineDeclaredVarKeys = (md: string): Set<string> => {
  const text = String(md || '').replace(/\r\n/g, '\n')
  const keys = new Set<string>()
  const inlineRefRx = /\{\{([^}]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = inlineRefRx.exec(text))) {
    const inner = String(m[1] || '').trim()
    const idxColon = inner.indexOf(':')
    const idxPipe = inner.indexOf('|')
    const cut = [idxColon, idxPipe].filter(i => i >= 0).sort((a, b) => a - b)[0]
    if (idxColon >= 0 && (cut === idxColon)) {
      const key = inner.slice(0, idxColon).trim()
      if (key) keys.add(key)
    }
  }
  return keys
}

const extractLeadingFrontmatterAndBody = (md: string): { frontmatter: string; body: string } | null => {
  const text = String(md || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  let start = 0
  while (start < lines.length && !String(lines[start] || '').trim()) start += 1
  if (String(lines[start] || '').trim() !== '---') return null
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!/^---\s*$/.test(String(lines[i] || ''))) continue
    return {
      frontmatter: lines.slice(start + 1, i).join('\n').trim(),
      body: lines.slice(i + 1).join('\n').trim(),
    }
  }
  return null
}

const extractTopLevelFrontmatterKeys = (frontmatter: string): Set<string> => {
  const lines = String(frontmatter || '').split('\n')
  const keys = new Set<string>()
  for (const line of lines) {
    const m = /^([A-Za-z_$][A-Za-z0-9_$-]{0,48})\s*:\s*/.exec(line)
    if (!m) continue
    const key = String(m[1] || '').trim()
    if (!key) continue
    keys.add(key)
  }
  return keys
}

const BASE_TEMPLATE_TIER_B_KEYS = [
  'product',
  'domain',
  'subject',
  'objective',
  'artifact',
  'owner',
  'version',
  'status',
] as const
const BASE_TEMPLATE_GENERIC_DOC_VAR_KEYS = new Set<string>(['variable', 'key'])

const isBaseTemplateFrontmatter = (frontmatter: string, keys: Set<string>): boolean => {
  if (!keys.has('runtime') || !keys.has('pipeline') || !keys.has('mermaid') || !keys.has('flow')) return false
  return BASE_TEMPLATE_TIER_B_KEYS.every(key => keys.has(key)) &&
    frontmatter.includes('\nruntime:') &&
    frontmatter.includes('\npipeline:') &&
    frontmatter.includes('\nmermaid:') &&
    frontmatter.includes('\nflow:')
}

const isBaseTemplateMarkdown = (md: string): boolean => {
  const parsed = extractLeadingFrontmatterAndBody(md)
  if (!parsed) return false
  const keys = extractTopLevelFrontmatterKeys(parsed.frontmatter)
  return isBaseTemplateFrontmatter(parsed.frontmatter, keys)
}

const extractTopLevelYamlBlockScalar = (frontmatter: string, key: string): string => {
  const lines = String(frontmatter || '').replace(/\r\n/g, '\n').split('\n')
  const keyName = String(key || '').trim()
  const keyRx = new RegExp(`^${keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:(?:\\s|$)`)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const match = keyRx.exec(line)
    if (!match) continue
    const rawValue = line.slice(match[0].length).trim()
    if (rawValue !== '|') return rawValue
    const out: string[] = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]
      if (!next.trim()) {
        out.push('')
        continue
      }
      if (!/^\s+/.test(next)) break
      out.push(next.replace(/^\s{2}/, ''))
    }
    return out.join('\n').trim()
  }
  return ''
}

const extractBodySectionMarkdown = (body: string, heading: string): string => {
  const text = String(body || '').replace(/\r\n/g, '\n')
  if (!text) return ''
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(`^##\\s+${escapedHeading}\\s*$`, 'im')
  const match = rx.exec(text)
  if (!match || typeof match.index !== 'number') return ''
  const start = match.index + match[0].length
  const tail = text.slice(start).replace(/^\s*\n/, '')
  const nextHeadingMatch = /^\s*##\s+/m.exec(tail)
  const section = nextHeadingMatch ? tail.slice(0, nextHeadingMatch.index) : tail
  return section.trim()
}

const stripFencedCodeBlocks = (text: string): string => {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ')
}

const countWordLikeTokens = (raw: string): number => {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length
}

const countMatches = (raw: string, rx: RegExp): number => {
  const matches = String(raw || '').match(rx)
  return Array.isArray(matches) ? matches.length : 0
}

const isPlaceholderLike = (raw: string): boolean => {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim().toLowerCase()
  if (!text) return true
  return (
    text === 'tbd' ||
    text === '—' ||
    text === '_streaming..._' ||
    text === 'streaming...' ||
    text === 'assistant response' ||
    text.startsWith('@flag:validation-failed')
  )
}

const estimateRequestComplexityScore = (raw: string): number => {
  const text = String(raw || '')
  let score = 0
  score += countMatches(text, /;/g)
  score += countMatches(text, /->/g)
  score += countMatches(text, /\+/g)
  score += countMatches(text, /\b(?:pitch deck|prd|tad|user flow|work flow|data flow|kanban|table|monetization|payments?|checkout|architecture|roadmap)\b/gi)
  return score
}

const hasUnbalancedDelimiters = (raw: string): boolean => {
  const text = String(raw || '')
  const stack: string[] = []
  const openToClose: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
  const closeToOpen: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (openToClose[ch]) {
      stack.push(ch)
      continue
    }
    if (!closeToOpen[ch]) continue
    const last = stack[stack.length - 1]
    if (!last || closeToOpen[ch] !== last) return true
    stack.pop()
  }
  return stack.length > 0
}

const validateNoNestedCodeFences = (md: string): ChatMarkdownValidationError | null => {
  const text = String(md || '').replace(/\r\n/g, '\n')
  const parsed = extractLeadingFrontmatterAndBody(text)
  if (!parsed) {
    if (!/```+/.test(text)) return null
    return {
      ruleId: 'V-03',
      message: 'Nested code fences are forbidden inside the `kgc` document. Use YAML block scalars and plain markdown body sections instead.',
    }
  }
  const fmKeys = extractTopLevelFrontmatterKeys(parsed.frontmatter)
  if (isBaseTemplateFrontmatter(parsed.frontmatter, fmKeys)) {
    if (!/```+/.test(parsed.frontmatter)) return null
    return {
      ruleId: 'V-03',
      message: 'Base-template KGC frontmatter must not contain fenced code blocks.',
    }
  }
  if (!/```+/.test(text)) return null
  return {
    ruleId: 'V-03',
    message: 'Nested code fences are forbidden inside the `kgc` document. Use YAML block scalars and plain markdown body sections instead.',
  }
}

const validateBaseTemplateBodyShape = (frontmatter: string, body: string): ChatMarkdownValidationError | null => {
  const fmKeys = extractTopLevelFrontmatterKeys(frontmatter)
  const requiredSections = [
    '## Computing Flow Definition',
    '## Flow Graph',
    '## Pipeline',
    '## PRD — Product Requirements',
    '## TAD — Technical Architecture',
    '## Node Reference',
    '## Open Questions',
    '## Customization Guide',
  ]
  for (const section of requiredSections) {
    if (body.includes(section)) continue
    return {
      ruleId: 'V-03',
      message: `Base-template body is missing required section: ${section}.`,
    }
  }
  for (const key of CANONICAL_KGC_REQUIRED_FRONTMATTER_KEYS) {
    if (fmKeys.has(key)) continue
    return {
      ruleId: 'V-03',
      message: `Base-template frontmatter is missing canonical KGC block: ${key}.`,
    }
  }
  const tierAKeys = ['title', 'graphId', 'doc_type', 'date', 'ai_model'] as const
  const requiredSubsections = [
    '### Runner Protocol',
    '### Graph Registry',
    '### Document Links',
    '### Retry arc — S04 feedback to S03',
    '### Goals',
    '### Non-Goals',
    '### User Stories',
    '### Compute Inline Mapping Spec',
    '### S02 Context Bundle Field Spec',
    '### S04 Validation Rules',
    '### S05 Data Schema',
    '### Frontmatter variable map',
    '### Extension checklist',
    '### Syntax quick-reference',
  ]
  for (const section of requiredSubsections) {
    if (body.includes(section)) continue
    return {
      ruleId: 'V-03',
      message: `Base-template body is missing required subsection: ${section}.`,
    }
  }
  for (const key of tierAKeys) {
    const scalar = extractTopLevelYamlBlockScalar(frontmatter, key).trim()
    if (!scalar) {
      return {
        ruleId: 'V-03',
        message: `Base-template frontmatter key "${key}" must be non-empty.`,
      }
    }
  }
  const bodyWordCount = countWordLikeTokens(body.replace(/\{\{[^}]+\}\}/g, ' '))
  if (bodyWordCount < 80) {
    return {
      ruleId: 'V-03',
      message: 'Base-template body is too thin. Expand the markdown sections with concrete explanatory content.',
    }
  }
  return null
}

const validateCanonicalKgcFrontmatterShape = (md: string): ChatMarkdownValidationError | null => {
  const parsed = extractLeadingFrontmatterAndBody(md)
  if (!parsed || isResponseOnlyKgcFrontmatter(parsed.frontmatter) || hasComputingFlowContract(parsed.frontmatter, parsed.body)) return null
  const fmKeys = extractTopLevelFrontmatterKeys(parsed.frontmatter)
  const hasCanvasPresetOnlyKeys = CANVAS_PRESET_ONLY_FRONTMATTER_KEYS.some(key => fmKeys.has(key))
  const hasCanonicalKgcSignals = CANONICAL_KGC_REQUIRED_FRONTMATTER_KEYS.some(key => fmKeys.has(key))
  if (hasCanvasPresetOnlyKeys && !hasCanonicalKgcSignals) {
    return {
      ruleId: 'V-03',
      message: 'chatAgenticGraph output must not degrade to a minimal canvas-preset-only document. Return the full canonical KGC contract.',
    }
  }
  if (!hasCanonicalKgcSignals) return null
  for (const key of CANONICAL_KGC_REQUIRED_FRONTMATTER_KEYS) {
    if (fmKeys.has(key)) continue
    return {
      ruleId: 'V-03',
      message: `Canonical KGC frontmatter block is missing: ${key}.`,
    }
  }
  return null
}

const validateCanonicalGroupingSurface = (md: string): ChatMarkdownValidationError | null => {
  const parsed = extractLeadingFrontmatterAndBody(md)
  if (!parsed) return null
  const fmKeys = extractTopLevelFrontmatterKeys(parsed.frontmatter)
  const topLevelParallelKeys = PARALLEL_GROUPING_TOP_LEVEL_KEYS.filter(key => {
    if (key === 'kg:subgraphs') return /(^|\n)kg:subgraphs\s*:/m.test(parsed.frontmatter)
    return fmKeys.has(key)
  })
  if (topLevelParallelKeys.length > 0) {
    return {
      ruleId: 'V-03',
      message: `Use flow.subgraphs as the only grouping source of truth. Remove parallel grouping channel(s): ${topLevelParallelKeys.join(', ')}.`,
    }
  }
  const flowBlock = extractTopLevelYamlBlockScalar(parsed.frontmatter, 'flow')
  if (!flowBlock) return null
  if (/(^|\n)\s*(?:clusters|cluster|groups?|layers?)\s*:/m.test(flowBlock)) {
    return {
      ruleId: 'V-03',
      message: 'Use flow.subgraphs as the only grouping source of truth. Remove retired group, cluster, or layer registries from flow.',
    }
  }
  const hasCanonicalGroupingRequirement =
    isBaseTemplateFrontmatter(parsed.frontmatter, fmKeys) ||
    fmKeys.has('pipeline') ||
    fmKeys.has('mermaid') ||
    fmKeys.has('graph_meta')
  if (hasCanonicalGroupingRequirement && !/(^|\n)\s*subgraphs\s*:/m.test(flowBlock)) {
    return {
      ruleId: 'V-03',
      message: 'Canonical KGC flow payload must declare flow.subgraphs so grouping projects through kg:subgraphs metadata.',
    }
  }
  return null
}

const validateFrontmatterBodyVariableLink = (md: string): ChatMarkdownValidationError | null => {
  const parsed = extractLeadingFrontmatterAndBody(md)
  if (!parsed) {
    return {
      ruleId: 'V-03',
      message: 'Missing YAML frontmatter. KGC markdown must start with frontmatter and close it before markdown body.',
    }
  }
  const body = parsed.body
  if (!body) {
    return {
      ruleId: 'V-03',
      message: 'Missing markdown body after frontmatter. Add non-empty body sections linked via {{key}}.',
    }
  }
  const refs = Array.from(stripFencedCodeBlocks(body).matchAll(/\{\{([^}]+)\}\}/g))
    .map(m => String(m[1] || '').trim())
    .filter(Boolean)
  if (refs.length === 0) {
    return {
      ruleId: 'V-03',
      message: 'Markdown body must reference frontmatter variables using {{key}} placeholders.',
    }
  }
  const fmKeys = extractTopLevelFrontmatterKeys(parsed.frontmatter)
  if (isResponseOnlyKgcFrontmatter(parsed.frontmatter))
    return ((message: string) => message ? { ruleId: 'V-03', message } : null)(readResponseOnlyKgcVariableLinkError({ frontmatterKeys: fmKeys, refs, readRefKey: readComputingFlowBodyRefKey }))
  const isBaseTemplate = isBaseTemplateFrontmatter(parsed.frontmatter, fmKeys)
  if (hasComputingFlowContract(parsed.frontmatter)) {
    const key = findUndeclaredComputingFlowBodyRef(parsed.frontmatter, refs)
    if (key) return { ruleId: 'V-03', message: `Computing-flow body variable {{${key}}} is not declared in canvas:runAction.bodyTokens.` }
    return null
  }
  if (isBaseTemplate) {
    for (const key of BASE_TEMPLATE_TIER_B_KEYS) {
      const scalar = extractTopLevelYamlBlockScalar(parsed.frontmatter, key).trim()
      if (!scalar) {
        return {
          ruleId: 'V-03',
          message: `Base-template frontmatter key "${key}" must be non-empty.`,
        }
      }
    }
    for (const ref of refs) {
      const key = readComputingFlowBodyRefKey(ref)
      if (!key) continue
      if (!isFrontmatterVarKeyDeclared({
        frontmatter: parsed.frontmatter,
        topLevelKeys: fmKeys,
        varKey: key,
        dottedParents: ['runtime'],
      })) {
        return {
          ruleId: 'V-03',
          message: `Body variable {{${key}}} is not declared in YAML frontmatter.`,
        }
      }
    }
    return null
  }
  for (const scalarKey of ['subject', 'action', 'goal', 'solution'] as const) {
    const scalar = extractTopLevelYamlBlockScalar(parsed.frontmatter, scalarKey).trim()
    if (!scalar) {
      return {
        ruleId: 'V-03',
        message: `Frontmatter key "${scalarKey}" must be non-empty.`,
      }
    }
    if (/\{\{[^}]+\}\}/.test(scalar)) return { ruleId: 'V-03', message: `Frontmatter key "${scalarKey}" must be concrete text, not a template placeholder.` }
  }
  for (const ref of refs) {
    const key = readComputingFlowBodyRefKey(ref)
    if (!key) continue
    if (!fmKeys.has(key)) return { ruleId: 'V-03', message: `Body variable {{${key}}} is not declared in YAML frontmatter.` }
  }
  return null
}

const validateSubstantiveKgcPayload = (md: string): ChatMarkdownValidationError | null => {
  const parsed = extractLeadingFrontmatterAndBody(md)
  if (!parsed || hasComputingFlowContract(parsed.frontmatter, parsed.body) || isResponseOnlyKgcFrontmatter(parsed.frontmatter)) return null
  const fmKeys = extractTopLevelFrontmatterKeys(parsed.frontmatter)
  if (isBaseTemplateFrontmatter(parsed.frontmatter, fmKeys)) {
    return validateBaseTemplateBodyShape(parsed.frontmatter, parsed.body)
  }
  const requestMd = extractTopLevelYamlBlockScalar(parsed.frontmatter, 'request_md')
  const solutionMd = extractTopLevelYamlBlockScalar(parsed.frontmatter, 'solution_md')
  const requestSection = extractBodySectionMarkdown(parsed.body, 'Request')
  const solutionSection = extractBodySectionMarkdown(parsed.body, 'Solution')
  const effectiveRequest = requestSection || requestMd
  const effectiveSolution = solutionSection || solutionMd
  if (/^#{1,6}\s+\{\{(?:solution|solution_md)(?:[:|][^}]*)?\}\}\s*$/m.test(parsed.body)) {
    return {
      ruleId: 'V-03',
      message: 'Markdown body headings must not be pure solution placeholders. Put concrete section titles and actual answer content.',
    }
  }
  if (/\{\{\s*solution_md(?:[:|][^}]*)?\s*\}\}/.test(parsed.body)) {
    return {
      ruleId: 'V-03',
      message: 'Markdown body must contain the actual solution content, not only a {{solution_md}} placeholder shell.',
    }
  }
  if (isPlaceholderLike(effectiveSolution)) {
    return {
      ruleId: 'V-03',
      message: 'Solution content must contain the full useful answer, not a placeholder or streaming marker.',
    }
  }
  if (hasUnbalancedDelimiters(effectiveSolution)) {
    return {
      ruleId: 'V-03',
      message: 'Solution content appears truncated or structurally incomplete (unbalanced delimiters). Regenerate a complete response.',
    }
  }

  const requestWords = countWordLikeTokens(effectiveRequest)
  const solutionWords = countWordLikeTokens(effectiveSolution)
  const bodyRenderableWords = countWordLikeTokens(
    parsed.body
      .replace(/\{\{[^}]+\}\}/g, ' ')
      .replace(/^#+\s+/gm, ' ')
      .replace(/^\s*[-*]\s+/gm, ' ')
      .replace(/^\s*\d+\.\s+/gm, ' '),
  )
  const bodyHeadingCount = countMatches(parsed.body, /^##?\s+/gm)
  if (bodyHeadingCount < 3) {
    return {
      ruleId: 'V-03',
      message: 'Markdown body must contain structured sections, not a thin shell.',
    }
  }

  const complexityScore = estimateRequestComplexityScore(effectiveRequest)
  const minSolutionWords = complexityScore >= 2 || requestWords >= 40
    ? Math.min(180, Math.max(36, Math.floor(requestWords * 0.8)))
    : requestWords >= 24
      ? Math.min(120, Math.max(18, Math.floor(requestWords * 0.45)))
      : 0
  const minBodyWords = minSolutionWords > 0
    ? Math.max(24, Math.floor(minSolutionWords * 0.65))
    : 0
  if (minSolutionWords > 0 && solutionWords < minSolutionWords) {
    return {
      ruleId: 'V-03',
      message: `Solution content is too thin for this request. Expand it into a substantive markdown answer (need at least ~${minSolutionWords} words for this request complexity).`,
    }
  }
  if (minBodyWords > 0 && bodyRenderableWords < minBodyWords) {
    return {
      ruleId: 'V-03',
      message: `Markdown body is too thin for this request. Put the real answer content directly in the body (need at least ~${minBodyWords} renderable words).`,
    }
  }
  return null
}

const validateVariableRefsResolvable = (md: string, vars: Set<string>): ChatMarkdownValidationError | null => {
  const text = stripFencedCodeBlocks(String(md || ''))
  const isBaseTemplate = isBaseTemplateMarkdown(md)
  const baseSentinelKeys = new Set<string>(BASE_TEMPLATE_TIER_B_KEYS)
  const rx = /\{\{([^}]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(text))) {
    const inner = String(m[1] || '').trim()
    if (!inner) continue
    const idxColon = inner.indexOf(':')
    const idxPipe = inner.indexOf('|')
    const cut = [idxColon, idxPipe].filter(i => i >= 0).sort((a, b) => a - b)[0]
    const key = (cut != null ? inner.slice(0, cut) : inner)
      .replace(/\\([|:])/g, '$1')
      .replace(/\\+$/g, '')
      .trim()
    if (!key) continue
    if (isBaseTemplate && BASE_TEMPLATE_GENERIC_DOC_VAR_KEYS.has(key)) continue
    if (!vars.has(key)) {
      if (isBaseTemplate && baseSentinelKeys.has(key)) continue
      return {
        ruleId: 'V-03',
        message: `Unresolved variable reference: {{${key}}}. Declare it in frontmatter/context or inline as {{${key}:value}}.`,
      }
    }
  }
  return null
}

const validateInlineJsonArrays = (md: string): ChatMarkdownValidationError | null => {
  const inlineCodes = extractInlineCodeSpans(md)
  for (const code of inlineCodes) {
    const trimmed = code.trim()
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) continue
    // Only enforce strict JSON when the author intends JSON-like quoted arrays.
    if (!trimmed.includes('"')) continue
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!Array.isArray(parsed)) continue
    } catch {
      return {
        ruleId: 'V-04',
        message: 'Inline-code arrays must be valid JSON, e.g. `["A","B"]`.',
      }
    }
  }
  return null
}

const validateComputePurity = (md: string): ChatMarkdownValidationError | null => {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const m = /^(\s*)compute:\s*(?:\|\s*|\{[^{}]*\bvalue:\s*\|\s*)$/.exec(line)
    if (!m) continue
    const baseIndent = String(m[1] || '').length
    const bodyLines: string[] = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]
      if (!next.trim()) {
        bodyLines.push(next)
        continue
      }
      const indent = next.match(/^\s*/)?.[0]?.length ?? 0
      if (indent <= baseIndent) break
      bodyLines.push(next)
    }
    const body = bodyLines.join('\n')
    if (/\b(fetch|document|window)\b/.test(body)) {
      return {
        ruleId: 'V-05',
        message: 'compute blocks must be pure: forbid fetch/document/window usage.',
      }
    }
  }
  return null
}

const validateHeadingEllipsis = (md: string): ChatMarkdownValidationError | null => {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    const m = /^(#{1,4})\s+(.+)$/.exec(line.trimEnd())
    if (!m) continue
    const label = String(m[2] || '').trim()
    if (label.endsWith('...')) {
      return {
        ruleId: 'V-06',
        message: 'Headings (H1–H4) must not end with ellipsis (...).',
      }
    }
  }
  return null
}

const validateConfidenceEnum = (md: string): ChatMarkdownValidationError | null => {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    const m = /^\s*confidence\s*:\s*([A-Za-z]+)\s*$/.exec(line)
    if (!m) continue
    const v = String(m[1] || '').trim().toLowerCase()
    if (v !== 'low' && v !== 'medium' && v !== 'high') {
      return {
        ruleId: 'V-07',
        message: 'confidence values must be exactly: low, medium, or high.',
      }
    }
  }
  return null
}

export const buildResolvableVarKeySet = (args: {
  frontmatter: Record<string, JSONValue> | null
  markdown: string
}): Set<string> => {
  const keys = new Set<string>()
  const parsed = extractLeadingFrontmatterAndBody(args.markdown)
  if (parsed) {
    const top = extractTopLevelFrontmatterKeys(parsed.frontmatter)
    for (const k of top) keys.add(k)
    for (const k of collectComputingFlowBodyVarKeys(parsed.frontmatter)) keys.add(k)
    if (isBaseTemplateFrontmatter(parsed.frontmatter, top) && top.has('runtime')) {
      const second = extractSecondLevelYamlKeys(parsed.frontmatter, 'runtime')
      keys.add('runtime.*')
      for (const k of second) keys.add(`runtime.${k}`)
    }
  }
  const fm = args.frontmatter
  if (fm && typeof fm === 'object') {
    for (const k of Object.keys(fm)) {
      if (k) keys.add(k)
    }
  }
  for (const k of extractInlineDeclaredVarKeys(args.markdown)) keys.add(k)
  return keys
}

export const validateChatMarkdown = (args: {
  markdown: string
  resolvableVarKeys: Set<string>
}): ChatMarkdownValidationResult => {
  const md = String(args.markdown || '').replace(/\r\n/g, '\n')
  const errors: ChatMarkdownValidationError[] = []

  const validators: Array<(md: string) => ChatMarkdownValidationError | null> = [
    validateSigilsUpperHex, validateNoAuthoredHtmlTables,
    validateKgcEnvelopeStartsAtFrontmatter,
    validateLongQuotes,
    validateCanonicalKgcFrontmatterShape,
    md2 => validateVariableRefsResolvable(md2, args.resolvableVarKeys),
    validateNoNestedCodeFences,
    validateCanonicalGroupingSurface,
    validateFrontmatterBodyVariableLink,
    validateSubstantiveKgcPayload,
    validateInlineJsonArrays,
    validateComputePurity,
    validateHeadingEllipsis,
    validateConfidenceEnum,
  ]
  for (const fn of validators) {
    const err = fn(md)
    if (!err) continue
    errors.push(err)
    break
  }

  return {
    ok: errors.length === 0,
    errors,
    failedRuleId: errors[0]?.ruleId || null,
  }
}
