import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { parseMarkdownBlocks, parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { extractMarkdownInlineRefs, slugify } from '@/features/parsers/markdownJsonLdUtils'
import { hashText } from '@/features/parsers/hash'
import { normalizeEntityKey, segmentWordsWithOffsets, textSegmentationPolicy } from '@/lib/graph/textAnalysis/utils'
import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'
import { computeLabelPropagationCommunities, type WeightedNeighbor } from '@/lib/semantic-mode/keywordCommunities'

export const PASSAGE_GRAPH_VERSION = 1
export const PASSAGE_LIMITS = Object.freeze({ characters: 60_000, bytes: 240_000, tokens: 12_000, passages: 200, steps: 120_000, milliseconds: 10_000 })
export type PassageGraphInput = { documentId: string; text: string; locale?: string; k?: number; threshold?: number; excludeLinkOnly?: boolean }
export type Passage = { id: string; kind: string; start: number; end: number; line: number; endLine: number; text: string; section: string | null; excluded: boolean; notice: string; references: Array<{ target: string; status: 'resolved' | 'unresolved'; nodeId?: string }> }
export type PassageGroup = { id: string; members: string[]; terms: string[] }
export type PassageGraphResult = { graph: GraphData; passages: Passage[]; groups: PassageGroup[]; partial: boolean; reasons: string[]; policy: string; elapsedMs: number }
export class PassageGraphError extends Error {
  constructor(public code: 'input-limit' | 'invalid-options' | 'invalid-frontmatter' | 'cancelled' | 'time-limit' | 'step-limit', message: string) { super(message); this.name = 'PassageGraphError' }
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Derived, source-bound inspection view. Never writes text, resolves remote links or fetches media. */
export function deriveDocumentPassageGraph(input: PassageGraphInput, control?: { signal?: AbortSignal; now?: () => number }): PassageGraphResult {
  const now = control?.now ?? (() => performance.now())
  const started = now()
  let steps = 0
  const guard = () => {
    if (control?.signal?.aborted) throw new PassageGraphError('cancelled', 'Passage analysis cancelled.')
    if (now() - started > PASSAGE_LIMITS.milliseconds) throw new PassageGraphError('time-limit', 'Passage analysis exceeded its time limit.')
    if (++steps > PASSAGE_LIMITS.steps) throw new PassageGraphError('step-limit', 'Passage analysis exceeded its work limit.')
  }
  guard()
  const k = input.k ?? 4, threshold = input.threshold ?? 0.2, locale = input.locale ?? 'und'
  if (!input.documentId || input.documentId.length > 2048 || !Number.isInteger(k) || k < 1 || k > 4 || !Number.isFinite(threshold) || threshold < 0 || threshold > 1 || typeof input.text !== 'string') {
    throw new PassageGraphError('invalid-options', 'Use an opaque document identity, k from 1 to 4 and a similarity threshold from 0 to 1.')
  }
  if (input.text.length > PASSAGE_LIMITS.characters || new TextEncoder().encode(input.text).length > PASSAGE_LIMITS.bytes) {
    throw new PassageGraphError('input-limit', 'Passage inspection supports up to 60,000 characters. The source is unchanged.')
  }
  let policy: string
  try { policy = textSegmentationPolicy(locale) } catch { throw new PassageGraphError('invalid-options', 'Enter a valid language tag.') }
  const lines = splitMarkdownLines(input.text)
  const fm = parseMarkdownFrontmatter(lines, { maxNodes: 4000, maxDepth: 24 })
  if (fm.warnings.length || (lines[0]?.trim() === '---' && fm.startIndex === 0)) throw new PassageGraphError('invalid-frontmatter', 'Repair the document metadata before deriving passages.')
  const blocks = parseMarkdownBlocks(lines, fm.startIndex)
  const offsets = [0], ends: number[] = []
  for (const match of input.text.matchAll(/\r\n|\r|\n/g)) { ends.push(match.index!); offsets.push(match.index! + match[0].length) }
  ends.push(input.text.length)
  const revision = hashText(input.text)
  const prefix = `passage:${hashText(input.documentId)}:${revision}`
  const passages: Passage[] = [], nodes: GraphNode[] = [], edges: GraphEdge[] = []
  const edgeIds = new Set<string>()
  const vectors = new Map<string, Map<string, number>>()
  const headings: Array<{ id: string; level: number }> = []
  const anchors = new Map<string, string[]>()
  const reasons: string[] = []
  let tokenCount = 0
  const addEdge = (source: string, target: string, label: string, properties: Record<string, JSONValue> = {}) => {
    const id = `${source}:${label}:${target}`
    if (edgeIds.has(id)) return false
    if (edges.length >= 2000) { if (!reasons.includes('edge-limit')) reasons.push('edge-limit'); return false }
    edgeIds.add(id)
    edges.push({ id, source, target, label, type: label, properties: { 'passage:method': 'authored-structure', ...properties }, metadata: { kind: 'document-passage', derived: true, source: input.documentId, sourceRevision: revision } })
    return true
  }
  for (const [index, block] of blocks.entries()) {
    guard()
    if (passages.length >= PASSAGE_LIMITS.passages) { reasons.push('passage-limit'); break }
    const start = offsets[block.startLine - 1]!, end = ends[block.endLine - 1]!
    const text = input.text.slice(start, end)
    const id = `${prefix}:p${index}`
    const refs = block.kind === 'code' ? { images: [], links: [] } : extractMarkdownInlineRefs(text)
    const linkOnly = refs.links.length > 0 && text.replace(/!?\[[^\]]*\]\([^)]*\)/g, '').trim().length === 0
    const mediaOnly = refs.images.length > 0 && text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim().length === 0
    const kind = mediaOnly ? 'media' : block.kind === 'paragraph' && /^\s*>/.test(text) ? 'quote' : block.kind
    const excluded = input.excludeLinkOnly === true && linkOnly
    if (block.kind === 'heading') while (headings.length && headings.at(-1)!.level >= block.level) headings.pop()
    const section = headings.at(-1)?.id ?? null
    const passage: Passage = { id, kind, start, end, line: block.startLine, endLine: block.endLine, text, section, excluded, notice: linkOnly ? 'Link-only block; retained unless you exclude it.' : '', references: refs.links.map(link => ({ target: link.url, status: 'unresolved' })) }
    passages.push(passage)
    nodes.push({ id, type: 'Passage', label: text.replace(/\s+/g, ' ').slice(0, 100) || kind, properties: { 'passage:kind': kind, 'passage:start': start, 'passage:end': end, 'passage:line': block.startLine, 'passage:endLine': block.endLine, 'passage:section': section, 'passage:excluded': excluded, 'passage:notice': passage.notice, 'passage:mediaReferences': refs.images.map(image => ({ label: image.alt, target: image.url })) }, metadata: { kind: 'document-passage', derived: true, source: input.documentId, sourceRevision: revision } })
    if (section) addEdge(section, id, 'contains')
    if (passages.length > 1) addEdge(passages[passages.length - 2]!.id, id, 'next')
    if (block.kind === 'heading') {
      const anchor = slugify(block.text)
      anchors.set(anchor, [...(anchors.get(anchor) ?? []), id])
      headings.push({ id, level: block.level })
    }
    const vector = new Map<string, number>()
    if (!excluded && ['paragraph', 'list', 'quote'].includes(kind)) {
      // Link destinations and markup cannot contribute lexical evidence; labels can.
      const analysisText = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ')
      const words = segmentWordsWithOffsets(analysisText, locale)
      const remaining = Math.max(0, PASSAGE_LIMITS.tokens - tokenCount)
      if (words.length > remaining || (words.length >= 12_000 && (words.at(-1)?.end ?? 0) < analysisText.length)) {
        if (!reasons.includes('token-limit')) reasons.push('token-limit')
      } else {
        tokenCount += words.length
        for (const word of words) {
          const term = normalizeEntityKey(word.raw)
          if (term && !KEYWORD_FUNCTION_WORDS.has(term) && !/^\d+$/.test(term)) vector.set(term, (vector.get(term) ?? 0) + 1)
        }
      }
    }
    vectors.set(id, vector)
  }
  const byId = new Map(passages.map(p => [p.id, p]))
  for (const [index, passage] of passages.entries()) {
    for (const reference of passage.references) {
      guard()
      if (!reference.target.startsWith('#')) continue
      let anchor = reference.target.slice(1)
      try { anchor = decodeURIComponent(anchor) } catch { continue }
      const targets = anchors.get(anchor)
      if (targets?.length !== 1) continue
      reference.status = 'resolved'; reference.nodeId = targets[0]!
      addEdge(passage.id, reference.nodeId, 'references')
    }
    nodes[index]!.properties['passage:references'] = passage.references as unknown as JSONValue
  }
  const documentFrequency = new Map<string, number>()
  const eligible = passages.filter(p => vectors.get(p.id)!.size > 0)
  for (const p of eligible) for (const term of vectors.get(p.id)!.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
  const norms = new Map<string, number>()
  for (const p of eligible) {
    const vector = vectors.get(p.id)!
    for (const [term, count] of vector) vector.set(term, (1 + Math.log(count)) * (1 + Math.log((1 + eligible.length) / (1 + documentFrequency.get(term)!))))
    norms.set(p.id, Math.sqrt([...vector.values()].reduce((sum, weight) => sum + weight * weight, 0)))
  }
  type Candidate = { id: string; score: number; terms: string[] }
  const candidates = new Map<string, Candidate[]>(eligible.map(p => [p.id, []]))
  const retain = (id: string, candidate: Candidate) => {
    const rows = candidates.get(id)!
    rows.push(candidate); rows.sort((a, b) => b.score - a.score || compare(a.id, b.id)); rows.splice(k)
  }
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    guard()
    const a = eligible[i]!, b = eligible[j]!, av = vectors.get(a.id)!, bv = vectors.get(b.id)!
    let dot = 0
    const terms: string[] = []
    for (const [term, weight] of av) if (bv.has(term)) { dot += weight * bv.get(term)!; terms.push(term) }
    if (!terms.length) continue
    const score = Math.max(0, Math.min(1, dot / (norms.get(a.id)! * norms.get(b.id)!)))
    if (score < threshold) continue
    terms.sort(compare)
    retain(a.id, { id: b.id, score, terms: terms.slice(0, 8) }); retain(b.id, { id: a.id, score, terms: terms.slice(0, 8) })
  }
  const neighbors = new Map<string, WeightedNeighbor[]>()
  for (const [id, rows] of candidates) for (const candidate of rows) {
    if (compare(id, candidate.id) >= 0 || !candidates.get(candidate.id)!.some(other => other.id === id)) continue
    const a = byId.get(id)!, b = byId.get(candidate.id)!
    const score = Number(candidate.score.toFixed(6))
    if (!addEdge(id, candidate.id, 'similar_to', { 'passage:method': 'lexical-tfidf-cosine-v1', 'passage:score': score, 'passage:terms': candidate.terms, 'passage:ranges': [[a.start, a.end], [b.start, b.end]] })) continue
    neighbors.set(id, [...(neighbors.get(id) ?? []), { id: candidate.id, w: score }])
    neighbors.set(candidate.id, [...(neighbors.get(candidate.id) ?? []), { id, w: score }])
  }
  guard()
  const labels = computeLabelPropagationCommunities({ nodeIds: [...neighbors.keys()].sort(compare), neighbors, iterations: 14 })
  // Split induced components as well: display compression is intentionally not an evidence operation.
  const visited = new Set<string>(), groups: PassageGroup[] = []
  for (const id of [...neighbors.keys()].sort(compare)) {
    if (visited.has(id)) continue
    const members = [id]; visited.add(id)
    for (let i = 0; i < members.length; i++) for (const neighbor of neighbors.get(members[i]!) ?? []) {
      guard()
      if (!visited.has(neighbor.id) && labels.get(neighbor.id) === labels.get(id)) { visited.add(neighbor.id); members.push(neighbor.id) }
    }
    if (members.length < 2) continue
    members.sort(compare)
    const terms = new Map<string, number>()
    for (const member of members) for (const [term, weight] of vectors.get(member)!) terms.set(term, (terms.get(term) ?? 0) + weight)
    const groupId = `${prefix}:group:${members.map(member => member.slice(member.lastIndexOf(':') + 1)).join('-')}`
    groups.push({ id: groupId, members, terms: [...terms].sort((a, b) => b[1] - a[1] || compare(a[0], b[0])).slice(0, 3).map(([term]) => term) })
    for (const node of nodes) if (members.includes(node.id)) { node.properties['passage:group'] = groupId; node.properties['visual:community'] = groups.length }
  }
  guard()
  const partial = reasons.length > 0
  const graph: GraphData = { type: 'Graph', context: 'document-passages', nodes, edges: edges.sort((a, b) => compare(a.id, b.id)), metadata: { kind: 'document-passages', source: input.documentId, sourceLayerHash: `${prefix}:v${PASSAGE_GRAPH_VERSION}:${k}:${threshold}:${policy}:${input.excludeLinkOnly === true}`, passageAnalysis: { version: PASSAGE_GRAPH_VERSION, revision, policy, k, threshold, partial, reasons, tokens: tokenCount, steps, groups: groups as unknown as JSONValue } } }
  return { graph, passages, groups, partial, reasons, policy, elapsedMs: now() - started }
}
