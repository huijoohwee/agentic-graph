export const COMPUTING_FLOW_SOURCE_NODE_ID = 'source_input'
export const COMPUTING_FLOW_COMPUTE_NODE_ID = 'compute_summary'

export const COMPUTING_FLOW_INPUT_FIELDS = [
  'input_query',
  'input_context',
  'input_audience',
  'input_format',
  'input_constraints',
  'input_evidence',
  'input_tone',
  'input_metric_label',
  'input_metric_target',
] as const

export const COMPUTING_FLOW_OUTPUT_FIELDS = [
  'output',
  'imageUrl',
  'outputSrcDoc',
] as const

export const COMPUTING_FLOW_BODY_TOKEN_KEYS = [
  `${COMPUTING_FLOW_COMPUTE_NODE_ID}.output`,
  `${COMPUTING_FLOW_COMPUTE_NODE_ID}.imageUrl`,
  `${COMPUTING_FLOW_COMPUTE_NODE_ID}.outputSrcDoc`,
  ...COMPUTING_FLOW_INPUT_FIELDS.map(field => `${COMPUTING_FLOW_SOURCE_NODE_ID}.${field}`),
] as const

export const COMPUTING_FLOW_GITGRAPH_ID = 'template_gitgraph'

const COMPUTING_FLOW_BODY_HEADINGS = ['## Response', '## Inputs'] as const

const escapeRegExp = (value: string): string =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractComputingFlowBodyHeadings = (body: string): string[] => {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(line => /^#{1,6}\s+\S/.test(line))
    .map(line => line.replace(/\s+/g, ' '))
}

const hasOnlyComputingFlowBodyHeadings = (body: string): boolean => {
  const headings = extractComputingFlowBodyHeadings(body)
  return JSON.stringify(headings) === JSON.stringify(COMPUTING_FLOW_BODY_HEADINGS)
}

const splitLeadingMarkdownDocument = (markdown: string): { frontmatter: string; body: string } | null => {
  const text = String(markdown || '').replace(/\r\n/g, '\n').trim()
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(text)
  if (!match) return null
  return {
    frontmatter: String(match[1] || ''),
    body: String(match[2] || ''),
  }
}

const trimComputingFlowBodyToTemplateSections = (body: string): string => {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n')
  const extraHeadingIndex = lines.findIndex(line => {
    const heading = String(line || '').trim().replace(/\s+/g, ' ')
    if (/^<!--[\s\S]*-->$/.test(heading)) return true
    return /^#{1,6}\s+\S/.test(heading) && !COMPUTING_FLOW_BODY_HEADINGS.includes(heading as typeof COMPUTING_FLOW_BODY_HEADINGS[number])
  })
  if (extraHeadingIndex < 0) return lines.join('\n').trimEnd()
  let end = extraHeadingIndex
  while (end > 0 && !String(lines[end - 1] || '').trim()) end -= 1
  while (end > 0 && /^<!--[\s\S]*-->$/.test(String(lines[end - 1] || '').trim())) {
    end -= 1
    while (end > 0 && !String(lines[end - 1] || '').trim()) end -= 1
  }
  return lines.slice(0, end).join('\n').trimEnd()
}

export const sanitizeComputingFlowMarkdown = (markdown: string): string => {
  const parsed = splitLeadingMarkdownDocument(markdown)
  if (!parsed) return String(markdown || '').replace(/\r\n/g, '\n').trim()
  if (!hasComputingFlowContract(parsed.frontmatter)) return String(markdown || '').replace(/\r\n/g, '\n').trim()
  const body = trimComputingFlowBodyToTemplateSections(parsed.body)
  return ['---', parsed.frontmatter.trimEnd(), '---', body.trim()].join('\n').trimEnd() + '\n'
}

const hasComputingFlowFrontmatterContract = (frontmatter: string): boolean => {
  const fm = String(frontmatter || '').replace(/\r\n/g, '\n')
  if (!/(^|\n)(?:schema|\$schema)\s*:\s*["']?agentic-os-computing-flow\/v1["']?/m.test(fm)) return false
  if (!/(^|\n)flow\s*:\s*(\n|$)/m.test(fm)) return false
  if (!/(^|\n)flow_diagrams\s*:\s*(\n|$)/m.test(fm)) return false
  if (!/\btype\s*:\s*mermaid_gitgraph\b/.test(fm)) return false
  if (!new RegExp(`\\b${escapeRegExp(COMPUTING_FLOW_GITGRAPH_ID)}\\b`).test(fm)) return false
  if (!new RegExp(`\\b${escapeRegExp(COMPUTING_FLOW_SOURCE_NODE_ID)}\\b`).test(fm)) return false
  if (!new RegExp(`\\b${escapeRegExp(COMPUTING_FLOW_COMPUTE_NODE_ID)}\\b`).test(fm)) return false
  if (!/canvas:runAction/.test(fm) || !/bodyTokens["']?\s*:/.test(fm)) return false
  for (const field of COMPUTING_FLOW_INPUT_FIELDS) {
    if (!new RegExp(`\\b${escapeRegExp(field)}\\b`).test(fm)) return false
    if (!new RegExp(`sourceHandle["']?\\s*[:=][^\\n]*["']?${escapeRegExp(field)}["']?`).test(fm)) return false
    if (!new RegExp(`targetHandle["']?\\s*[:=][^\\n]*["']?${escapeRegExp(field)}["']?`).test(fm)) return false
    if (!new RegExp(`token["']?\\s*[:=][^\\n]*["']?${escapeRegExp(COMPUTING_FLOW_SOURCE_NODE_ID)}\\.${escapeRegExp(field)}["']?`).test(fm)) return false
  }
  for (const field of COMPUTING_FLOW_OUTPUT_FIELDS) {
    if (!new RegExp(`token["']?\\s*[:=][^\\n]*["']?${escapeRegExp(COMPUTING_FLOW_COMPUTE_NODE_ID)}\\.${escapeRegExp(field)}["']?`).test(fm)) return false
  }
  return true
}

export const hasComputingFlowContract = (frontmatter: string, body = ''): boolean => {
  if (!hasComputingFlowFrontmatterContract(frontmatter)) return false
  const markdownBody = String(body || '').replace(/\r\n/g, '\n')
  if (markdownBody) {
    if (!/(^|\n)## Response\s*(\n|$)/.test(markdownBody)) return false
    if (!/(^|\n)## Inputs\s*(\n|$)/.test(markdownBody)) return false
    if (!markdownBody.includes(`{{${COMPUTING_FLOW_COMPUTE_NODE_ID}.output}}`)) return false
    if (!hasOnlyComputingFlowBodyHeadings(markdownBody)) return false
    if (/<!--[\s\S]*?-->/.test(markdownBody)) return false
    if (/frontmatter|dataflow|flow\.nodes|flow\.edges/i.test(markdownBody)) return false
  }
  return true
}

export const collectComputingFlowBodyVarKeys = (frontmatter: string): Set<string> => {
  const keys = new Set<string>()
  if (!hasComputingFlowContract(frontmatter)) return keys
  for (const key of COMPUTING_FLOW_BODY_TOKEN_KEYS) keys.add(key)
  return keys
}

export const readComputingFlowBodyRefKey = (ref: string): string => {
  const text = String(ref || '').trim()
  const idxColon = text.indexOf(':')
  const idxPipe = text.indexOf('|')
  const cut = [idxColon, idxPipe].filter(i => i >= 0).sort((a, b) => a - b)[0]
  return cut != null ? text.slice(0, cut).trim() : text
}

export const findUndeclaredComputingFlowBodyRef = (frontmatter: string, refs: ReadonlyArray<string>): string => {
  const keys = collectComputingFlowBodyVarKeys(frontmatter)
  if (keys.size === 0) return ''
  for (const ref of refs) {
    const key = readComputingFlowBodyRefKey(ref)
    if (key && !keys.has(key)) return key
  }
  return ''
}
