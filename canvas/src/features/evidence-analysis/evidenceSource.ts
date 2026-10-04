import { useGraphStore } from '@/hooks/useGraphStore'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { hashText } from '@/features/parsers/hash'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'

export type EvidenceKind = 'record' | 'volume' | 'arrival' | 'route' | 'notice'
export type EvidenceExample = Readonly<{
  id: string; label: string; kind: EvidenceKind; paths: readonly string[]; entityId?: string; atUtc?: string
}>
export type EvidenceConfiguration = Readonly<{
  schema: 'evidence-workspace/v1'; title: string; description: string
  profiles: Readonly<Record<'record' | 'volume' | 'arrival' | 'route', string>>
  policies: Readonly<Record<'volume' | 'arrival' | 'route' | 'notice', string>>
  examples: readonly EvidenceExample[]
}>
export type EvidenceSourceCapture = Readonly<{
  documentName: string; documentText: string; sourceId: string; sourceRevision: number | undefined
  sourceKey: string; config: EvidenceConfiguration
}>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max = 2048): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= max
const keys = (value: unknown, fields: string[]) => object(value) && Object.keys(value).length === fields.length && fields.every(key => Object.prototype.hasOwnProperty.call(value, key))
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value) }
  return value
}
export function validateEvidenceConfiguration(input: unknown): EvidenceConfiguration {
  if (!keys(input, ['schema', 'title', 'description', 'profiles', 'policies', 'examples'])) throw new Error('Missing or unsupported evidence configuration fields.')
  const value = JSON.parse(JSON.stringify(input))
  if (value.schema !== 'evidence-workspace/v1' || !text(value.title) || !text(value.description)
    || !keys(value.profiles, ['record', 'volume', 'arrival', 'route']) || !keys(value.policies, ['volume', 'arrival', 'route', 'notice'])
    || ![...Object.values(value.profiles), ...Object.values(value.policies)].every(id => text(id, 80))) throw new Error('Evidence profile and policy IDs must be explicitly authored.')
  if (!Array.isArray(value.examples) || !value.examples.length || value.examples.length > 20) throw new Error('Declare 1–20 bounded evidence examples.')
  const seen = new Set<string>()
  for (const example of value.examples) {
    if (!object(example) || Object.keys(example).some(key => !['id', 'label', 'kind', 'paths', 'entityId', 'atUtc'].includes(key))
      || !text(example.id, 80) || seen.has(example.id) || !text(example.label) || !['record', 'volume', 'arrival', 'route', 'notice'].includes(String(example.kind))
      || !Array.isArray(example.paths) || !example.paths.length || example.paths.length > 40
      || (example.kind !== 'arrival' && example.paths.length !== 1)
      || !example.paths.every(path => typeof path === 'string' && /^\/evidence-analysis\/fixtures\/[a-zA-Z0-9._-]+\.json$/.test(path))
      || (example.entityId !== undefined && !text(example.entityId, 128)) || (example.atUtc !== undefined && !text(example.atUtc, 32))) throw new Error('Evidence examples require unique IDs and bounded local fixture paths.')
    seen.add(example.id)
  }
  return frozen(value)
}
export function captureEvidenceSource(): EvidenceSourceCapture {
  const state = useGraphStore.getState(), source = findComposedSourceFileByPath({ sourceFiles: state.sourceFiles, targetPath: state.markdownDocumentName })
  if (!source?.enabled || source.status !== 'parsed' || source.text !== state.markdownDocumentText) throw new Error('Evidence requires the exact enabled, parsed active SourceFile text.')
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(source.text))
  if (parsed.warnings.length) throw new Error(`Evidence source YAML is invalid: ${parsed.warnings.join(' ')}`)
  const config = validateEvidenceConfiguration(parsed.meta.evidence_workspace)
  return Object.freeze({ documentName: state.markdownDocumentName, documentText: source.text, sourceId: source.id,
    sourceRevision: source.parsedGraphRevision, sourceKey: `${source.id}:${source.parsedGraphRevision ?? ''}:${hashText(source.text)}`, config })
}
export function isEvidenceSourceCurrent(capture: EvidenceSourceCapture): boolean {
  const state = useGraphStore.getState(), source = findComposedSourceFileByPath({ sourceFiles: state.sourceFiles, targetPath: state.markdownDocumentName })
  return state.markdownDocumentName === capture.documentName && state.markdownDocumentText === capture.documentText
    && source?.id === capture.sourceId && source?.text === capture.documentText && source?.parsedGraphRevision === capture.sourceRevision
    && source?.enabled === true && source?.status === 'parsed'
}
