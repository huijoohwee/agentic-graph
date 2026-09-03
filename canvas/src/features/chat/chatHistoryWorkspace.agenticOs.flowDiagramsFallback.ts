import { analyzeAgenticOsRequest, sanitizeScalar } from './chatAgenticOsRequestProfile'

const normalizeDiagramTerm = (raw: string, maxChars = 72): string => (
  sanitizeScalar(raw, maxChars)
    .replace(/[\\"]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
)

const buildDiagramTerms = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string[] => {
  const placeholders = new Set(['{{product}}', '{{artifact}}', '{{domain}}', '{{subject}}', '{{objective}}'])
  const terms = [
    ...profile.namedTerms,
    profile.product,
    profile.artifact,
    profile.domain,
    profile.subject,
    profile.objective,
  ]
  const candidates: string[] = []
  const seen = new Set<string>()
  for (const term of terms) {
    const normalized = normalizeDiagramTerm(term)
    const signature = normalized.toLowerCase()
    if (!normalized || placeholders.has(normalized) || seen.has(signature)) continue
    seen.add(signature)
    candidates.push(normalized)
  }
  const searchable = (value: string): string => (
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  )
  const out = candidates.filter((term, index) => {
    if (/^(?:a|an|the)\s+.*\bfor$/i.test(term)) return false
    const signature = searchable(term)
    if (!signature) return false
    const compact = signature.replace(/\s+/g, '')
    const wordCount = signature.split(/\s+/g).length
    if (wordCount > 1 && compact.length > 12) return true
    return !candidates.some((other, otherIndex) => {
      if (otherIndex === index) return false
      const otherSignature = searchable(other)
      const otherCompact = otherSignature.replace(/\s+/g, '')
      return otherCompact.length > compact.length && compact.length >= 3 && otherCompact.includes(compact)
    })
  }).slice(0, 6)
  return out.length > 0 ? out : ['request scope', 'context bundle', 'generated response']
}

const buildMermaidQuotedValue = (raw: string, fallback: string): string => {
  const value = normalizeDiagramTerm(raw || fallback, 80) || fallback
  return JSON.stringify(value)
}

const buildGanttTaskLabel = (raw: string, fallback: string): string => {
  return normalizeDiagramTerm(raw || fallback, 70)
    .replace(/[:]/g, ' -')
    .trim() || fallback
}

export const buildFlowDiagramsBlock = (profile: ReturnType<typeof analyzeAgenticOsRequest>, product: string, artifact: string): string[] => {
  const diagramTerms = buildDiagramTerms(profile)
  const flowTitle = product !== '{{product}}' ? product : artifact !== '{{artifact}}' ? artifact : 'active request'
  const gitCommitTerms = diagramTerms.slice(0, 4)
  const ganttTerms = diagramTerms.slice(0, 4)
  return [
    'flow_diagrams:',
    '  key: flow_diagrams',
    '  type: object',
    '  value:',
    '    gitgraph:',
    '      key: gitgraph',
    '      type: mermaid_gitgraph',
    '      title: "Request GitGraph dataflow lanes"',
    '      render_on: [flow_editor, storyboard, strybldr]',
    '      value: |-',
    '        gitGraph',
    '          commit id:"prompt_capture"',
    '          branch context_pack',
    '          checkout context_pack',
    ...gitCommitTerms.map(term => `          commit id:${buildMermaidQuotedValue(term, 'request_term')}`),
    '          checkout main',
    '          branch response_generation',
    '          checkout response_generation',
    `          commit id:${buildMermaidQuotedValue(artifact !== '{{artifact}}' ? artifact : 'generated response', 'generated response')}`,
    '          checkout main',
    '          branch review_gate',
    '          checkout review_gate',
    '          commit id:"term_coverage"',
    '          checkout main',
    '          merge context_pack',
    '          merge response_generation',
    '          merge review_gate',
    '          commit id:"rich_media_panels"',
    '    gantt:',
    '      key: gantt',
    '      type: mermaid_gantt',
    '      title: "Request Gantt critical path"',
    '      render_on: [flow_editor, storyboard, strybldr, document_view, timeline_view]',
    '      value: |-',
    '        gantt',
    `          title computing flow: ${buildGanttTaskLabel(flowTitle, 'active request')}`,
    '          dateFormat YYYY-MM-DD',
    '          section Intake',
    '          Prompt capture :done, prompt_capture, 2026-06-05, 1d',
    '          section Term coverage',
    ...ganttTerms.map((term, index) => `          ${buildGanttTaskLabel(term, `Request term ${index + 1}`)} coverage :term_${index + 1}, after prompt_capture, 1d`),
    '          section Critical path',
    '          Structured response generation :crit, response_generation, after prompt_capture, 1d',
    '          Term coverage review :crit, review_gate, after response_generation, 1d',
    '          Rich Media Panels :crit, rich_media_panels, after review_gate, 1d',
  ]
}
