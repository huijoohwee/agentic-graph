import fs from 'node:fs'
import path from 'node:path'

import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildAndSetFlowNativeScene } from '@/components/FlowCanvas/buildNativeScene'
import { readFlowConfig } from '@/components/FlowCanvas/config'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY, resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { KG_SUBGRAPHS_KEY } from '@/lib/graph/subgraphs'
import { buildCanonicalWidgetRegistryDraft, getWidgetRegistryEntryLabel, resolveWidgetRegistryApiDocRef } from '@/features/storyboard-widget-manager/registryTemplates'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { FRONTMATTER_FLOW_WIDGET_FIELDS_KEY } from '@/features/parsers/markdownFrontmatterFlowGraph.flowBlock'
import { resolveDocsSsotFixturePath } from '@/tests/lib/docsSsotFixture'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'

export function testMarkdownFrontmatterFlowGraphImportsNodesEdgesAndRegistry() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-001',
    'nodes:',
    '  - id: NODE_A',
    '    type: Source',
    '    label: "A"',
    '    category: source',
    '    pos: { x: 40, y: 80 }',
    '    inputs: []',
    '    outputs:',
    '      - port: out_1',
    '        type: STRING',
    '  - id: NODE_B',
    '    type: Sink',
    '    label: "B"',
    '    category: output',
    '    pos: { x: 240, y: 80 }',
    '    visual: { zIndex: 9, opacity: 0.5, width: 420, height: 180 }',
    '    inputs:',
    '      - port: in_1',
    '        type: STRING',
    '        from: NODE_A.out_1',
    '    outputs: []',
    'connections:',
    '  - { id: e01, from_node: NODE_A, from_port: out_1, to_node: NODE_B, to_port: in_1, type: STRING }',
    'socket_types:',
    '  STRING: { color: "#AED6F1", accepts: [STRING] }',
    '---',
    '',
    '# Demo',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if ((res.warnings || []).length !== 0) throw new Error(`expected no warnings, got: ${(res.warnings || []).join('; ')}`)
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  if (g.nodes.length !== 2) throw new Error(`expected 2 nodes, got ${g.nodes.length}`)
  if (g.edges.length !== 1) throw new Error(`expected 1 edge, got ${g.edges.length}`)

  const a = g.nodes.find(n => n.id === 'NODE_A')
  const b = g.nodes.find(n => n.id === 'NODE_B')
  if (!a || !b) throw new Error('expected NODE_A and NODE_B')
  if (a.x !== 40 || a.y !== 80) throw new Error('expected NODE_A x/y from pos')
  if (b.x !== 240 || b.y !== 80) throw new Error('expected NODE_B x/y from pos')
  if ((a.properties as Record<string, unknown>)['visual:layer'] !== 'source') throw new Error('expected source visual:layer=source')
  if ((b.properties as Record<string, unknown>)['visual:layer'] !== 'output') throw new Error('expected output visual:layer=output')
  if ((a.properties as Record<string, unknown>)['visual:depth'] !== 0) throw new Error('expected source visual:depth=0')
  if ((b.properties as Record<string, unknown>)['visual:depth'] !== 7) throw new Error('expected output visual:depth=7')
  if ((b.properties as Record<string, unknown>)['visual:zIndex'] !== 9) throw new Error('expected visual:zIndex override')
  if ((b.properties as Record<string, unknown>)['visual:opacity'] !== 0.5) throw new Error('expected visual:opacity override')
  if ((b.properties as Record<string, unknown>)['visual:width'] !== 420) throw new Error('expected visual:width override')
  if ((b.properties as Record<string, unknown>)['visual:height'] !== 180) throw new Error('expected visual:height override')
  const portTypes = (b.properties as Record<string, unknown>)['flow:portTypes'] as unknown
  if (!portTypes || typeof portTypes !== 'object') throw new Error('expected flow:portTypes on node')

  const e = g.edges[0]
  const props = (e.properties || {}) as Record<string, unknown>
  if (props[FLOW_EDGE_SOURCE_PORT_KEY] !== 'out_1') throw new Error('expected flow:sourcePortKey=out_1')
  if (props[FLOW_EDGE_TARGET_PORT_KEY] !== 'in_1') throw new Error('expected flow:targetPortKey=in_1')

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (!Array.isArray(registry) || registry.length < 2) throw new Error('expected widget registry entries')

  const socketTypes = meta.socketTypes
  if (!socketTypes || typeof socketTypes !== 'object') throw new Error('expected socketTypes metadata')

  const subgraphs = meta[KG_SUBGRAPHS_KEY]
  if (typeof subgraphs !== 'undefined') throw new Error('expected no synthetic fallback subgraphs when frontmatter did not declare them')
}

export function testMarkdownFlowBlockInBodyParsesNodesEdgesAndWidgetFields() {
  const md = [
    '# Title',
    '',
    'flow:',
    '  direction:  {key: direction,  type: string,  value: LR}',
    '  edgeType:   {key: edgeType,   type: string,  value: smoothstep}',
    '  nodes:',
    '    - id:      {key: id,      type: string,   value: "n-canvas"}',
    '      type:    {key: type,    type: string,   value: "input"}',
    '      label:   {key: label,   type: string,   value: "Canvas"}',
    '      handles: {key: handles, type: object,   value: {source: [signal]}}',
    '      data:    {key: data,    type: object,   value: {pain: "x"}}',
    '      compute: {key: compute, type: function, value: |',
    '        (inputs) => ({ signal: inputs.x ?? null })',
    '      }',
    '    - id:      {key: id,      type: string,   value: "n-pack"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      label:   {key: label,   type: string,   value: "Pack"}',
    '      handles: {key: handles, type: object,   value: {target: [signal]}}',
    '      compute: {key: compute, type: function, value: |',
    '        (inputs) => ({})',
    '      }',
    '  edges:',
    '    - { id: e1, source: n-canvas, sourceHandle: signal, target: n-pack, targetHandle: signal, animated: true }',
    '---',
    '',
    '## Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-ai-pipeline-prd-tad.md', md)
  if (!res) throw new Error('expected a flow graph parse result from markdown body')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  if (g.nodes.length !== 2) throw new Error(`expected 2 nodes, got ${g.nodes.length}`)
  if (g.edges.length !== 1) throw new Error(`expected 1 edge, got ${g.edges.length}`)

  const canvas = g.nodes.find(n => n.id === 'n-canvas')
  if (!canvas) throw new Error('expected node n-canvas')
  const canvasProps = (canvas.properties || {}) as Record<string, unknown>
  const handlesValue = canvasProps['frontmatter:handles']
  if (!handlesValue || typeof handlesValue !== 'object') throw new Error('expected frontmatter:handles to be preserved for widget')
  if (!canvasProps.data || typeof canvasProps.data !== 'object') throw new Error('expected data property for widget')
  if (typeof canvasProps['flow:compute'] !== 'string') throw new Error('expected flow:compute property for widget')

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (!Array.isArray(registry) || registry.length < 2) throw new Error('expected widget registry entries')
  const canvasEntry = registry.find(e => String((e as { formId?: unknown })?.formId || '').trim() === 'fm:n-canvas') as
    | { fields?: unknown[] }
    | undefined
  if (!canvasEntry) throw new Error('expected registry entry for fm:n-canvas')
  const fields = Array.isArray(canvasEntry.fields) ? canvasEntry.fields : []
  const fieldKeys = fields.map(f => String((f as { fieldKey?: unknown })?.fieldKey || '')).filter(Boolean)
  if (!fieldKeys.includes('handles')) throw new Error('expected handles widget field from envelope')
  if (!fieldKeys.includes('data')) throw new Error('expected data widget field from envelope')
  if (!fieldKeys.includes('compute')) throw new Error('expected compute widget field from envelope')

  const e1 = g.edges.find(e => String(e.id || '') === 'e1')
  if (!e1) throw new Error('expected edge e1')
  const e1Props = (e1.properties || {}) as Record<string, unknown>
  if (e1Props[FLOW_EDGE_SOURCE_PORT_KEY] !== 'signal') throw new Error('expected e1 source port signal')
  if (e1Props[FLOW_EDGE_TARGET_PORT_KEY] !== 'signal') throw new Error('expected e1 target port signal')
}

export function testMarkdownFrontmatterFlowGraphParsesInlineEnvelopeBlockScalarBraceOnLastLine() {
  const md = [
    '---',
    'title: x',
    'flow:',
    '  nodes:',
    '    - id:      {key: id,      type: string, value: "n-canvas"}',
    '      type:    {key: type,    type: string, value: "input"}',
    '      label:   {key: label,   type: string, value: "Canvas"}',
    '      handles: {key: handles, type: object, value: {source: [signal]}}',
    '      compute: {key: compute, type: function, value: |',
    '        (inputs) => ({ ok: true })}',
    '  edges: []',
    '---',
    '',
    '# body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('inline-envelope-brace.md', md)
  if (!res) throw new Error('expected parse result')
  if (res.graphData.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  const node = res.graphData.nodes.find(n => n.id === 'n-canvas')
  if (!node) throw new Error('expected node')
  const props = (node.properties || {}) as Record<string, unknown>
  if (typeof props['flow:compute'] !== 'string') throw new Error('expected flow:compute string')
  if (String(props['flow:compute']).includes('})}')) throw new Error('expected trailing brace to be repaired out of compute')
}

export function testMarkdownFrontmatterFlowGraphParsesNoSpaceEnvelopeObjectKeysForWidgetVisibility() {
  const md = [
    '---',
    'flow:',
    '  nodes:',
    '    - id:           {key: id,           type: string,  value: "n-canvas"}',
    '      type:         {key: type,         type: string,  value: "input"}',
    '      label:        {key: label,        type: string,  value: "S01"}',
    '      phase:        {key: phase,        type: string,  value: "emit"}',
    '      actor:        {key: actor,        type: array,   value: ["{{subject}}","system"]}',
    '      handles:      {key: handles,      type: object,  value: {source: [signal]}}',
    '      applies_rules:{key: applies_rules,type: array,   value: []}',
    '      db_writes:    {key: db_writes,    type: string,  value: "flow_nodes"}',
    '      retry_arc:    {key: retry_arc,    type: string,  value: "—"}',
    '      confidence:   {key: confidence,   type: string,  value: "high"}',
    '      status:       {key: status,       type: string,  value: "TBD"}',
    '      kanban:       {key: kanban,       type: string,  value: "done"}',
    '      compute:      {key: compute,      type: function, value: |',
    '        (inputs) => ({ signal: inputs.x ?? null })',
    '      }',
    '    - id:           {key: id,           type: string,  value: "n-pack"}',
    '      type:         {key: type,         type: string,  value: "default"}',
    '      label:        {key: label,        type: string,  value: "S02"}',
    '      phase:        {key: phase,        type: string,  value: "pack"}',
    '      actor:        {key: actor,        type: array,   value: ["system"]}',
    '      handles:      {key: handles,      type: object,  value: {target: [signal], source: [context]}}',
    '      applies_rules:{key: applies_rules,type: array,   value: []}',
    '      db_writes:    {key: db_writes,    type: string,  value: "flow_nodes"}',
    '      retry_arc:    {key: retry_arc,    type: string,  value: "—"}',
    '      confidence:   {key: confidence,   type: string,  value: "high"}',
    '      status:       {key: status,       type: string,  value: "TBD"}',
    '      kanban:       {key: kanban,       type: string,  value: "done"}',
    '      compute:      {key: compute,      type: function, value: |',
    '        (inputs) => ({ context: inputs.signal ?? null })',
    '      }',
    '  edges:',
    '    - {id: e1, source: n-canvas, sourceHandle: signal, target: n-pack, targetHandle: signal}',
    '---',
    '',
    '# body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-no-space-envelope.md', md)
  if (!res) throw new Error('expected parse result for no-space envelope keys')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  if ((g.nodes || []).length !== 2) throw new Error(`expected 2 nodes, got ${(g.nodes || []).length}`)
  if ((g.edges || []).length !== 1) throw new Error(`expected 1 edge, got ${(g.edges || []).length}`)

  const nodeIds = new Set((g.nodes || []).map(n => String(n.id || '').trim()).filter(Boolean))
  if (!nodeIds.has('n-canvas') || !nodeIds.has('n-pack')) {
    throw new Error(`expected parsed node ids n-canvas,n-pack, got ${Array.from(nodeIds).join(',')}`)
  }

  const widgetForms = (g.nodes || [])
    .map(n => String(((n.properties || {}) as Record<string, unknown>)['flow:widgetFormId'] || '').trim())
    .filter(Boolean)
    .sort()
  if (widgetForms.join(',') !== 'fm:n-canvas,fm:n-pack') {
    throw new Error(`expected node-scoped widget forms, got ${widgetForms.join(',')}`)
  }

  const canvasNode = (g.nodes || []).find(n => String(n.id || '').trim() === 'n-canvas')
  if (!canvasNode) throw new Error('expected n-canvas node')
  const canvasProps = (canvasNode.properties || {}) as Record<string, unknown>
  if (String(canvasProps.phase || '') !== 'emit') throw new Error('expected declared phase to persist in node properties')
  const actor = canvasProps.actor
  if (!Array.isArray(actor) || actor.length !== 2) throw new Error('expected declared actor array to persist in node properties')
  const appliesRules = canvasProps.applies_rules
  if (!Array.isArray(appliesRules)) throw new Error('expected declared applies_rules to persist in node properties')
  if (String(canvasProps.db_writes || '') !== 'flow_nodes') throw new Error('expected declared db_writes to persist in node properties')
  if (String(canvasProps.retry_arc || '') !== '—') throw new Error('expected declared retry_arc to persist in node properties')
  if (String(canvasProps.confidence || '') !== 'high') throw new Error('expected declared confidence to persist in node properties')
  if (String(canvasProps.status || '') !== 'TBD') throw new Error('expected declared status to persist in node properties')
  if (String(canvasProps.kanban || '') !== 'done') throw new Error('expected declared kanban to persist in node properties')
}

export function testMarkdownFrontmatterFlowGraphWarnsOnMalformedTypedEnvelopeWrappers() {
  const md = [
    '---',
    'flow:',
    '  direction: {key: wrongDirection, type: string, value: "TB"}',
    '  edgeType: {key: edgeType, value: "smoothstep"}',
    '  nodes:',
    '    - id: {key: nodeId, type: string, value: "bad-node"}',
    '      type: {key: type, type: string, value: "input"}',
    '      label: {key: label, type: string, value: "Bad Node"}',
    '      summary: {key: summary, type: "", value: "Broken wrapper metadata should warn"}',
    '    - id: {key: id, type: string, value: "good-node"}',
    '      type: {key: type, type: string, value: "default"}',
    '      label: {key: label, type: string, value: "Good Node"}',
    '  edges: []',
    '---',
    '',
    '# body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-malformed-envelope.md', md)
  if (!res) throw new Error('expected parse result for malformed envelope wrappers')
  const warningBlob = res.warnings.join(' | ')
  if (!warningBlob.includes('Flow typed envelope malformed at flow.direction: expected key "direction" but found "wrongDirection"')) {
    throw new Error(`expected direction key mismatch warning, got: ${warningBlob}`)
  }
  if (!warningBlob.includes('Flow typed envelope malformed at flow.edgeType: expected exact { key, type, value } wrapper')) {
    throw new Error(`expected edgeType wrapper shape warning, got: ${warningBlob}`)
  }
  if (!warningBlob.includes('Flow typed envelope malformed at flow.nodes[0].id: expected key "id" but found "nodeId"')) {
    throw new Error(`expected node id key mismatch warning, got: ${warningBlob}`)
  }
  if (!warningBlob.includes('Flow typed envelope malformed at flow.nodes[0].summary: wrapper type must be a non-empty string')) {
    throw new Error(`expected node summary type warning, got: ${warningBlob}`)
  }
  const node = res.graphData.nodes.find(n => String(n.label || '') === 'Bad Node')
  if (node) throw new Error('expected malformed wrapped node id to stay unparsed so the node is skipped instead of silently unwrapping')
}

export function testMarkdownFrontmatterFlowGraphMatchesVideoScriptTemplateEdgeIdsAndPorts() {
  const md = [
    '---',
    'meta:',
    '  id: video-script-template-like-001',
    'nodes:',
    '  - id: WIDGET_04',
    '    type: TextOverlay',
    '    category: overlay',
    '    pos: { x: 1020, y: 560 }',
    '    params:',
    '      text: "{{overlays.overlay_04.text}}"',
    '    inputs:',
    '      - port: clip_in',
    '        type: VIDEO_CLIP',
    '        from: NODE_CLIP_04.clip_out',
    '    outputs:',
    '      - port: composed_out',
    '        type: VIDEO_CLIP',
    '  - id: NODE_SEQUENCE',
    '    type: SequenceAssembler',
    '    category: assemble',
    '    pos: { x: 1340, y: 440 }',
    '    inputs:',
    '      - port: clip_04_in',
    '        type: VIDEO_CLIP',
    '        from: WIDGET_04.composed_out',
    '    outputs:',
    '      - port: sequence_out',
    '        type: VIDEO_SEQUENCE',
    'connections:',
    '  - id: e42',
    '    from: WIDGET_04.composed_out',
    '    to: NODE_SEQUENCE.clip_04_in',
    '    type: VIDEO_CLIP',
    'socket_types:',
    '  VIDEO_CLIP: { color: "#5DADE2", accepts: [VIDEO_CLIP] }',
    '  VIDEO_SEQUENCE: { color: "#1A5276", accepts: [VIDEO_SEQUENCE] }',
    '---',
    '',
    '## Beat 04',
    '',
    '| Edge | From port | To port | Type |',
    '|---|---|---|---|',
    '| e42 | `WIDGET_04.composed_out` | `NODE_SEQUENCE.clip_04_in` | `VIDEO_CLIP` |',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('video-script-template.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  const g = res.graphData
  const e42 = g.edges.find(e => String(e.id || '') === 'e42') || null
  if (!e42) throw new Error('expected edge id=e42')
  const e42Props = (e42.properties || {}) as Record<string, unknown>
  if (e42Props[FLOW_EDGE_SOURCE_PORT_KEY] !== 'composed_out') throw new Error('expected e42 source port composed_out')
  if (e42Props[FLOW_EDGE_TARGET_PORT_KEY] !== 'clip_04_in') throw new Error('expected e42 target port clip_04_in')

  const overlay = g.nodes.find(n => n.id === 'WIDGET_04') || null
  if (!overlay) throw new Error('expected WIDGET_04')
  const overlayProps = (overlay.properties || {}) as Record<string, unknown>
  const params = overlayProps.params
  if (!params || typeof params !== 'object') throw new Error('expected node params payload for widget fidelity')
  const portTypes = overlayProps['flow:portTypes']
  if (!portTypes || typeof portTypes !== 'object') throw new Error('expected flow:portTypes for port handle fidelity')

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (!Array.isArray(registry) || registry.length < 2) throw new Error('expected widget registry entries')
  const socketTypes = meta.socketTypes
  if (!socketTypes || typeof socketTypes !== 'object') throw new Error('expected socketTypes metadata')
}

export function testMarkdownFlowBlockPreservesFlowWidgetNodeTypesAndFormIds() {
  const md = [
    '# Title',
    '',
    'flow:',
    '  direction:  {key: direction,  type: string,  value: LR}',
    '  edgeType:   {key: edgeType,   type: string,  value: smoothstep}',
    '  nodes:',
    '    - id:      {key: id,      type: string,  value: "n-text"}',
    '      type:    {key: type,    type: string,  value: "TextGeneration"}',
    '      label:   {key: label,   type: string,  value: "OpenAI Text Widget"}',
    '      handles: {key: handles, type: object,  value: {target: ["prompt_in"], source: ["text_out"]}}',
    '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "textGeneration.openai"}',
    '      chatProvider: {key: chatProvider, type: string, value: "openai"}',
    '      chatModel: {key: chatModel, type: string, value: "gpt-5-nano"}',
    '      prompt: {key: prompt, type: string, value: "hello"}',
    '    - id:      {key: id,      type: string,  value: "n-panel"}',
    '      type:    {key: type,    type: string,  value: "RichMediaPanel"}',
    '      label:   {key: label,   type: string,  value: "Rich Media Panel"}',
    '      handles: {key: handles, type: object,  value: {target: ["output"], source: []}}',
    '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "richMediaPanel"}',
    '  edges:',
    '    - { id: e1, source: n-text, sourceHandle: text_out, target: n-panel, targetHandle: output, animated: true }',
    '---',
    '',
    '## Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('flow-widget-types.md', md)
  if (!res) throw new Error('expected parse result for flow widget types')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const textNode = g.nodes.find(n => String(n.id || '') === 'n-text')
  if (!textNode) throw new Error('expected n-text node')
  if (String(textNode.type || '') !== 'TextGeneration') throw new Error(`expected TextGeneration type, got ${String(textNode.type || '')}`)
  const textProps = (textNode.properties || {}) as Record<string, unknown>
  if (String(textProps[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'textGeneration.openai') {
    throw new Error(`expected flow:widgetFormId=textGeneration.openai, got ${String(textProps[FLOW_WIDGET_FORM_ID_KEY] || '')}`)
  }

  const panelNode = g.nodes.find(n => String(n.id || '') === 'n-panel')
  if (!panelNode) throw new Error('expected n-panel node')
  if (String(panelNode.type || '') !== 'RichMediaPanel') throw new Error(`expected RichMediaPanel type, got ${String(panelNode.type || '')}`)
  const panelProps = (panelNode.properties || {}) as Record<string, unknown>
  if (String(panelProps[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'richMediaPanel') {
    throw new Error(`expected flow:widgetFormId=richMediaPanel, got ${String(panelProps[FLOW_WIDGET_FORM_ID_KEY] || '')}`)
  }

  const e1 = g.edges.find(e => String(e.id || '') === 'e1')
  if (!e1) throw new Error('expected edge e1')
  const e1Props = (e1.properties || {}) as Record<string, unknown>
  if (String(e1Props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'text_out') throw new Error('expected e1 source port text_out')
  if (String(e1Props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'output') throw new Error('expected e1 target port output')

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (Array.isArray(registry) && registry.some(r => String((r as { formId?: unknown })?.formId || '').startsWith('fm:n-text'))) {
    throw new Error('expected parser not to overwrite widget formId with fm:n-text')
  }
}

export function testMarkdownFlowBlockLocalComputeTextGenerationUsesNodeOwnedWidgetRegistry() {
  const md = [
    '# Title',
    '',
    'flow:',
    '  nodes:',
    '    - id:      {key: id,      type: string,  value: "local_text"}',
    '      type:    {key: type,    type: string,  value: "TextGeneration"}',
    '      label:   {key: label,   type: string,  value: "Local Text Compute"}',
    '      handles: {key: handles, type: object,  value: {target: ["prompt_in"], source: ["text_out", "outputSrcDoc"]}}',
    '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "textGeneration"}',
    '      "canvas:runAction": {key: canvas:runAction, type: object, value: {fn: compute, inputs: [prompt_in], outputs: [text_out, outputSrcDoc]}}',
    '      output: {key: output, type: markdown, value: "Ready"}',
    '      outputSrcDoc: {key: outputSrcDoc, type: html_srcdoc, value: ""}',
    '      compute: {key: compute, type: string, value: "inputs => ({ text_out: String(inputs.prompt_in || \'\'), outputSrcDoc: \'\' })"}',
    '  edges: []',
    '---',
    '',
    '## Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('local-compute-text-generation.md', md)
  if (!res) throw new Error('expected parse result for local compute text generation')
  const g = res.graphData
  const node = g.nodes.find(n => String(n.id || '') === 'local_text') || null
  if (!node) throw new Error('expected local_text node')
  const props = (node.properties || {}) as Record<string, unknown>
  if (String(props[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'fm:local_text') {
    throw new Error(`expected local compute TextGeneration to resolve to fm:local_text, got ${String(props[FLOW_WIDGET_FORM_ID_KEY] || '')}`)
  }
  const rawSpecs = props[FRONTMATTER_FLOW_WIDGET_FIELDS_KEY]
  const specKeys = Array.isArray(rawSpecs)
    ? rawSpecs.map(v => (v && typeof v === 'object' && !Array.isArray(v) ? String((v as Record<string, unknown>).fieldKey || '').trim() : '')).filter(Boolean)
    : []
  ;['output', 'outputSrcDoc', 'compute'].forEach(key => {
    if (!specKeys.includes(key)) throw new Error(`expected local compute registry field ${key}`)
  })
  if (specKeys.includes('chatAuthMode') || specKeys.includes('chatEndpointUrl') || specKeys.includes('chatModel')) {
    throw new Error(`expected local compute TextGeneration to avoid provider transport fields, got ${specKeys.join(',')}`)
  }

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? (meta[FLOW_WIDGET_REGISTRY_METADATA_KEY] as Array<Record<string, unknown>>)
    : []
  const localEntry = registry.find(entry => String(entry.formId || '') === 'fm:local_text') || null
  if (!localEntry) throw new Error('expected node-owned registry entry for local_text')
  const fields = Array.isArray(localEntry.fields) ? (localEntry.fields as Array<Record<string, unknown>>) : []
  const fieldKeys = fields.map(field => String(field.fieldKey || '').trim()).filter(Boolean)
  if (fieldKeys.includes('chatAuthMode') || fieldKeys.includes('chatEndpointUrl') || fieldKeys.includes('chatModel')) {
    throw new Error(`expected node-owned local compute registry to avoid provider fields, got ${fieldKeys.join(',')}`)
  }
  const label = getWidgetRegistryEntryLabel({
    nodeTypeId: localEntry.nodeTypeId,
    widgetTypeId: localEntry.widgetTypeId,
    formId: localEntry.formId,
  })
  if (label !== 'Widget') {
    throw new Error(`expected node-owned local compute registry label to stay neutral, got ${label}`)
  }
  const outputDocRef = resolveWidgetRegistryApiDocRef({
    registryEntry: {
      nodeTypeId: String(localEntry.nodeTypeId || ''),
      widgetTypeId: String(localEntry.widgetTypeId || ''),
      formId: String(localEntry.formId || ''),
    },
    schemaPath: 'output',
    fieldKey: 'output',
  })
  if (outputDocRef) {
    throw new Error(`expected node-owned local compute output to avoid provider API refs, got ${JSON.stringify(outputDocRef)}`)
  }
}

export function testMarkdownFlowBlockRejectsLegacyVideoWidgetTypeAlias() {
  const md = [
    '# Title',
    '',
    'flow:',
    '  nodes:',
    '    - id:      {key: id,      type: string,  value: "n-video"}',
    '      type:    {key: type,    type: string,  value: "VideoGeneration"}',
    '      label:   {key: label,   type: string,  value: "BytePlus Video Widget"}',
    '      handles: {key: handles, type: object,  value: {target: ["reference_image"], source: ["videoUrl"]}}',
    '      "flow:widgetFormId": {key: flow:widgetFormId, type: string, value: "videoGeneration"}',
    '      "flow:widgetTypeId": {key: flow:widgetTypeId, type: string, value: "ports"}',
    '      model: {key: model, type: string, value: "seedance-1-0-pro-fast-251015"}',
    '      prompt: {key: prompt, type: string, value: "animate this"}',
    '  edges: []',
    '---',
    '',
    '## Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('flow-video-widget-type-normalization.md', md)
  if (!res) throw new Error('expected parse result for video widget type normalization')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const videoNode = g.nodes.find(n => String(n.id || '') === 'n-video')
  if (!videoNode) throw new Error('expected n-video node')
  const videoProps = (videoNode.properties || {}) as Record<string, unknown>
  if (String(videoProps[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'videoGeneration') {
    throw new Error(`expected flow:widgetFormId=videoGeneration, got ${String(videoProps[FLOW_WIDGET_FORM_ID_KEY] || '')}`)
  }
  if (String(videoProps[FLOW_WIDGET_TYPE_ID_KEY] || '') !== 'ports') {
    throw new Error(`expected stale flow:widgetTypeId alias to remain unremapped for rejection, got ${String(videoProps[FLOW_WIDGET_TYPE_ID_KEY] || '')}`)
  }

  const canonicalVideoDraft = buildCanonicalWidgetRegistryDraft({ nodeTypeId: 'VideoGeneration' })
  if (!canonicalVideoDraft) throw new Error('expected canonical video registry draft')
  const resolved = resolveWidgetRegistryEntry({
    node: videoNode,
    registry: [{ ...canonicalVideoDraft, id: 'video-default', updatedAt: '2026-04-27T00:00:00.000Z' }],
    graphMetaKind: 'frontmatter-flow',
  })
  if (resolved) throw new Error('expected stale video widgetTypeId alias to be rejected instead of remapped')
}

export function testMarkdownFrontmatterFlowGraphHonorsUserSubgraphs() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-subgraphs-001',
    'nodes:',
    '  - id: NODE_A',
    '    type: Source',
    '    label: "A"',
    '    category: source',
    '    pos: { x: 40, y: 80 }',
    '    inputs: []',
    '    outputs:',
    '      - port: out_1',
    '        type: STRING',
    '  - id: NODE_B',
    '    type: Sink',
    '    label: "B"',
    '    category: output',
    '    pos: { x: 240, y: 80 }',
    '    inputs:',
    '      - port: in_1',
    '        type: STRING',
    '        from: NODE_A.out_1',
    '    outputs: []',
    'connections:',
    '  - { id: e01, from_node: NODE_A, from_port: out_1, to_node: NODE_B, to_port: in_1, type: STRING }',
    `'${KG_SUBGRAPHS_KEY}':`,
    '  - id: g1',
    '    label: "Cluster 1"',
    '    kind: cluster',
    '    parentId: null',
    '    memberNodeIds: [NODE_A, NODE_B]',
    '---',
    '',
    '# Demo',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if ((res.warnings || []).length !== 0) throw new Error(`expected no warnings, got: ${(res.warnings || []).join('; ')}`)
  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const subgraphs = meta[KG_SUBGRAPHS_KEY]
  if (!Array.isArray(subgraphs) || subgraphs.length !== 1) throw new Error('expected user subgraphs to be preserved')
  const sg = subgraphs[0] as { id?: unknown; label?: unknown; kind?: unknown; memberNodeIds?: unknown }
  if (String(sg.id || '') !== 'g1') throw new Error('expected subgraph id g1')
  if (String(sg.label || '') !== 'Cluster 1') throw new Error('expected subgraph label Cluster 1')
  if (String(sg.kind || '') !== 'cluster') throw new Error('expected subgraph kind cluster')
  if (!Array.isArray(sg.memberNodeIds) || sg.memberNodeIds.length !== 2) throw new Error('expected memberNodeIds preserved')
}

export function testMarkdownFrontmatterFlowGraphWarningsDetectDivergentConnections() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-warn-001',
    'nodes:',
    '  - id: NODE_A',
    '    type: Source',
    '    label: "A"',
    '    category: source',
    '    pos_x: 40',
    '    pos_y: 80',
    '    inputs: []',
    '    outputs:',
    '      - port: out_1',
    '        type: STRING',
    '  - id: NODE_B',
    '    type: Sink',
    '    label: "B"',
    '    category: output',
    '    pos_x: 240',
    '    pos_y: 80',
    '    inputs:',
    '      - port: in_1',
    '        type: STRING',
    '        from: NODE_A.out_1',
    '    outputs: []',
    'connections:',
    '  - { id: e01, from_node: NODE_A, from_port: out_1, to_node: NODE_B, to_port: in_1, type: STRING }',
    '  - { id: e02, from_node: NODE_A, from_port: out_1, to_node: NODE_B, to_port: in_2 }',
    'socket_types:',
    '  STRING: { color: "#AED6F1", accepts: [STRING] }',
    '---',
    '',
    '# Demo',
  ].join('\n')
  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if ((res.warnings || []).length === 0) throw new Error('expected warnings for divergent connections')
}

export function testMarkdownFrontmatterFlowGraphParsesDotFromToConnections() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-conn-001',
    'nodes:',
    '  - id: NODE_A',
    '    type: Source',
    '    label: "A"',
    '    category: source',
    '    pos: { x: 40, y: 80 }',
    '    inputs: []',
    '    outputs:',
    '      - port: out_1',
    '        type: STRING',
    '  - id: NODE_B',
    '    type: Sink',
    '    label: "B"',
    '    category: output',
    '    pos: { x: 240, y: 80 }',
    '    inputs:',
    '      - port: in_1',
    '        type: STRING',
    '        from: NODE_A.out_1',
    '    outputs: []',
    'connections:',
    '  - { id: e01, from: NODE_A.out_1, to: NODE_B.in_1, type: STRING }',
    'socket_types:',
    '  STRING: { color: "#AED6F1", accepts: [STRING] }',
    '---',
    '',
    '# Demo',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if ((res.warnings || []).length !== 0) throw new Error(`expected no warnings, got: ${(res.warnings || []).join('; ')}`)
  if (res.graphData.edges.length !== 1) throw new Error(`expected 1 edge, got ${res.graphData.edges.length}`)
  const e = res.graphData.edges[0]
  if ((e.properties as Record<string, unknown>)['flow:socketType'] !== 'STRING') throw new Error('expected flow:socketType=STRING')
  if (String(e.type || '') !== 'STRING') throw new Error('expected edge.type=STRING')
}

export function testMarkdownFrontmatterFlowGraphRepairsMissingSpaceAfterColonQuote() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-conn-002',
    'nodes:',
    '  - id: A',
    '    type: Source',
    '    label: "A"',
    '    category: source',
    '    pos: { x: 0, y: 0 }',
    '    params:',
    '      attribution:"{{strings.moments.quote_source}}"',
    '    inputs: []',
    '    outputs:',
    '      - { port: out_1, type: STRING, fans_to: [B] }',
    '  - id: B',
    '    type: Sink',
    '    label: "B"',
    '    category: output',
    '    pos: { x: 100, y: 0 }',
    '    inputs:',
    '      - { port: in_1, type: STRING, from: A.out_1 }',
    '    outputs: []',
    'connections:',
    '  - { id: e01, from: A.out_1, to: B.in_1, type: STRING }',
    'socket_types:',
    '  STRING: { color: "#AED6F1", accepts: [STRING] }',
    '---',
    '',
    '# Demo',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if (res.graphData.nodes.length !== 2) throw new Error(`expected 2 nodes, got ${res.graphData.nodes.length}`)
  if (res.graphData.edges.length !== 1) throw new Error(`expected 1 edge, got ${res.graphData.edges.length}`)
}

export function testMarkdownFrontmatterFlowGraphAugmentsPortsFromEdgeMap() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-conn-003',
    'nodes:',
    '  - id: A',
    '    type: Source',
    '    label: "A"',
    '    category: source',
    '    pos: { x: 0, y: 0 }',
    '    params: {}',
    '    inputs: []',
    '    outputs:',
    '      - { port: out_1, type: STRING, fans_to: [B] }',
    '  - id: B',
    '    type: Sink',
    '    label: "B"',
    '    category: output',
    '    pos: { x: 100, y: 0 }',
    '    params: {}',
    '    inputs: []',
    '    outputs: []',
    'connections:',
    '  - { id: e01, from: A.out_1, to: B.in_1, type: STRING }',
    'socket_types:',
    '  STRING: { color: "#AED6F1", accepts: [STRING] }',
    '---',
    '',
    '# Demo',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  const b = res.graphData.nodes.find(n => n.id === 'B') || null
  if (!b) throw new Error('expected node B')
  const portTypes = (b.properties || {})['flow:portTypes'] as unknown
  if (!portTypes || typeof portTypes !== 'object') throw new Error('expected node B to have flow:portTypes')
  const inPorts = (portTypes as { in?: Record<string, unknown> }).in || {}
  if (inPorts.in_1 !== 'STRING') throw new Error(`expected B.in_1 type STRING, got ${String(inPorts.in_1 || '')}`)
}

export function testMarkdownFrontmatterFlowGraphExtractsEdgeTablesAndSocketLegend() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-table-001',
    'nodes:',
    '  - id: NODE_A',
    '    type: Source',
    '    category: source',
    '    pos: { x: 40, y: 80 }',
    '    params: {}',
    '  - id: NODE_B',
    '    type: Sink',
    '    category: output',
    '    pos: { x: 240, y: 80 }',
    '    params: {}',
    '---',
    '',
    '# Demo',
    '',
    '| Edge | From port | To port | Type |',
    '|---|---|---|---|',
    '| e01 | `NODE_A.out_1` | `NODE_B.in_1` | `STRING` |',
    '',
    '## Socket Type Legend',
    '',
    '| Type | Colour | Carries |',
    '|---|---|---|',
    '| `STRING` | 🔵 `#AED6F1` | Text values |',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if (res.graphData.edges.length !== 1) throw new Error(`expected 1 edge, got ${res.graphData.edges.length}`)

  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const socketTypes = meta.socketTypes as unknown
  if (!socketTypes || typeof socketTypes !== 'object') throw new Error('expected socketTypes metadata from legend table')
  const spec = (socketTypes as Record<string, unknown>).STRING as unknown
  if (!spec || typeof spec !== 'object') throw new Error('expected socketTypes.STRING spec')
  if ((spec as Record<string, unknown>).color !== '#AED6F1') throw new Error('expected socketTypes.STRING.color to match legend')

  const b = res.graphData.nodes.find(n => n.id === 'NODE_B') || null
  if (!b) throw new Error('expected node NODE_B')
  const portTypes = (b.properties || {})['flow:portTypes'] as unknown
  if (!portTypes || typeof portTypes !== 'object') throw new Error('expected node NODE_B to have flow:portTypes')
  const inPorts = (portTypes as { in?: Record<string, unknown> }).in || {}
  if (inPorts.in_1 !== 'STRING') throw new Error(`expected NODE_B.in_1 type STRING, got ${String(inPorts.in_1 || '')}`)
}

export function testMarkdownFrontmatterFlowGraphParsesMultiFrontmatterBlocks() {
  const md = [
    '---',
    'meta:',
    '  id: demo-flow-multi-001',
    '---',
    '---',
    'nodes:',
    '  - id: NODE_A',
    '    type: Source',
    '    category: source',
    '    pos: { x: 40, y: 80 }',
    '    params: {}',
    '    inputs: []',
    '    outputs:',
    '      - port: out_1',
    '        type: STRING',
    '  - id: NODE_B',
    '    type: Sink',
    '    category: output',
    '    pos: { x: 240, y: 80 }',
    '    params: {}',
    '    inputs: []',
    '    outputs: []',
    '---',
    '',
    '# Demo',
    '',
    '| Edge | From port | To port | Type |',
    '|---|---|---|---|',
    '| e01 | `NODE_A.out_1` | `NODE_B.in_1` | `STRING` |',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('demo.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if (res.graphData.nodes.length !== 2) throw new Error(`expected 2 nodes, got ${res.graphData.nodes.length}`)
  if (res.graphData.edges.length !== 1) throw new Error(`expected 1 edge, got ${res.graphData.edges.length}`)
}

export function testMarkdownFrontmatterFlowGraphParsesSigilNeuralTemplateAndBodyAnnotations() {
  const md = [
    '---',
    'doc:',
    '  id: "doc:test"',
    'nodes:',
    '  - @node:pain:a: { label: "Pain A", status: placeholder }',
    '  - @node:feature:1: { label: "Feature 1", status: active }',
    'clusters:',
    '  - @cluster:pitch:',
    '      label: "Pitch Cluster"',
    '      color: "#2D6A4F"',
    '      members:',
    '        - "@node:pain:a"',
    '        - "@node:feature:1"',
    'edges:',
    '  - id: @edge:pain→feature',
    '    source: "@node:pain:*"',
    '    target: "@node:feature:*"',
    '    rel: motivates',
    '---',
    '',
    '## Pitch<!-- @cluster:pitch -->',
    'Pain marker<!-- @node:pain:a -->',
    'Feature marker<!-- @node:feature:1 -->',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('sigil-template.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  if (res.graphData.nodes.length < 3) throw new Error(`expected at least 3 nodes, got ${res.graphData.nodes.length}`)
  if (res.graphData.edges.length < 1) throw new Error(`expected at least 1 edge, got ${res.graphData.edges.length}`)

  const pain = res.graphData.nodes.find(n => n.id === '@node:pain:a') || null
  if (!pain) throw new Error('expected @node:pain:a')
  const pitch = res.graphData.nodes.find(n => n.id === '@cluster:pitch') || null
  if (!pitch) throw new Error('expected @cluster:pitch')
  const painPrimitive = (pain.properties || {})['frontmatter:primitive']
  const clusterPrimitive = (pitch.properties || {})['frontmatter:primitive']
  if (painPrimitive !== 'node') throw new Error('expected @node primitive=node')
  if (clusterPrimitive !== 'cluster') throw new Error('expected @cluster primitive=cluster')

  const edge = res.graphData.edges.find(e => String(e.id || '').startsWith('@edge:pain→feature')) || null
  if (!edge) throw new Error('expected @edge:pain→feature edge')
  if ((edge.properties || {})['frontmatter:primitive'] !== 'edge') throw new Error('expected edge primitive=edge')
  if (String(edge.label || '') !== 'motivates') throw new Error('expected edge label motivates')

  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const wiring = meta.frontmatterAnnotationWiring as unknown
  if (!wiring || typeof wiring !== 'object') throw new Error('expected frontmatterAnnotationWiring metadata')
  const nodeIds = (wiring as { nodeIds?: unknown }).nodeIds
  if (!Array.isArray(nodeIds) || !nodeIds.includes('@node:pain:a')) throw new Error('expected node annotation ids to include @node:pain:a')
  const clusterIds = (wiring as { clusterIds?: unknown }).clusterIds
  if (!Array.isArray(clusterIds) || !clusterIds.includes('@cluster:pitch')) throw new Error('expected cluster annotation ids to include @cluster:pitch')

  const subgraphs = meta[KG_SUBGRAPHS_KEY]
  if (!Array.isArray(subgraphs)) throw new Error('expected subgraphs metadata')
  const pitchSubgraph = subgraphs.find(s => (s as { id?: unknown }).id === '@cluster:pitch') || null
  if (!pitchSubgraph) throw new Error('expected @cluster:pitch subgraph')
}

export function testMarkdownFrontmatterFlowGraphPrefersMermaidWiringOverSyntheticSigilExpansion() {
  const md = [
    '---',
    'nodes:',
    '  - @node:pain:a: { label: "Pain A", status: placeholder }',
    '  - @node:feature:1: { label: "Feature 1", status: active }',
    'edges:',
    '  - id: @edge:pain→feature',
    '    source: "@node:pain:*"',
    '    target: "@node:feature:*"',
    '    rel: motivates',
    'graph: |',
    '  graph TD',
    '    n_pain["@node:pain:a · Pain A"]',
    '    n_feat["@node:feature:1 · Feature 1"]',
    '    e_motivates{{"@edge:pain→feature · motivates"}}',
    '    n_pain -->|identity-anchor| e_motivates --> n_feat',
    '---',
    '',
    'Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('sigil-mermaid-wiring.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  const edges = res.graphData.edges || []
  if (edges.length !== 2) throw new Error(`expected exactly 2 mermaid wiring edges, got ${edges.length}`)

  const hasSyntheticMotivates = edges.some(e => String(e.label || '') === 'motivates')
  if (hasSyntheticMotivates) throw new Error('expected no synthetic direct motivates edges when mermaid wiring exists')

  const edgeNode = res.graphData.nodes.find(n => n.id === '@edge:pain→feature') || null
  if (!edgeNode) throw new Error('expected @edge node to be materialized from mermaid wiring')
  const primitive = (edgeNode.properties || {})['frontmatter:primitive']
  if (primitive !== 'edge') throw new Error('expected @edge node primitive=edge')

  const edgeSourceKinds = new Set(
    edges.map(e => String(((e.properties || {}) as Record<string, unknown>)['frontmatter:edgeSource'] || '')),
  )
  if (edgeSourceKinds.size !== 1 || !edgeSourceKinds.has('mermaid-wiring')) {
    throw new Error('expected all edges to come from mermaid wiring source')
  }

  const identityAnchorEdge = edges.find(e => String(e.label || '') === 'identity-anchor') || null
  if (!identityAnchorEdge) throw new Error('expected inline mermaid edge label to be preserved')
  const displayLabel = String(((identityAnchorEdge.properties || {}) as Record<string, unknown>)['frontmatter:displayLabel'] || '')
  if (displayLabel !== 'identity-anchor') throw new Error('expected frontmatter:displayLabel to preserve inline label')
}

export function testMarkdownFrontmatterFlowGraphParsesSigilEdgeLinesWithHandleRouting() {
  const md = [
    '---',
    'nodes:',
    '  - @node:n-a: { label: "A", type: input }',
    '  - @node:n-b: { label: "B", type: output }',
    'edges:',
    '  - @edge:n-a:signal → n-b:signal',
    '---',
    '',
    '# Flow',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('sigil-edge-lines.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  const edge = res.graphData.edges.find(e => String(e.id || '').includes('@edge:n-a:signal->n-b:signal')) || null
  if (!edge) throw new Error('expected edge from sigil line declaration')
  const props = (edge.properties || {}) as Record<string, unknown>
  if (String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'signal') throw new Error('expected source port from sigil edge line')
  if (String(props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'signal') throw new Error('expected target port from sigil edge line')
}

export function testMarkdownFrontmatterFlowGraphParsesWorkflowFlowBlockWithHandlesDataAndCompute() {
  const md = [
    '---',
    'subject: hackathon winners',
    'flow:',
    '  direction: LR',
    '  edgeType: smoothstep',
    '  snapToGrid: true',
    '  gridSize: 20',
    '  computed: true',
    '  nodes:',
    '    - id: n-scrape',
    '      type: input',
    '      label: scrape event URLs',
    '      position: { x: 0, y: 0 }',
    '      handles:',
    '        source: [urls]',
    '      data:',
    '        urls: ["https://example.com/a"]',
    '        confidence: high',
    '    - id: n-extract',
    '      type: default',
    '      label: "{{subject}}"',
    '      position: { x: 220, y: 0 }',
    '      handles:',
    '        target: [urls]',
    '        source: [demos]',
    '      compute: |',
    '        (inputs) => ({',
    '          demos: (Array.isArray(inputs.urls) ? inputs.urls : [inputs.urls]).filter(Boolean).map((u) => ({ url: u, extracted: true }))',
    '        })',
    '      data: {}',
    '    - id: n-gallery',
    '      type: output',
    '      label: project gallery',
    '      position: { x: 440, y: 0 }',
    '      handles:',
    '        target: [demos]',
    '      data:',
    '        winner_badge: true',
    '        repo_link: TBD',
    '  edges:',
    '    - id: e-scrape-extract',
    '      source: n-scrape',
    '      sourceHandle: urls',
    '      target: n-extract',
    '      targetHandle: urls',
    '      label: scrape → extract',
    '      animated: true',
    '---',
    '',
    '# Demo',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('flow-guideline.md', md)
  if (!res) throw new Error('expected a frontmatter flow graph parse result')
  const g = res.graphData
  if (g.nodes.length !== 3) throw new Error(`expected 3 nodes, got ${g.nodes.length}`)
  if (g.edges.length !== 1) throw new Error(`expected 1 edge, got ${g.edges.length}`)

  const extract = g.nodes.find(n => n.id === 'n-extract') || null
  if (!extract) throw new Error('expected n-extract')
  if (String(extract.label || '') !== 'hackathon winners') throw new Error('expected template label resolution for n-extract')
  const extractProps = (extract.properties || {}) as Record<string, unknown>
  if (typeof extractProps['flow:compute'] !== 'string') throw new Error('expected flow:compute on n-extract')
  const extractData = extractProps.data as Record<string, unknown> | undefined
  if (!extractData || typeof extractData !== 'object') throw new Error('expected data object on n-extract')

  const gallery = g.nodes.find(n => n.id === 'n-gallery') || null
  if (!gallery) throw new Error('expected n-gallery')
  const galleryProps = (gallery.properties || {}) as Record<string, unknown>
  if (galleryProps['frontmatter:waiting'] !== true) throw new Error('expected frontmatter:waiting for TBD payload')
  const galleryData = galleryProps.data as Record<string, unknown> | undefined
  if (!galleryData || galleryData.repo_link !== null) throw new Error('expected TBD to normalize to null in node data')

  const edge = g.edges[0]
  const edgeProps = (edge.properties || {}) as Record<string, unknown>
  if (edgeProps[FLOW_EDGE_SOURCE_PORT_KEY] !== 'urls') throw new Error('expected source handle urls')
  if (edgeProps[FLOW_EDGE_TARGET_PORT_KEY] !== 'urls') throw new Error('expected target handle urls')
  if (String(edge.label || '') !== 'scrape → extract') throw new Error('expected edge label from flow block')
  if (edgeProps['flow:animated'] !== true) throw new Error('expected flow:animated=true from flow block')

  const meta = (g.metadata || {}) as Record<string, unknown>
  const settings = meta.frontmatterFlowSettings as Record<string, unknown> | undefined
  if (!settings) throw new Error('expected frontmatterFlowSettings in metadata')
  if (settings.direction !== 'LR') throw new Error('expected flow direction LR')
  if (settings.edgeType !== 'smoothstep') throw new Error('expected flow edgeType smoothstep')
}

export function testMarkdownFrontmatterFlowGraphParsesWrappedNodeFieldEnvelopeAndEdgeHandles() {
  const md = [
    '---',
    'flow:',
    '  direction: LR',
    '  edgeType: smoothstep',
    '  snapToGrid: true',
    '  gridSize: 20',
    '  computed: true',
    '  nodes:',
    '    - id:      {key: id,      type: string,   value: "n-canvas"}',
    '      type:    {key: type,    type: string,   value: "input"}',
    '      label:   {key: label,   type: string,   value: "Knowledge Graph Canvas"}',
    '      handles: {key: handles, type: object,   value: {source: [signal]}}',
    '      data:    {key: data,    type: object,   value: {pain: "AI responses ignore graph structure", goal: "structured context for every prompt"}}',
    '      compute: {key: compute, type: function, value: "(inputs) => ({ signal: { node: inputs.__selected_node ?? null, fm: inputs.__frontmatter ?? {}, summary: inputs.__graph_summary ?? \\"\\" } })"}',
    '    - id:      {key: id,      type: string,   value: "n-ai"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      label:   {key: label,   type: string,   value: "generateMarkdown()"}',
    '      handles: {key: handles, type: object,   value: {target: [context, correction], source: [md]}}',
    '      data:    {key: data,    type: object,   value: {model: "claude-sonnet-4-20250514", temperature: 0.3}}',
    '    - id:      {key: id,      type: string,   value: "n-validate"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      label:   {key: label,   type: string,   value: "validateMarkdown()"}',
    '      handles: {key: handles, type: object,   value: {target: [md], source: [valid_md, correction]}}',
    '      data:    {key: data,    type: object,   value: {rules: ["V-01","V-02"], max_retry: 3}}',
    '    - id:      {key: id,      type: string,   value: "n-render"}',
    '      type:    {key: type,    type: string,   value: "output"}',
    '      label:   {key: label,   type: string,   value: "renderCanvas()"}',
    '      handles: {key: handles, type: object,   value: {target: [valid_md]}}',
    '      data:    {key: data,    type: object,   value: {stores: ["flow_nodes","flow_edges"], triggers: "canvas re-render"}}',
    '  edges:',
    '    - { id: e3, source: n-ai,       sourceHandle: md,         target: n-validate, targetHandle: md,         animated: true }',
    '    - { id: e4, source: n-validate, sourceHandle: valid_md,   target: n-render,   targetHandle: valid_md,   animated: true, label: "validated MD" }',
    '    - { id: e5, source: n-validate, sourceHandle: correction, target: n-ai,       targetHandle: correction, animated: true, label: "@flag:correction" }',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('wrapped-flow-envelope.md', md)
  if (!res) throw new Error('expected parse result for wrapped flow node field envelope')
  const g = res.graphData
  if (g.nodes.length !== 4) throw new Error(`expected 4 flow nodes, got ${g.nodes.length}`)
  if (g.edges.length !== 3) throw new Error(`expected 3 flow edges, got ${g.edges.length}`)

  const e5 = g.edges.find(e => String(e.id || '') === 'e5') || null
  if (!e5) throw new Error('expected e5 edge')
  const e5Props = (e5.properties || {}) as Record<string, unknown>
  if (String(e5.source || '') !== 'n-validate' || String(e5.target || '') !== 'n-ai') {
    throw new Error('expected e5 endpoints n-validate -> n-ai')
  }
  if (String(e5Props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'correction') throw new Error('expected e5 source handle correction')
  if (String(e5Props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'correction') throw new Error('expected e5 target handle correction')

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? (meta[FLOW_WIDGET_REGISTRY_METADATA_KEY] as Array<Record<string, unknown>>)
    : []
  const aiForm = registry.find(r => String(r.formId || '') === 'fm:n-ai') || null
  const validateForm = registry.find(r => String(r.formId || '') === 'fm:n-validate') || null
  if (!aiForm || !validateForm) throw new Error('expected registry entries for n-ai and n-validate')
  const aiPorts = Array.isArray(aiForm.ports) ? (aiForm.ports as Array<Record<string, unknown>>) : []
  const validatePorts = Array.isArray(validateForm.ports) ? (validateForm.ports as Array<Record<string, unknown>>) : []
  const hasAiCorrectionIn = aiPorts.some(p => String(p.portKey || '') === 'correction' && String(p.direction || '') === 'input')
  const hasValidateCorrectionOut = validatePorts.some(p => String(p.portKey || '') === 'correction' && String(p.direction || '') === 'output')
  if (!hasAiCorrectionIn || !hasValidateCorrectionOut) {
    throw new Error('expected wrapped-flow envelope handles to map correction ports into widget registry')
  }
}

export function testMarkdownFrontmatterFlowGraphParsesAllWrappedNodeIdsIntoWidgetForms() {
  const md = [
    '---',
    'flow:',
    '  nodes:',
    '    - id:      {key: id,      type: string,   value: "n-canvas"}',
    '      type:    {key: type,    type: string,   value: "input"}',
    '      handles: {key: handles, type: object,   value: {source: [signal]}}',
    '    - id:      {key: id,      type: string,   value: "n-pack"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      handles: {key: handles, type: object,   value: {target: [signal], source: [context]}}',
    '    - id:      {key: id,      type: string,   value: "n-ai"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      handles: {key: handles, type: object,   value: {target: [context, correction], source: [md]}}',
    '    - id:      {key: id,      type: string,   value: "n-validate"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      handles: {key: handles, type: object,   value: {target: [md], source: [valid_md, correction]}}',
    '    - id:      {key: id,      type: string,   value: "n-render"}',
    '      type:    {key: type,    type: string,   value: "output"}',
    '      handles: {key: handles, type: object,   value: {target: [valid_md]}}',
    '  edges:',
    '    - { id: e1, source: n-canvas,   sourceHandle: signal,     target: n-pack,     targetHandle: signal }',
    '    - { id: e2, source: n-pack,     sourceHandle: context,    target: n-ai,       targetHandle: context }',
    '    - { id: e3, source: n-ai,       sourceHandle: md,         target: n-validate, targetHandle: md }',
    '    - { id: e4, source: n-validate, sourceHandle: valid_md,   target: n-render,   targetHandle: valid_md }',
    '    - { id: e5, source: n-validate, sourceHandle: correction, target: n-ai,       targetHandle: correction }',
    '---',
  ].join('\n')

  const expectedNodeIds = ['n-canvas', 'n-pack', 'n-ai', 'n-validate', 'n-render'].sort()
  const res = tryParseMarkdownFrontmatterFlowGraph('wrapped-flow-ids.md', md)
  if (!res) throw new Error('expected parse result for wrapped node ids')
  const g = res.graphData
  const actualNodeIds = (g.nodes || []).map(n => String(n.id || '')).filter(Boolean).sort()
  if (JSON.stringify(actualNodeIds) !== JSON.stringify(expectedNodeIds)) {
    throw new Error(`expected wrapped node ids parsed into graph nodes, got ${JSON.stringify(actualNodeIds)}`)
  }

  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? (meta[FLOW_WIDGET_REGISTRY_METADATA_KEY] as Array<Record<string, unknown>>)
    : []
  const formIds = registry.map(r => String(r.formId || '')).filter(Boolean)
  for (let i = 0; i < expectedNodeIds.length; i += 1) {
    const formId = `fm:${expectedNodeIds[i]}`
    if (!formIds.includes(formId)) throw new Error(`expected widget form for wrapped node id ${expectedNodeIds[i]}`)
  }
}

export function testMarkdownFrontmatterFlowGraphFlowBlockIgnoresMermaidAndRendersOnlyFlowNodesForWidgets() {
  const md = [
    '---',
    'mermaid: |',
    '  flowchart TB',
    '    extra_a["extra-a"] --> extra_b["extra-b"]',
    'flow:',
    '  nodes:',
    '    - id:      {key: id,      type: string,   value: "n-canvas"}',
    '      type:    {key: type,    type: string,   value: "input"}',
    '      handles: {key: handles, type: object,   value: {source: [signal]}}',
    '    - id:      {key: id,      type: string,   value: "n-pack"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      handles: {key: handles, type: object,   value: {target: [signal], source: [context]}}',
    '    - id:      {key: id,      type: string,   value: "n-ai"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      handles: {key: handles, type: object,   value: {target: [context, correction], source: [md]}}',
    '    - id:      {key: id,      type: string,   value: "n-validate"}',
    '      type:    {key: type,    type: string,   value: "default"}',
    '      handles: {key: handles, type: object,   value: {target: [md], source: [valid_md, correction]}}',
    '    - id:      {key: id,      type: string,   value: "n-render"}',
    '      type:    {key: type,    type: string,   value: "output"}',
    '      handles: {key: handles, type: object,   value: {target: [valid_md]}}',
    '  edges:',
    '    - { id: e1, source: n-canvas,   sourceHandle: signal,     target: n-pack,     targetHandle: signal }',
    '    - { id: e2, source: n-pack,     sourceHandle: context,    target: n-ai,       targetHandle: context }',
    '    - { id: e3, source: n-ai,       sourceHandle: md,         target: n-validate, targetHandle: md }',
    '    - { id: e4, source: n-validate, sourceHandle: valid_md,   target: n-render,   targetHandle: valid_md }',
    '    - { id: e5, source: n-validate, sourceHandle: correction, target: n-ai,       targetHandle: correction }',
    '---',
  ].join('\n')

  const expectedNodeIds = ['n-canvas', 'n-pack', 'n-ai', 'n-validate', 'n-render'].sort()
  const res = tryParseMarkdownFrontmatterFlowGraph('flow-block-ignore-mermaid.md', md)
  if (!res) throw new Error('expected parse result for flow block with mermaid side payload')
  const actualNodeIds = (res.graphData.nodes || []).map(n => String(n.id || '')).filter(Boolean).sort()
  if (JSON.stringify(actualNodeIds) !== JSON.stringify(expectedNodeIds)) {
    throw new Error(`expected only flow node ids from flow block, got ${JSON.stringify(actualNodeIds)}`)
  }
  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? (meta[FLOW_WIDGET_REGISTRY_METADATA_KEY] as Array<Record<string, unknown>>)
    : []
  const formIds = registry.map(r => String(r.formId || '')).filter(Boolean).sort()
  const expectedFormIds = expectedNodeIds.map(id => `fm:${id}`).sort()
  if (JSON.stringify(formIds) !== JSON.stringify(expectedFormIds)) {
    throw new Error(`expected only flow widget forms, got ${JSON.stringify(formIds)}`)
  }
}

export function testMarkdownFrontmatterFlowGraphDerivesWidgetBundleNodesAndConnectionsWithoutHardcodedFixturePath() {
  const md = [
    '---',
    'title: Widget Bundle Frontmatter',
    ':class: text-center',
    'widget_bundle:',
    '  widgets:',
    '    - formId: textGeneration',
    '      id: w-text-1',
    '      properties:',
    '        - { key: prompt, type: string, value: "hello" }',
    '      handles:',
    '        prompt_in: [id: h-prompt-in-1, port: prompt_in]',
    '        text_out: [id: h-text-out-1, port: text_out]',
    '    - formId: imageGeneration',
    '      id: w-image-1',
    '      properties:',
    '        - { key: model, type: string, value: "seedream-4-0-250828" }',
    '      handles:',
    '        prompt_in: [id: h-prompt-in-2, port: prompt_in]',
    '        imageUrl: [id: h-img-url-1, port: imageUrl]',
    'mermaid: |',
    '  flowchart LR',
    '    A["Text Gen<br/>w-text-1"] -->|text_out → prompt_in| B["Image Gen<br/>w-image-1"]',
    'graph_meta:',
    '  direction: RIGHT',
    '---',
    '',
    '# Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('widget-bundle-frontmatter.md', md)
  if (!res) throw new Error('expected parse result from widget_bundle + mermaid frontmatter')
  if (String(res.graphData.context || '') !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const ids = new Set((res.graphData.nodes || []).map(n => String(n.id || '')))
  if (!ids.has('w-text-1') || !ids.has('w-image-1')) {
    throw new Error(`expected widget_bundle node ids, got ${Array.from(ids).join(',')}`)
  }

  const edge = (res.graphData.edges || []).find(e => String(e.source || '') === 'w-text-1' && String(e.target || '') === 'w-image-1')
  if (!edge) throw new Error('expected mermaid wiring edge between widget_bundle nodes')
  const edgeProps = (edge.properties || {}) as Record<string, unknown>
  if (String(edgeProps[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'text_out') throw new Error('expected source handle text_out')
  if (String(edgeProps[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'prompt_in') throw new Error('expected target handle prompt_in')

  const textNode = (res.graphData.nodes || []).find(n => String(n.id || '') === 'w-text-1')
  if (!textNode) throw new Error('expected w-text-1 node')
  const textProps = (textNode.properties || {}) as Record<string, unknown>
  if (String(textProps[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'textGeneration') {
    throw new Error(`expected flow:widgetFormId=textGeneration, got ${String(textProps[FLOW_WIDGET_FORM_ID_KEY] || '')}`)
  }

  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const settings = (meta.frontmatterFlowSettings || {}) as Record<string, unknown>
  if (String(settings.direction || '') !== 'LR') throw new Error('expected graph_meta.direction RIGHT to normalize as LR')
}

export function testMarkdownFrontmatterFlowGraphDerivesNodesAndConnectionsFromFrontmatterIndexMermaid() {
  const md = [
    '---',
    'title: Frontmatter Index Mermaid Seed',
    'index:',
    '  mermaid: |',
    '    flowchart LR',
    '      A["Start"] -->|text_out → prompt_in| B["End"]',
    '---',
    '',
    '# Body',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('index-mermaid-seed.md', md)
  if (!res) throw new Error('expected parse result from index.mermaid seed')
  if (String(res.graphData.context || '') !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const ids = new Set((res.graphData.nodes || []).map(n => String(n.id || '')))
  if (!ids.has('A') || !ids.has('B')) {
    throw new Error(`expected index.mermaid node ids A,B; got ${Array.from(ids).join(',')}`)
  }

  const edge = (res.graphData.edges || []).find(e => String(e.source || '') === 'A' && String(e.target || '') === 'B')
  if (!edge) throw new Error('expected index.mermaid wiring edge A -> B')
  const edgeProps = (edge.properties || {}) as Record<string, unknown>
  if (String(edgeProps[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'text_out') throw new Error('expected source handle text_out')
  if (String(edgeProps[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'prompt_in') throw new Error('expected target handle prompt_in')

  const settings = (((res.graphData.metadata || {}) as Record<string, unknown>).frontmatterFlowSettings || {}) as Record<string, unknown>
  if (String(settings.direction || '') !== 'LR') throw new Error('expected index.mermaid flowchart LR direction to persist')
}

export async function testMarkdownLoaderFlowBlockSkipsMarkdownStructureNodesForWidgets() {
  const md = [
    '---',
    'title: Loader Isolation',
    'flow:',
    '  nodes:',
    '    - id: a',
    '      type: input',
    '      handles: { source: [out] }',
    '    - id: b',
    '      type: output',
    '      handles: { target: [out] }',
    '  edges:',
    '    - { id: e1, source: a, sourceHandle: out, target: b, targetHandle: out }',
    '---',
    '',
    '# architecture-overview',
    '',
    '- List 2',
    '',
    '| Table 1 |',
    '| --- |',
    '| Paragraph 1 |',
  ].join('\n')

  const res = await loadGraphDataFromTextViaParser('loader-flow-isolation.md', md, { applyToStore: false, syncMarkdownDocument: false })
  if (!res?.graphData) throw new Error('expected loader graph data')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  const ids = (g.nodes || []).map(n => String(n.id || '').trim()).filter(Boolean).sort()
  const expected = ['a', 'b']
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new Error(`expected only flow node ids from flow block, got ${JSON.stringify(ids)}`)
  }
  const meta = (g.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? (meta[FLOW_WIDGET_REGISTRY_METADATA_KEY] as Array<Record<string, unknown>>)
    : []
  const forms = registry.map(r => String(r.formId || '').trim()).filter(Boolean).sort()
  if (JSON.stringify(forms) !== JSON.stringify(['fm:a', 'fm:b'])) {
    throw new Error(`expected only flow widget forms for loader parse, got ${JSON.stringify(forms)}`)
  }
}

export function testMarkdownFrontmatterFlowGraphParsesWrappedFlowSettingsAndMultilineComputeEnvelope() {
  const md = [
    '---',
    'flow:',
    '  direction:  {key: direction,  type: string,  value: LR}',
    '  edgeType:   {key: edgeType,   type: string,  value: smoothstep}',
    '  snapToGrid: {key: snapToGrid, type: boolean, value: true}',
    '  computed:   {key: computed,   type: boolean, value: true}',
    '  nodes:',
    '    - id:      {key: id,      type: string,   value: "n-a"}',
    '      type:    {key: type,    type: string,   value: "input"}',
    '      handles: {key: handles, type: object,   value: {source: [signal]}}',
    '      compute: {key: compute, type: function, value: |',
    '        (inputs) => ({',
    '          signal: { ok: true }',
    '        })',
    '      }',
    '    - id:      {key: id,      type: string,   value: "n-b"}',
    '      type:    {key: type,    type: string,   value: "output"}',
    '      handles: {key: handles, type: object,   value: {target: [signal]}}',
    '  edges:',
    '    - { id: e1, source: n-a, sourceHandle: signal, target: n-b, targetHandle: signal }',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('wrapped-flow-settings-compute.md', md)
  if (!res) throw new Error('expected wrapped flow settings + multiline compute envelope parse result')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  const ids = (g.nodes || []).map(n => String(n.id || '').trim()).filter(Boolean).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['n-a', 'n-b'])) {
    throw new Error(`expected n-a/n-b flow nodes only, got ${JSON.stringify(ids)}`)
  }
  const meta = (g.metadata || {}) as Record<string, unknown>
  const settings = (meta.frontmatterFlowSettings || {}) as Record<string, unknown>
  if (String(settings.direction || '').trim() !== 'LR') throw new Error('expected wrapped flow.direction to parse as LR')
  if (String(settings.edgeType || '').trim() !== 'smoothstep') throw new Error('expected wrapped flow.edgeType to parse as smoothstep')
  if (settings.snapToGrid !== true || settings.computed !== true) throw new Error('expected wrapped flow boolean settings to parse as true')
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphUsesLeadingKgcBlockOnlyAndDedupesEdges() {
  const md = [
    '---',
    'doc:',
    '  id: "doc:kgc:turn:demo"',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-in',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-out',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - id: e-front',
    '      source: n-in.turn',
    '      target: n-out.turn',
    '---',
    '',
    '# Trailing chat history',
    '',
    '| Edge | From port | To port | Type |',
    '|---|---|---|---|',
    '| e-history | `n-in.turn` | `n-out.turn` | `STRING` |',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-chat.md', md)
  if (!res) throw new Error('expected chatKnowgrph frontmatter-flow parse result')

  const g = res.graphData
  if (g.nodes.length !== 2) throw new Error(`expected 2 nodes from leading KGC block, got ${g.nodes.length}`)
  if (g.edges.length !== 1) throw new Error(`expected 1 deduped edge from leading KGC block, got ${g.edges.length}`)
  const edge = g.edges[0]
  if (String(edge.source || '') !== 'n-in' || String(edge.target || '') !== 'n-out') {
    throw new Error('expected canonical edge endpoints without @node prefix drift')
  }
}

export function testMarkdownFrontmatterFlowGraphFlowBlockParsesDottedEdgeEndpointsForWidgetLinks() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-in',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-out',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - source: n-in.turn',
    '      target: n-out.turn',
    '      label: "responds"',
    '---',
    '',
    '# trailing history',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-dotted-flow-edges.md', md)
  if (!res) throw new Error('expected frontmatter flow parse result')
  if (res.graphData.edges.length !== 1) throw new Error(`expected 1 parsed edge, got ${res.graphData.edges.length}`)
  const edge = res.graphData.edges[0]!
  const props = (edge.properties || {}) as Record<string, unknown>
  if (String(edge.source || '') !== 'n-in' || String(edge.target || '') !== 'n-out') {
    throw new Error('expected dotted endpoints to resolve to node ids')
  }
  if (String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'turn') throw new Error('expected source port from dotted endpoint')
  if (String(props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'turn') throw new Error('expected target port from dotted endpoint')
  if (String(edge.label || '') !== 'responds') throw new Error('expected label from dotted flow edge declaration')
}

export function testMarkdownFrontmatterFlowGraphPreservesDeclaredPathIdentityWithFileExtension() {
  const sourceNodeId = 'doc:md:%2Fnotes%2Fnote_20260803T040623Z.md'
  const md = [
    '---',
    'flow:',
    '  nodes:',
    `    - id: ${JSON.stringify(sourceNodeId)}`,
    '      type: Document',
    '      "flow:widgetFormId": "fm:authored-document"',
    '      summary: "Keep authored input"',
    '    - id: generated-card',
    '      type: TextGeneration',
    '  edges:',
    `    - source: ${JSON.stringify(sourceNodeId)}`,
    '      target: generated-card',
    '      label: candidateOption',
    '---',
    '',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('authored-path-identity.md', md)
  if (!res) throw new Error('expected frontmatter flow parse result')
  const edge = res.graphData.edges[0]
  if (edge?.source !== sourceNodeId || edge.target !== 'generated-card') {
    throw new Error(`expected declared path identity to remain atomic instead of treating .md as a port, got ${JSON.stringify(edge)}`)
  }
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphKeepsOutputSourceHandlesForWidgetEdgeAnchors() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-in',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-out',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '        source: [detail]',
    '  edges:',
    '    - source: n-in.turn',
    '      target: n-out.turn',
    '    - source: n-out.detail',
    '      target: n-in.turn',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-output-source-handle.md', md)
  if (!res) throw new Error('expected chatKnowgrph flow parse result')
  const registry = ((res.graphData.metadata || {}) as Record<string, unknown>)['flow:widgetRegistry']
  if (!Array.isArray(registry)) throw new Error('expected widget registry metadata')
  const form = registry.find((r: unknown) => {
    const rec = (r || {}) as Record<string, unknown>
    return String(rec.formId || '') === 'fm:n-out'
  }) as Record<string, unknown> | undefined
  if (!form) throw new Error('expected n-out widget form registry entry')
  const ports = Array.isArray(form.ports) ? (form.ports as Array<Record<string, unknown>>) : []
  const hasDetailOutput = ports.some(p => String(p.portKey || '') === 'detail' && String(p.direction || '') === 'output')
  if (!hasDetailOutput) throw new Error('expected chatKnowgrph output node to keep source handle detail for widget edge anchors')
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphKeepsTurnEdgeDirectionAndHandleMapping() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-recommend-solo-founder-z',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-solution-1-use-case-prob',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '        source: [detail]',
    '  edges:',
    '    - source: n-recommend-solo-founder-z.turn',
    '      target: n-solution-1-use-case-prob.turn',
    '      label: "responds"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-turn-direction.md', md)
  if (!res) throw new Error('expected chatKnowgrph flow parse result')
  if (res.graphData.edges.length !== 1) throw new Error(`expected exactly 1 edge, got ${res.graphData.edges.length}`)
  const e = res.graphData.edges[0]!
  const props = (e.properties || {}) as Record<string, unknown>
  if (String(e.source || '') !== 'n-recommend-solo-founder-z') {
    throw new Error('expected source node to remain n-recommend-solo-founder-z')
  }
  if (String(e.target || '') !== 'n-solution-1-use-case-prob') {
    throw new Error('expected target node to remain n-solution-1-use-case-prob')
  }
  if (String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'turn') {
    throw new Error('expected source handle mapping to port turn')
  }
  if (String(props[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'turn') {
    throw new Error('expected target handle mapping to port turn')
  }
  if (String(e.label || '') !== 'responds') {
    throw new Error('expected edge label responds')
  }
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphFlowBlockOverridesLegacyTopLevelNodesAndEdges() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'nodes:',
    '  - id: legacy-a',
    '    label: "Legacy A"',
    '  - id: legacy-b',
    '    label: "Legacy B"',
    'edges:',
    '  - source: legacy-a.turn',
    '    target: legacy-b.turn',
    '    label: "legacy-edge"',
    'flow:',
    '  nodes:',
    '    - id: flow-a',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: flow-b',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - source: flow-a.turn',
    '      target: flow-b.turn',
    '      label: "flow-edge"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-flow-overrides-legacy.md', md)
  if (!res) throw new Error('expected parse result')
  const nodeIds = new Set((res.graphData.nodes || []).map(n => String(n.id || '')))
  if (nodeIds.has('legacy-a') || nodeIds.has('legacy-b')) {
    throw new Error('expected legacy top-level nodes to be ignored when flow block is present')
  }
  if (!nodeIds.has('flow-a') || !nodeIds.has('flow-b')) {
    throw new Error('expected only flow block nodes to remain')
  }
  if (res.graphData.edges.length !== 1) throw new Error(`expected only 1 flow edge, got ${res.graphData.edges.length}`)
  const e = res.graphData.edges[0]!
  if (String(e.source || '') !== 'flow-a' || String(e.target || '') !== 'flow-b' || String(e.label || '') !== 'flow-edge') {
    throw new Error('expected only flow block edge to remain')
  }
}

export function testMarkdownFrontmatterFlowGraphFlowBlockOverridesLegacyTopLevelEdgesOutsideChatMode() {
  const md = [
    '---',
    'nodes:',
    '  - id: legacy-a',
    '    label: "Legacy A"',
    '  - id: legacy-b',
    '    label: "Legacy B"',
    'edges:',
    '  - source: legacy-a.turn',
    '    target: legacy-b.turn',
    '    label: "legacy-edge"',
    'flow:',
    '  nodes:',
    '    - id: flow-a',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: flow-b',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - source: flow-a.turn',
    '      target: flow-b.turn',
    '      label: "flow-edge"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('flow-overrides-legacy-non-chat.md', md)
  if (!res) throw new Error('expected parse result')
  const nodeIds = new Set((res.graphData.nodes || []).map(n => String(n.id || '')))
  if (nodeIds.has('legacy-a') || nodeIds.has('legacy-b')) {
    throw new Error('expected legacy top-level nodes to be ignored when flow block is present')
  }
  if (!nodeIds.has('flow-a') || !nodeIds.has('flow-b')) {
    throw new Error('expected only flow block nodes to remain')
  }
  if (res.graphData.edges.length !== 1) throw new Error(`expected only 1 flow edge, got ${res.graphData.edges.length}`)
  const e = res.graphData.edges[0]!
  if (String(e.source || '') !== 'flow-a' || String(e.target || '') !== 'flow-b' || String(e.label || '') !== 'flow-edge') {
    throw new Error('expected only flow block edge to remain')
  }
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphRemovesConflictingComputeAndWiringData() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-a',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '      compute: "return 42"',
    '      data:',
    '        text: "ok"',
    '        handles: "legacy-should-be-removed"',
    '        compute: "legacy-should-be-removed"',
    '    - id: n-b',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '  edges:',
    '    - source: n-a.turn',
    '      target: n-b.turn',
    '      label: "responds"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-chat-clean-wire.md', md)
  if (!res) throw new Error('expected parse result')
  const nodeA = res.graphData.nodes.find(n => String(n.id || '') === 'n-a')
  if (!nodeA) throw new Error('expected node n-a')
  const props = (nodeA.properties || {}) as Record<string, unknown>
  const data = (props.data || {}) as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(props, 'compute')) {
    throw new Error('expected compute to be removed for chatKnowgrph flow nodes')
  }
  if (Object.prototype.hasOwnProperty.call(data, 'handles') || Object.prototype.hasOwnProperty.call(data, 'compute')) {
    throw new Error('expected conflicting wiring/compute keys removed from chatKnowgrph node data')
  }
  if (String(data.text || '') !== 'ok') throw new Error('expected non-conflicting data to remain')
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphParsesOnlyDeclaredFlowNodeIdsForWidgets() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'nodes:',
    '  - id: legacy-n-1',
    '    label: "Legacy 1"',
    '  - id: legacy-n-2',
    '    label: "Legacy 2"',
    'flow:',
    '  nodes:',
    '    - id: n-recommend-solo-founder-z',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-solution-1-use-case-prob',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '        source: [detail]',
    '    - id: n-1-use-case-problem-solut',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-use-case',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-problem',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-solo-founder-zero-budg',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-1-ship-a-wedge-in-7-14',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-2-tco-first-architectu',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-3-organic-growth-chann',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-4-conversion-loop-free',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '  edges:',
    '    - source: n-recommend-solo-founder-z.turn',
    '      target: n-solution-1-use-case-prob.turn',
    '      label: "responds"',
    '---',
  ].join('\n')

  const expected = [
    'n-recommend-solo-founder-z',
    'n-solution-1-use-case-prob',
    'n-1-use-case-problem-solut',
    'n-use-case',
    'n-problem',
    'n-2-solo-founder-zero-budg',
    'n-2-1-ship-a-wedge-in-7-14',
    'n-2-2-tco-first-architectu',
    'n-2-3-organic-growth-chann',
    'n-2-4-conversion-loop-free',
  ].sort()

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-chat-only-flow-node-ids.md', md)
  if (!res) throw new Error('expected parse result')
  const actual = (res.graphData.nodes || []).map(n => String(n.id || '')).filter(Boolean).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected only declared flow node ids, got ${JSON.stringify(actual)}`)
  }
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphKgcSampleUsesOnlyDeclaredTurnDetailPorts() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-recommend-solo-founder-z',
    '      type: input',
    '      handles:',
    '        source: [turn]',
    '    - id: n-solution-1-use-case-prob',
    '      type: output',
    '      handles:',
    '        target: [turn]',
    '        source: [detail]',
    '    - id: n-1-use-case-problem-solut',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-use-case',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-problem',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-solo-founder-zero-budg',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-1-ship-a-wedge-in-7-14',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-2-tco-first-architectu',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-3-organic-growth-chann',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '    - id: n-2-4-conversion-loop-free',
    '      type: default',
    '      handles:',
    '        target: [detail]',
    '  edges:',
    '    - source: n-recommend-solo-founder-z.turn',
    '      target: n-solution-1-use-case-prob.turn',
    '      label: "responds"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-1-use-case-problem-solut.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-use-case.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-problem.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-2-solo-founder-zero-budg.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-2-1-ship-a-wedge-in-7-14.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-2-2-tco-first-architectu.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-2-3-organic-growth-chann.detail',
    '      label: "expands"',
    '    - source: n-solution-1-use-case-prob.detail',
    '      target: n-2-4-conversion-loop-free.detail',
    '      label: "expands"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-flow-sample.md', md)
  if (!res) throw new Error('expected parse result')
  if (res.graphData.edges.length !== 9) throw new Error(`expected 9 flow edges, got ${res.graphData.edges.length}`)

  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta['flow:widgetRegistry']) ? (meta['flow:widgetRegistry'] as Array<Record<string, unknown>>) : []
  if (registry.length < 10) throw new Error(`expected widget registry entries for flow nodes, got ${registry.length}`)

  const forbiddenPortKeys = new Set(['compute', 'data'])
  for (let i = 0; i < registry.length; i += 1) {
    const rec = registry[i]
    const ports = Array.isArray(rec.ports) ? (rec.ports as Array<Record<string, unknown>>) : []
    for (let j = 0; j < ports.length; j += 1) {
      const portKey = String(ports[j]?.portKey || '').trim()
      if (forbiddenPortKeys.has(portKey)) {
        throw new Error(`expected no hard-coded port handle "${portKey}"`)
      }
    }
  }

  const formInput = registry.find(r => String(r.formId || '') === 'fm:n-recommend-solo-founder-z') || null
  if (!formInput) throw new Error('expected form registry for n-recommend-solo-founder-z')
  const inputPorts = Array.isArray(formInput.ports) ? (formInput.ports as Array<Record<string, unknown>>) : []
  const hasInputTurnSource = inputPorts.some(p => String(p.portKey || '') === 'turn' && String(p.direction || '') === 'output')
  if (!hasInputTurnSource) throw new Error('expected n-recommend-solo-founder-z source handle turn')

  const formOutput = registry.find(r => String(r.formId || '') === 'fm:n-solution-1-use-case-prob') || null
  if (!formOutput) throw new Error('expected form registry for n-solution-1-use-case-prob')
  const outputPorts = Array.isArray(formOutput.ports) ? (formOutput.ports as Array<Record<string, unknown>>) : []
  const hasOutputTurnTarget = outputPorts.some(p => String(p.portKey || '') === 'turn' && String(p.direction || '') === 'input')
  const hasOutputDetailSource = outputPorts.some(p => String(p.portKey || '') === 'detail' && String(p.direction || '') === 'output')
  if (!hasOutputTurnTarget || !hasOutputDetailSource) {
    throw new Error('expected n-solution-1-use-case-prob handles target.turn and source.detail')
  }
}

export function testMarkdownFrontmatterFlowGraphChatKnowgrphPrunesUnreferencedHandlesAndKeepsEdgeMappedPorts() {
  const md = [
    '---',
    'doc:',
    '  type: chatKnowgrph',
    'flow:',
    '  nodes:',
    '    - id: n-a',
    '      type: input',
    '      handles:',
    '        source: [turn,unusedOut]',
    '    - id: n-b',
    '      type: output',
    '      handles:',
    '        target: [turn,unusedIn]',
    '        source: [detail,unusedOut2]',
    '  edges:',
    '    - source: n-a.turn',
    '      target: n-b.turn',
    '      label: "responds"',
    '    - source: n-b.detail',
    '      target: n-a.turn',
    '      label: "expands"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('kgc-handle-prune.md', md)
  if (!res) throw new Error('expected parse result')
  const meta = (res.graphData.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta['flow:widgetRegistry']) ? (meta['flow:widgetRegistry'] as Array<Record<string, unknown>>) : []
  const formA = registry.find(r => String(r.formId || '') === 'fm:n-a')
  const formB = registry.find(r => String(r.formId || '') === 'fm:n-b')
  if (!formA || !formB) throw new Error('expected widget registry forms for n-a and n-b')
  const portsA = Array.isArray(formA.ports) ? formA.ports as Array<Record<string, unknown>> : []
  const portsB = Array.isArray(formB.ports) ? formB.ports as Array<Record<string, unknown>> : []
  const hasA_turn_out = portsA.some(p => String(p.portKey || '') === 'turn' && String(p.direction || '') === 'output')
  const hasA_unusedOut = portsA.some(p => String(p.portKey || '') === 'unusedOut')
  const hasB_turn_in = portsB.some(p => String(p.portKey || '') === 'turn' && String(p.direction || '') === 'input')
  const hasB_detail_out = portsB.some(p => String(p.portKey || '') === 'detail' && String(p.direction || '') === 'output')
  const hasB_unused = portsB.some(p => String(p.portKey || '').toLowerCase().includes('unused'))
  if (!hasA_turn_out || !hasB_turn_in || !hasB_detail_out) {
    throw new Error('expected edge-mapped handle ports to remain')
  }
  if (hasA_unusedOut || hasB_unused) {
    throw new Error('expected unreferenced handles to be pruned in chatKnowgrph flow mode')
  }
}

export function testMarkdownFrontmatterFlowGraphEnforcesNodeTypeHandleAndComputeContract() {
  const md = [
    '---',
    'flow:',
    '  computed: true',
    '  nodes:',
    '    - id: n-input',
    '      type: input',
    '      handles:',
    '        target: [bad_sink]',
    '        source: [out_a]',
    '      compute: |',
    '        (inputs) => ({ out_a: inputs.bad_sink })',
    '      data: []',
    '    - id: n-output',
    '      type: output',
    '      handles:',
    '        target: [in_a]',
    '        source: [bad_source]',
    '      compute: |',
    '        (inputs) => ({ bad_source: inputs.in_a })',
    '      data: "scalar-jsonb"',
    '  edges:',
    '    - id: e1',
    '      source: n-input',
    '      sourceHandle: out_a',
    '      target: n-output',
    '      targetHandle: in_a',
    '---',
    '',
    '# Demo',
  ].join('\n')
  const res = tryParseMarkdownFrontmatterFlowGraph('flow-contract.md', md)
  if (!res) throw new Error('expected parse result')
  const inputNode = res.graphData.nodes.find(n => n.id === 'n-input') || null
  const outputNode = res.graphData.nodes.find(n => n.id === 'n-output') || null
  if (!inputNode || !outputNode) throw new Error('expected input and output nodes')
  const inputProps = (inputNode.properties || {}) as Record<string, unknown>
  const outputProps = (outputNode.properties || {}) as Record<string, unknown>
  if (typeof inputProps['flow:compute'] !== 'string' || !String(inputProps['flow:compute']).trim()) {
    throw new Error('expected input compute to be preserved')
  }
  if (typeof outputProps['flow:compute'] !== 'string' || !String(outputProps['flow:compute']).trim()) {
    throw new Error('expected output compute to be preserved')
  }
  const inputPortTypes = (inputProps['flow:portTypes'] || {}) as { in?: Record<string, unknown>; out?: Record<string, unknown> }
  const outputPortTypes = (outputProps['flow:portTypes'] || {}) as { in?: Record<string, unknown>; out?: Record<string, unknown> }
  if (inputPortTypes.in && Object.keys(inputPortTypes.in).length > 0) throw new Error('expected input node to have no target handles')
  if (outputPortTypes.out && Object.keys(outputPortTypes.out).length > 0) throw new Error('expected output node to have no source handles')
  if ((inputProps.data as unknown[] | null)?.length !== 0) throw new Error('expected input node data to preserve jsonb array')
  if (String(outputProps.data || '') !== 'scalar-jsonb') throw new Error('expected output node data to preserve jsonb scalar')
  const warningBlob = res.warnings.join(' | ')
  if (!warningBlob.includes('input node n-input cannot declare target handles')) throw new Error('expected input sink contract warning')
  if (!warningBlob.includes('output node n-output cannot declare source handles')) throw new Error('expected output source contract warning')
}

function readPitchdeckTemplatePath(): string {
  const envPath = typeof process.env.KG_TEST_PITCHDECK_TEMPLATE_PATH === 'string'
    ? process.env.KG_TEST_PITCHDECK_TEMPLATE_PATH.trim()
    : ''
  if (envPath) return envPath
  const cwd = process.cwd()
  const fallback = path.resolve(cwd, '..', '..', 'huijoohwee.github.io', 'template', 'pitchdeck-prd-tad-template-lite.md')
  return fallback
}

export function testMarkdownFrontmatterFlowGraphFidelityPitchdeckTemplateLite() {
  const templatePath = readPitchdeckTemplatePath()
  if (!templatePath || !fs.existsSync(templatePath)) return
  const md = fs.readFileSync(templatePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(templatePath), md)
  if (!res) throw new Error('expected pitchdeck frontmatter flow parse result')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  const flowEdges = g.edges.filter(e => {
    const props = (e.properties || {}) as Record<string, unknown>
    const sourcePort = String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '')
    const targetPort = String(props[FLOW_EDGE_TARGET_PORT_KEY] || '')
    return !!sourcePort && !!targetPort
  })
  if (flowEdges.length !== 4) throw new Error(`expected 4 handle-linked flow edges, got ${flowEdges.length}`)

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const requiredIds = [
    'w-text-outline',
    'p-text-outline',
    'w-image-keyvisual',
    'p-image-keyvisual',
    'w-video-cut',
    'p-video-cut',
  ]
  for (let i = 0; i < requiredIds.length; i += 1) {
    if (!nodeById.has(requiredIds[i]!)) throw new Error(`expected ${requiredIds[i]} node`) 
  }

  const wText = nodeById.get('w-text-outline')!
  const wTextProps = (wText.properties || {}) as Record<string, unknown>
  if (String(wTextProps.chatProvider || '') !== 'byteplus-modelark') {
    throw new Error('expected pitchdeck template to resolve template_inputs.text_provider into w-text-outline.chatProvider')
  }
}

function readMarkdownSyntaxComputingFlowSamplePath(): string {
  const envPath = typeof process.env.KG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_SAMPLE_PATH === 'string'
    ? process.env.KG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_SAMPLE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveRepoTestDataPath('markdown-syntax-computing-flow-sample.md')
}

function readMarkdownSyntaxComputingFlowRfSamplePath(): string {
  const envPath = typeof process.env.KG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_RF_SAMPLE_PATH === 'string'
    ? process.env.KG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_RF_SAMPLE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveRepoTestDataPath('markdown-syntax-computing-flow-rf-sample.md')
}

function readKnowgrphRichMediaGenerationDemoPath(): string {
  const envPath = typeof process.env.KG_TEST_KNOWGRPH_RICH_MEDIA_GENERATION_DEMO_PATH === 'string'
    ? process.env.KG_TEST_KNOWGRPH_RICH_MEDIA_GENERATION_DEMO_PATH.trim()
    : ''
  return envPath
}

function readKnowgrphVideoDemoPath(): string {
  const envPath = typeof process.env.KG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_PATH === 'string'
    ? process.env.KG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveDocsSsotFixturePath('knowgrph-video-demo.md')
}

function readKnowgrphVideoDemoSeededPath(): string {
  const envPath = typeof process.env.KG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_SEEDED_PATH === 'string'
    ? process.env.KG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_SEEDED_PATH.trim()
    : ''
  return envPath
}

function readKgcAiPipelinePrdTadPath(): string {
  const envPath = typeof process.env.KG_TEST_KGC_PIPELINE_PRD_TAD_PATH === 'string'
    ? process.env.KG_TEST_KGC_PIPELINE_PRD_TAD_PATH.trim()
    : ''
  if (envPath) return envPath
  const cwd = process.cwd()
  return path.resolve(cwd, '..', '..', '..', 'huijoohwee.github.io', 'docs', 'kgc-ai-pipeline-prd-tad.md')
}

export function testMarkdownFrontmatterFlowGraphFidelityMarkdownSyntaxComputingFlowSample() {
  const samplePath = readMarkdownSyntaxComputingFlowSamplePath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected computing-flow sample frontmatter parse result')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const typedNodes = g.nodes.filter(n => {
    const type = String(n?.type || '').trim()
    return type === 'input' || type === 'default' || type === 'output' || type === 'custom'
  })
  if (typedNodes.length !== 9) throw new Error(`expected 9 typed flow nodes, got ${typedNodes.length}`)
  const byType = new Map<string, number>()
  for (let i = 0; i < typedNodes.length; i += 1) {
    const type = String(typedNodes[i]?.type || '').trim()
    byType.set(type, (byType.get(type) || 0) + 1)
  }
  if ((byType.get('input') || 0) !== 2) throw new Error('expected 2 input nodes')
  if ((byType.get('default') || 0) !== 4) throw new Error('expected 4 default nodes')
  if ((byType.get('output') || 0) !== 2) throw new Error('expected 2 output nodes')
  if ((byType.get('custom') || 0) !== 1) throw new Error('expected 1 custom node')

  const flowEdges = g.edges.filter(e => {
    const props = (e.properties || {}) as Record<string, unknown>
    const sourcePort = String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '')
    const targetPort = String(props[FLOW_EDGE_TARGET_PORT_KEY] || '')
    return !!sourcePort && !!targetPort
  })
  if (flowEdges.length !== 11) throw new Error(`expected 11 handle-linked edges, got ${flowEdges.length}`)

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const configNode = nodeById.get('n-config') || null
  if (!configNode) throw new Error('expected n-config input node')
  const configData = (((configNode.properties || {}) as Record<string, unknown>).data || {}) as Record<string, unknown>
  if (String(configData.demo_url || '') !== 'https://treehacks-2026.devpost.com/project-gallery') {
    throw new Error('expected frontmatter variable resolution for n-config.data.demo_url')
  }
  if (configData.threshold !== 0.75) {
    throw new Error('expected numeric frontmatter variable resolution for n-config.data.threshold')
  }
  if (String(configData.score_formula || '') !== 'demos.length * 0.4 + (winner ? 0.6 : 0)') {
    throw new Error('expected frontmatter variable resolution for n-config.data.score_formula')
  }

  const unresolvedLabelEdge = flowEdges.find(e => String(e.id || '') === 'fe-06') || null
  if (!unresolvedLabelEdge) throw new Error('expected fe-06 edge')
  if (String(unresolvedLabelEdge.label || '') !== 'confidence ≥ high') {
    throw new Error('expected edge labels to resolve dotted flow-node data references')
  }

  const scoreNode = nodeById.get('n-score') || null
  if (!scoreNode) throw new Error('expected n-score default node')
  const scoreCompute = String((((scoreNode.properties || {}) as Record<string, unknown>)['flow:compute']) || '')
  if (!scoreCompute.includes('scored_demos')) throw new Error('expected n-score compute to be preserved')

  const waitingNode = nodeById.get('n-gallery') || null
  if (!waitingNode) throw new Error('expected n-gallery output node')
  const waitingProps = (waitingNode.properties || {}) as Record<string, unknown>
  if (waitingProps['frontmatter:waiting'] !== true) throw new Error('expected frontmatter:waiting for TBD repo_url')
  const waitingData = (waitingProps.data || {}) as Record<string, unknown>
  if (waitingData.repo_url !== null) throw new Error('expected repo_url TBD to normalize as null')

  const flowWarnings = res.warnings.filter(w => w.includes('Flow node contract violation') || w.includes('Flow node compute rejected as unsafe'))
  if (flowWarnings.length > 0) throw new Error(`expected no flow contract warnings for sample, got: ${flowWarnings.join(' | ')}`)
}

export function testMarkdownFrontmatterFlowGraphFidelityKgcAiPipelinePrdTadTopLevelSections() {
  const samplePath = readKgcAiPipelinePrdTadPath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected KGC pipeline PRD/TAD frontmatter parse result')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  if (!Array.isArray(g.nodes) || g.nodes.length !== 5) throw new Error(`expected 5 flow nodes, got ${g.nodes.length}`)
  if (!Array.isArray(g.edges) || g.edges.length !== 5) throw new Error(`expected 5 flow edges, got ${g.edges.length}`)

  const meta = (g.metadata || {}) as Record<string, unknown>
  const frontmatterMeta = (meta.frontmatterMeta || null) as Record<string, unknown> | null
  if (!frontmatterMeta || typeof frontmatterMeta !== 'object') throw new Error('expected metadata.frontmatterMeta for top-level frontmatter sections')

  if (String(frontmatterMeta.product || '') !== '{{product}}') throw new Error('expected Tier B placeholder product in frontmatterMeta')
  if (String(frontmatterMeta.subject || '') !== '{{subject}}') throw new Error('expected Tier B placeholder subject in frontmatterMeta')
  const runtime = (frontmatterMeta.runtime || null) as Record<string, unknown> | null
  if (!runtime || typeof runtime !== 'object') throw new Error('expected runtime block in frontmatterMeta')
  const runtimeEntry = (runtime.entry || null) as Record<string, unknown> | null
  const runtimeExit = (runtime.exit || null) as Record<string, unknown> | null
  if (String(runtimeEntry?.value || '') !== 'n-trigger') throw new Error('expected runtime.entry.value=n-trigger')
  if (String(runtimeExit?.value || '') !== 'n-deliver') throw new Error('expected runtime.exit.value=n-deliver')

  const pipeline = Array.isArray(frontmatterMeta.pipeline) ? frontmatterMeta.pipeline as Array<Record<string, unknown>> : null
  if (!pipeline || pipeline.length !== 5) throw new Error('expected 5 pipeline steps in frontmatterMeta')
  if (String((pipeline[0] || {}).seq || '') !== 'S01' || String((pipeline[4] || {}).seq || '') !== 'S05') {
    throw new Error('expected pipeline S01..S05 sequence in frontmatterMeta')
  }

  const mermaid = String(frontmatterMeta.mermaid || '')
  if (!mermaid.includes('flowchart LR')) throw new Error('expected mermaid block preserved in frontmatterMeta')
  const flow = (frontmatterMeta.flow || null) as Record<string, unknown> | null
  if (!flow || typeof flow !== 'object') throw new Error('expected flow block in frontmatterMeta')
  const flowNodes = Array.isArray(flow.nodes) ? flow.nodes : []
  if (flowNodes.length !== 5) throw new Error(`expected 5 flow.nodes in frontmatterMeta, got ${flowNodes.length}`)
  const flowEdges = Array.isArray(flow.edges) ? flow.edges : []
  if (flowEdges.length !== 5) throw new Error(`expected 5 flow.edges in frontmatterMeta, got ${flowEdges.length}`)
}

export function testMarkdownFrontmatterFlowGraphFidelityMarkdownSyntaxComputingFlowRfSample() {
  const samplePath = readMarkdownSyntaxComputingFlowRfSamplePath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected computing-flow-rf sample frontmatter parse result')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const typedNodes = g.nodes.filter(n => {
    const type = String(n?.type || '').trim()
    return type === 'input' || type === 'default' || type === 'output'
  })
  if (typedNodes.length !== 7) throw new Error(`expected 7 typed flow nodes, got ${typedNodes.length}`)
  const byType = new Map<string, number>()
  for (let i = 0; i < typedNodes.length; i += 1) {
    const type = String(typedNodes[i]?.type || '').trim()
    byType.set(type, (byType.get(type) || 0) + 1)
  }
  if ((byType.get('input') || 0) !== 3) throw new Error('expected 3 input nodes')
  if ((byType.get('default') || 0) !== 2) throw new Error('expected 2 default nodes')
  if ((byType.get('output') || 0) !== 2) throw new Error('expected 2 output nodes')

  const flowEdges = g.edges.filter(e => {
    const props = (e.properties || {}) as Record<string, unknown>
    const sourcePort = String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '')
    const targetPort = String(props[FLOW_EDGE_TARGET_PORT_KEY] || '')
    return !!sourcePort && !!targetPort
  })
  if (flowEdges.length !== 6) throw new Error(`expected 6 handle-linked edges, got ${flowEdges.length}`)

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const inputNode = nodeById.get('1') || null
  if (!inputNode) throw new Error('expected node 1')
  const inputData = (((inputNode.properties || {}) as Record<string, unknown>).data || {}) as Record<string, unknown>
  if (!String(inputData.note || '').includes('@flag:local state for UI; data object for downstream')) {
    throw new Error('expected input-node downstream data advisory flag in node 1 data.note')
  }

  const colorNode = nodeById.get('4') || null
  if (!colorNode) throw new Error('expected node 4')
  const colorData = (((colorNode.properties || {}) as Record<string, unknown>).data || {}) as Record<string, unknown>
  if (!String(colorData.note || '').includes('per-handle connection state')) {
    throw new Error('expected per-handle connection state advisory flag in node 4 data.note')
  }

  const edge = flowEdges.find(e => String(e.id || '') === 'e7-8') || null
  if (!edge) throw new Error('expected e7-8 edge')
  const edgeProps = (edge.properties || {}) as Record<string, unknown>
  if (String(edgeProps[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'color') throw new Error('expected e7-8 source port color')
  if (String(edgeProps[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'color') throw new Error('expected e7-8 target port color')

  const positions: Record<string, { x: number; y: number }> = {}
  for (let i = 0; i < g.nodes.length; i += 1) {
    const n = g.nodes[i]
    const id = String(n.id || '').trim()
    if (!id) continue
    const x = (n as unknown as { x?: unknown }).x
    const y = (n as unknown as { y?: unknown }).y
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      positions[id] = { x, y }
    }
  }
  const runtime = { rankdir: 'LR', scene: null, dirty: false } as unknown as {
    rankdir: 'TB' | 'LR'
    scene: unknown
    dirty: boolean
  }
  buildAndSetFlowNativeScene({
    runtime: runtime as never,
    graphData: g,
    positions,
    schema: null,
    forbidCircleNodes: false,
    flowConfig: readFlowConfig({ schema: null, rankdir: 'LR' }),
    sceneGroups: [],
    rankdir: 'LR',
    widgetRegistry: [],
  })
  const scene = runtime.scene as unknown as { nodes?: Array<{ id?: unknown }>; edges?: Array<{ id?: unknown }> } | null
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length < 7) throw new Error('expected Flow native scene nodes for RF sample')
  if (!Array.isArray(scene.edges) || scene.edges.length < 6) throw new Error('expected Flow native scene edges for RF sample')

  const flowWarnings = res.warnings.filter(w => w.includes('Flow node contract violation') || w.includes('Flow node compute rejected as unsafe'))
  if (flowWarnings.length > 0) throw new Error(`expected no flow contract warnings for RF sample, got: ${flowWarnings.join(' | ')}`)
}

export function testMarkdownFrontmatterFlowGraphFidelityKnowgrphRichMediaGenerationDemo() {
  const samplePath = readKnowgrphRichMediaGenerationDemoPath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected rich-media generation demo frontmatter parse result')
  const g = res.graphData
  if (g.context !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')
  if (g.nodes.length !== 20) throw new Error(`expected 20 flow nodes, got ${g.nodes.length}`)
  if (g.edges.length !== 32) throw new Error(`expected 32 flow edges, got ${g.edges.length}`)

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const videoNode = nodeById.get('w-video-scene') || null
  const panelNode = nodeById.get('p-video-scene') || null
  if (!videoNode) throw new Error('expected w-video-scene node')
  if (!panelNode) throw new Error('expected p-video-scene node')

  const videoProps = (videoNode.properties || {}) as Record<string, unknown>
  if (String(videoProps[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'videoGeneration') {
    throw new Error('expected w-video-scene flow:widgetFormId=videoGeneration')
  }
  if (String(videoProps.model || '') !== 'seedance-1-0-pro-fast-251015') {
    throw new Error(`expected BytePlus video demo default model, got ${String(videoProps.model || '')}`)
  }
  if (
    String(videoProps.prompt || '')
    !== 'epic cinematic, myth-tech fusion, 12s; Flaming Mountain desert; celestial troops vs mech-beasts at sunset. Script: Epic cinematic battlefield video set on a vast ancient desert. The film opens with an extreme wide establishing shot — massive ranks of celestial troops, ornate heavenly armor, cloud-tipped spears, silk banners snapping in dust-laden winds. At the front: a towering Robomonkey, chrome-gold body etched with seal script, glowing red eyes cutting through the haze, electric staff crackling at its back — and beside it a barrel-chested Robopig, iron-plated snout gleaming, mechanical rake raised and humming. Low-angle sunset light casts a heavy amber glow as the camera slowly pushes in, hydraulic joints hissing, steam rising in the cold air. Cut to medium: Robomonkey stares ahead, golden headband catching the last light. Low-angle: Robopig\'s iron hoof strikes the cracked earth — sand and embers erupt, ground trembling. Pull back to a high aerial wide: the full celestial army stretches across the Flaming Mountain desert — vast, overwhelming, awe-inspiring.\n'
  ) {
    throw new Error(`expected resolved video prompt contract, got ${String(videoProps.prompt || '')}`)
  }
  if (Number(videoProps.duration) !== 12) {
    throw new Error(`expected video duration 12, got ${String(videoProps.duration || '')}`)
  }
  if (String(videoProps.ratio || '') !== '16:9') throw new Error('expected video ratio 16:9')
  if (String(videoProps.resolution || '') !== '480p') throw new Error('expected video resolution 480p')
  if (videoProps.generate_audio !== false) throw new Error('expected generate_audio=false')
  if (videoProps.draft !== true) throw new Error('expected draft=true')
  if (videoProps.camera_fixed !== false) throw new Error('expected camera_fixed=false')
  if (String(videoProps.image_url_url || '') !== 'base64') throw new Error('expected image_url_url=base64')
  const videoHandles = (videoProps['frontmatter:handles'] || null) as Record<string, unknown> | null
  const videoTargetHandles = Array.isArray(videoHandles?.target) ? videoHandles.target : []
  const videoSourceHandles = Array.isArray(videoHandles?.source) ? videoHandles.source : []
  if (videoTargetHandles.length !== 1 || String(videoTargetHandles[0] || '') !== 'reference_image') {
    throw new Error('expected w-video-scene target handle reference_image')
  }
  if (videoSourceHandles.length !== 1 || String(videoSourceHandles[0] || '') !== 'videoUrl') {
    throw new Error('expected w-video-scene source handle videoUrl')
  }

  const frontmatterMeta = ((g.metadata || {}) as Record<string, unknown>).frontmatterMeta as Record<string, unknown> | null
  const demoInputs = (frontmatterMeta?.demo_inputs || null) as Record<string, unknown> | null
  const location = (demoInputs?.location || null) as Record<string, unknown> | null
  if (String(demoInputs?.vibe || '') !== 'epic cinematic, myth-tech fusion') {
    throw new Error('expected demo_inputs.vibe to match current rich-media generation demo')
  }
  if (Number(demoInputs?.duration_seconds) !== 12) throw new Error('expected demo_inputs.duration_seconds=12')
  if (String(location?.name || '') !== 'Flaming Mountain desert') {
    throw new Error('expected demo_inputs.location.name=Flaming Mountain desert')
  }
  if (String(location?.label || '') !== 'Flaming Mountain desert (sunset battlefield)') {
    throw new Error('expected demo_inputs.location.label to match the sunset battlefield scene')
  }
  if (String(frontmatterMeta?.kgCanvasRenderMode || '') !== '2d') {
    throw new Error('expected rich-media generation demo to preserve kgCanvasRenderMode=2d in frontmatter metadata')
  }
  if (String(frontmatterMeta?.kgCanvas2dRenderer || '') !== 'storyboard') {
    throw new Error('expected rich-media generation demo to preserve kgCanvas2dRenderer=storyboard in frontmatter metadata')
  }
  if (frontmatterMeta?.kgFrontmatterModeEnabled !== true) {
    throw new Error('expected rich-media generation demo to preserve kgFrontmatterModeEnabled=true in frontmatter metadata')
  }
  if (frontmatterMeta?.kgDocumentStructureBaselineLock !== false) {
    throw new Error('expected rich-media generation demo to preserve kgDocumentStructureBaselineLock=false in frontmatter metadata')
  }

  const panelProps = (panelNode.properties || {}) as Record<string, unknown>
  if (String(panelProps[FLOW_WIDGET_FORM_ID_KEY] || '') !== 'richMediaPanel') {
    throw new Error('expected p-video-scene flow:widgetFormId=richMediaPanel')
  }
  const panelHandles = (panelProps['frontmatter:handles'] || null) as Record<string, unknown> | null
  const panelTargetHandles = Array.isArray(panelHandles?.target) ? panelHandles.target : []
  const panelSourceHandles = Array.isArray(panelHandles?.source) ? panelHandles.source : []
  if (panelTargetHandles.length !== 2 || String(panelTargetHandles[0] || '') !== 'videoUrl' || String(panelTargetHandles[1] || '') !== 'outputSrcDoc') {
    throw new Error('expected p-video-scene target handles [videoUrl, outputSrcDoc]')
  }
  if (panelSourceHandles.length !== 2 || String(panelSourceHandles[0] || '') !== 'videoUrl' || String(panelSourceHandles[1] || '') !== 'outputSrcDoc') {
    throw new Error('expected p-video-scene source handles [videoUrl, outputSrcDoc]')
  }

  const edge = g.edges.find(e => String(e.id || '') === 'e-video') || null
  if (!edge) throw new Error('expected e-video edge')
  const edgeProps = (edge.properties || {}) as Record<string, unknown>
  if (String(edge.source || '') !== 'w-video-scene' || String(edge.target || '') !== 'p-video-scene') {
    throw new Error('expected e-video endpoints w-video-scene -> p-video-scene')
  }
  if (String(edgeProps[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'videoUrl') throw new Error('expected e-video source port videoUrl')
  if (String(edgeProps[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'videoUrl') throw new Error('expected e-video target port videoUrl')

  const sceneToVideoRefEdge = g.edges.find(e => String(e.id || '') === 'e-scene01-to-video-ref') || null
  if (!sceneToVideoRefEdge) throw new Error('expected e-scene01-to-video-ref edge')
  const sceneToVideoRefProps = (sceneToVideoRefEdge.properties || {}) as Record<string, unknown>
  if (String(sceneToVideoRefEdge.source || '') !== 'w-img-scene-01' || String(sceneToVideoRefEdge.target || '') !== 'w-video-scene') {
    throw new Error('expected e-scene01-to-video-ref endpoints w-img-scene-01 -> w-video-scene')
  }
  if (String(sceneToVideoRefProps[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== 'imageUrl') {
    throw new Error('expected e-scene01-to-video-ref source port imageUrl')
  }
  if (String(sceneToVideoRefProps[FLOW_EDGE_TARGET_PORT_KEY] || '') !== 'reference_image') {
    throw new Error('expected e-scene01-to-video-ref target port reference_image')
  }

  const display = deriveSceneDisplayGraph({ graphData: g })
  if (!display) throw new Error('expected display graph derivation for rich-media generation demo')
  if (display.displayNodes.length !== 20) throw new Error(`expected 20 display nodes, got ${display.displayNodes.length}`)
  if (display.displayEdges.length !== 32) throw new Error(`expected 32 display edges, got ${display.displayEdges.length}`)
  const displayEdgeIds = new Set(display.displayEdges.map(e => String(e.id || '').trim()).filter(Boolean))
  if (!displayEdgeIds.has('e-video')) throw new Error('expected display graph to keep e-video visible')
  if (!displayEdgeIds.has('e-scene01-to-video-ref')) throw new Error('expected display graph to keep e-scene01-to-video-ref visible')
}

export function testMarkdownFrontmatterFlowGraphFidelityKnowgrphVideoDemoDirectorBriefShotsToWidgets() {
  const samplePath = readKnowgrphVideoDemoPath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected knowgrph video demo frontmatter parse result')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const shotText = nodeById.get('db-shot-S01-text') || null
  if (!shotText) throw new Error('expected derived director_brief shot node db-shot-S01-text')
  if (String(shotText.type || '').trim() !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    throw new Error('expected shot text node to be TextGeneration')
  }
  const props = (shotText.properties || {}) as Record<string, unknown>
  const rawSpecs = props[FRONTMATTER_FLOW_WIDGET_FIELDS_KEY]
  const fieldSpecs = Array.isArray(rawSpecs) ? rawSpecs : []
  const specKeys = fieldSpecs
    .map(v => (v && typeof v === 'object' && !Array.isArray(v) ? String((v as Record<string, unknown>).fieldKey || '').trim() : ''))
    .filter(Boolean)
  ;['shot', 'timecode', 'epoch', 'description', 'image_prompt', 'video_prompt'].forEach(k => {
    if (!specKeys.includes(k)) throw new Error(`expected shot node to expose field spec ${k}`)
  })
  if (String(props.shot || '').trim() !== 'S01') throw new Error('expected shot node properties.shot to be S01')
  const output = String(props.output || '')
  if (!output.includes('# Shot S01')) throw new Error('expected shot node to prepopulate markdown output')

  const posText = { x: (shotText as unknown as { x?: unknown }).x, y: (shotText as unknown as { y?: unknown }).y }
  if (!(typeof posText.x === 'number' && Number.isFinite(posText.x))) throw new Error('expected shot text node x position')
  if (!(typeof posText.y === 'number' && Number.isFinite(posText.y))) throw new Error('expected shot text node y position')
  if (Number(props['visual:zIndex']) !== 0) throw new Error('expected shot text visual:zIndex=0')

  const shotTextPanel = nodeById.get('db-shot-S01-text-panel') || null
  if (!shotTextPanel) throw new Error('expected derived shot panel node db-shot-S01-text-panel')
  const panelProps = (shotTextPanel.properties || {}) as Record<string, unknown>
  if (Number(panelProps['visual:zIndex']) !== 1) throw new Error('expected shot panel visual:zIndex=1')
  if (String(panelProps.richMediaActiveTab || '') !== 'text') throw new Error('expected shot text panel richMediaActiveTab=text')
  const posPanel = { x: (shotTextPanel as unknown as { x?: unknown }).x, y: (shotTextPanel as unknown as { y?: unknown }).y }
  if (posPanel.x === posText.x && posPanel.y === posText.y) throw new Error('expected shot panel to not overlap shot text position')
  if (!(Number(posPanel.y) - Number(posText.y) > 600)) {
    throw new Error('expected derived director_brief shot panel rows to clear the full widget height instead of overlapping the source widget')
  }
  if (!(Number(posPanel.y) - Number(posText.y) < 680)) {
    throw new Error(`expected derived director_brief shot panel rows to stay visually tight after 16:9 panel offset tuning, got ${Number(posPanel.y) - Number(posText.y)}`)
  }

  const shotImagePanel = nodeById.get('db-shot-S01-image-panel') || null
  const shotVideoPanel = nodeById.get('db-shot-S01-video-panel') || null
  if (!shotImagePanel) throw new Error('expected derived shot panel node db-shot-S01-image-panel')
  if (!shotVideoPanel) throw new Error('expected derived shot panel node db-shot-S01-video-panel')
  if (String((((shotImagePanel.properties || {}) as Record<string, unknown>).richMediaActiveTab) || '') !== 'image') {
    throw new Error('expected shot image panel richMediaActiveTab=image')
  }
  if (String((((shotVideoPanel.properties || {}) as Record<string, unknown>).richMediaActiveTab) || '') !== 'video') {
    throw new Error('expected shot video panel richMediaActiveTab=video')
  }

  const topLevelPanelNodes = g.nodes.filter(node => String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  const topLevelPanelById = new Map(topLevelPanelNodes.map(node => [String(node.id || '').trim(), node] as const))
  if (String((((topLevelPanelById.get('p-text-script')?.properties || {}) as Record<string, unknown>).richMediaActiveTab) || '') !== 'text') {
    throw new Error('expected authored text panel richMediaActiveTab=text')
  }
  if (String((((topLevelPanelById.get('p-img-scene')?.properties || {}) as Record<string, unknown>).richMediaActiveTab) || '') !== 'image') {
    throw new Error('expected authored image panel richMediaActiveTab=image')
  }
  if (String((((topLevelPanelById.get('p-video-scene')?.properties || {}) as Record<string, unknown>).richMediaActiveTab) || '') !== 'video') {
    throw new Error('expected authored video panel richMediaActiveTab=video')
  }
  const authoredFlowXs = ['w-text-script', 'w-img-scene', 'w-video-scene', 'p-text-script', 'p-img-scene', 'p-video-scene']
    .map(id => Number((nodeById.get(id) as unknown as { x?: unknown } | null)?.x))
    .filter(Number.isFinite)
  const shotBandXs = ['db-shot-S01-text', 'db-shot-S01-image', 'db-shot-S01-video', 'db-shot-S05-text', 'db-shot-S05-image', 'db-shot-S05-video']
    .map(id => Number((nodeById.get(id) as unknown as { x?: unknown } | null)?.x))
    .filter(Number.isFinite)
  const authoredFlowYs = ['w-text-script', 'w-img-scene', 'w-video-scene', 'p-text-script', 'p-img-scene', 'p-video-scene']
    .map(id => Number((nodeById.get(id) as unknown as { y?: unknown } | null)?.y))
    .filter(Number.isFinite)
  const shotBandYs = ['db-shot-S01-text', 'db-shot-S01-text-panel', 'db-shot-S05-text', 'db-shot-S05-text-panel']
    .map(id => Number((nodeById.get(id) as unknown as { y?: unknown } | null)?.y))
    .filter(Number.isFinite)
  if (authoredFlowXs.length > 0 && shotBandXs.length > 0) {
    const authoredMinX = Math.min(...authoredFlowXs)
    const authoredMaxX = Math.max(...authoredFlowXs)
    const shotMinX = Math.min(...shotBandXs)
    const shotMaxX = Math.max(...shotBandXs)
    const separatedHorizontally =
      authoredMinX - shotMaxX > 300
      || shotMinX - authoredMaxX > 300
    const separatedVertically = authoredFlowYs.length > 0 && shotBandYs.length > 0
      ? (
          Math.min(...authoredFlowYs) - Math.max(...shotBandYs) > 300
          || Math.min(...shotBandYs) - Math.max(...authoredFlowYs) > 300
        )
      : false
    if (!separatedHorizontally && !separatedVertically) {
      throw new Error('expected derived director_brief shot grid to stay in a separate band so it does not overlap the primary frontmatter flow graph')
    }
  }

  const shot2 = nodeById.get('db-shot-S02-text') || null
  if (!shot2) throw new Error('expected derived director_brief shot node db-shot-S02-text')
  const pos2 = { x: (shot2 as unknown as { x?: unknown }).x, y: (shot2 as unknown as { y?: unknown }).y }
  if (!(typeof pos2.x === 'number' && Number.isFinite(pos2.x))) throw new Error('expected shot S02 x position')
  if (!(typeof pos2.y === 'number' && Number.isFinite(pos2.y))) throw new Error('expected shot S02 y position')
  if (pos2.x === posText.x && pos2.y === posText.y) throw new Error('expected shot S02 to not overlap shot S01')

  const shot3 = nodeById.get('db-shot-S03-text') || null
  if (!shot3) throw new Error('expected derived director_brief shot node db-shot-S03-text')
  const pos3 = { x: (shot3 as unknown as { x?: unknown }).x, y: (shot3 as unknown as { y?: unknown }).y }
  if (!(typeof pos3.x === 'number' && Number.isFinite(pos3.x))) throw new Error('expected shot S03 x position')
  if (!(typeof pos3.y === 'number' && Number.isFinite(pos3.y))) throw new Error('expected shot S03 y position')
  if (Math.abs(Number(pos3.y) - Number(posText.y)) > 1) {
    throw new Error('expected first three shots to spread across the same first row for 16:9 balance')
  }
  if (!(Number(posText.x) < Number(pos2.x) && Number(pos2.x) < Number(pos3.x))) {
    throw new Error('expected S01-S03 hero shots to preserve left-to-right first-row order')
  }
  const shot4 = nodeById.get('db-shot-S04-text') || null
  if (!shot4) throw new Error('expected derived director_brief shot node db-shot-S04-text')
  const pos4 = { x: (shot4 as unknown as { x?: unknown }).x, y: (shot4 as unknown as { y?: unknown }).y }
  if (!(typeof pos4.y === 'number' && Number.isFinite(pos4.y))) throw new Error('expected shot S04 y position')
  if (!(Number(pos4.y) > Number(posText.y))) {
    throw new Error('expected canvas reveal/CTA shots to start on the row after the three hero locales')
  }
  const shot5 = nodeById.get('db-shot-S05-text') || null
  if (!shot5) throw new Error('expected derived director_brief shot node db-shot-S05-text')
  const pos5 = { x: (shot5 as unknown as { x?: unknown }).x, y: (shot5 as unknown as { y?: unknown }).y }
  if (!(typeof pos5.x === 'number' && Number.isFinite(pos5.x))) throw new Error('expected shot S05 x position')
  if (!(typeof pos5.y === 'number' && Number.isFinite(pos5.y))) throw new Error('expected shot S05 y position')
  if (Math.abs(Number(pos5.y) - Number(pos4.y)) > 1) {
    throw new Error('expected S04-S05 CTA shots to share the same tightened second row')
  }
  const heroToCtaRowGap = Number(pos4.y) - Number(posText.y)
  if (!(heroToCtaRowGap > 0 && heroToCtaRowGap < 1100)) {
    throw new Error(`expected hero-to-CTA row gap to stay visually tight for 16:9 composition, got ${heroToCtaRowGap}`)
  }
  const heroXs = [Number(posText.x), Number(pos2.x), Number(pos3.x)]
  const heroCentroidX = heroXs.reduce((sum, value) => sum + value, 0) / heroXs.length
  const ctaCentroidX = (Number(pos4.x) + Number(pos5.x)) / 2
  if (Math.abs(heroCentroidX - ctaCentroidX) > 500) {
    throw new Error(`expected hero and CTA rows to stay horizontally centered as a collective, hero=${heroCentroidX} cta=${ctaCentroidX}`)
  }
  const firstShotCentroidX = [
    Number(posText.x),
    Number((shotImagePanel as unknown as { x?: unknown }).x),
    Number((shotVideoPanel as unknown as { x?: unknown }).x),
  ].reduce((sum, value) => sum + value, 0) / 3
  const firstShotPanelCentroidX = [
    Number((shotTextPanel as unknown as { x?: unknown }).x),
    Number((shotImagePanel as unknown as { x?: unknown }).x),
    Number((shotVideoPanel as unknown as { x?: unknown }).x),
  ].reduce((sum, value) => sum + value, 0) / 3
  if (Math.abs(firstShotPanelCentroidX - firstShotCentroidX) > 220) {
    throw new Error(`expected first-shot panel centroid to stay aligned with its own widget band, widget=${firstShotCentroidX} panels=${firstShotPanelCentroidX}`)
  }

  const edgeUniqs = new Set(
    g.edges
      .map(e => {
        const p = (e.properties || {}) as Record<string, unknown>
        const fromPort = String(p[FLOW_EDGE_SOURCE_PORT_KEY] || '').trim()
        const toPort = String(p[FLOW_EDGE_TARGET_PORT_KEY] || '').trim()
        const source = String(e.source || '').trim()
        const target = String(e.target || '').trim()
        return source && target && fromPort && toPort ? `${source}.${fromPort}->${target}.${toPort}` : ''
      })
      .filter(Boolean),
  )
  if (!edgeUniqs.has('db-shot-S01-text.text_out->db-shot-S01-text-panel.output')) {
    throw new Error('expected derived shot text_out edge to text panel')
  }
  if (!edgeUniqs.has('db-shot-S01-image.imageUrl->db-shot-S01-video.reference_image')) {
    throw new Error('expected derived shot imageUrl edge to video reference_image')
  }
}

export function testMarkdownFrontmatterFlowGraphFidelityKnowgrphVideoDemoFrontmatterFlow16x9CompositionContract() {
  const samplePath = readKnowgrphVideoDemoPath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected knowgrph video demo frontmatter parse result')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const settings = ((g.metadata || {}) as Record<string, unknown>).frontmatterFlowSettings as Record<string, unknown> | null
  if (!settings) throw new Error('expected frontmatter flow settings metadata')
  if (Number(settings.balancedHeroRowCount) !== 3) throw new Error('expected balancedHeroRowCount=3')
  if (Math.abs(Number(settings.balancedHeroRowGapScale) - 0.76) > 0.0001) throw new Error('expected balancedHeroRowGapScale=0.76')
  if (Math.abs(Number(settings.balancedHeroRowStaggerScale) - 0.12) > 0.0001) throw new Error('expected balancedHeroRowStaggerScale=0.12')
  if (Math.abs(Number(settings.balancedPanelOffsetScale) - 0.96) > 0.0001) throw new Error('expected balancedPanelOffsetScale=0.96')

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const readPos = (id: string): { x: number; y: number } => {
    const node = nodeById.get(id) || null
    const x = Number((node as unknown as { x?: unknown } | null)?.x)
    const y = Number((node as unknown as { y?: unknown } | null)?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`expected finite position for ${id}`)
    return { x, y }
  }

  const s01 = readPos('db-shot-S01-text')
  const s02 = readPos('db-shot-S02-text')
  const s03 = readPos('db-shot-S03-text')
  const s04 = readPos('db-shot-S04-text')
  const s05 = readPos('db-shot-S05-text')
  const s01Panel = readPos('db-shot-S01-text-panel')
  const s01ImagePanel = readPos('db-shot-S01-image-panel')
  const s01VideoPanel = readPos('db-shot-S01-video-panel')

  if (!(Math.abs(s01.y - s02.y) <= 1 && Math.abs(s02.y - s03.y) <= 1)) {
    throw new Error('expected hero widgets S01-S03 on one row')
  }
  if (!(s01.x < s02.x && s02.x < s03.x)) {
    throw new Error('expected hero widgets S01-S03 in left-to-right order')
  }
  if (!(Math.abs(s04.y - s05.y) <= 1 && s04.y > s01.y)) {
    throw new Error('expected CTA widgets S04-S05 on a lower shared row')
  }

  const heroCentroidX = (s01.x + s02.x + s03.x) / 3
  const ctaCentroidX = (s04.x + s05.x) / 2
  if (Math.abs(heroCentroidX - ctaCentroidX) > 500) {
    throw new Error(`expected hero and CTA widget centroids aligned, hero=${heroCentroidX} cta=${ctaCentroidX}`)
  }

  const panelGap = s01Panel.y - s01.y
  if (!(panelGap > 600 && panelGap < 680)) {
    throw new Error(`expected same-shot panel gap within tuned 16:9 band, got ${panelGap}`)
  }

  const firstShotPanelCentroidX = (s01Panel.x + s01ImagePanel.x + s01VideoPanel.x) / 3
  const firstShotWidgetBandCentroidX = (s01.x + s01ImagePanel.x + s01VideoPanel.x) / 3
  if (Math.abs(firstShotPanelCentroidX - firstShotWidgetBandCentroidX) > 220) {
    throw new Error(`expected first-shot panel centroid aligned with first-shot band, widgets=${firstShotWidgetBandCentroidX} panels=${firstShotPanelCentroidX}`)
  }
}

export function testMarkdownFrontmatterFlowGraphDirectorBriefUsesCompactBalancedBandWithoutFixtureOffsets() {
  const md = [
    '---',
    'nodes:',
    '  - id: authored-text',
    '    type: TextGeneration',
    '    pos: { x: 0, y: 0 }',
    '  - id: authored-image',
    '    type: ImageGeneration',
    '    pos: { x: 600, y: 0 }',
    'frontmatterFlowSettings:',
    '  balancedHeroRowCount: 3',
    '  balancedHeroRowGapScale: 0.76',
    '  balancedPanelOffsetScale: 0.96',
    'director_brief:',
    '  shots:',
    '    - shot: S01',
    '      timecode: 0-5s',
    '      image_prompt: "One"',
    '      video_prompt: "One motion"',
    '    - shot: S02',
    '      timecode: 5-10s',
    '      image_prompt: "Two"',
    '      video_prompt: "Two motion"',
    '    - shot: S03',
    '      timecode: 10-15s',
    '      image_prompt: "Three"',
    '      video_prompt: "Three motion"',
    '    - shot: S04',
    '      timecode: 15-20s',
    '      image_prompt: "Four"',
    '      video_prompt: "Four motion"',
    '    - shot: S05',
    '      timecode: 20-25s',
    '      image_prompt: "Five"',
    '      video_prompt: "Five motion"',
    '---',
  ].join('\n')

  const res = tryParseMarkdownFrontmatterFlowGraph('synthetic-director-brief.md', md)
  if (!res) throw new Error('expected synthetic director brief parse result')
  const nodeById = new Map(res.graphData.nodes.map(n => [String(n.id || ''), n] as const))
  const readPos = (id: string): { x: number; y: number } => {
    const node = nodeById.get(id) || null
    const x = Number((node as unknown as { x?: unknown } | null)?.x)
    const y = Number((node as unknown as { y?: unknown } | null)?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`expected finite position for ${id}`)
    return { x, y }
  }
  const s01 = readPos('db-shot-S01-text')
  const s02 = readPos('db-shot-S02-text')
  const s03 = readPos('db-shot-S03-text')
  const s04 = readPos('db-shot-S04-text')
  const s05 = readPos('db-shot-S05-text')
  const s03Video = readPos('db-shot-S03-video')
  const authoredCenterX = (readPos('authored-text').x + readPos('authored-image').x) / 2
  const heroCenterX = (s01.x + s02.x + s03.x) / 3
  const ctaCenterX = (s04.x + s05.x) / 2

  if (!(s01.x < s02.x && s02.x < s03.x)) throw new Error('expected hero shot row to preserve visual order')
  if (!(Math.abs(s01.y - s02.y) <= 1 && Math.abs(s02.y - s03.y) <= 1)) throw new Error('expected hero shots on one row')
  if (!(Math.abs(s04.y - s05.y) <= 1 && s04.y > s01.y)) throw new Error('expected CTA shots on a lower balanced row')
  if (Math.abs(heroCenterX - ctaCenterX) > 500) throw new Error('expected derived shot rows to share one centered collective centroid')

  const shotXs = [s01.x, s02.x, s03.x, s04.x, s05.x, s03Video.x]
  const derivedBandCenterX = (Math.min(...shotXs) + Math.max(...shotXs)) / 2
  if (Math.abs(derivedBandCenterX - authoredCenterX) > 500) throw new Error('expected derived shot band to anchor near authored graph centroid')
  const shotSpanX = Math.max(...shotXs) - Math.min(...shotXs)
  if (shotSpanX > 5000) throw new Error(`expected compact balanced shot band, got x-span ${shotSpanX}`)
  if (Math.max(...shotXs.map(x => Math.abs(x))) > 2600) throw new Error(`expected no far-right fixture offset residue, got xs ${shotXs.join(',')}`)
}

export function testMarkdownFrontmatterFlowGraphFidelityKnowgrphVideoDemoSeededVisualPayloads() {
  const samplePath = readKnowgrphVideoDemoSeededPath()
  if (!samplePath || !fs.existsSync(samplePath)) return
  const md = fs.readFileSync(samplePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph(path.basename(samplePath), md)
  if (!res) throw new Error('expected seeded knowgrph video demo frontmatter parse result')
  const g = res.graphData
  if (String(g.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context')

  const nodeById = new Map(g.nodes.map(n => [String(n.id || ''), n] as const))
  const textPanel = nodeById.get('p-text-script') || null
  const imagePanel = nodeById.get('p-img-scene') || null
  const videoPanel = nodeById.get('p-video-scene') || null
  if (!textPanel || !imagePanel || !videoPanel) throw new Error('expected seeded visual demo to preserve authored top-level panels')

  const textProps = (textPanel.properties || {}) as Record<string, unknown>
  const imageProps = (imagePanel.properties || {}) as Record<string, unknown>
  const videoProps = (videoPanel.properties || {}) as Record<string, unknown>
  if (String(textProps.richMediaActiveTab || '') !== 'text') throw new Error('expected seeded text panel richMediaActiveTab=text')
  if (String(imageProps.richMediaActiveTab || '') !== 'image') throw new Error('expected seeded image panel richMediaActiveTab=image')
  if (String(videoProps.richMediaActiveTab || '') !== 'video') throw new Error('expected seeded video panel richMediaActiveTab=video')
  if (!String(textProps.outputSrcDoc || '').includes('Seeded Visual Demo')) throw new Error('expected seeded text panel outputSrcDoc content')
  if (!String(imageProps.imageUrl || '').includes('Example.jpg')) throw new Error('expected seeded image panel imageUrl fixture')
  if (!String(videoProps.videoUrl || '').includes('flower.mp4')) throw new Error('expected seeded video panel videoUrl fixture')
}
