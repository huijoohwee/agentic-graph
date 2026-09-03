import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

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

const hasBaseTemplateFrontmatter = (frontmatter: string): boolean => {
  const text = `\n${String(frontmatter || '')}`
  return text.includes('\n$schema:') && text.includes('\nruntime:') && text.includes('\npipeline:') && text.includes('\nflow:')
}

const hasCanonicalPrdScaffold = (body: string): boolean => {
  return body.includes('### Goals') && body.includes('### Non-Goals') && body.includes('### User Stories')
}

const CANONICAL_PRD_SCAFFOLD = [
  '### Goals',
  '',
  ...serializeMarkdownPipeTable({
    columns: ['id', 'Goal', 'maps to', 'Priority', 'Status'],
    rows: [
      ['`G-01`', 'Preserve one universal pipeline contract across request variants', '`@node:n-trigger`', '`#D85A30:P0`', 'TBD'],
      ['`G-02`', 'Shape context from the current request instead of cloning fixture prose', '`@node:n-pack`', '`#D85A30:P0`', 'TBD'],
      ['`G-03`', 'Generate `{{artifact}}` with request-relevant body content', '`@node:n-process`', '`#D85A30:P0`', 'TBD'],
      ['`G-04`', 'Reject unresolved or malformed markdown before persistence', '`@node:n-validate`', '`#185FA5|bg#E6F1FB:P1`', 'TBD'],
      ['`G-05`', 'Persist only the normalized artifact identity and body', '`@node:n-deliver`', '`#185FA5|bg#E6F1FB:P1`', 'TBD'],
    ],
  }),
  '',
  '### Non-Goals',
  '',
  'The base path does not infer missing business decisions, create alternate mappings, or inject project-specific vocabulary when the request does not provide it. Domain-specific choices should be added only when the request or later context makes them explicit.',
  '',
  '### User Stories',
  '',
  ...serializeMarkdownPipeTable({
    columns: ['id', 'As a...', 'I want...', 'So that...', 'Acceptance criteria'],
    rows: [
      ['`US-01`', '`{{owner}}`', 'one request to map into one valid stored artifact', 'the chat pipeline stays predictable', 'output starts with frontmatter and contains required body sections'],
      ['`US-02`', '`{{owner}}`', 'the body to reflect the request', 'the stored document stays relevant to the query', 'problem and architecture prose mention request-specific scope without fabrication'],
      ['`US-03`', '`reviewer`', 'failed rule feedback to stay bounded and actionable', 'retry loops do not drift or freeze', 'retry arc stops at `{{runtime.maxRetry}}` and surfaces a correction signal'],
      ['`US-04`', '`renderer`', 'frontmatter and body to stay aligned', 'graph, markdown, and storage stay in sync', 'section references and node IDs remain consistent across surfaces'],
    ],
  }),
].join('\n')

const insertCanonicalPrdScaffold = (body: string): string => {
  const normalized = String(body || '').replace(/\r\n/g, '\n').trim()
  if (!normalized || hasCanonicalPrdScaffold(normalized)) return normalized
  const requestFitHeading = '\n### Request Fit\n'
  if (normalized.includes(requestFitHeading)) {
    return normalized.replace(requestFitHeading, `\n${CANONICAL_PRD_SCAFFOLD}\n${requestFitHeading}`)
  }
  const tadHeading = '\n## TAD — Technical Architecture\n'
  if (normalized.includes(tadHeading)) {
    return normalized.replace(tadHeading, `\n${CANONICAL_PRD_SCAFFOLD}\n${tadHeading}`)
  }
  return `${normalized}\n\n${CANONICAL_PRD_SCAFFOLD}`
}

export const ensureAgenticOsBaseTemplateRequiredBodyScaffold = (markdown: string): string => {
  const text = String(markdown || '').replace(/\r\n/g, '\n').trim()
  const parsed = splitLeadingFrontmatterAndBody(text)
  if (!parsed || !hasBaseTemplateFrontmatter(parsed.frontmatter)) return markdown
  if (hasResponseOnlyAgenticOsMarker(parsed.frontmatter)) return markdown
  const body = insertCanonicalPrdScaffold(parsed.body)
  return ['---', parsed.frontmatter.trimEnd(), '---', body].join('\n').trimEnd() + '\n'
}
