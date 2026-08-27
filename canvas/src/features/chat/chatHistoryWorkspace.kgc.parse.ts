import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import {
  COMPUTING_FLOW_COMPUTE_NODE_ID,
  COMPUTING_FLOW_SOURCE_NODE_ID,
  hasComputingFlowContract,
} from './chatComputingFlowContract'
import {
  extractTopLevelYamlKeys,
  isFrontmatterVarKeyDeclared,
  splitLeadingFrontmatterAndBody,
} from './chatKgcFrontmatter'
import { hasResponseOnlyKgcBody, isResponseOnlyKgcFrontmatter } from './chatKgcResponseOnlyContract'

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

const isBaseTemplateFrontmatter = (frontmatter: string, keys: Set<string>): boolean => {
  if (!keys.has('runtime') || !keys.has('pipeline') || !keys.has('mermaid') || !keys.has('flow') || !keys.has('links')) return false
  return BASE_TEMPLATE_TIER_B_KEYS.every(key => keys.has(key)) &&
    frontmatter.includes('\nruntime:') &&
    frontmatter.includes('\npipeline:') &&
    frontmatter.includes('\nmermaid:') &&
    frontmatter.includes('\nflow:') &&
    frontmatter.includes('\nlinks:')
}

const countMatches = (text: string, pattern: RegExp): number => {
  const matches = text.match(pattern)
  return Array.isArray(matches) ? matches.length : 0
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

const extractVariableRefsFromBody = (markdownBody: string): string[] => {
  const text = String(markdownBody || '')
    // Ignore fenced code blocks; {{...}} inside examples should not be treated as runtime refs.
    .replace(/```[\s\S]*?```/g, ' ')
  return Array.from(text.matchAll(/\{\{([^}]+)\}\}/g))
    .map(match => String(match[1] || '').trim())
    .filter(Boolean)
}

const extractVarRefKey = (raw: string): string => {
  const ref = String(raw || '').trim()
  const idxColon = ref.indexOf(':')
  const idxPipe = ref.indexOf('|')
  const cut = [idxColon, idxPipe].filter(i => i >= 0).sort((a, b) => a - b)[0]
  return (cut == null ? ref : ref.slice(0, cut)).trim()
}

const BASE_TEMPLATE_REQUIRED_BODY_SECTIONS = [
  '## Computing Flow Definition',
  '## Flow Graph',
  '## Pipeline',
  '## PRD — Product Requirements',
  '## TAD — Technical Architecture',
  '## Open Questions',
  '## Customization Guide',
] as const

const hasMandatoryBaseTemplateBodySections = (markdownBody: string): boolean => {
  return BASE_TEMPLATE_REQUIRED_BODY_SECTIONS.every(section => markdownBody.includes(section))
}

const isComputingFlowStructuredMarkdown = (frontmatter: string, markdownBody: string): boolean => {
  if (!hasComputingFlowContract(frontmatter, markdownBody)) return false
  const parsed = tryParseMarkdownFrontmatterFlowGraph('chatAgenticGraph.computing-flow.md', ['---', frontmatter, '---', markdownBody].join('\n'))
  if (!parsed) return false
  const nodeIds = new Set((parsed.graphData.nodes || []).map(node => String(node.id || '')))
  const edgeCount = Array.isArray(parsed.graphData.edges) ? parsed.graphData.edges.length : 0
  return nodeIds.has(COMPUTING_FLOW_SOURCE_NODE_ID) && nodeIds.has(COMPUTING_FLOW_COMPUTE_NODE_ID) && edgeCount >= 1
}

export const isKgcStructuredMarkdown = (raw: string): boolean => {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!text.startsWith('---\n')) return false
  const parsedFrontmatterBody = splitLeadingFrontmatterAndBody(text)
  if (!parsedFrontmatterBody) return false
  const frontmatter = ['---', parsedFrontmatterBody.frontmatter, '---'].join('\n')
  const markdownBody = parsedFrontmatterBody.body
  if (!markdownBody) return false
  const bodyRefs = extractVariableRefsFromBody(markdownBody)
  if (bodyRefs.length === 0) return false
  const frontmatterKeys = extractTopLevelYamlKeys(parsedFrontmatterBody.frontmatter)
  if (isComputingFlowStructuredMarkdown(parsedFrontmatterBody.frontmatter, markdownBody)) return true
  if (frontmatterKeys.has('kgcResponseOnly') && isResponseOnlyKgcFrontmatter(parsedFrontmatterBody.frontmatter)) {
    return hasResponseOnlyKgcBody(markdownBody, BASE_TEMPLATE_REQUIRED_BODY_SECTIONS)
  }
  for (const ref of bodyRefs) {
    const key = extractVarRefKey(ref)
    if (!key) continue
    if (!isFrontmatterVarKeyDeclared({
      frontmatter: parsedFrontmatterBody.frontmatter,
      topLevelKeys: frontmatterKeys,
      varKey: key,
      dottedParents: ['runtime'],
    })) return false
  }
  if (!isBaseTemplateFrontmatter(parsedFrontmatterBody.frontmatter, frontmatterKeys)) return false
  if (!hasMandatoryBaseTemplateBodySections(markdownBody)) return false
  if (/```/.test(parsedFrontmatterBody.frontmatter)) return false
  const baseScalars = ['title', 'graphId', 'doc_type', 'date', 'ai_model', '$schema'] as const
  for (const key of baseScalars) {
    const scalar = extractTopLevelYamlBlockScalar(parsedFrontmatterBody.frontmatter, key).trim()
    if (!scalar) return false
  }
  for (const key of BASE_TEMPLATE_TIER_B_KEYS) {
    const scalar = extractTopLevelYamlBlockScalar(parsedFrontmatterBody.frontmatter, key).trim()
    if (!scalar) return false
  }
  if (countMatches(parsedFrontmatterBody.frontmatter, /(^|\n)\s*-\s*(?:\{id:\s*)?e[1-5]\b/g) < 5) return false
  const parsed = tryParseMarkdownFrontmatterFlowGraph('chatAgenticGraph.kgc.base.md', text)
  if (!parsed) return false
  const nodes = Array.isArray(parsed.graphData.nodes) ? parsed.graphData.nodes : []
  const edges = Array.isArray(parsed.graphData.edges) ? parsed.graphData.edges : []
  return nodes.length >= 2 && edges.length >= 1
}
