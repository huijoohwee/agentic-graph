import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { GraphState } from '@/hooks/store/types'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { isMarkdownLikeFileName } from 'grph-shared/markdown/mermaidInput'
import { recordDocumentVersionSnapshot } from '@/features/document-versioning/documentVersioning'
import yaml from 'js-yaml'
import {
  normalizeComposedSourcePath,
  readComposedSourceFilePath,
  resolvePreferredComposedSourceFileFromState,
} from '@/features/source-files/composedSourceSelection'
import {
  isStrybldrStoryboardMarkdown,
} from '@/features/strybldr/strybldrStoryboard'
import { normalizeGeneratedRichMediaTableProperties } from '@/features/rich-media/richMediaTablePersistence'; import { containsMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'; import { enqueueWorkspaceSourceTextWrite } from './workspaceSourceTextWriteQueue'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { buildUpdatedSourceFileParsedGraphState } from '@/features/source-files/sourceFileParsedState'
import { hashText } from '@/features/parsers/hash'
import {
  findActiveMarkdownDocumentSourceFile,
  syncStrybldrStoryboardMarkdownFromParsedGraph,
} from './graphDataFrontmatterFlowSyncSupport'
import { syncStructuredResponseEnvelopeFromNodeEdit } from './graphDataStructuredResponseSync'
import { buildTextSelectionWidgetEdgePersistenceProperties } from '@/lib/storyboardWidget/textSelectionWidgetLink'
import { ensureAuthoredMarkdownNoteFrontmatterDefaults } from '@/features/workspace-fs/workspaceAuthoredNoteDocument'
const FLOW_YAML_PLAIN_KEY_RE = /^[A-Za-z0-9_.-]+$/
const FLOW_EDGE_SOURCE_PORT_KEY = 'flow:sourcePortKey'
const FLOW_EDGE_TARGET_PORT_KEY = 'flow:targetPortKey'
const FLOW_COMPUTE_PROPERTY_KEY = 'flow:compute'
const FLOW_PORT_TYPES_PROPERTY_KEY = 'flow:portTypes'
const FRONTMATTER_HANDLES_PROPERTY_KEY = 'frontmatter:handles'
const FRONTMATTER_WIDGET_FIELDS_PROPERTY_KEY = 'frontmatter:widgetFields'
type FrontmatterWidgetFieldSpec = {
  fieldKey: string
  fieldType: string
  schemaPath?: string
}
function flowYamlKey(key: string): string {
  return FLOW_YAML_PLAIN_KEY_RE.test(key) ? key : JSON.stringify(key)
}
function flowYamlInlineValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value == null) return 'null'
  try {
    return JSON.stringify(value)
  } catch {
    return 'null'
  }
}
function flowYamlInlineStringValue(value: string): string {
  return FLOW_YAML_PLAIN_KEY_RE.test(value) ? value : JSON.stringify(value)
}
function appendFlowYamlFieldLines(lines: string[], indent: string, key: string, value: unknown): void {
  if (typeof value === 'undefined') return
  const yamlKey = flowYamlKey(key)
  if (typeof value === 'string' && value.includes('\n')) {
    lines.push(`${indent}${yamlKey}: |`)
    for (const row of value.split('\n')) lines.push(`${indent}  ${row}`)
    return
  }
  lines.push(`${indent}${yamlKey}: ${flowYamlInlineValue(value)}`)
}
function inferFrontmatterFlowFieldType(value: unknown): string {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}
function readFrontmatterWidgetFieldSpecs(node: GraphNode): FrontmatterWidgetFieldSpec[] {
  const props = (node.properties || {}) as Record<string, unknown>
  const raw = props[FRONTMATTER_WIDGET_FIELDS_PROPERTY_KEY]
  if (!Array.isArray(raw)) return []
  const out: FrontmatterWidgetFieldSpec[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const spec = raw[i]
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue
    const rec = spec as Record<string, unknown>
    const fieldKey = String(rec.fieldKey || '').trim()
    const fieldType = String(rec.fieldType || '').trim()
    const schemaPath = String(rec.schemaPath || '').trim()
    if (!fieldKey || !fieldType) continue
    out.push({
      fieldKey,
      fieldType,
      ...(schemaPath ? { schemaPath } : {}),
    })
  }
  return out
}
function readFrontmatterFlowFieldType(node: GraphNode, fieldName: string, value: unknown): string {
  const normalizedFieldName = String(fieldName || '').trim()
  if (!normalizedFieldName) return inferFrontmatterFlowFieldType(value)
  if (normalizedFieldName === 'id' || normalizedFieldName === 'type' || normalizedFieldName === 'label') return 'string'
  if (normalizedFieldName === 'position') return 'object'
  if (normalizedFieldName === 'handles') return 'object'
  if (normalizedFieldName === 'compute') return 'string'
  const specs = readFrontmatterWidgetFieldSpecs(node)
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i]
    if (!spec) continue
    const schemaPath = String(spec.schemaPath || '').trim()
    if (schemaPath === normalizedFieldName || schemaPath === `properties.${normalizedFieldName}` || spec.fieldKey === normalizedFieldName) {
      return spec.fieldType
    }
  }
  return inferFrontmatterFlowFieldType(value)
}
function appendFlowYamlEnvelopeFieldLines(
  lines: string[],
  indent: string,
  key: string,
  value: unknown,
  fieldType?: string,
): void {
  const unwrappedValue = unwrapGraphCellValue(value)
  if (typeof unwrappedValue === 'undefined') return
  const yamlKey = flowYamlKey(key)
  const normalizedType = String(fieldType || '').trim() || inferFrontmatterFlowFieldType(unwrappedValue)
  if (typeof unwrappedValue === 'string' && unwrappedValue.includes('\n')) {
    const blockIndicator = key === 'output' && containsMarkdownPipeTable(unwrappedValue) ? '|-' : '|'
    lines.push(`${indent}${yamlKey}:`)
    lines.push(`${indent}  key: ${flowYamlInlineStringValue(String(key || '').trim() || key)}`)
    lines.push(`${indent}  type: ${flowYamlInlineStringValue(normalizedType)}`)
    lines.push(`${indent}  value: ${blockIndicator}`)
    for (const row of unwrappedValue.split('\n')) lines.push(`${indent}    ${row}`)
    return
  }
  lines.push(
    `${indent}${yamlKey}: {key: ${flowYamlInlineStringValue(String(key || '').trim() || key)}, type: ${flowYamlInlineStringValue(normalizedType)}, value: ${flowYamlInlineValue(unwrappedValue)}}`,
  )
}
function readFlowHandlesFromNode(node: GraphNode): Record<string, unknown> | null {
  const rawProperties = unwrapGraphCellValue(node.properties)
  const props = rawProperties && typeof rawProperties === 'object' && !Array.isArray(rawProperties)
    ? rawProperties as Record<string, unknown>
    : {}
  const explicit = unwrapGraphCellValue(props[FRONTMATTER_HANDLES_PROPERTY_KEY])
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    return explicit as Record<string, unknown>
  }
  const rawPortTypes = unwrapGraphCellValue(props[FLOW_PORT_TYPES_PROPERTY_KEY])
  if (!rawPortTypes || typeof rawPortTypes !== 'object' || Array.isArray(rawPortTypes)) return null
  const portTypes = rawPortTypes as Record<string, unknown>
  const target = portTypes.in && typeof portTypes.in === 'object' && !Array.isArray(portTypes.in)
    ? Object.keys(portTypes.in as Record<string, unknown>).filter(Boolean)
    : []
  const source = portTypes.out && typeof portTypes.out === 'object' && !Array.isArray(portTypes.out)
    ? Object.keys(portTypes.out as Record<string, unknown>).filter(Boolean)
    : []
  const out: Record<string, unknown> = {}
  if (target.length > 0) out.target = target
  if (source.length > 0) out.source = source
  return Object.keys(out).length > 0 ? out : null
}
function buildFrontmatterFlowBlockLines(graphData: GraphData): string[] {
  const lines: string[] = ['flow:']
  const meta = (graphData.metadata || {}) as Record<string, unknown>
  const settings = meta.frontmatterFlowSettings && typeof meta.frontmatterFlowSettings === 'object' && !Array.isArray(meta.frontmatterFlowSettings)
    ? (meta.frontmatterFlowSettings as Record<string, unknown>)
    : null
  if (settings) {
    appendFlowYamlEnvelopeFieldLines(lines, '  ', 'direction', settings.direction, 'string')
    appendFlowYamlEnvelopeFieldLines(lines, '  ', 'edgeType', settings.edgeType, 'string')
    appendFlowYamlEnvelopeFieldLines(lines, '  ', 'balancedViewportPreset', settings.balancedViewportPreset, 'string')
    appendFlowYamlEnvelopeFieldLines(lines, '  ', 'computed', settings.computed, 'boolean')
    appendFlowYamlEnvelopeFieldLines(lines, '  ', 'snapToGrid', settings.snapToGrid, 'boolean')
    appendFlowYamlEnvelopeFieldLines(lines, '  ', 'gridSize', settings.gridSize, 'number')
  }
  lines.push('  nodes:')
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  for (const node of nodes) {
    const rawProperties = unwrapGraphCellValue(node.properties)
    const originalProps = rawProperties && typeof rawProperties === 'object' && !Array.isArray(rawProperties)
      ? rawProperties as Record<string, unknown>
      : {}
    const nodeType = String(unwrapGraphCellValue(node.type) || 'Node')
    const nodeId = String(unwrapGraphCellValue(node.id) || '')
    const nodeLabel = String(unwrapGraphCellValue(node.label) || nodeId)
    const normalizedProps = normalizeGeneratedRichMediaTableProperties({ nodeType, nodeLabel, properties: originalProps })
    const normalizedNode: GraphNode = normalizedProps === originalProps ? node : { ...node, properties: normalizedProps as GraphNode['properties'] }
    appendFlowYamlEnvelopeFieldLines(lines, '    - ', 'id', nodeId, 'string')
    appendFlowYamlEnvelopeFieldLines(lines, '      ', 'type', nodeType, 'string')
    appendFlowYamlEnvelopeFieldLines(lines, '      ', 'label', nodeLabel, 'string')
    const positionValue = unwrapGraphCellValue((node as GraphNode & { position?: unknown }).position)
    const position = positionValue && typeof positionValue === 'object' && !Array.isArray(positionValue)
      ? positionValue as Record<string, unknown>
      : null
    const rawX = unwrapGraphCellValue(node.x ?? position?.x)
    const rawY = unwrapGraphCellValue(node.y ?? position?.y)
    const x = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : null
    const y = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : null
    if (x != null || y != null) {
      const nextPosition: Record<string, number> = {}
      if (x != null) nextPosition.x = x
      if (y != null) nextPosition.y = y
      appendFlowYamlEnvelopeFieldLines(lines, '      ', 'position', nextPosition, 'object')
    }
    const handles = readFlowHandlesFromNode(normalizedNode)
    if (handles) appendFlowYamlEnvelopeFieldLines(lines, '      ', 'handles', handles, 'object')
    const props = normalizedProps
    const propEntries = Object.entries(props)
      .filter(([key, value]) => {
        if (typeof value === 'undefined') return false
        if (key === FRONTMATTER_HANDLES_PROPERTY_KEY) return false
        if (key === FRONTMATTER_WIDGET_FIELDS_PROPERTY_KEY) return false
        if (key === FLOW_COMPUTE_PROPERTY_KEY) return false
        return true
      })
      .sort(([a], [b]) => a.localeCompare(b))
    for (const [key, value] of propEntries) {
      const unwrappedValue = unwrapGraphCellValue(value)
      appendFlowYamlEnvelopeFieldLines(lines, '      ', key, unwrappedValue, readFrontmatterFlowFieldType(normalizedNode, key, unwrappedValue))
    }
    const computeValue = unwrapGraphCellValue(props[FLOW_COMPUTE_PROPERTY_KEY])
    const compute = typeof computeValue === 'string' ? computeValue : ''
    if (compute.trim()) appendFlowYamlEnvelopeFieldLines(lines, '      ', 'compute', compute, 'string')
  }
  lines.push('  edges:')
  const edges = Array.isArray(graphData.edges) ? graphData.edges : []
  for (const edge of edges) {
    const rawProperties = unwrapGraphCellValue(edge.properties)
    const props = rawProperties && typeof rawProperties === 'object' && !Array.isArray(rawProperties)
      ? rawProperties as Record<string, unknown>
      : {}
    const source = String(unwrapGraphCellValue(edge.source) || '').trim()
    const target = String(unwrapGraphCellValue(edge.target) || '').trim()
    const sourceHandle = String(unwrapGraphCellValue(props[FLOW_EDGE_SOURCE_PORT_KEY]) || '').trim()
    const targetHandle = String(unwrapGraphCellValue(props[FLOW_EDGE_TARGET_PORT_KEY]) || '').trim()
    const row: Record<string, unknown> = {
      id: String(unwrapGraphCellValue(edge.id) || ''),
      source,
      ...(sourceHandle ? { sourceHandle } : {}),
      target,
      ...(targetHandle ? { targetHandle } : {}),
    }
    const label = String(unwrapGraphCellValue(edge.label) || '').trim()
    if (label) row.label = label
    if (typeof props.animated === 'boolean') row.animated = props.animated
    const socketType = String(unwrapGraphCellValue(props['flow:socketType']) || '').trim()
    if (socketType) row.type = socketType
    const selectionProvenance = buildTextSelectionWidgetEdgePersistenceProperties(edge)
    if (selectionProvenance) row.properties = selectionProvenance
    lines.push(`    - ${flowYamlInlineValue(row)}`)
  }
  return lines
}
function replaceTopLevelYamlSectionLines(args: {
  yamlLines: string[]
  sectionKey: string
  sectionLines: string[]
}): string[] {
  const sectionKey = String(args.sectionKey || '').trim()
  if (!sectionKey) return args.yamlLines
  const escapedSectionKey = sectionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionHeaderRe = new RegExp(`^${escapedSectionKey}\\s*:\\s*$`)
  let start = -1
  let end = args.yamlLines.length
  for (let i = 0; i < args.yamlLines.length; i += 1) {
    const trimmed = String(args.yamlLines[i] || '').trim()
    if (!sectionHeaderRe.test(trimmed)) continue
    start = i
    break
  }
  if (start >= 0) {
    end = args.yamlLines.length
    for (let i = start + 1; i < args.yamlLines.length; i += 1) {
      const rawLine = String(args.yamlLines[i] || '')
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const indent = rawLine.match(/^\s*/)?.[0]?.length || 0
      if (indent === 0 && /^[A-Za-z0-9_.-]+\s*:/.test(trimmed)) {
        end = i
        break
      }
    }
  }
  return start >= 0
    ? [...args.yamlLines.slice(0, start), ...args.sectionLines, ...args.yamlLines.slice(end)]
    : [...args.yamlLines.filter((line, index, arr) => !(arr.length === 1 && line.trim() === '')), ...args.sectionLines]
}
function buildTopLevelYamlSectionLines(sectionKey: string, sectionValue: unknown): string[] {
  const key = String(sectionKey || '').trim()
  if (!key || typeof sectionValue === 'undefined') return []
  const dumped = String(
    yaml.dump(
      { [key]: sectionValue },
      {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
      },
    ) || '',
  ).trimEnd()
  return dumped ? dumped.split('\n') : []
}
function readFrontmatterTimelineSectionValue(graphData: GraphData): unknown {
  const metadata = graphData.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? (graphData.metadata as Record<string, unknown>)
    : null
  const frontmatterMeta = metadata?.frontmatterMeta && typeof metadata.frontmatterMeta === 'object' && !Array.isArray(metadata.frontmatterMeta)
    ? (metadata.frontmatterMeta as Record<string, unknown>)
    : null
  return frontmatterMeta?.timeline
}
function graphDataHasFlowTopology(graphData: GraphData | null | undefined): boolean {
  return (Array.isArray(graphData?.nodes) && graphData!.nodes.length > 0)
    || (Array.isArray(graphData?.edges) && graphData!.edges.length > 0)
}
function frontmatterTextHasFlowTopology(rawText: string): boolean {
  const block = extractYamlFrontmatterBlock(rawText)
  if (!block) return false
  try {
    const parsed = yaml.load(String(block.yamlText || ''))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const flow = (parsed as Record<string, unknown>).flow
    if (!flow || typeof flow !== 'object' || Array.isArray(flow)) return false
    const record = flow as Record<string, unknown>
    return (Array.isArray(record.nodes) && record.nodes.length > 0)
      || (Array.isArray(record.edges) && record.edges.length > 0)
  } catch {
    return false
  }
}
function upsertTopLevelFrontmatterSectionMarkdownText(args: {
  rawText: string
  sectionKey: string
  sectionValue: unknown
}): string {
  const sectionLines = buildTopLevelYamlSectionLines(args.sectionKey, args.sectionValue)
  if (sectionLines.length === 0) return args.rawText
  const block = extractYamlFrontmatterBlock(args.rawText)
  if (!block) {
    const prefix = ['---', ...sectionLines, '---', ''].join('\n')
    return args.rawText ? `${prefix}\n${args.rawText}` : `${prefix}\n`
  }
  const yamlLines = String(block.yamlText || '').split('\n')
  const nextYamlLines = replaceTopLevelYamlSectionLines({
    yamlLines,
    sectionKey: args.sectionKey,
    sectionLines,
  })
  const nextYaml = nextYamlLines.filter((line, index, arr) => !(arr.length > 1 && index === 0 && line === '')).join('\n')
  const suffix = args.rawText.slice(block.rawBlock.length)
  return `---\n${nextYaml}\n---${suffix}`
}

export function upsertFrontmatterFlowMarkdownText(
  rawText: string,
  graphData: GraphData,
  context?: { documentName?: string | null },
): string {
  const text = ensureAuthoredMarkdownNoteFrontmatterDefaults({
    documentName: String(context?.documentName || ''),
    rawText: String(rawText || ''),
  })
  if (!graphDataHasFlowTopology(graphData) && frontmatterTextHasFlowTopology(text)) return text
  const flowLines = buildFrontmatterFlowBlockLines(graphData)
  const block = extractYamlFrontmatterBlock(text)
  if (!block) {
    const prefix = ['---', ...flowLines, '---', ''].join('\n')
    return text ? `${prefix}\n${text}` : `${prefix}\n`
  }
  const yamlLines = String(block.yamlText || '').split('\n')
  let start = -1
  let end = yamlLines.length
  for (let i = 0; i < yamlLines.length; i += 1) {
    const trimmed = String(yamlLines[i] || '').trim()
    if (/^flow\s*:\s*$/.test(trimmed)) {
      start = i
      break
    }
  }
  if (start >= 0) {
    end = yamlLines.length
    for (let i = start + 1; i < yamlLines.length; i += 1) {
      const rawLine = String(yamlLines[i] || '')
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const indent = rawLine.match(/^\s*/)?.[0]?.length || 0
      if (indent === 0 && /^[A-Za-z0-9_.-]+\s*:/.test(trimmed)) {
        end = i
        break
      }
    }
  }
  const nextYamlLines = start >= 0
    ? [...yamlLines.slice(0, start), ...flowLines, ...yamlLines.slice(end)]
    : [...yamlLines.filter((line, index, arr) => !(arr.length === 1 && line.trim() === '')), ...flowLines]
  const nextYaml = nextYamlLines.filter((line, index, arr) => !(arr.length > 1 && index === 0 && line === '')).join('\n')
  const suffix = text.slice(block.rawBlock.length)
  const nextText = `---\n${nextYaml}\n---${suffix}`
  const timelineSectionValue = readFrontmatterTimelineSectionValue(graphData)
  return upsertTopLevelFrontmatterSectionMarkdownText({
    rawText: nextText,
    sectionKey: 'timeline',
    sectionValue: timelineSectionValue,
  })
}

export function sourceFileShouldWriteFrontmatterFlow(file: GraphState['sourceFiles'][number]): boolean {
  const name = String(file?.name || '').trim()
  const path = String(file?.source?.path || '').trim()
  return isMarkdownLikeFileName(name) || isMarkdownLikeFileName(path)
}

export function isActiveMarkdownSourceFile(state: GraphState, file: GraphState['sourceFiles'][number]): boolean {
  const preferred = resolvePreferredComposedSourceFileFromState({
    state,
    fallbackName: state.markdownDocumentName,
  })
  if (!preferred || !file) return false
  const preferredId = String(preferred.id || '').trim()
  const fileId = String(file.id || '').trim()
  if (preferredId && fileId && preferredId === fileId) return true
  const preferredPath = readComposedSourceFilePath(preferred)
  const filePath = readComposedSourceFilePath(file)
  return !!preferredPath && preferredPath === filePath
}

export function findSourceFileForMarkdownDocument(state: GraphState, name: string): GraphState['sourceFiles'][number] | null {
  return resolvePreferredComposedSourceFileFromState({
    state,
    fallbackName: name,
  })
}

export function writeWorkspaceSourceTextIfPresent(
  file: GraphState['sourceFiles'][number],
  text: string,
  label = 'Source file update',
  source: 'sourceFiles' | 'gitGraph' = 'sourceFiles',
): Promise<boolean> {
  const workspacePath = normalizeComposedSourcePath(readComposedSourceFilePath(file))
  if (!workspacePath) return Promise.resolve(false)
  recordDocumentVersionSnapshot({
    path: workspacePath,
    text,
    label,
    source,
  })
  return enqueueWorkspaceSourceTextWrite(workspacePath, text)
}

function isFrontmatterFlowGraphData(graphData: GraphData | null | undefined): boolean {
  return isFrontmatterFlowGraph(graphData)
}

export function syncActiveMarkdownDocumentTextFromParsedGraph(args: {
  state: GraphState
  sourceFiles: GraphState['sourceFiles']
  parsedGraphData: GraphData
  previousNode?: GraphNode | null
  nextNode?: GraphNode | null
}): {
  sourceFiles: GraphState['sourceFiles']
  accepted: boolean
  markdownDocumentText?: string | null
  markdownDocumentName?: string | null
} {
  const activeName = String(args.state.markdownDocumentName || '').trim()
  const activeText = String(args.state.markdownDocumentText || '')
  if (!activeName) return { sourceFiles: args.sourceFiles, accepted: false }
  if (!isMarkdownLikeFileName(activeName)) return { sourceFiles: args.sourceFiles, accepted: false }
  if (isStrybldrStoryboardMarkdown(activeText)) {
    const strybldrText = syncStrybldrStoryboardMarkdownFromParsedGraph({
      text: activeText,
      graphData: args.parsedGraphData,
      previousNode: args.previousNode,
      nextNode: args.nextNode,
    }) || activeText
    const nextText = isFrontmatterFlowGraphData(args.parsedGraphData) && frontmatterTextHasFlowTopology(activeText)
      ? upsertFrontmatterFlowMarkdownText(strybldrText, args.parsedGraphData, { documentName: activeName })
      : strybldrText
    if (!nextText || nextText === activeText) return { sourceFiles: args.sourceFiles, accepted: true }
    const activeFileMatch = findActiveMarkdownDocumentSourceFile(args)
    if (!activeFileMatch) {
      return {
        sourceFiles: args.sourceFiles,
        accepted: true,
        markdownDocumentText: nextText,
        markdownDocumentName: activeName,
      }
    }
    const nextSourceFiles = args.sourceFiles.slice()
    nextSourceFiles[activeFileMatch.index] = {
      ...activeFileMatch.file,
      ...buildUpdatedSourceFileParsedGraphState({
        previousParsedState: activeFileMatch.file,
        graphData: args.parsedGraphData,
      }),
      text: nextText,
      parsedTextHash: hashText(nextText),
    }
    return {
      sourceFiles: nextSourceFiles,
      accepted: true,
      markdownDocumentText: nextText,
      markdownDocumentName: activeName,
    }
  }
  if (!isFrontmatterFlowGraphData(args.parsedGraphData)) return { sourceFiles: args.sourceFiles, accepted: false }
  const nextText = syncStructuredResponseEnvelopeFromNodeEdit({
    rawText: upsertFrontmatterFlowMarkdownText(activeText, args.parsedGraphData, { documentName: activeName }),
    previousNode: args.previousNode,
    nextNode: args.nextNode,
  })
  if (nextText === activeText) return { sourceFiles: args.sourceFiles, accepted: true }
  const activeFileMatch = findActiveMarkdownDocumentSourceFile(args)
  if (!activeFileMatch) {
    return {
      sourceFiles: args.sourceFiles,
      accepted: true,
      markdownDocumentText: nextText,
      markdownDocumentName: activeName,
    }
  }
  const nextSourceFiles = args.sourceFiles.slice()
  nextSourceFiles[activeFileMatch.index] = {
    ...activeFileMatch.file,
    ...buildUpdatedSourceFileParsedGraphState({
      previousParsedState: activeFileMatch.file,
      graphData: args.parsedGraphData,
    }),
    text: nextText,
    parsedTextHash: hashText(nextText),
  }
  return {
    sourceFiles: nextSourceFiles,
    accepted: true,
    markdownDocumentText: nextText,
    markdownDocumentName: activeName,
  }
}

export function writeActiveMarkdownDocumentTextIfPresent(args: {
  state: GraphState
  sourceFiles: GraphState['sourceFiles']
  text: string
  label?: string
  source?: 'sourceFiles' | 'gitGraph'
}): Promise<boolean> {
  const activeFileMatch = findActiveMarkdownDocumentSourceFile(args)
  if (activeFileMatch?.file) {
    return writeWorkspaceSourceTextIfPresent(activeFileMatch.file, args.text, args.label || 'Source file update', args.source || 'sourceFiles')
  }
  const activePath = normalizeComposedSourcePath(String(args.state.markdownDocumentName || '').trim())
  if (!activePath) return Promise.resolve(false)
  if (!isMarkdownLikeFileName(activePath)) return Promise.resolve(false)
  recordDocumentVersionSnapshot({
    path: activePath,
    text: args.text,
    label: args.label || 'Markdown document update',
    source: args.source || 'sourceFiles',
  })
  return enqueueWorkspaceSourceTextWrite(activePath, args.text)
}

export function syncSourceFileTextFromParsedGraph(args: {
  state: GraphState
  sourceFiles: GraphState['sourceFiles']
  fileIndex: number
  parsedGraphData: GraphData
  previousNode?: GraphNode | null
  nextNode?: GraphNode | null
}): { sourceFiles: GraphState['sourceFiles']; markdownDocumentText?: string | null } {
  const file = args.sourceFiles[args.fileIndex]
  if (!file || !sourceFileShouldWriteFrontmatterFlow(file)) return { sourceFiles: args.sourceFiles }
  const currentText = String(file.text || '')
  if (isStrybldrStoryboardMarkdown(currentText)) {
    const nextText = syncStrybldrStoryboardMarkdownFromParsedGraph({
      text: currentText,
      graphData: args.parsedGraphData,
      previousNode: args.previousNode,
      nextNode: args.nextNode,
    })
    if (!nextText || nextText === currentText) return { sourceFiles: args.sourceFiles }
    const nextSourceFiles = args.sourceFiles.slice()
    nextSourceFiles[args.fileIndex] = {
      ...file,
      text: nextText,
      parsedTextHash: '',
    }
    return {
      sourceFiles: nextSourceFiles,
      ...(isActiveMarkdownSourceFile(args.state, file) ? { markdownDocumentText: nextText } : {}),
    }
  }
  const nextText = upsertFrontmatterFlowMarkdownText(currentText, args.parsedGraphData, {
    documentName: readComposedSourceFilePath(file) || file.name,
  })
  if (nextText === currentText) return { sourceFiles: args.sourceFiles }
  const nextSourceFiles = args.sourceFiles.slice()
  nextSourceFiles[args.fileIndex] = {
    ...file,
    text: nextText,
    parsedTextHash: '',
  }
  return {
    sourceFiles: nextSourceFiles,
    ...(isActiveMarkdownSourceFile(args.state, file) ? { markdownDocumentText: nextText } : {}),
  }
}
