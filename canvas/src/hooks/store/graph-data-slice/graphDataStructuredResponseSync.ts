import { isKeyTypeValue, unwrapKeyTypeValue as unwrapTypedValue } from '@/lib/graph/keyTypeValue'
import yaml from 'js-yaml'
import type { GraphNode } from '@/lib/graph/types'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

const STRUCTURED_LIST_KEYS = ['widgets', 'panels', 'cards', 'media', 'nodes', 'tables'] as const
const STRUCTURED_ENVELOPE_KEYS = ['result', 'response', 'structuredContent'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const replaceTypedValue = (value: unknown, nextValue: unknown): unknown =>
  isKeyTypeValue(value)
    ? { ...value, value: nextValue }
    : nextValue

const normalizeStructuredNodeId = (value: unknown): string => {
  const slug = String(unwrapTypedValue(value) || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug ? `mcp-response-${slug}` : ''
}

const readRecordField = (record: Record<string, unknown>, key: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key]
  const properties = record.properties
  if (isRecord(properties) && Object.prototype.hasOwnProperty.call(properties, key)) return properties[key]
  if (!Array.isArray(properties)) return undefined
  const entry = properties.find(item => isRecord(item) && String(unwrapTypedValue(item.key) || '').trim() === key)
  return isRecord(entry) ? entry.value : undefined
}

const writeRecordField = (record: Record<string, unknown>, key: string, nextValue: unknown): boolean => {
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    record[key] = replaceTypedValue(record[key], nextValue)
    return true
  }
  const properties = record.properties
  if (isRecord(properties) && Object.prototype.hasOwnProperty.call(properties, key)) {
    properties[key] = replaceTypedValue(properties[key], nextValue)
    return true
  }
  if (!Array.isArray(properties)) return false
  const entry = properties.find(item => isRecord(item) && String(unwrapTypedValue(item.key) || '').trim() === key)
  if (!isRecord(entry)) return false
  entry.value = nextValue
  return true
}

const readStructuredRecordId = (record: Record<string, unknown>): string => {
  for (const key of ['id', 'nodeId', 'node_id']) {
    const raw = readRecordField(record, key)
    if (typeof unwrapTypedValue(raw) !== 'undefined') return normalizeStructuredNodeId(raw)
  }
  return ''
}

const changedNodeProperties = (previousNode: GraphNode, nextNode: GraphNode): Map<string, unknown> => {
  const previous = (previousNode.properties || {}) as Record<string, unknown>
  const next = (nextNode.properties || {}) as Record<string, unknown>
  const changed = new Map<string, unknown>()
  for (const [key, rawNextValue] of Object.entries(next)) {
    if (!key || key.includes(':')) continue
    const previousValue = unwrapGraphCellValue(previous[key])
    const nextValue = unwrapGraphCellValue(rawNextValue)
    if (typeof nextValue === 'undefined') continue
    try {
      if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) continue
    } catch {
      continue
    }
    changed.set(key, nextValue)
  }
  return changed
}

const updateStructuredPayload = (
  value: unknown,
  nodeId: string,
  changedProperties: ReadonlyMap<string, unknown>,
  depth = 0,
): boolean => {
  if (!isRecord(value) || depth > 8) return false
  let changed = false
  for (const listKey of STRUCTURED_LIST_KEYS) {
    const records = value[listKey]
    if (!Array.isArray(records)) continue
    for (const item of records) {
      if (!isRecord(item) || readStructuredRecordId(item) !== nodeId) continue
      for (const [key, nextValue] of changedProperties) {
        changed = writeRecordField(item, key, nextValue) || changed
      }
    }
  }
  for (const envelopeKey of STRUCTURED_ENVELOPE_KEYS) {
    changed = updateStructuredPayload(unwrapTypedValue(value[envelopeKey]), nodeId, changedProperties, depth + 1) || changed
  }
  return changed
}

const replaceTopLevelResponseSection = (rawText: string, responseValue: unknown): string => {
  const block = extractYamlFrontmatterBlock(rawText)
  if (!block) return rawText
  const yamlLines = String(block.yamlText || '').split('\n')
  const start = yamlLines.findIndex(line => /^response\s*:/.test(String(line || '').trim()))
  if (start < 0) return rawText
  let end = yamlLines.length
  for (let index = start + 1; index < yamlLines.length; index += 1) {
    const line = String(yamlLines[index] || '')
    if (line.trim() && !/^\s/.test(line)) {
      end = index
      break
    }
  }
  const responseLines = yaml.dump({ response: responseValue }, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd().split('\n')
  const nextYaml = [...yamlLines.slice(0, start), ...responseLines, ...yamlLines.slice(end)].join('\n')
  return `---\n${nextYaml}\n---${rawText.slice(block.rawBlock.length)}`
}

export function syncStructuredResponseEnvelopeFromNodeEdit(args: {
  rawText: string
  previousNode?: GraphNode | null
  nextNode?: GraphNode | null
}): string {
  const previousNode = args.previousNode
  const nextNode = args.nextNode
  const nodeId = String(nextNode?.id || '').trim()
  if (!previousNode || !nextNode || !nodeId.startsWith('mcp-response-')) return args.rawText
  const changedProperties = changedNodeProperties(previousNode, nextNode)
  if (changedProperties.size === 0) return args.rawText

  const block = extractYamlFrontmatterBlock(args.rawText)
  if (!block) return args.rawText
  try {
    const parsed = yaml.load(String(block.yamlText || ''))
    if (!isRecord(parsed) || !isRecord(parsed.response)) return args.rawText
    const responseValue = unwrapTypedValue(parsed.response)
    if (!isRecord(responseValue)) return args.rawText
    const markdownBodyField = responseValue.markdown_body
    const markdownBody = unwrapTypedValue(markdownBodyField)
    if (typeof markdownBody !== 'string' || !markdownBody.trim().startsWith('{')) return args.rawText
    const payload = JSON.parse(markdownBody) as unknown
    if (!updateStructuredPayload(payload, nodeId, changedProperties)) return args.rawText
    responseValue.markdown_body = replaceTypedValue(markdownBodyField, JSON.stringify(payload, null, 2))
    return replaceTopLevelResponseSection(args.rawText, parsed.response)
  } catch {
    return args.rawText
  }
}
