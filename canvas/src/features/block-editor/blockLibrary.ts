import { parseLearningPython } from '@/features/python-learning/pythonParser'
import { PYTHON_LIMITS, sourceBytes, type Expression, type PythonProgram, type Statement } from '@/features/python-learning/pythonModel'
import { ProgramEditError } from './programError'

export type BlockDefinition = Readonly<{ id: string; category: string; title: string; description: string; kind: 'statement'; snippet: string }>
export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = Object.freeze([
  { id: 'if', category: 'Logic', title: 'If condition', description: 'Run steps when a condition is true', kind: 'statement', snippet: 'if True:\n    pass' },
  { id: 'while', category: 'Loops', title: 'While loop', description: 'Repeat while a condition is true', kind: 'statement', snippet: 'while False:\n    pass' },
  { id: 'for', category: 'Loops', title: 'For range', description: 'Repeat with a named counter', kind: 'statement', snippet: 'for index in range(3):\n    pass' },
  { id: 'math', category: 'Math', title: 'Calculate value', description: 'Assign an arithmetic expression', kind: 'statement', snippet: 'result = 1 + 2' },
  { id: 'text', category: 'Text', title: 'Print text', description: 'Show text during an explicit run', kind: 'statement', snippet: 'print("text")' },
  { id: 'variable', category: 'Variables', title: 'Set variable', description: 'Store a value under a name', kind: 'statement', snippet: 'value = 0' },
  { id: 'function', category: 'Functions', title: 'Define function', description: 'Create a top-level procedure', kind: 'statement', snippet: 'def procedure():\n    pass' },
  { id: 'return', category: 'Functions', title: 'Return value', description: 'Return a value from a function', kind: 'statement', snippet: 'return 0' },
])

export type BlockTreeNode = Readonly<{
  id: string; parentId: string | null; depth: number; kind: string; title: string; detail: string
  line: number; statement: boolean; container: boolean
  /** Presentation attachment from the native syntax owner; never inferred from IDs. */
  attachment?: string
}>
export type BlockInsertPosition = 'before' | 'after' | 'inside'
const expressionTitle = (value: Expression): string => {
  if (value.kind === 'literal') {
    const scalar = value.value
    if (typeof scalar === 'bigint') return scalar.toString()
    if (scalar && typeof scalar === 'object' && scalar.kind === 'float') return String(scalar.value)
    return scalar === null ? 'None' : typeof scalar === 'boolean' ? (scalar ? 'True' : 'False') : String(scalar)
  }
  if (value.kind === 'name' || value.kind === 'call') return value.name
  if (value.kind === 'unary' || value.kind === 'binary') return value.operator
  return value.operators.join(' ')
}
export function programTree(program: PythonProgram): BlockTreeNode[] {
  const rows: BlockTreeNode[] = [{ id: 'program', parentId: null, depth: 0, kind: 'module', title: 'Program', detail: `${program.body.length} statements`, line: 0, statement: false, container: true }]
  const expression = (value: Expression, id: string, parentId: string, depth: number, attachment: string) => {
    rows.push({ id, parentId, depth, attachment, kind: value.kind, title: expressionTitle(value), detail: `${value.kind} · line ${value.line}`, line: value.line, statement: false, container: false })
    if (value.kind === 'unary') expression(value.value, `${id}.v`, id, depth + 1, 'Value')
    if (value.kind === 'binary') { expression(value.left, `${id}.l`, id, depth + 1, 'Left'); expression(value.right, `${id}.r`, id, depth + 1, 'Right') }
    if (value.kind === 'compare') value.values.forEach((item, index) => expression(item, `${id}.${index}`, id, depth + 1, `Operand ${index + 1}`))
    if (value.kind === 'call') value.args.forEach((item, index) => expression(item, `${id}.${index}`, id, depth + 1, `Argument ${index + 1}`))
  }
  const statement = (value: Statement, id: string, parentId: string, depth: number, attachment = 'Steps') => {
    const title = value.kind === 'assign' || value.kind === 'for' || value.kind === 'def' ? `${value.kind} ${value.name}` : value.kind
    const container = ['if', 'while', 'for', 'def'].includes(value.kind)
    rows.push({ id, parentId, depth, attachment, kind: value.kind, title, detail: `statement · line ${value.line}`, line: value.line, statement: true, container })
    if (value.kind === 'assign' || value.kind === 'expression') expression(value.value, `${id}.v`, id, depth + 1, 'Value')
    if (value.kind === 'return' && value.value) expression(value.value, `${id}.v`, id, depth + 1, 'Value')
    if (value.kind === 'while') { expression(value.condition, `${id}.c`, id, depth + 1, 'While'); value.body.forEach((item, index) => statement(item, `${id}.${index}`, id, depth + 1, 'Do')) }
    if (value.kind === 'for') { expression(value.iterable, `${id}.i`, id, depth + 1, 'In'); value.body.forEach((item, index) => statement(item, `${id}.${index}`, id, depth + 1, 'Do')) }
    if (value.kind === 'def') value.body.forEach((item, index) => statement(item, `${id}.${index}`, id, depth + 1, 'Do'))
    if (value.kind === 'if') {
      value.branches.forEach((branch, index) => {
        expression(branch.condition, `${id}.c${index}`, id, depth + 1, index ? `Elif ${index}` : 'If')
        branch.body.forEach((item, childIndex) => statement(item, `${id}.b${index}.${childIndex}`, id, depth + 1, 'Then'))
      })
      value.otherwise.forEach((item, index) => statement(item, `${id}.o${index}`, id, depth + 1, 'Else'))
    }
  }
  program.body.forEach((value, index) => statement(value, `s${index}`, 'program', 1))
  return rows
}

export const lineOffset = (source: string, line: number): number => {
  if (line <= 1) return 0
  let current = 1
  for (let index = 0; index < source.length; index++) if (source[index] === '\n' && ++current === line) return index + 1
  return source.length
}
export const lineIndent = (source: string, line: number): string => /^[ ]*/.exec(source.slice(lineOffset(source, line)))?.[0] || ''
export function endOfStatement(source: string, line: number, indent: string, kind: string): number {
  const lines = source.split('\n')
  for (let next = line + 1; next <= lines.length; next++) {
    const text = lines[next - 1] || ''
    if (!text.trim() || text.trimStart().startsWith('#')) continue
    const nextIndent = /^[ ]*/.exec(text)?.[0] || ''
    if (nextIndent.length > indent.length) continue
    if (kind === 'if' && nextIndent.length === indent.length && /^(?:elif\b|else\s*:)/.test(text.trimStart())) continue
    return lineOffset(source, next)
  }
  return source.length
}

export function insertBlock(source: string, targetId: string, position: BlockInsertPosition, definition: BlockDefinition): string {
  const program = parseLearningPython(source), target = programTree(program).find(row => row.id === targetId)
  if (!target || (target.id !== 'program' && !target.statement)) throw new ProgramEditError('Choose a statement or Program as the target.')
  if (target.id === 'program' && position !== 'inside') throw new ProgramEditError('Choose Inside for Program.')
  if (position === 'inside' && !target.container) throw new ProgramEditError('This statement has no body.')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const indent = target.id === 'program' ? '' : lineIndent(source, target.line)
  const writeIndent = position === 'inside' && target.id !== 'program' ? indent + '    ' : indent
  const offset = target.id === 'program' ? source.length : position === 'before' ? lineOffset(source, target.line)
    : position === 'inside' ? lineOffset(source, target.line + 1)
      : endOfStatement(source, target.line, indent, target.kind)
  const snippet = definition.snippet.split('\n').map(line => writeIndent + line).join(newline)
  const prefix = offset === source.length && source && !source.endsWith('\n') ? newline : ''
  const candidate = source.slice(0, offset) + prefix + snippet + newline + source.slice(offset)
  if (sourceBytes(candidate) > PYTHON_LIMITS.sourceBytes) throw new ProgramEditError('Source exceeds 32 KiB.')
  parseLearningPython(candidate)
  return candidate
}
