import { parseLearningPython } from '@/features/python-learning/pythonParser'
import { PYTHON_LIMITS, sourceBytes, type Expression, type PythonProgram, type Statement } from '@/features/python-learning/pythonModel'
import { parseUniqueJson } from './uniqueJson'
import { ProgramEditError } from './programError'
export { ProgramEditError } from './programError'

export const PROGRAM_SCHEMA = 'workspace-program/v1'
export const PROGRAM_PROFILE = 'procedural-python/v1'

type Shape = Record<string, unknown>
const object = (value: unknown): Shape => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProgramEditError('Expected a program object.')
  return value as Shape
}
const fields = (value: Shape, allowed: string[]) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new ProgramEditError(`Unknown program field ${key}.`)
}
const string = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length > 4096) throw new ProgramEditError(`Invalid ${label}.`)
  return value
}
const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value) || value.length > PYTHON_LIMITS.astNodes) throw new ProgramEditError(`Invalid ${label}.`)
  return value
}
const identifier = (value: unknown): string => {
  const name = string(value, 'identifier')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ProgramEditError('Invalid identifier.')
  return name
}
const child = (value: unknown, id: string): Shape => ({ ...object(value), id })
const noIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(noIds)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, noIds(entry)]))
  return value
}

export function expressionShape(value: Expression, id: string): Shape {
  switch (value.kind) {
    case 'literal': {
      const literal = value.value
      const encoded = typeof literal === 'bigint' ? { kind: 'integer', decimal: literal.toString() }
        : literal && typeof literal === 'object' && literal.kind === 'float' ? { kind: 'float', decimal: String(literal.value) }
          : literal === null ? { kind: 'null' }
            : typeof literal === 'boolean' ? { kind: 'boolean', value: literal }
              : typeof literal === 'string' ? { kind: 'string', value: literal }
                : null
      if (!encoded) throw new ProgramEditError('Runtime-only value cannot become source.')
      return { id, kind: 'literal', value: encoded }
    }
    case 'name': return { id, kind: 'name', name: value.name }
    case 'unary': return { id, kind: 'unary', operator: value.operator, value: expressionShape(value.value, `${id}.v`) }
    case 'binary': return { id, kind: 'binary', operator: value.operator, left: expressionShape(value.left, `${id}.l`), right: expressionShape(value.right, `${id}.r`) }
    case 'compare': return { id, kind: 'compare', operators: value.operators, values: value.values.map((entry, index) => expressionShape(entry, `${id}.${index}`)) }
    case 'call': return { id, kind: 'call', name: value.name, args: value.args.map((entry, index) => expressionShape(entry, `${id}.${index}`)) }
  }
}

export function statementShape(value: Statement, id: string): Shape {
  switch (value.kind) {
    case 'assign': return { id, kind: 'assign', name: value.name, value: expressionShape(value.value, `${id}.v`) }
    case 'expression': return { id, kind: 'expression', value: expressionShape(value.value, `${id}.v`) }
    case 'return': return { id, kind: 'return', value: value.value ? expressionShape(value.value, `${id}.v`) : null }
    case 'break': case 'continue': case 'pass': return { id, kind: value.kind }
    case 'while': return { id, kind: 'while', condition: expressionShape(value.condition, `${id}.c`), body: value.body.map((entry, index) => statementShape(entry, `${id}.${index}`)) }
    case 'for': return { id, kind: 'for', name: value.name, iterable: expressionShape(value.iterable, `${id}.i`), body: value.body.map((entry, index) => statementShape(entry, `${id}.${index}`)) }
    case 'def': return { id, kind: 'def', name: value.name, parameters: value.parameters, body: value.body.map((entry, index) => statementShape(entry, `${id}.${index}`)) }
    case 'if': return { id, kind: 'if', branches: value.branches.map((branch, index) => ({ condition: expressionShape(branch.condition, `${id}.c${index}`), body: branch.body.map((entry, childIndex) => statementShape(entry, `${id}.b${index}.${childIndex}`)) })), otherwise: value.otherwise.map((entry, index) => statementShape(entry, `${id}.o${index}`)) }
  }
}

export function programShape(program: PythonProgram): Shape {
  return { id: 'program', kind: 'module', body: program.body.map((entry, index) => statementShape(entry, `s${index}`)) }
}

export function renderProgramJson(source: string): string {
  const program = parseLearningPython(source)
  return JSON.stringify({ schema: PROGRAM_SCHEMA, languageProfile: PROGRAM_PROFILE, program: programShape(program), fidelity: { source } }, null, 2) + '\n'
}

const BINARY = new Set(['+', '-', '*', '/', '//', '%', 'and', 'or'])
const COMPARISON = new Set(['==', '!=', '<', '<=', '>', '>='])
function emitExpression(raw: unknown, depth: number, ids: Set<string>): string {
  if (depth > PYTHON_LIMITS.parseDepth) throw new ProgramEditError('Program depth limit.')
  const value = object(raw), kind = string(value.kind, 'expression kind')
  const id = string(value.id, 'node id'); if (ids.has(id)) throw new ProgramEditError('Duplicate node ID.'); ids.add(id)
  switch (kind) {
    case 'literal': {
      fields(value, ['id', 'kind', 'value']); const scalar = object(value.value), type = string(scalar.kind, 'literal kind')
      if (type === 'integer') { fields(scalar, ['kind', 'decimal']); const decimal = string(scalar.decimal, 'integer'); if (!/^(?:0|[1-9][0-9]*|-?[1-9][0-9]*)$/.test(decimal)) throw new ProgramEditError('Invalid integer.'); return decimal }
      if (type === 'float') { fields(scalar, ['kind', 'decimal']); const decimal = string(scalar.decimal, 'float'); if (!/^-?(?:\d+\.\d*|\.\d+|\d+(?:\.\d*)?[eE][+-]?\d+)$/.test(decimal) || !Number.isFinite(Number(decimal))) throw new ProgramEditError('Invalid float.'); return decimal }
      if (type === 'string') { fields(scalar, ['kind', 'value']); return JSON.stringify(string(scalar.value, 'string')) }
      if (type === 'boolean') { fields(scalar, ['kind', 'value']); if (typeof scalar.value !== 'boolean') throw new ProgramEditError('Invalid boolean.'); return scalar.value ? 'True' : 'False' }
      if (type === 'null') { fields(scalar, ['kind']); return 'None' }
      throw new ProgramEditError('Unsupported literal kind.')
    }
    case 'name': fields(value, ['id', 'kind', 'name']); return identifier(value.name)
    case 'unary': {
      fields(value, ['id', 'kind', 'operator', 'value']); const operator = string(value.operator, 'unary operator')
      if (!['+', '-', 'not'].includes(operator)) throw new ProgramEditError('Unsupported unary operator.')
      return `(${operator === 'not' ? 'not ' : operator}${emitExpression(value.value, depth + 1, ids)})`
    }
    case 'binary': {
      fields(value, ['id', 'kind', 'operator', 'left', 'right']); const operator = string(value.operator, 'binary operator')
      if (!BINARY.has(operator)) throw new ProgramEditError('Unsupported binary operator.')
      return `(${emitExpression(value.left, depth + 1, ids)} ${operator} ${emitExpression(value.right, depth + 1, ids)})`
    }
    case 'compare': {
      fields(value, ['id', 'kind', 'operators', 'values']); const operators = array(value.operators, 'comparisons').map(item => string(item, 'comparison'))
      const values = array(value.values, 'comparison values')
      if (!operators.length || values.length !== operators.length + 1 || operators.some(item => !COMPARISON.has(item))) throw new ProgramEditError('Invalid comparison chain.')
      return `(${values.map((entry, index) => `${index ? `${operators[index - 1]} ` : ''}${emitExpression(entry, depth + 1, ids)}`).join(' ')})`
    }
    case 'call': {
      fields(value, ['id', 'kind', 'name', 'args']); const args = array(value.args, 'arguments')
      if (args.length > 32) throw new ProgramEditError('Argument limit.')
      return `${identifier(value.name)}(${args.map(entry => emitExpression(entry, depth + 1, ids)).join(', ')})`
    }
    default: throw new ProgramEditError('Unsupported expression kind.')
  }
}

function emitStatements(raw: unknown, depth: number, ids: Set<string>): string[] {
  if (depth > PYTHON_LIMITS.parseDepth) throw new ProgramEditError('Program depth limit.')
  const indent = '    '.repeat(depth)
  return array(raw, 'statement list').flatMap(entry => {
    const value = object(entry), kind = string(value.kind, 'statement kind'), id = string(value.id, 'node id')
    if (ids.has(id)) throw new ProgramEditError('Duplicate node ID.'); ids.add(id)
    const expression = (rawExpression: unknown) => emitExpression(rawExpression, depth + 1, ids)
    const body = (rawBody: unknown): string[] => { const lines = emitStatements(rawBody, depth + 1, ids); if (!lines.length) throw new ProgramEditError('A suite needs a statement.'); return lines }
    switch (kind) {
      case 'assign': fields(value, ['id', 'kind', 'name', 'value']); return [`${indent}${identifier(value.name)} = ${expression(value.value)}`]
      case 'expression': fields(value, ['id', 'kind', 'value']); return [`${indent}${expression(value.value)}`]
      case 'return': fields(value, ['id', 'kind', 'value']); return [`${indent}return${value.value === null ? '' : ` ${expression(value.value)}`}`]
      case 'pass': case 'break': case 'continue': fields(value, ['id', 'kind']); return [`${indent}${kind}`]
      case 'while': fields(value, ['id', 'kind', 'condition', 'body']); return [`${indent}while ${expression(value.condition)}:`, ...body(value.body)]
      case 'for': fields(value, ['id', 'kind', 'name', 'iterable', 'body']); return [`${indent}for ${identifier(value.name)} in ${expression(value.iterable)}:`, ...body(value.body)]
      case 'def': {
        fields(value, ['id', 'kind', 'name', 'parameters', 'body']); const parameters = array(value.parameters, 'parameters').map(identifier)
        if (parameters.length > 16 || new Set(parameters).size !== parameters.length) throw new ProgramEditError('Invalid parameters.')
        return [`${indent}def ${identifier(value.name)}(${parameters.join(', ')}):`, ...body(value.body)]
      }
      case 'if': {
        fields(value, ['id', 'kind', 'branches', 'otherwise']); const branches = array(value.branches, 'branches')
        if (!branches.length) throw new ProgramEditError('An if needs a branch.')
        const lines = branches.flatMap((rawBranch, index) => {
          const branch = object(rawBranch); fields(branch, ['condition', 'body'])
          return [`${indent}${index ? 'elif' : 'if'} ${expression(branch.condition)}:`, ...body(branch.body)]
        })
        const otherwise = emitStatements(value.otherwise, depth + 1, ids)
        return otherwise.length ? [...lines, `${indent}else:`, ...otherwise] : lines
      }
      default: throw new ProgramEditError('Unsupported statement kind.')
    }
  })
}

const sameMeaning = (left: unknown, right: unknown) => JSON.stringify(noIds(left)) === JSON.stringify(noIds(right))
const lineOffset = (source: string, line: number): number => {
  if (line <= 1) return 0
  let current = 1
  for (let index = 0; index < source.length; index++) if (source[index] === '\n' && ++current === line) return index + 1
  return source.length
}
function patchTopLevel(source: string, oldProgram: PythonProgram, nextBody: unknown[]): string {
  const before = oldProgram.body.map((entry, index) => statementShape(entry, `s${index}`))
  let first = 0; while (first < before.length && first < nextBody.length && sameMeaning(before[first], nextBody[first])) first++
  if (first === before.length && first === nextBody.length) return source
  let suffix = 0
  while (suffix < before.length - first && suffix < nextBody.length - first && sameMeaning(before[before.length - suffix - 1], nextBody[nextBody.length - suffix - 1])) suffix++
  const oldEnd = before.length - suffix, nextEnd = nextBody.length - suffix
  const start = first < before.length ? lineOffset(source, oldProgram.body[first]!.line) : source.length
  let end = oldEnd < before.length ? lineOffset(source, oldProgram.body[oldEnd]!.line) : source.length
  // Trivia between statements belongs to the following unchanged interval.
  while (end > start) {
    const previous = source.lastIndexOf('\n', Math.max(start, end - 2)) + 1
    if (previous <= start) break
    const trailing = source.slice(previous, end).trim()
    if (trailing && !trailing.startsWith('#')) break
    end = previous
  }
  const replaced = source.slice(start, end)
  if (replaced.includes('#')) throw new ProgramEditError('This edit could move a comment. Edit Python directly or choose a narrower change.')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const inserted = emitStatements(nextBody.slice(first, nextEnd), 0, new Set()).join(newline)
  const prefix = start === source.length && source && !source.endsWith('\n') ? newline : ''
  const candidate = source.slice(0, start) + prefix + (inserted ? inserted + newline : '') + source.slice(end)
  if (sourceBytes(candidate) > PYTHON_LIMITS.sourceBytes) throw new ProgramEditError('Source exceeds 32 KiB.')
  return candidate
}

export function applyProgramJson(currentSource: string, draft: string): string {
  if (sourceBytes(draft) > 262144) throw new ProgramEditError('Program JSON exceeds 256 KiB.')
  const envelope = object(parseUniqueJson(draft)); fields(envelope, ['schema', 'languageProfile', 'program', 'fidelity'])
  if (envelope.schema !== PROGRAM_SCHEMA || envelope.languageProfile !== PROGRAM_PROFILE) throw new ProgramEditError('Unsupported program schema.')
  const fidelity = object(envelope.fidelity); fields(fidelity, ['source'])
  if (fidelity.source !== currentSource) throw new ProgramEditError('Source changed since this JSON draft was opened.')
  const program = object(envelope.program); fields(program, ['id', 'kind', 'body'])
  if (program.kind !== 'module') throw new ProgramEditError('Expected a module.')
  if (program.id !== 'program') throw new ProgramEditError('Invalid module ID.')
  const body = array(program.body, 'program body')
  emitStatements(body, 0, new Set([program.id]))
  const next = patchTopLevel(currentSource, parseLearningPython(currentSource), body)
  const reparsed = parseLearningPython(next)
  if (!sameMeaning(programShape(reparsed).body, body)) throw new ProgramEditError('JSON program does not match generated Python.')
  return next
}

export function renderProgramMarkdown(source: string): string {
  parseLearningPython(source)
  const longest = Math.max(2, ...[...source.matchAll(/`+/g)].map(match => match[0].length))
  const fence = '`'.repeat(longest + 1), newline = source.includes('\r\n') ? '\r\n' : '\n'
  return `<!-- workspace-program:v1 final-newline=${source.endsWith('\n') ? 1 : 0} -->${newline}${fence}python${newline}${source}${source.endsWith('\n') ? '' : newline}${fence}${newline}`
}

export function applyProgramMarkdown(currentSource: string, draft: string): string {
  if (sourceBytes(draft) > 262144) throw new ProgramEditError('Program Markdown exceeds 256 KiB.')
  const old = renderProgramMarkdown(currentSource)
  const match = /^(<!-- workspace-program:v1 final-newline=([01]) -->)(\r?\n)(`{3,})python\3([\s\S]*?)\4\3$/.exec(draft)
  if (!match) throw new ProgramEditError('Keep one owned Python fence and its marker.')
  const currentMatch = /^(<!-- workspace-program:v1 final-newline=([01]) -->)(\r?\n)(`{3,})python\3/.exec(old)!
  if (match[1] !== currentMatch[1] || match[4] !== currentMatch[4]) throw new ProgramEditError('The owned fence metadata changed.')
  const payload = match[5]
  if (payload.includes(`${match[3]}${match[4]}${match[3]}`)) throw new ProgramEditError('Keep one owned Python fence and its marker.')
  const candidate = match[2] === '0' ? payload.slice(0, -match[3].length) : payload
  if (match[2] === '0' && !payload.endsWith(match[3])) throw new ProgramEditError('The closing fence needs its own line.')
  parseLearningPython(candidate)
  return candidate
}
