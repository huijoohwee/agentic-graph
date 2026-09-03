import yaml from 'js-yaml'
import type { JSONValue } from '@/lib/graph/types'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import {
  buildCanonicalWidgetRegistryDraft,
} from '@/features/storyboard-widget-manager/registryTemplates'
import { inferTextGenerationProviderFamily } from '@/features/storyboard-widget-manager/textGenerationProviderFamily'
import type { ChatResponseStructuredSurface } from './chatResponseStructuredContent'

const yamlScalar = (value: unknown): string => JSON.stringify(String(value ?? ''))

const yamlValue = (value: JSONValue): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return yamlScalar(typeof value === 'string' ? value : JSON.stringify(value))
}

const yamlKey = (key: string): string =>
  /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : yamlScalar(key)

const appendYamlPropertyLines = (lines: string[], indent: string, key: string, value: JSONValue): void => {
  if (typeof value === 'string' && value.includes('\n')) {
    lines.push(`${indent}${yamlKey(key)}: |-`)
    for (const row of value.replace(/\r\n?/g, '\n').split('\n')) lines.push(`${indent}  ${row}`)
    return
  }
  if (typeof value === 'object' && value !== null) {
    const block = yaml.dump({ [key]: value }, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    }).trimEnd()
    lines.push(...block.split('\n').map(row => `${indent}${row}`))
    return
  }
  lines.push(`${indent}${yamlKey(key)}: ${yamlValue(value)}`)
}

const CHAT_RESPONSE_REGISTRY_UPDATED_AT = '1970-01-01T00:00:00.000Z'

const cleanRegistryIdPart = (value: unknown): string =>
  String(value || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

const escapeRegExp = (value: string): string =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasFlowListItemId = (frontmatter: string, id: string): boolean => {
  const escaped = escapeRegExp(id)
  const quoted = `["']?${escaped}["']?`
  return new RegExp(`(^|\\n)\\s*-\\s*(?:\\{\\s*id\\s*:\\s*${quoted}\\b|id\\s*:\\s*${quoted}(?:\\s|$))`).test(frontmatter)
}

const replaceCount = (frontmatter: string, key: string, increment: number): string => {
  if (increment <= 0) return frontmatter
  const rx = new RegExp(`(^\\s*${escapeRegExp(key)}:\\s*)(\\d+)(\\s*$)`, 'm')
  return frontmatter.replace(rx, (_match, prefix: string, rawCount: string, suffix: string) => {
    const count = Number.parseInt(rawCount, 10)
    return `${prefix}${Number.isFinite(count) ? count + increment : rawCount}${suffix}`
  })
}

const readPropertyString = (properties: Record<string, JSONValue>, key: string): string => {
  const value = properties[key]
  return typeof value === 'string' ? value.trim() : ''
}

const registrySignature = (entry: unknown): string => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
  const record = entry as Record<string, unknown>
  const nodeTypeId = typeof record.nodeTypeId === 'string' ? record.nodeTypeId.trim() : ''
  const widgetTypeId = typeof record.widgetTypeId === 'string' ? record.widgetTypeId.trim() : ''
  const formId = typeof record.formId === 'string' ? record.formId.trim() : ''
  if (nodeTypeId && widgetTypeId && formId) return `${nodeTypeId}\u0000${widgetTypeId}\u0000${formId}`
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  return id
}

const readExistingRegistrySignatures = (frontmatter: string): Set<string> => {
  const signatures = new Set<string>()
  try {
    const parsed = yaml.load(String(frontmatter || ''))
    const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
    const direct = record && Array.isArray(record[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? record[FLOW_WIDGET_REGISTRY_METADATA_KEY] as unknown[]
      : []
    const widgetBundle = record && record.widget_bundle && typeof record.widget_bundle === 'object' && !Array.isArray(record.widget_bundle)
      ? record.widget_bundle as Record<string, unknown>
      : null
    const bundled = widgetBundle && Array.isArray(widgetBundle.registry) ? widgetBundle.registry : []
    for (const entry of [...direct, ...bundled]) {
      const signature = registrySignature(entry)
      if (signature) signatures.add(signature)
    }
  } catch {
    return signatures
  }
  return signatures
}

const buildChatResponseWidgetRegistryEntries = (surface: ChatResponseStructuredSurface): Record<string, JSONValue>[] => {
  const out: Record<string, JSONValue>[] = []
  const seen = new Set<string>()
  const nodes = Array.isArray(surface.nodes) ? surface.nodes : []
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const nodeTypeId = String(node?.nodeTypeId || '').trim()
    if (!nodeTypeId) continue
    const properties = node.properties || {}
    const formId = readPropertyString(properties, 'flow:widgetFormId')
    const widgetTypeId = readPropertyString(properties, 'flow:widgetTypeId') || 'default'
    if (!formId || !widgetTypeId) continue
    const draft = buildCanonicalWidgetRegistryDraft({
      nodeTypeId,
      widgetTypeId,
      formId,
      providerFamily: nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID
        ? inferTextGenerationProviderFamily({
            formId,
            widgetTypeId,
            provider: properties.chatProvider,
            endpointUrl: properties.chatEndpointUrl,
            model: properties.chatModel,
          })
        : undefined,
    })
    if (!draft) continue
    const entry: Record<string, JSONValue> = {
      ...draft,
      id: `qer-chat-${cleanRegistryIdPart(nodeTypeId) || 'node'}-${cleanRegistryIdPart(widgetTypeId) || 'default'}-${cleanRegistryIdPart(formId) || 'form'}`,
      updatedAt: CHAT_RESPONSE_REGISTRY_UPDATED_AT,
    } as unknown as Record<string, JSONValue>
    const signature = registrySignature(entry)
    if (!signature || seen.has(signature)) continue
    seen.add(signature)
    out.push(entry)
  }
  return out
}

const dumpYamlLines = (value: unknown): string[] =>
  yaml.dump(value, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd().split('\n')

const findTopLevelWidgetRegistryIndex = (lines: string[]): number =>
  lines.findIndex(line => /^\s{0}['"]?flow:widgetRegistry['"]?\s*:/.test(line || ''))

const upsertWidgetRegistryEntries = (frontmatter: string, surface: ChatResponseStructuredSurface): string => {
  const entries = buildChatResponseWidgetRegistryEntries(surface)
  if (entries.length === 0) return frontmatter
  const existing = readExistingRegistrySignatures(frontmatter)
  const missing = entries.filter(entry => {
    const signature = registrySignature(entry)
    return signature && !existing.has(signature)
  })
  if (missing.length === 0) return frontmatter

  const lines = String(frontmatter || '').replace(/\r\n/g, '\n').split('\n')
  const registryIndex = findTopLevelWidgetRegistryIndex(lines)
  if (registryIndex >= 0) {
    const end = findYamlSectionEnd(lines, registryIndex, 0)
    const itemLines = dumpYamlLines(missing).map(line => `  ${line}`)
    lines.splice(end, 0, ...itemLines)
    return lines.join('\n')
  }

  const registryLines = dumpYamlLines({ [FLOW_WIDGET_REGISTRY_METADATA_KEY]: missing })
  const flowMarker = '\nflow:\n'
  if (frontmatter.includes(flowMarker)) return insertBeforeMarker(frontmatter, flowMarker, registryLines)
  return `${frontmatter.trimEnd()}\n${registryLines.join('\n')}`
}

const insertBeforeMarker = (frontmatter: string, marker: string, lines: string[]): string => {
  if (lines.length === 0 || !frontmatter.includes(marker)) return frontmatter
  return frontmatter.replace(marker, `\n${lines.join('\n')}${marker}`)
}

const STRUCTURED_FRONTMATTER_FIELD_ORDER = [
  'kgCanvasSurfaceMode',
  'kgCanvasRenderMode',
  'kgCanvas3dMode',
  'kgCanvas2dRenderer',
  'kgDocumentSemanticMode',
  'kgFrontmatterModeEnabled',
  'kgMultiDimTableModeEnabled',
  'kgDocumentStructureBaselineLock',
  'kgWorkflowManagerModeEnabled',
  'kgStrybldrStoryboard',
  'flow_diagrams',
  'kgAssetType',
  'kgAssetFormat',
  'kgAssetName',
  'kgAssetMimeType',
  'kgAssetDataUrl',
  'kgAssetUrl',
  'kgAssetPendingLocalImport',
  'kgAssetPendingLocalPath',
  'kgAssetBytes',
  'kgAssetValidGlbMagic',
  'kgAssetValidGlbContainer',
  'kgAssetValidGlbChunkOrder',
  'kgAssetValidGlbChunkAlignment',
  'kgAssetValidGlbJsonPadding',
  'kgAssetValidGlbBinPadding',
  'kgAssetValidGlbBinReference',
  'kgAssetValidGltfJson',
  'kgAssetValidGltfAsset',
  'kgAssetGltfVersion',
  'kgAssetExternalResourceCount',
  'kgAssetEmbeddedResourceCount',
  'kgAssetGlbJsonChunkBytes',
  'kgAssetGlbBinChunkBytes',
  'kgAssetGlbUnknownChunkCount',
] as const

const structuredFrontmatterSortIndex = (key: string): number => {
  const index = (STRUCTURED_FRONTMATTER_FIELD_ORDER as readonly string[]).indexOf(key)
  return index >= 0 ? index : STRUCTURED_FRONTMATTER_FIELD_ORDER.length
}

const replaceTopLevelFrontmatterScalar = (frontmatter: string, key: string, value: JSONValue): {
  next: string
  replaced: boolean
} => {
  const line = `${yamlKey(key)}: ${yamlValue(value)}`
  const rx = new RegExp(`(^${escapeRegExp(key)}\\s*:\\s*).*$`, 'm')
  if (!rx.test(frontmatter)) return { next: frontmatter, replaced: false }
  return { next: frontmatter.replace(rx, line), replaced: true }
}

const isBlockFrontmatterValue = (value: JSONValue): boolean =>
  typeof value === 'object' && value !== null

const findTopLevelFrontmatterKeyIndex = (lines: string[], key: string): number => {
  const escaped = escapeRegExp(key)
  const rx = new RegExp(`^\\s{0}["']?${escaped}["']?\\s*:`)
  return lines.findIndex(line => rx.test(line || ''))
}

const replaceTopLevelFrontmatterBlock = (frontmatter: string, key: string, value: JSONValue): {
  next: string
  replaced: boolean
} => {
  const lines = String(frontmatter || '').replace(/\r\n/g, '\n').split('\n')
  const index = findTopLevelFrontmatterKeyIndex(lines, key)
  if (index < 0) return { next: frontmatter, replaced: false }
  const end = findYamlSectionEnd(lines, index, 0)
  lines.splice(index, end - index, ...dumpYamlLines({ [key]: value }))
  return { next: lines.join('\n'), replaced: true }
}

const upsertStructuredFrontmatterFields = (frontmatter: string, fields: Record<string, JSONValue> | null | undefined): string => {
  const entries = Object.entries(fields || {})
    .filter(([key, value]) => key && typeof value !== 'undefined')
    .sort(([a], [b]) => structuredFrontmatterSortIndex(a) - structuredFrontmatterSortIndex(b) || a.localeCompare(b))
  if (entries.length === 0) return frontmatter

  let next = frontmatter
  const missingLines: string[] = []
  for (const [key, value] of entries) {
    const replaced = isBlockFrontmatterValue(value)
      ? replaceTopLevelFrontmatterBlock(next, key, value)
      : replaceTopLevelFrontmatterScalar(next, key, value)
    next = replaced.next
    if (!replaced.replaced) {
      if (isBlockFrontmatterValue(value)) missingLines.push(...dumpYamlLines({ [key]: value }))
      else missingLines.push(`${yamlKey(key)}: ${yamlValue(value)}`)
    }
  }
  if (missingLines.length === 0) return next
  const flowMarker = '\nflow:\n'
  if (next.includes(flowMarker)) return insertBeforeMarker(next, flowMarker, missingLines)
  return `${next.trimEnd()}\n${missingLines.join('\n')}`
}

const insertIntoFlowListBlock = (frontmatter: string, marker: string, lines: string[]): string => {
  if (lines.length === 0) return frontmatter
  const markerIndex = frontmatter.indexOf(marker)
  if (markerIndex < 0) return frontmatter
  const before = frontmatter.slice(0, markerIndex + marker.length)
  const after = frontmatter.slice(markerIndex + marker.length)
  const afterLines = after.split('\n')
  let insertIndex = afterLines.length
  for (let i = 0; i < afterLines.length; i += 1) {
    const line = afterLines[i] || ''
    if (!line.trim()) continue
    if (/^\S/.test(line) || /^\s{0,2}\S/.test(line)) {
      insertIndex = i
      break
    }
  }
  const nextLines = [
    ...afterLines.slice(0, insertIndex),
    ...lines,
    ...afterLines.slice(insertIndex),
  ]
  return `${before}${nextLines.join('\n')}`
}

const countLeadingSpaces = (line: string): number => {
  const match = String(line || '').match(/^ */)
  return match ? match[0].length : 0
}

const findYamlSectionEnd = (lines: string[], startIndex: number, parentIndent: number): number => {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] || ''
    if (!line.trim()) continue
    if (countLeadingSpaces(line) <= parentIndent) return i
  }
  return lines.length
}

const findDirectChildIndent = (lines: string[], startIndex: number, endIndex: number, parentIndent: number): number => {
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const line = lines[i] || ''
    if (!line.trim()) continue
    const indent = countLeadingSpaces(line)
    if (indent > parentIndent) return indent
  }
  return parentIndent + 2
}

const readYamlListItemValue = (value: string): string => {
  const trimmed = String(value || '').trim().replace(/,$/, '').trim()
  if (!trimmed) return ''
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

const readInlineYamlListValues = (line: string): string[] => {
  const start = line.indexOf('[')
  const end = line.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  return line
    .slice(start + 1, end)
    .split(',')
    .map(readYamlListItemValue)
    .filter(Boolean)
}

const appendWidgetBundleNodeRefs = (frontmatter: string, nodeIds: string[]): string => {
  const refs = nodeIds.map(id => String(id || '').trim()).filter(Boolean)
  if (refs.length === 0) return frontmatter
  const lines = String(frontmatter || '').replace(/\r\n/g, '\n').split('\n')
  const widgetBundleIndex = lines.findIndex(line => /^widget_bundle\s*:/.test(line || ''))
  const canonicalBundleRefs = Array.from(new Set(['n-deliver', ...refs]))
  if (widgetBundleIndex < 0) {
    const block = [
      'widget_bundle:',
      '  graph:',
      `    nodes_ref: [${canonicalBundleRefs.map(id => yamlScalar(id)).join(', ')}]`,
    ]
    const flowIndex = lines.findIndex(line => /^flow\s*:/.test(line || ''))
    if (flowIndex >= 0) {
      lines.splice(flowIndex, 0, ...block)
      return lines.join('\n')
    }
    return `${frontmatter.trimEnd()}\n${block.join('\n')}`
  }

  const widgetBundleEnd = findYamlSectionEnd(lines, widgetBundleIndex, 0)
  const widgetBundleChildIndent = findDirectChildIndent(lines, widgetBundleIndex, widgetBundleEnd, 0)
  let graphIndex = -1
  for (let i = widgetBundleIndex + 1; i < widgetBundleEnd; i += 1) {
    const line = lines[i] || ''
    if (countLeadingSpaces(line) === widgetBundleChildIndent && /^\s*graph\s*:/.test(line)) {
      graphIndex = i
      break
    }
  }
  if (graphIndex < 0) {
    lines.splice(widgetBundleEnd, 0,
      `${' '.repeat(widgetBundleChildIndent)}graph:`,
      `${' '.repeat(widgetBundleChildIndent + 2)}nodes_ref: [${canonicalBundleRefs.map(id => yamlScalar(id)).join(', ')}]`,
    )
    return lines.join('\n')
  }

  const graphIndent = countLeadingSpaces(lines[graphIndex] || '')
  const graphEnd = findYamlSectionEnd(lines, graphIndex, graphIndent)
  const graphChildIndent = findDirectChildIndent(lines, graphIndex, graphEnd, graphIndent)
  let nodesRefIndex = -1
  for (let i = graphIndex + 1; i < graphEnd; i += 1) {
    const line = lines[i] || ''
    if (countLeadingSpaces(line) === graphChildIndent && /^\s*nodes_ref\s*:/.test(line)) {
      nodesRefIndex = i
      break
    }
  }
  if (nodesRefIndex < 0) {
    lines.splice(graphEnd, 0, `${' '.repeat(graphChildIndent)}nodes_ref: [${canonicalBundleRefs.map(id => yamlScalar(id)).join(', ')}]`)
    return lines.join('\n')
  }

  const nodesRefLine = lines[nodesRefIndex] || ''
  const existing = new Set<string>()
  if (nodesRefLine.includes('[') && nodesRefLine.includes(']')) {
    readInlineYamlListValues(nodesRefLine).forEach(id => existing.add(id))
    const missing = refs.filter(id => !existing.has(id))
    if (missing.length === 0) return frontmatter
    const nextValues = [
      ...readInlineYamlListValues(nodesRefLine),
      ...missing,
    ].map(id => yamlScalar(id)).join(', ')
    lines[nodesRefIndex] = nodesRefLine.replace(/\[[^\]]*\]/, `[${nextValues}]`)
    return lines.join('\n')
  }

  const nodesRefIndent = countLeadingSpaces(nodesRefLine)
  let insertIndex = graphEnd
  for (let i = nodesRefIndex + 1; i < graphEnd; i += 1) {
    const line = lines[i] || ''
    if (!line.trim()) continue
    const indent = countLeadingSpaces(line)
    if (indent <= nodesRefIndent) {
      insertIndex = i
      break
    }
    if (line.trim().startsWith('- ')) existing.add(readYamlListItemValue(line.trim().slice(2)))
  }
  const missing = refs.filter(id => !existing.has(id))
  if (missing.length === 0) return frontmatter
  const listIndent = `${' '.repeat(nodesRefIndent + 2)}- `
  lines.splice(insertIndex, 0, ...missing.map(id => `${listIndent}${yamlScalar(id)}`))
  return lines.join('\n')
}

export const buildChatResponseSurfaceFlowPatch = (surface: ChatResponseStructuredSurface | null | undefined): {
  nodeLines: string[]
  edgeLines: string[]
  subgraphLine: string
} => {
  const nodes = Array.isArray(surface?.nodes) ? surface.nodes : []
  const edges = Array.isArray(surface?.edges) ? surface.edges : []
  const nodeLines = nodes.flatMap(node => {
    const lines = [
      `    - id: ${yamlScalar(node.id)}`,
      `      type: ${yamlScalar(node.nodeTypeId || FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)}`,
      `      label: ${yamlScalar(node.label)}`,
      '      category: output',
      '      properties:',
    ]
    for (const [key, value] of Object.entries(node.properties)) {
      appendYamlPropertyLines(lines, '        ', key, value)
    }
    return lines
  })
  const edgeLines = edges.map(edge =>
    `    - {id: ${yamlScalar(edge.id)}, source: ${yamlScalar(edge.source)}, sourceHandle: ${yamlScalar(edge.sourceHandle)}, target: ${yamlScalar(edge.target)}, targetHandle: ${yamlScalar(edge.targetHandle)}, label: ${yamlScalar(edge.label)}, animated: true}`)
  const subgraphLine = nodes.length
    ? `    - {id: "sg-mcp-response", kind: subgraph, label: "MCP Structured Response", memberNodeIds: [${nodes.map(node => yamlScalar(node.id)).join(', ')}], parentId: null}`
    : ''
  return { nodeLines, edgeLines, subgraphLine }
}

export const projectChatResponseStructuredSurfaceIntoAgenticOsFrontmatter = (args: {
  frontmatter: string
  surface: ChatResponseStructuredSurface | null | undefined
}): string => {
  const frontmatter = String(args.frontmatter || '')
  const surface = args.surface || null
  if (!surface) return frontmatter
  const frontmatterWithStructuredFields = upsertStructuredFrontmatterFields(frontmatter, surface.frontmatter)
  if (surface.nodes.length === 0) return frontmatterWithStructuredFields
  const frontmatterWithRegistry = upsertWidgetRegistryEntries(frontmatterWithStructuredFields, surface)
  const frontmatterWithWidgetRefs = appendWidgetBundleNodeRefs(frontmatterWithRegistry, surface.nodes.map(node => node.id))
  if (/(^|\n)agenticOsResponseOnly:\s*true\b/.test(frontmatterWithWidgetRefs)) return frontmatterWithWidgetRefs
  const projectedNodes = surface.nodes.filter(node => !hasFlowListItemId(frontmatterWithWidgetRefs, node.id))
  const projectedEdges = surface.edges.filter(edge => !hasFlowListItemId(frontmatterWithWidgetRefs, edge.id))
  if (projectedNodes.length === 0 && projectedEdges.length === 0) return frontmatterWithWidgetRefs
  const patch = buildChatResponseSurfaceFlowPatch({ nodes: projectedNodes, edges: projectedEdges })
  const hasMcpPhase = /(^|\n)\s*-\s*id:\s*["']?P4["']?(?:\s|$)/.test(frontmatterWithWidgetRefs) || frontmatterWithWidgetRefs.includes('MCP Structured Response')
  let next = frontmatterWithWidgetRefs
  next = replaceCount(next, 'node_count', projectedNodes.length)
  next = replaceCount(next, 'edge_count', projectedEdges.length)
  next = replaceCount(next, 'phase_count', projectedNodes.length > 0 && !hasMcpPhase ? 1 : 0)
  if (projectedNodes.length > 0 && !hasMcpPhase) {
    next = next.replace(
      '      nodes: [n-deliver]',
      [
        '      nodes: [n-deliver]',
        '    - id: P4',
        '      label: "MCP Structured Response"',
        '      seq_range: "S06"',
        `      nodes: [${surface.nodes.map(node => yamlScalar(node.id)).join(', ')}]`,
      ].join('\n'),
    )
  }
  const subgraphsMarker = '\n  subgraphs:\n'
  next = insertBeforeMarker(next, subgraphsMarker, patch.nodeLines)
  if (patch.subgraphLine && !hasFlowListItemId(next, 'sg-mcp-response')) {
    next = next.replace(
      '    - {id: sg-p3, kind: subgraph, label: "Deliver + Persist", memberNodeIds: [n-deliver], parentId: null}',
      [
        '    - {id: sg-p3, kind: subgraph, label: "Deliver + Persist", memberNodeIds: [n-deliver], parentId: null}',
        patch.subgraphLine,
      ].join('\n'),
    )
  }
  next = insertIntoFlowListBlock(next, '\n  edges:\n', patch.edgeLines)
  return next
}
