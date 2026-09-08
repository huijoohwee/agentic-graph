import { buildBoundedFlowCacheKey, createFlowConnectedValuesCache } from '@/lib/storyboardWidget/flowConnectedValuesCache'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'

export function testFlowConnectedValuesCachePreservesCompleteInputs(): void {
  const properties: Record<string, unknown> = { 'flow:widgetTypeId': 'out', 'flow:widgetFormId': 'out' }
  for (let i = 0; i < 100; i++) properties[`filler${i}`] = i
  properties.value = 'first'
  const graph = { type: 'GraphData', nodes: [
    { id: 'source-cache', type: 'Node', properties },
    { id: 'sink-cache', type: 'Node', properties: { 'flow:widgetTypeId': 'in', 'flow:widgetFormId': 'in' } },
  ], edges: [{ id: 'edge-cache', source: 'source-cache', target: 'sink-cache', properties: { 'flow:sourcePortKey': 'out', 'flow:targetPortKey': 'in' } }] }
  const registry = ['out', 'in'].map(direction => ({ id: direction, isEnabled: true, nodeTypeId: 'Node', widgetTypeId: direction, formId: direction, fields: [], schemaMappings: [], updatedAt: '',
    ports: [{ portKey: direction, direction: direction === 'out' ? 'output' : 'input', schemaPath: direction === 'out' ? 'properties.value' : 'properties.input' }] }))
  const read = (graphSemanticKey?: string) => computeFlowConnectedValuesBySchemaPath({ graphData: graph as never, registry: registry as never, targetNodeIds: new Set(['sink-cache']), graphSemanticKey })
  const value = (result: ReturnType<typeof read>) => result.get('sink-cache')?.['properties.input']?.value
  const first = read()
  if (value(first) !== 'first' || read() !== first) throw new Error('expected valid repeated-input reuse')
  properties.value = 'second'
  if (value(read()) !== 'second') throw new Error('cache hid an edit after the sampled property limit')
  read('caller-key')
  properties.value = { nested: { deep: { value: 'third' } } }
  if (value(read('caller-key')) !== properties.value) throw new Error('caller semantic key hid a real input edit')
  const current = read()
  current.get('sink-cache')!['properties.input']!.value = 'caller corruption'
  if (value(read()) !== properties.value) throw new Error('cache reused a caller-mutated result')
  Object.assign(graph.edges[0]!, { source: { id: 'source-cache' }, target: { id: 'sink-cache' } })
  if (value(read()) !== properties.value) throw new Error('object-form edge endpoints must preserve connected output')
  properties.value = { left: 1, right: 2 }
  read()
  properties.value = { right: 2, left: 1 }
  if (JSON.stringify(value(read())) !== JSON.stringify(properties.value)) throw new Error('cache changed observable property order')
  for (const ids of [['sink-cache', 'source-cache'], ['source-cache', 'sink-cache']]) {
    const result = computeFlowConnectedValuesBySchemaPath({ graphData: graph as never, registry: registry as never, targetNodeIds: new Set(ids) })
    if ([...result.keys()].join(',') !== ids.join(',')) throw new Error('cache changed requested target order')
  }
}

export function testFlowConnectedValuesCacheBoundsAndOpaqueInputs(): void {
  const cache = createFlowConnectedValuesCache<Map<string, unknown>>()
  for (let i = 0; i < 65; i++) cache.write(`entry-${i}`, new Map([['value', i]]))
  if (cache.read('entry-0') !== null || !cache.read('entry-64')) throw new Error('cache must cap all combinations at 64 entries')
  for (let i = 0; i < 20; i++) cache.write(`${i}:` + 'x'.repeat(60000), new Map([['value', i]]))
  if (cache.read('0:' + 'x'.repeat(60000)) !== null || !cache.read('19:' + 'x'.repeat(60000))) throw new Error('serialized retention budget was not enforced')
  cache.write('replace', new Map([['value', 1]]))
  cache.write('replace', new Map([['value', 'x'.repeat(65537)]]))
  if (cache.read('replace') !== null) throw new Error('uncacheable replacement must retire old value')
  let calls = 0
  const opaque = Object.defineProperty({}, 'value', { get() { calls++; return 1 } })
  if (buildBoundedFlowCacheKey(opaque) !== null || calls !== 0) throw new Error('cache must not invoke accessors')
  if (buildBoundedFlowCacheKey('x'.repeat(65537)) !== null || buildBoundedFlowCacheKey(Array(9000)) !== null) throw new Error('oversized keys must bypass caching')
  let deep: unknown = null
  for (let i = 0; i < 70; i++) deep = { deep }
  if (buildBoundedFlowCacheKey(deep) !== null) throw new Error('deep keys must bypass caching')
  const shared = { value: 1 }
  if (buildBoundedFlowCacheKey([shared, shared]) === buildBoundedFlowCacheKey([{ value: 1 }, { value: 1 }])) throw new Error('key must preserve reference topology')
}
