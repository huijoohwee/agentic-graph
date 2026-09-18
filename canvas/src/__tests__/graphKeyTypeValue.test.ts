import assert from 'node:assert/strict'
import { load as loadYaml } from 'js-yaml'
import { applyYamlMetadataTableReplacement, buildYamlMetadataTableMarkdown } from '@/features/markdown-workspace/main/viewer/sourceStructuredDataViewYaml'
import { isKeyTypeValue, readKeyTypeValueField, unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import { readNodeProperties, readRecordPathValue, unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { unwrapNodeFieldValue } from '@/lib/canvas/graph-elements/mediaSpecNodeFields'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'

export function testKtvReadersPreservePayloadsAndFalsyValues() {
  const payload = { key: 'inner', type: 'number', value: 7 }
  for (const value of [false, 0, '', null, [], { value: 4, unit: 'metres' }, payload]) {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    const cell = { key: 'field', type, value }
    for (const read of [unwrapKeyTypeValue, unwrapGraphCellValue, unwrapNodeFieldValue]) {
      assert.equal(read(cell, 'field'), value)
      assert.equal(readKeyTypeValueField({ raw: cell, expectedKey: 'field', path: 'field', warnings: [] }), value)
    }
  }
  const plain = { value: 42, unit: 'metres' }
  assert.equal(unwrapGraphCellValue(plain), plain)
  const cyclic: Record<string, unknown> = { key: 'field', type: 'object' }
  cyclic.value = cyclic
  assert.equal(unwrapGraphCellValue(cyclic), cyclic, 'decoding is bounded to one field envelope')
}

export function testKtvReadersRejectMalformedFieldsConsistently() {
  for (const raw of [
    { value: 1 }, { key: 'field', value: 1 }, { type: 'number', value: 1 },
    { key: '', type: 'number', value: 1 }, { key: 'field', type: '', value: 1 },
    { key: 'other', type: 'number', value: 1 },
    { key: 'field', type: 'number', value: '1' }, { key: 'field', type: 'number', value: NaN },
    { key: 'field', type: 'boolean', value: 'false' }, { key: 'field', type: 'object', value: [] },
    { key: 'field', type: 'number', value: 1, extra: true },
  ]) {
    const warnings: string[] = []
    assert.equal(isKeyTypeValue(raw, 'field'), false)
    for (const read of [unwrapKeyTypeValue, unwrapGraphCellValue, unwrapNodeFieldValue]) assert.equal(read(raw, 'field'), raw)
    assert.equal(readKeyTypeValueField({ raw, path: 'field', expectedKey: 'field', warnings }), raw)
    assert.equal(warnings.length, 1)
  }
  assert.equal(unwrapKeyTypeValue({ key: 'compute', type: 'function', value: '(x) => x' }), '(x) => x')
  assert.equal(unwrapKeyTypeValue({ key: 'output', type: 'markdown', value: '# Hello' }), '# Hello')
}

export function testKtvPropertyPathsDecodeEachFieldOnce() {
  const point = { key: 'point', type: 'object', value: { x: { key: 'x', type: 'number', value: 0 } } }
  const props = { point, 'literal.path': { key: 'literal.path', type: 'boolean', value: false } }
  const node = { properties: { key: 'properties', type: 'object', value: props } }
  assert.equal(readNodeProperties(node), props)
  assert.equal(readRecordPathValue(props, 'properties.point.x'), 0)
  assert.equal(readRecordPathValue(props, 'literal.path'), false)
}

export function testKtvFlowNeverBypassesRejectedWrappers() {
  const source = `---
flow:
  nodes:
    - id: {key: id, type: string, value: n}
      type: {key: type, type: string, value: default}
      compute: {key: wrong, type: function, value: "() => ({output: 1})"}
      weight: {key: wrong, type: number, value: 42}
      payload: {value: 7, unit: metres}
  edges: []
---\n`
  const result = tryParseMarkdownFrontmatterFlowGraph('ktv.md', source)!
  const node = result.graphData.nodes[0]
  assert.equal(result.warnings.filter(w => w.includes('expected key')).length, 2)
  assert.deepEqual(node.properties?.weight, { key: 'wrong', type: 'number', value: 42 })
  assert.deepEqual(node.properties?.payload, { value: 7, unit: 'metres' })
  assert.equal(node.properties?.['flow:compute'], undefined)
  assert.equal(node.properties?.['frontmatter:widgetFields'], undefined)
}

export function testKtvEditorTablePreservesTypesAndMatchingKeys() {
  const sourceText = 'field: {key: field, type: string, value: "false"}'
  const edit = (key: string, type: string, value: string) => applyYamlMetadataTableReplacement({
    sourceText,
    replacementLines: [
      '| Key | Type | Value | Content | Line | Indent |',
      '| --- | --- | --- | --- | --- | --- |',
      `| ${key} | ${type} | ${value} | | 1 | 0 |`,
    ],
  })
  const edited = loadYaml(edit('renamed', 'string', '12')!) as Record<string, unknown>
  assert.deepEqual(edited, { renamed: { key: 'renamed', type: 'string', value: '12' } })
  assert.equal(edit('field', 'number', 'invalid'), null)
  assert.deepEqual(loadYaml(edit('field', 'boolean', 'false')!), { field: { key: 'field', type: 'boolean', value: false } })
  const valid = buildYamlMetadataTableMarkdown({ text: sourceText, startLine: 1 }).lines.join('\n')
  const malformed = buildYamlMetadataTableMarkdown({ text: sourceText.replace('key: field', 'key: wrong'), startLine: 1 }).lines.join('\n')
  assert.match(valid, /\| string \| false \|/)
  assert.match(malformed, /\| scalar \|/)
}
