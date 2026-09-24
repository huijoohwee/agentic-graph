import { parseLearningPython } from '@/features/python-learning/pythonParser'
import { PYTHON_LIMITS, sourceBytes } from '@/features/python-learning/pythonModel'
import { endOfStatement, lineIndent, lineOffset, programTree, type BlockTreeNode } from './blockLibrary'
import { ProgramEditError } from './programError'

type Range = { start: number; end: number; text: string; indent: string }
const range = (source: string, row: BlockTreeNode): Range => {
  const indent = lineIndent(source, row.line)
  const start = lineOffset(source, row.line)
  const end = endOfStatement(source, row.line, indent, row.kind)
  return { start, end, text: source.slice(start, end), indent }
}
const checkUnambiguous = (text: string) => {
  if (text.includes('#')) throw new ProgramEditError('This block touches a comment. Edit Python directly to preserve its placement.')
}
const checked = (source: string): string => {
  if (sourceBytes(source) > PYTHON_LIMITS.sourceBytes) throw new ProgramEditError('Source exceeds 32 KiB.')
  parseLearningPython(source)
  return source
}
const selected = (source: string, targetId: string) => {
  const rows = programTree(parseLearningPython(source))
  const row = rows.find(item => item.id === targetId)
  if (!row?.statement) throw new ProgramEditError('Select a statement block.')
  return { row, rows }
}

export function blockSource(source: string, targetId: string): string {
  const { row } = selected(source, targetId), span = range(source, row)
  const lines = span.text.replace(/(?:\r?\n)+$/, '').split(/\r?\n/)
  return lines.map(line => line.startsWith(span.indent) ? line.slice(span.indent.length) : line).join('\n')
}

export function replaceBlock(source: string, targetId: string, draft: string): string {
  const { row } = selected(source, targetId), span = range(source, row)
  checkUnambiguous(span.text)
  if (!draft.trim()) throw new ProgramEditError('A replacement block needs source.')
  if (draft.includes('\r')) throw new ProgramEditError('Use line feeds in the block draft.')
  const lines = draft.replace(/\n+$/, '').split('\n')
  if (lines.some(line => line && /^\s/.test(line) && !/^ +/.test(line))) throw new ProgramEditError('Use spaces for indentation.')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const replacement = lines.map(line => span.indent + line).join(newline) + newline
  return checked(source.slice(0, span.start) + replacement + source.slice(span.end))
}

export function deleteBlock(source: string, targetId: string): string {
  const { row } = selected(source, targetId), span = range(source, row)
  checkUnambiguous(span.text)
  const without = source.slice(0, span.start) + source.slice(span.end)
  try { return checked(without) }
  catch {
    if (!span.indent) throw new ProgramEditError('Removing this block leaves invalid source.')
    const newline = source.includes('\r\n') ? '\r\n' : '\n'
    const withPass = source.slice(0, span.start) + `${span.indent}pass${newline}` + source.slice(span.end)
    try { return checked(withPass) }
    catch { throw new ProgramEditError('Removing this block leaves invalid source.') }
  }
}

export function moveBlock(source: string, targetId: string, direction: 'up' | 'down'): string {
  const { row, rows } = selected(source, targetId)
  const siblings = rows.filter(item => item.statement && item.parentId === row.parentId && item.depth === row.depth)
  const index = siblings.findIndex(item => item.id === targetId)
  const other = siblings[index + (direction === 'up' ? -1 : 1)]
  if (!other) throw new ProgramEditError('No adjacent statement in this direction.')
  const first = range(source, direction === 'up' ? other : row)
  const second = range(source, direction === 'up' ? row : other)
  if (first.end !== second.start || first.indent !== second.indent) throw new ProgramEditError('Move across this boundary in Python to preserve structure.')
  checkUnambiguous(first.text); checkUnambiguous(second.text)
  return checked(source.slice(0, first.start) + second.text + first.text + source.slice(second.end))
}
