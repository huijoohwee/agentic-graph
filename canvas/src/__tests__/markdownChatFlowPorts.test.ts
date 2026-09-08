import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphRemovesConflictingComputeAndWiringData() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
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

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-chat-clean-wire.md', md)
  if (!res) throw new Error('expected parse result')
  const nodeA = res.graphData.nodes.find(n => String(n.id || '') === 'n-a')
  if (!nodeA) throw new Error('expected node n-a')
  const props = (nodeA.properties || {}) as Record<string, unknown>
  const data = (props.data || {}) as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(props, 'compute')) {
    throw new Error('expected compute to be removed for chatAgenticGraph flow nodes')
  }
  if (Object.prototype.hasOwnProperty.call(data, 'handles') || Object.prototype.hasOwnProperty.call(data, 'compute')) {
    throw new Error('expected conflicting wiring/compute keys removed from chatAgenticGraph node data')
  }
  if (String(data.text || '') !== 'ok') throw new Error('expected non-conflicting data to remain')
}

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphParsesOnlyDeclaredFlowNodeIdsForWidgets() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
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

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-chat-only-flow-node-ids.md', md)
  if (!res) throw new Error('expected parse result')
  const actual = (res.graphData.nodes || []).map(n => String(n.id || '')).filter(Boolean).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected only declared flow node ids, got ${JSON.stringify(actual)}`)
  }
}

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphAgenticOsSampleUsesOnlyDeclaredTurnDetailPorts() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
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

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-flow-sample.md', md)
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

export function testMarkdownFrontmatterFlowGraphChatAgenticGraphPrunesUnreferencedHandlesAndKeepsEdgeMappedPorts() {
  const md = [
    '---',
    'doc:',
    '  type: chatagentic-graph',
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

  const res = tryParseMarkdownFrontmatterFlowGraph('agentic-os-handle-prune.md', md)
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
    throw new Error('expected unreferenced handles to be pruned in chatAgenticGraph flow mode')
  }
}

