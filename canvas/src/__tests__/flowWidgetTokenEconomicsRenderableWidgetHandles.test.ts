import fs from 'node:fs'
import path from 'node:path'

import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'

import { WidgetEditorForm } from '@/components/StoryboardWidget/WidgetEditorForm'
import { normalizeWidgetFieldSchemaPath } from '@/features/storyboard-widget-manager/widgetFieldMutation'
import { FLOW_WIDGET_FORM_ID_KEY, resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  FRONTMATTER_FLOW_HANDLES_VALUE_KEY,
  FRONTMATTER_FLOW_WIDGET_FIELDS_KEY,
} from '@/features/parsers/markdownFrontmatterFlowGraph.flowBlock'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { defaultSchema } from '@/lib/graph/schema'
import { readRecordPathValue } from '@/lib/graph/nodeProperties'
import { resolveDocsSsotFixturePath } from '@/tests/lib/docsSsotFixture'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { buildRichMediaPanelOverlayState, buildRichMediaPanelPreviewSpec } from '@/lib/render/richMediaSsot'

const TOKEN_ECONOMICS_FIXTURE_BASENAME = 'agenticgraph-token-economics-model-demo.md'

type DomGlobalSnapshot = Partial<Pick<
  typeof globalThis,
  'window' | 'document' | 'Event' | 'InputEvent' | 'Node' | 'Element' | 'Text' | 'HTMLElement' | 'HTMLInputElement' | 'HTMLTextAreaElement'
>> & { IS_REACT_ACT_ENVIRONMENT?: unknown }

type RenderedNode = {
  dom: JSDOM
  host: HTMLElement
  root: ReturnType<typeof createRoot>
  node: GraphNode
  registryEntry: WidgetRegistryEntry | null
  patched: Array<Record<string, unknown>>
  restoreGlobals: () => void
}

type EditableFieldSpec = {
  fieldKey: string
  fieldType: string
  schemaPath: string
}

type EditableControlWindow = Window & {
  HTMLInputElement: typeof HTMLInputElement
  HTMLTextAreaElement: typeof HTMLTextAreaElement
  HTMLElement: typeof HTMLElement
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(entry => String(entry || '').trim()).filter(Boolean)
    : []

function installDomGlobals(dom: JSDOM): () => void {
  const g = globalThis as typeof globalThis & DomGlobalSnapshot
  const prev: DomGlobalSnapshot = {
    window: g.window,
    document: g.document,
    Event: g.Event,
    InputEvent: g.InputEvent,
    Node: g.Node,
    Element: g.Element,
    Text: g.Text,
    HTMLElement: g.HTMLElement,
    HTMLInputElement: g.HTMLInputElement,
    HTMLTextAreaElement: g.HTMLTextAreaElement,
    IS_REACT_ACT_ENVIRONMENT: g.IS_REACT_ACT_ENVIRONMENT,
  }
  g.window = dom.window as unknown as Window & typeof globalThis
  g.document = dom.window.document
  g.Event = dom.window.Event as typeof Event
  g.InputEvent = dom.window.InputEvent as typeof InputEvent
  g.Node = dom.window.Node as typeof Node
  g.Element = dom.window.Element as typeof Element
  g.Text = dom.window.Text as typeof Text
  g.HTMLElement = dom.window.HTMLElement as typeof HTMLElement
  g.HTMLInputElement = dom.window.HTMLInputElement as typeof HTMLInputElement
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement as typeof HTMLTextAreaElement
  g.IS_REACT_ACT_ENVIRONMENT = true
  const patchLegacyInputEventMethods = (proto: Record<string, unknown> | undefined) => {
    if (!proto) return
    if (typeof proto.attachEvent !== 'function') proto.attachEvent = () => void 0
    if (typeof proto.detachEvent !== 'function') proto.detachEvent = () => void 0
  }
  patchLegacyInputEventMethods((dom.window.Element as unknown as { prototype?: Record<string, unknown> }).prototype)
  patchLegacyInputEventMethods((dom.window.HTMLElement as unknown as { prototype?: Record<string, unknown> }).prototype)
  patchLegacyInputEventMethods((dom.window as unknown as { HTMLInputElement?: { prototype?: Record<string, unknown> } }).HTMLInputElement?.prototype)
  patchLegacyInputEventMethods((dom.window as unknown as { HTMLTextAreaElement?: { prototype?: Record<string, unknown> } }).HTMLTextAreaElement?.prototype)
  patchLegacyInputEventMethods((dom.window as unknown as { HTMLSelectElement?: { prototype?: Record<string, unknown> } }).HTMLSelectElement?.prototype)
  return () => {
    Object.entries(prev).forEach(([key, value]) => {
      if (typeof value === 'undefined') delete (g as Record<string, unknown>)[key]
      else (g as Record<string, unknown>)[key] = value
    })
  }
}

function readAgenticGraphPublishedDocsFixturePath(): string {
  const envPath = String(process.env.AG_TEST_TOKEN_ECONOMICS_FLOW_FIXTURE_PATH || '').trim()
  if (envPath) return envPath
  const siblingDocsPath = path.resolve(process.cwd(), '..', 'huijoohwee', 'docs', TOKEN_ECONOMICS_FIXTURE_BASENAME)
  if (fs.existsSync(siblingDocsPath)) return siblingDocsPath
  return resolveDocsSsotFixturePath(TOKEN_ECONOMICS_FIXTURE_BASENAME)
}

function parseAgenticGraphTokenEconomicsFixture(): GraphData {
  const fixturePath = readAgenticGraphPublishedDocsFixturePath()
  const markdown = fs.readFileSync(fixturePath, 'utf8')
  const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(fixturePath), markdown)
  if (!parsed) throw new Error('expected token-economics frontmatter flow fixture to parse')
  if (String(parsed.graphData.context || '') !== 'frontmatter-flow') {
    throw new Error('expected token-economics fixture to parse as frontmatter-flow')
  }
  return parsed.graphData
}

function readWidgetRegistry(graphData: GraphData): WidgetRegistryEntry[] {
  const metadata = isRecord(graphData.metadata) ? graphData.metadata : {}
  const raw = metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('expected token-economics fixture to expose widget registry metadata')
  }
  return raw as WidgetRegistryEntry[]
}

function readFrontmatterPortKeys(node: GraphNode): string[] {
  const props = isRecord(node.properties) ? node.properties : {}
  const handles = isRecord(props[FRONTMATTER_FLOW_HANDLES_VALUE_KEY])
    ? props[FRONTMATTER_FLOW_HANDLES_VALUE_KEY]
    : {}
  return [...readStrings(handles.target), ...readStrings(handles.source)]
}

function readEditableFieldSpecs(node: GraphNode): EditableFieldSpec[] {
  const props = isRecord(node.properties) ? node.properties : {}
  const specs = Array.isArray(props[FRONTMATTER_FLOW_WIDGET_FIELDS_KEY])
    ? props[FRONTMATTER_FLOW_WIDGET_FIELDS_KEY]
    : []
  return specs
    .map(spec => {
      if (!isRecord(spec)) return null
      const fieldKey = String(spec.fieldKey || '').trim()
      const fieldType = String(spec.fieldType || '').trim().toLowerCase()
      const schemaPath = normalizeWidgetFieldSchemaPath(spec.schemaPath, fieldKey)
      return fieldKey && schemaPath ? { fieldKey, fieldType, schemaPath } : null
    })
    .filter((spec): spec is EditableFieldSpec => Boolean(spec))
    .filter(spec => !['id', 'type', 'label', 'position', 'size', 'handles', 'tags'].includes(spec.fieldKey))
}

function pickRenderableWidgetNode(graphData: GraphData): GraphNode {
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  const found = nodes.find(node => (
    readFrontmatterPortKeys(node).length > 1
    && readEditableFieldSpecs(node).some(spec => spec.fieldType === 'string' || spec.fieldType === 'textarea')
    && String((node.properties as Record<string, unknown> | undefined)?.[FLOW_WIDGET_FORM_ID_KEY] || '').trim()
  ))
  if (!found) throw new Error('expected token-economics fixture to include renderable frontmatter widget nodes')
  return found
}

function readNodeById(graphData: GraphData, nodeId: string): GraphNode {
  const id = String(nodeId || '').trim()
  const node = (Array.isArray(graphData.nodes) ? graphData.nodes : [])
    .find(entry => String(entry.id || '').trim() === id)
  if (!node) throw new Error(`expected token-economics fixture to include node ${id}`)
  return node
}

async function renderParsedTokenEconomicsNode(graphData: GraphData, nodeId?: string): Promise<RenderedNode> {
  const registryEntries = readWidgetRegistry(graphData)
  const node = nodeId ? readNodeById(graphData, nodeId) : pickRenderableWidgetNode(graphData)
  const registryEntry = resolveWidgetRegistryEntry({
    node,
    registry: registryEntries,
    graphMetaKind: 'frontmatter-flow',
  })
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const restoreGlobals = installDomGlobals(dom)
  const host = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  const patched: Array<Record<string, unknown>> = []
  await act(async () => {
    root.render(
      React.createElement(WidgetEditorForm, {
        active: true,
        node,
        graphMetaKind: 'frontmatter-flow',
        edges: graphData.edges,
        schema: defaultSchema,
        hideFields: false,
        labelInputRef: { current: null },
        onSetLabel: () => void 0,
        onSetType: () => void 0,
        onPatchProperties: () => void 0,
        onSetProperties: next => patched.push(next),
        onValidate: () => void 0,
        registryEntry,
        registryEntries,
      }),
    )
  })
  return { dom, host, root, node, registryEntry, patched, restoreGlobals }
}

function withPatchedNodeProperties(graphData: GraphData, nodeId: string, properties: Record<string, unknown>): GraphData {
  const id = String(nodeId || '').trim()
  return {
    ...graphData,
    nodes: (Array.isArray(graphData.nodes) ? graphData.nodes : []).map(node => (
      String(node.id || '').trim() === id
        ? { ...node, properties: { ...properties } as never }
        : node
    )),
  }
}

function computeRichMediaPanelPreviewSrcDoc(graphData: GraphData, panelNodeId: string): string {
  const registry = readWidgetRegistry(graphData)
  const panelNode = readNodeById(graphData, panelNodeId)
  if (String(panelNode.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
    throw new Error(`expected ${panelNodeId} to be a Rich Media Panel`)
  }
  const connectedByNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry,
    targetNodeIds: new Set([panelNodeId]),
  })
  const connectedValuesBySchemaPath = connectedByNodeId.get(panelNodeId)
  const panel = buildRichMediaPanelOverlayState({
    node: panelNode,
    connectedValuesBySchemaPath,
  })
  if (!panel) throw new Error(`expected Rich Media Panel overlay state for ${panelNodeId}`)
  const preview = buildRichMediaPanelPreviewSpec({
    node: panelNode,
    connectedValuesBySchemaPath,
    panel,
  })
  const srcDoc = String(preview?.kind === 'iframe' ? preview.srcDoc || '' : '')
  if (!srcDoc.trim()) throw new Error(`expected Rich Media Panel preview srcdoc for ${panelNodeId}`)
  return srcDoc
}

function readGrossKpi(srcDoc: string): string {
  return String(srcDoc || '').match(/Gross \$([^<]+)\/mo/)?.[1] || ''
}

function assertSemanticPortHandles(rendered: RenderedNode) {
  const portKeys = readFrontmatterPortKeys(rendered.node)
  if (portKeys.length === 0) throw new Error('expected token-economics widget to declare semantic port handles')
  const missing = portKeys.filter(portKey => (
    !rendered.host.querySelector(`button[data-kg-port-handle="1"][data-kg-port-key="${portKey}"]`)
  ))
  if (missing.length > 0) {
    throw new Error(`expected token-economics widget to render semantic port handles: ${missing.join(', ')}`)
  }
  const generic = rendered.host.querySelector(
    'button[data-kg-port-key="handles.source"], button[data-kg-port-key="handles.target"]',
  )
  if (generic) throw new Error('expected token-economics widget to avoid generic handles.source/handles.target ports')
}

function assertPortKtvKeyLabel(rendered: RenderedNode, portKey: string) {
  const rows = (Array.from(rendered.host.querySelectorAll('tr')) as HTMLTableRowElement[])
    .filter(row => row.querySelector(`button[data-kg-port-handle="1"][data-kg-port-key="${portKey}"]`))
  if (rows.length === 0) throw new Error(`expected ${portKey} KTV port rows to render`)
  const labels = rows
    .map(row => String((row.querySelector('td:nth-child(2) label') as HTMLLabelElement | null)?.textContent || '').trim())
    .filter(Boolean)
  const suffixed = labels.filter(label => label === `${portKey} out port` || label === `${portKey} in port`)
  if (suffixed.length > 0) {
    throw new Error(`expected ${portKey} KTV port row key to stay consolidated, got ${JSON.stringify(labels)}`)
  }
  if (!labels.includes(portKey)) {
    throw new Error(`expected at least one ${portKey} KTV port row key to equal the semantic key, got ${JSON.stringify(labels)}`)
  }
}

function assertMergedEditablePortKtvRow(rendered: RenderedNode, portKey: string, dir: 'in' | 'out') {
  const rows = (Array.from(rendered.host.querySelectorAll('tr')) as HTMLTableRowElement[])
    .filter(row => String((row.querySelector('td:nth-child(2) label') as HTMLLabelElement | null)?.textContent || '').trim() === portKey)
  if (rows.length !== 1) {
    throw new Error(`expected ${portKey} to render as one consolidated KTV row, got ${rows.length}`)
  }
  const row = rows[0]
  const control = row.querySelector('[data-kg-card-inline-edit="1"]') as HTMLElement | null
  if (!control) throw new Error(`expected ${portKey} consolidated row to keep inline-editable Value control`)
  const portButton = row.querySelector(`button[data-kg-port-handle="1"][data-kg-port-dir="${dir}"][data-kg-port-key="${portKey}"]`)
  if (!portButton) throw new Error(`expected ${portKey} consolidated row to keep functional ${dir} port handle`)
  const readOnlyDuplicate = row.querySelector('input[disabled][readonly]')
  if (readOnlyDuplicate) throw new Error(`expected ${portKey} consolidated row to avoid read-only duplicate Value control`)
}

async function openSharedInlineValueControl(
  rendered: RenderedNode,
  control: Element,
): Promise<HTMLInputElement | HTMLTextAreaElement> {
  const win = rendered.dom.window as unknown as EditableControlWindow
  if (
    control instanceof win.HTMLInputElement
    || control instanceof win.HTMLTextAreaElement
  ) {
    return control as HTMLInputElement | HTMLTextAreaElement
  }
  if (
    !(control instanceof win.HTMLElement)
    || control.getAttribute('data-kg-card-inline-edit') !== '1'
  ) {
    throw new Error(`expected ${control.id || control.textContent || ''} to bind to the shared inline Value editor`)
  }
  await act(async () => {
    control.dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  const next = rendered.dom.window.document.getElementById(control.id)
  if (
    !(next instanceof win.HTMLInputElement)
    && !(next instanceof win.HTMLTextAreaElement)
  ) {
    throw new Error(`expected shared inline Value editor ${control.id || ''} to open an editable input`)
  }
  return next as HTMLInputElement | HTMLTextAreaElement
}

async function commitSharedInlineValueControl(
  rendered: RenderedNode,
  control: Element,
  value: string,
) {
  const win = rendered.dom.window as unknown as EditableControlWindow
  const editable = await openSharedInlineValueControl(rendered, control)
  if (editable.disabled || editable.readOnly) {
    throw new Error(`expected ${editable.id || ''} Value control to be editable`)
  }
  const setter = Object.getOwnPropertyDescriptor(
    editable instanceof win.HTMLTextAreaElement
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype,
    'value',
  )?.set
  if (!setter) throw new Error('expected DOM Value control setter')
  await act(async () => {
    setter.call(editable, value)
    Simulate.change(editable)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  const changedEditable = rendered.dom.window.document.getElementById(editable.id)
  if (
    !(changedEditable instanceof win.HTMLInputElement)
    && !(changedEditable instanceof win.HTMLTextAreaElement)
  ) {
    throw new Error(`expected shared inline Value editor ${editable.id || ''} to stay open after change`)
  }
  await act(async () => {
    Simulate.keyDown(changedEditable, {
      key: 'Enter',
      metaKey: changedEditable instanceof win.HTMLTextAreaElement,
    })
  })
}

async function assertEditableWidgetValues(rendered: RenderedNode) {
  const spec = readEditableFieldSpecs(rendered.node).find(entry => (
    entry.fieldType === 'string' || entry.fieldType === 'textarea'
  ))
  if (!spec) throw new Error('expected token-economics widget to expose editable string field values')
  const label = Array.from(rendered.host.querySelectorAll('label')).find(entry => {
    if (String(entry.textContent || '').trim() !== spec.fieldKey) return false
    const controlId = String(entry.getAttribute('for') || '').trim()
    const control = controlId ? rendered.dom.window.document.getElementById(controlId) : null
    return control?.getAttribute('data-kg-card-inline-edit') === '1'
  })
  if (!label) throw new Error(`expected editable field label ${spec.fieldKey} to bind to the shared inline Value editor`)
  const controlId = String(label.getAttribute('for') || '').trim()
  const control = controlId ? rendered.dom.window.document.getElementById(controlId) : null
  if (!control) throw new Error(`expected editable field ${spec.fieldKey} to bind to a shared KTV Value control`)
  if (control.getAttribute('data-kg-card-inline-edit') !== '1') {
    throw new Error(`expected editable field ${spec.fieldKey} to reuse CardInlineTextEditor`)
  }
  await commitSharedInlineValueControl(rendered, control, 'token-economics-render-edit')
  if (!rendered.patched.some(entry => readRecordPathValue(entry, spec.schemaPath) === 'token-economics-render-edit')) {
    throw new Error(`expected editing ${spec.fieldKey} to patch widget properties at ${spec.schemaPath}`)
  }
}

export const testTokenEconomicsFrontmatterWidgetsRenderSemanticPortHandlesAndEditableValues = async () => {
  const graphData = parseAgenticGraphTokenEconomicsFixture()
  const rendered = await renderParsedTokenEconomicsNode(graphData)
  try {
    assertSemanticPortHandles(rendered)
    await assertEditableWidgetValues(rendered)
  } finally {
    await act(async () => {
      rendered.root.unmount()
    })
    rendered.restoreGlobals()
    rendered.dom.window.close()
  }
}

export const testTokenEconomicsWidgetValueEditRecomputesRichMediaPanelPreview = async () => {
  const graphData = parseAgenticGraphTokenEconomicsFixture()
  const rendered = await renderParsedTokenEconomicsNode(graphData, 'revenue_drivers')
  try {
    assertPortKtvKeyLabel(rendered, 'paid_conversion_rate')
    assertMergedEditablePortKtvRow(rendered, 'agent_token_take_rate', 'out')
    const beforeSrcDoc = computeRichMediaPanelPreviewSrcDoc(graphData, 'tco_chart_panel')
    const beforeGross = readGrossKpi(beforeSrcDoc)
    if (!beforeGross) throw new Error('expected token-economics TCO panel preview to expose a gross revenue KPI')

    const label = Array.from(rendered.host.querySelectorAll('label')).find(entry => {
      if (String(entry.textContent || '').trim() !== 'monthly_active_users') return false
      const candidateId = String(entry.getAttribute('for') || '').trim()
      const candidate = candidateId ? rendered.dom.window.document.getElementById(candidateId) : null
      return candidate?.getAttribute('data-kg-card-inline-edit') === '1'
    })
    if (!label) throw new Error('expected editable monthly_active_users value row to bind to the shared inline Value editor')
    const controlId = String(label.getAttribute('for') || '').trim()
    const control = controlId ? rendered.dom.window.document.getElementById(controlId) : null
    if (!control) throw new Error('expected monthly_active_users Value cell to bind to an editable shared Value control')
    if (control.getAttribute('data-kg-card-inline-edit') !== '1') {
      throw new Error('expected monthly_active_users Value cell to reuse CardInlineTextEditor')
    }
    await commitSharedInlineValueControl(rendered, control, '9999')
    const patched = rendered.patched[rendered.patched.length - 1]
    if (!patched) throw new Error('expected editing monthly_active_users to emit patched widget properties')
    if (readRecordPathValue(patched, 'monthly_active_users') !== 9999) {
      throw new Error(`expected monthly_active_users edit to patch a numeric root property, got ${JSON.stringify(patched)}`)
    }

    const editedGraphData = withPatchedNodeProperties(graphData, 'revenue_drivers', patched)
    const afterSrcDoc = computeRichMediaPanelPreviewSrcDoc(editedGraphData, 'tco_chart_panel')
    const afterGross = readGrossKpi(afterSrcDoc)
    if (!afterGross) throw new Error('expected edited token-economics TCO panel preview to expose a gross revenue KPI')
    if (afterSrcDoc === beforeSrcDoc || afterGross === beforeGross) {
      throw new Error(`expected Value edit to recompute Rich Media Panel output, before=${beforeGross}, after=${afterGross}`)
    }
  } finally {
    await act(async () => {
      rendered.root.unmount()
    })
    rendered.restoreGlobals()
    rendered.dom.window.close()
  }
}
