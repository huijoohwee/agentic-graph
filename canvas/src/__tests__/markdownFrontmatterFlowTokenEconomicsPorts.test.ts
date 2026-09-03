import fs from 'node:fs'
import path from 'node:path'

import {
  buildFrontmatterWidgetContractModel,
  buildFrontmatterWidgetContractRowSpecs,
} from '@/features/storyboard-widget-manager/frontmatterWidgetContract'
import { FLOW_WIDGET_FORM_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { FRONTMATTER_FLOW_HANDLES_VALUE_KEY } from '@/features/parsers/markdownFrontmatterFlowGraph.flowBlock'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { resolveDocsSsotFixturePath } from '@/tests/lib/docsSsotFixture'

const TOKEN_ECONOMICS_STORYBOARD_WIDGET_FIXTURE_BASENAME = 'agentic-graph-token-economics-model-demo.md'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readPortKeys = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(entry => String(entry || '').trim()).filter(Boolean)
    : []

function readAgenticGraphTokenEconomicsDemoPath(): string {
  const envPath = typeof process.env.AG_TEST_TOKEN_ECONOMICS_DOCS_SSOT_FIXTURE_PATH === 'string'
    ? process.env.AG_TEST_TOKEN_ECONOMICS_DOCS_SSOT_FIXTURE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveDocsSsotFixturePath(TOKEN_ECONOMICS_STORYBOARD_WIDGET_FIXTURE_BASENAME)
}

export function testMarkdownFrontmatterFlowGraphFidelityTokenEconomicsWidgetKeysMapToPortHandles() {
  const samplePath = readAgenticGraphTokenEconomicsDemoPath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected token-economics frontmatter parse result')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') {
    throw new Error('expected token-economics graph to parse as frontmatter-flow')
  }

  const registryEntries = Array.isArray((g.metadata as Record<string, unknown> | null | undefined)?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? ((g.metadata as Record<string, unknown>)[FLOW_WIDGET_REGISTRY_METADATA_KEY] as unknown[])
    : []
  const registryByFormId = new Map<string, unknown>()
  for (let i = 0; i < registryEntries.length; i += 1) {
    const entry = registryEntries[i]
    if (!isRecord(entry)) continue
    const formId = String(entry.formId || '').trim()
    if (!formId || registryByFormId.has(formId)) continue
    registryByFormId.set(formId, entry)
  }

  let checkedWidgetCount = 0
  let checkedHandleRowCount = 0
  for (let i = 0; i < g.nodes.length; i += 1) {
    const node = g.nodes[i]
    const props = (node.properties || {}) as Record<string, unknown>
    const handles = isRecord(props[FRONTMATTER_FLOW_HANDLES_VALUE_KEY])
      ? props[FRONTMATTER_FLOW_HANDLES_VALUE_KEY] as Record<string, unknown>
      : null
    if (!handles) continue
    const frontmatterPortKeys = new Set([
      ...readPortKeys(handles.target),
      ...readPortKeys(handles.source),
    ])
    if (frontmatterPortKeys.size === 0) continue
    const formId = String(props[FLOW_WIDGET_FORM_ID_KEY] || '').trim()
    const registryEntry = formId ? registryByFormId.get(formId) : null
    const rows = buildFrontmatterWidgetContractRowSpecs(buildFrontmatterWidgetContractModel({
      node,
      edges: g.edges,
      registryEntry: registryEntry as never,
    }))
    const renderedPortKeys = rows.handleRows.flatMap(row => row.portKeys)
    if (renderedPortKeys.length === 0) {
      throw new Error(`expected ${String(node.id || '')} to render semantic port-handle rows`)
    }
    const genericRows = rows.handleRows.filter(row => (
      row.valueText.includes('handles.source')
      || row.valueText.includes('handles.target')
      || row.portKeys.some(portKey => portKey === 'handles.source' || portKey === 'handles.target')
    ))
    if (genericRows.length > 0) {
      throw new Error(`expected ${String(node.id || '')} handle rows to map semantic keys, not generic handles.source/handles.target labels`)
    }
    const missing = Array.from(frontmatterPortKeys).filter(portKey => !renderedPortKeys.includes(portKey))
    if (missing.length > 0) {
      throw new Error(`expected ${String(node.id || '')} handle rows to include frontmatter semantic keys: ${missing.join(', ')}`)
    }
    checkedWidgetCount += 1
    checkedHandleRowCount += rows.handleRows.length
  }

  if (checkedWidgetCount === 0 || checkedHandleRowCount === 0) {
    throw new Error('expected token-economics fixture to validate at least one widget handle contract')
  }
}
