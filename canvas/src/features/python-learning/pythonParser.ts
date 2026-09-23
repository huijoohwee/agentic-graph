import { toLines, isBlankOrComment } from '../parsers/python/lexer'
import { boundedValue } from './pythonValues'
import { PYTHON_LIMITS, PythonLearningError, sourceBytes, type Expression, type Statement, type PythonProgram, type SourceSpan } from './pythonModel'

type Token = SourceSpan & { kind: string; text: string }
const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '))
const COMPARISONS = ['==', '!=', '<', '<=', '>', '>=']
const PRECEDENCE: Record<string, number> = { or: 1, and: 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5, '//': 5, '%': 5 }
const invalid = (token: SourceSpan, message: string): never => { throw new PythonLearningError('unsupported-syntax', message, token) }
function tokenize(source: string): Token[] {
  if (sourceBytes(source) > PYTHON_LIMITS.sourceBytes) throw new PythonLearningError('limit-exceeded', 'Source exceeds 32 KiB.')
  const result: Token[] = [], indents = [0]
  for (const record of toLines(source)) {
    if (isBlankOrComment(record.text)) continue
    const line = record.num
    if (/\t/.test(record.raw.slice(0, record.indent))) invalid({ line, column: 1 }, 'Use spaces for indentation in the learning subset.')
    if (record.indent > indents[indents.length - 1]) {
      if (indents.length >= PYTHON_LIMITS.parseDepth) invalid({ line, column: 1 }, 'Indentation nesting limit.')
      indents.push(record.indent); result.push({ kind: 'indent', text: '', line, column: 1 })
    } else {
      while (record.indent < indents[indents.length - 1]) { indents.pop(); result.push({ kind: 'dedent', text: '', line, column: 1 }) }
      if (record.indent !== indents[indents.length - 1]) invalid({ line, column: 1 }, 'Indentation does not match an outer block.')
    }
    let offset = record.indent
    while (offset < record.raw.length) {
      const char = record.raw[offset], column = offset + 1
      if (char === '#') break
      if (char === ' ' || char === '\t') { offset++; continue }
      const rest = record.raw.slice(offset)
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)
      if (number) {
        result.push({ kind: 'number', text: number[0], line, column }); offset += number[0].length
      } else if (name) {
        result.push({ kind: KEYWORDS.has(name[0]) ? name[0] : 'name', text: name[0], line, column }); offset += name[0].length
      } else if (char === "'" || char === '"') {
        if (rest.startsWith(char.repeat(3))) invalid({ line, column }, 'Triple-quoted strings are outside the learning subset.')
        let raw = '', closed = false; offset++
        while (offset < record.raw.length) {
          const next = record.raw[offset++]
          if (next === char) { closed = true; break }
          if (next === '\\') {
            if (offset >= record.raw.length) break
            raw += next + record.raw[offset++]
          } else raw += next
        }
        if (!closed) invalid({ line, column }, 'Unterminated string.')
        result.push({ kind: 'string', text: raw, line, column })
      } else {
        const symbol = /^(?:==|!=|<=|>=|\/\/|[+\-*/%<>=():,])/.exec(rest)
        if (!symbol) invalid({ line, column }, `Unsupported syntax ${JSON.stringify(char)}.`)
        result.push({ kind: symbol[0], text: symbol[0], line, column }); offset += symbol[0].length
      }
      if (result.length > PYTHON_LIMITS.astNodes * 4) throw new PythonLearningError('limit-exceeded', 'Token limit.', { line, column })
    }
    result.push({ kind: 'newline', text: '', line, column: record.raw.length + 1 })
  }
  const line = toLines(source).length + 1
  while (indents.length > 1) { indents.pop(); result.push({ kind: 'dedent', text: '', line, column: 1 }) }
  result.push({ kind: 'eof', text: '', line, column: 1 })
  return result
}
function stringValue(token: Token): string {
  const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', '\\': '\\', "'": "'", '"': '"' }
  return token.text.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, code: string) => {
    if (Object.hasOwn(escapes, code)) return escapes[code]
    if (/^[uUx]/.test(code)) {
      if (code.length === 1) invalid(token, 'Invalid Unicode/hex escape.')
      const point = parseInt(code.slice(1), 16)
      if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) invalid(token, 'Invalid Unicode scalar.')
      return String.fromCodePoint(point)
    }
    if (/^[0-7N]$/.test(code)) invalid(token, 'Octal and named Unicode escapes are outside the learning subset.')
    return '\\' + code
  })
}
export function parseLearningPython(source: string): PythonProgram {
  const tokens = tokenize(source)
  let cursor = 0, nodeCount = 0, expressionDepth = 0
  const current = () => tokens[cursor]
  const take = () => tokens[cursor++]
  const at = (kind: string) => current().kind === kind
  const accept = (kind: string) => at(kind) ? take() : null
  const need = (kind: string): Token => accept(kind) || invalid(current(), `Expected ${kind}; found ${current().kind}.`)
  const node = <T extends SourceSpan>(value: T): T => {
    if (++nodeCount > PYTHON_LIMITS.astNodes) throw new PythonLearningError('limit-exceeded', 'AST node limit.', value)
    return value
  }
  const expression = (minimum = 0): Expression => {
    if (++expressionDepth > PYTHON_LIMITS.parseDepth) throw new PythonLearningError('limit-exceeded', 'Expression nesting limit.', current())
    try {
      const token = take(); let left: Expression
      if (token.kind === 'not' && minimum >= 3) invalid(token, 'Parenthesize not in an arithmetic or comparison operand.')
      if (token.kind === 'number') {
        if (!/[.eE]/.test(token.text) && /^0\d*[1-9]/.test(token.text)) invalid(token, 'Leading zeros in decimal integers are not permitted.')
        if (!/[.eE]/.test(token.text) && token.text.replace(/^0+/, '').length > 309) throw new PythonLearningError('limit-exceeded', 'Integer literal limit.', token)
        const value = /[.eE]/.test(token.text) ? { kind: 'float' as const, value: Number(token.text) } : BigInt(token.text)
        left = node({ kind: 'literal', value: boundedValue(value, token), line: token.line, column: token.column })
      } else if (token.kind === 'string') left = node({ ...token, kind: 'literal', value: boundedValue(stringValue(token), token) })
      else if (['True', 'False', 'None'].includes(token.kind)) left = node({ ...token, kind: 'literal', value: token.kind === 'None' ? null : token.kind === 'True' })
      else if (token.kind === 'name') {
        if (accept('(')) {
          const args: Expression[] = []
          if (!at(')')) do { args.push(expression()); if (args.length > 32) invalid(token, 'At most 32 call arguments.'); } while (accept(',') && !at(')'))
          need(')'); left = node({ ...token, kind: 'call', name: token.text, args })
        } else left = node({ ...token, kind: 'name', name: token.text })
      } else if (['+', '-', 'not'].includes(token.kind)) left = node({ ...token, kind: 'unary', operator: token.kind, value: expression(token.kind === 'not' ? 2 : 6) })
      else if (token.kind === '(') { left = expression(); need(')') }
      else return invalid(token, `Unsupported expression ${token.text || token.kind}.`)
      while ((PRECEDENCE[current().kind] || 0) > minimum) {
        const operator = take(), precedence = PRECEDENCE[operator.kind]
        if (COMPARISONS.includes(operator.kind)) {
          const values = [left, expression(precedence)], operators = [operator.kind]
          while (COMPARISONS.includes(current().kind)) { operators.push(take().kind); values.push(expression(precedence)) }
          left = node({ ...operator, kind: 'compare', values, operators })
        } else left = node({ ...operator, kind: 'binary', operator: operator.kind, left, right: expression(precedence) })
      }
      return left
    } finally { expressionDepth-- }
  }
  const locals = (body: Statement[]): string[] => [...new Set(body.flatMap(s => {
    if (s.kind === 'assign') return [s.name]
    if (s.kind === 'for') return [s.name, ...locals(s.body)]
    if (s.kind === 'while') return locals(s.body)
    if (s.kind === 'if') return [...s.branches.flatMap(b => locals(b.body)), ...locals(s.otherwise)]
    return []
  }))]
  const block = (depth: number, inFunction: boolean, loopDepth: number): Statement[] => {
    need(':'); need('newline'); need('indent')
    const body: Statement[] = []
    while (!at('dedent') && !at('eof')) body.push(statement(depth + 1, inFunction, loopDepth))
    if (!body.length) invalid(current(), 'Expected an indented body.')
    need('dedent'); return body
  }
  const statement = (depth: number, inFunction: boolean, loopDepth: number): Statement => {
    const token = current()
    if (depth > PYTHON_LIMITS.parseDepth) invalid(token, 'Statement nesting limit.')
    if (accept('if')) {
      const condition = expression(), branches = [{ condition, body: block(depth, inFunction, loopDepth) }]
      while (accept('elif')) { const condition = expression(); branches.push({ condition, body: block(depth, inFunction, loopDepth) }) }
      const otherwise = accept('else') ? block(depth, inFunction, loopDepth) : []
      return node({ ...token, kind: 'if', branches, otherwise })
    }
    if (accept('while')) {
      const condition = expression(), body = block(depth, inFunction, loopDepth + 1)
      return node({ ...token, kind: 'while', condition, body })
    }
    if (accept('for')) {
      const name = need('name').text; need('in'); const iterable = expression(), body = block(depth, inFunction, loopDepth + 1)
      return node({ ...token, kind: 'for', name, iterable, body })
    }
    if (accept('def')) {
      if (depth !== 0) invalid(token, 'Only top-level function definitions are supported.')
      const name = need('name').text, parameters: string[] = []; need('(')
      if (!at(')')) do { parameters.push(need('name').text); if (parameters.length > 16) invalid(token, 'At most 16 parameters.'); } while (accept(',') && !at(')'))
      need(')'); if (new Set(parameters).size !== parameters.length) invalid(token, 'Duplicate parameter.')
      const body = block(depth, true, 0)
      return node({ ...token, kind: 'def', name, parameters, body, locals: [...new Set([...parameters, ...locals(body)])] })
    }
    let result: Statement
    if (accept('return')) {
      if (!inFunction) invalid(token, 'return is only valid inside a function.')
      result = node({ ...token, kind: 'return', value: at('newline') ? null : expression() })
    } else if (['pass', 'break', 'continue'].includes(token.kind)) {
      take(); if (token.kind !== 'pass' && !loopDepth) invalid(token, `${token.kind} is only valid inside a loop.`)
      result = node({ ...token, kind: token.kind as 'pass' | 'break' | 'continue' })
    } else if (at('name') && tokens[cursor + 1]?.kind === '=') {
      take(); take(); result = node({ ...token, kind: 'assign', name: token.text, value: expression() })
    } else result = node({ ...token, kind: 'expression', value: expression() })
    need('newline'); return result
  }
  const body: Statement[] = []
  while (!at('eof')) body.push(statement(0, false, 0))
  // Parser call depth does not bound left-associative trees or combined statement/expression depth.
  const pending: Array<{ value: Statement | Expression; depth: number }> = body.map(value => ({ value, depth: 1 }))
  while (pending.length) {
    const { value, depth } = pending.pop()!
    if (depth > PYTHON_LIMITS.parseDepth) throw new PythonLearningError('limit-exceeded', 'AST depth limit.', value)
    let children: Array<Statement | Expression> = []
    switch (value.kind) {
      case 'unary': children = [value.value]; break
      case 'binary': children = [value.left, value.right]; break
      case 'compare': children = value.values; break
      case 'call': children = value.args; break
      case 'assign': case 'expression': children = [value.value]; break
      case 'return': children = value.value ? [value.value] : []; break
      case 'if': children = [...value.branches.flatMap(branch => [branch.condition, ...branch.body]), ...value.otherwise]; break
      case 'while': children = [value.condition, ...value.body]; break
      case 'for': children = [value.iterable, ...value.body]; break
      case 'def': children = value.body; break
    }
    pending.push(...children.map(value => ({ value, depth: depth + 1 })))
  }
  return { body, nodeCount }
}
