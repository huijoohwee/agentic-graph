import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parseLearningPython } from '../features/python-learning/pythonParser'
import { applyProgramJson, applyProgramMarkdown, renderProgramJson, renderProgramMarkdown } from '../features/block-editor/programCodec'
import { BLOCK_DEFINITIONS, insertBlock, programTree } from '../features/block-editor/blockLibrary'
import { blockSource, deleteBlock, moveBlock, replaceBlock } from '../features/block-editor/blockEdits'
import { clearBlockSession, publishBlockSession, readBlockSession } from '../features/block-editor/blockSession'

test('four program projections retain exact Python bytes on no-op', () => {
  const source = '# original comment\r\ncount = 2  # keep spacing\r\nprint(count)\r\n'
  assert.deepEqual(parseLearningPython(source).body.map(item => item.kind), ['assign', 'expression'])
  assert.equal(applyProgramJson(source, renderProgramJson(source)), source)
  assert.equal(applyProgramMarkdown(source, renderProgramMarkdown(source)), source)
  assert(programTree(parseLearningPython(source)).some(row => row.title === 'assign count'))
})

test('JSON edits change one statement and preserve unrelated source bytes', () => {
  const source = '# heading\ncount = 2\n# stays with print\nprint(count)\n'
  const envelope = JSON.parse(renderProgramJson(source))
  envelope.program.body[0].value.value.decimal = '3'
  const changed = applyProgramJson(source, JSON.stringify(envelope))
  assert.equal(changed, '# heading\ncount = 3\n# stays with print\nprint(count)\n')
  assert.equal(parseLearningPython(changed).body.length, 2)
})

test('JSON refuses stale fidelity, duplicate keys and duplicate IDs', () => {
  const source = 'value = 1\nprint(value)\n', envelope = JSON.parse(renderProgramJson(source))
  envelope.fidelity.source = 'other = 0\n'
  assert.throws(() => applyProgramJson(source, JSON.stringify(envelope)), /Source changed/)
  assert.throws(() => applyProgramJson(source, '{"schema":"a","schema":"b"}'), /duplicate-key/)
  envelope.fidelity.source = source
  envelope.program.body[1].id = envelope.program.body[0].id
  assert.throws(() => applyProgramJson(source, JSON.stringify(envelope)), /Duplicate node ID/)
})

test('Markdown edit accepts only the bound Python fence', () => {
  const source = 'value = 1', draft = renderProgramMarkdown(source)
  assert.equal(applyProgramMarkdown(source, draft.replace('value = 1', 'value = 2')), 'value = 2')
  assert.throws(() => applyProgramMarkdown(source, draft + 'extra'), /one owned Python fence/)
})

test('library insertion preserves comments and rejects invalid scope', () => {
  const source = '# heading\nvalue = 1\n', target = programTree(parseLearningPython(source)).find(row => row.title === 'assign value')!
  const text = BLOCK_DEFINITIONS.find(item => item.id === 'text')!
  assert.equal(insertBlock(source, target.id, 'after', text), '# heading\nvalue = 1\nprint("text")\n')
  assert.throws(() => insertBlock(source, target.id, 'inside', text), /no body/)
  const returnDefinition = BLOCK_DEFINITIONS.find(item => item.id === 'return')!
  assert.throws(() => insertBlock(source, target.id, 'after', returnDefinition), /return is only valid/)
})

test('block source edit, movement, and deletion preserve valid structure', () => {
  const source = 'value = 1\nprint(value)\n'
  assert.equal(blockSource(source, 's0'), 'value = 1')
  assert.equal(replaceBlock(source, 's0', 'value = 2'), 'value = 2\nprint(value)\n')
  assert.equal(moveBlock(source, 's1', 'up'), 'print(value)\nvalue = 1\n')
  assert.equal(deleteBlock(source, 's0'), 'print(value)\n')
  assert.equal(deleteBlock('if True:\n    value = 1\n', 's0.b0.0'), 'if True:\n    pass\n')
  assert.throws(() => replaceBlock('value = 1 # keep\n', 's0', 'value = 2'), /comment/)
  assert.throws(() => moveBlock('value = 1\n# keep\nprint(value)\n', 's1', 'up'), /comment|boundary/)
})

test('each authoring origin projects to the other three views without changing source bytes', () => {
  const python = '# authored here\nvalue = 1\nprint(value)\n'
  const block = insertBlock(python, 's0', 'after', BLOCK_DEFINITIONS.find(item => item.id === 'text')!)
  const jsonDraft = JSON.parse(renderProgramJson(python))
  jsonDraft.program.body[0].value.value.decimal = '5'
  const json = applyProgramJson(python, JSON.stringify(jsonDraft))
  const markdown = applyProgramMarkdown(python, renderProgramMarkdown(python).replace('value = 1', 'value = 8'))
  for (const source of [python, block, json, markdown]) {
    const tree = programTree(parseLearningPython(source))
    assert.equal(tree[0]?.kind, 'module')
    assert.equal(applyProgramJson(source, renderProgramJson(source)), source)
    assert.equal(applyProgramMarkdown(source, renderProgramMarkdown(source)), source)
  }
})

test('nested supported procedures, loops, conditions, and literal kinds round trip', () => {
  const source = 'def compute(n):\n    total = 0\n    for index in range(n):\n        if index == 2:\n            continue\n        elif index > 4:\n            break\n        else:\n            total = total + index\n    while False:\n        pass\n    return total\nflag = True\nempty = None\nscale = 1.5\n'
  const kinds = new Set(programTree(parseLearningPython(source)).map(row => row.kind))
  for (const kind of ['def', 'for', 'if', 'continue', 'break', 'while', 'pass', 'return', 'literal']) assert(kinds.has(kind), kind)
  assert.equal(applyProgramJson(source, renderProgramJson(source)), source)
  assert.equal(applyProgramMarkdown(source, renderProgramMarkdown(source)), source)
})

test('Block library session generations fence target and source changes', () => {
  const owner = Symbol('test')
  const session = { documentId: 'exercise.py', source: 'value = 1\n', target: null, readOnly: false,
    insert: () => 'value = 1\n' }
  publishBlockSession(owner, session)
  const first = readBlockSession()!.generation
  publishBlockSession(owner, { ...session, source: 'value = 2\n' })
  assert(readBlockSession()!.generation > first)
  clearBlockSession(owner)
  assert.equal(readBlockSession(), null)
})
