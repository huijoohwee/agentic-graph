import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parseLearningPython } from '../python-learning/pythonParser'
import { programTree } from './blockLibrary'
import { blockSource, replaceBlock } from './blockEdits'
import { blockVisualShape } from './blockVisualLanguage'

test('assembled branches keep each condition and body in source order, including nested loops', () => {
  const source = 'if True:\n    while False:\n        pass\nelif False:\n    print(2)\nelse:\n    print(3)\nprint(4)\n'
  const rows = programTree(parseLearningPython(source))
  const branches = rows.filter(row => row.parentId === 's0')
  assert.deepEqual(branches.map(row => [row.kind, row.attachment]), [
    ['literal', 'If'], ['while', 'Then'], ['literal', 'Elif 1'], ['expression', 'Then'], ['expression', 'Else'],
  ])
  assert.deepEqual(rows.filter(row => row.parentId === branches[1].id).map(row => row.attachment), ['While', 'Do'])
  assert.equal(blockSource(source, branches[4].id), 'print(3)')
  assert.equal(replaceBlock(source, branches[4].id, 'print(5)'), source.replace('print(3)', 'print(5)'))
  assert.equal(rows.at(-1)?.title, '4')
})

test('nested value sockets preserve operand order and terminal ownership without adding syntax nodes', () => {
  const source = 'def result(a):\n    return not (a > 1 and a < 4)\nflag = True\n'
  const program = parseLearningPython(source), rows = programTree(program)
  const terminal = rows.find(row => row.kind === 'return')!
  assert.equal(blockVisualShape(terminal), 'terminal')
  const returned = rows.find(row => row.parentId === terminal.id)!
  assert.equal(blockVisualShape(returned), 'predicate')
  const binary = rows.find(row => row.kind === 'binary')!
  assert.deepEqual(rows.filter(row => row.parentId === binary.id).map(row => row.attachment), ['Left', 'Right'])
  assert.equal(rows.at(-1)?.title, 'True')
  assert.equal(rows.length, program.nodeCount + 1)
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length)
})
