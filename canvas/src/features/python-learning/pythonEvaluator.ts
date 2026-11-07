import { parseLearningPython } from './pythonParser'
import { binary, boundedValue, compare, formatValue, integer, isFloat, truthy, unary } from './pythonValues'
import { PYTHON_LIMITS, PythonLearningError, sourceBytes, type Expression, type PyValue, type SourceSpan, type Statement } from './pythonModel'

export type ExecutionMetrics = { statements: number; assignments: number; loops: number; branches: number; functions: number; sensors: number }
export type PythonCapabilities = Readonly<{ call: (name: string, args: PyValue[], span: SourceSpan) => Promise<PyValue> }>
type Frame = { values: Map<string, PyValue>; locals: Set<string> | null }
type Flow = { kind: 'return'; value: PyValue } | { kind: 'break' | 'continue' } | undefined
type Evaluation<T> = AsyncGenerator<SourceSpan, T, void>
const BUILTINS = ['range', 'print', 'abs', 'min', 'max', 'drive', 'turn', 'distance', 'at_goal', 'takeoff', 'fly', 'hover', 'land', 'altitude']

export class PythonEvaluator {
  readonly program
  readonly output: string[] = []
  readonly metrics: ExecutionMetrics = { statements: 0, assignments: 0, loops: 0, branches: 0, functions: 0, sensors: 0 }
  readonly globals: Frame = { values: new Map(), locals: null }
  private steps = 0
  private outputSize = 0
  private readonly activeFunctions = new Set<Statement>()
  private readonly frames: Frame[] = [this.globals]
  constructor(source: string, private readonly capabilities: PythonCapabilities) { this.program = parseLearningPython(source) }
  private budget(span: SourceSpan) {
    if (++this.steps > PYTHON_LIMITS.steps) throw new PythonLearningError('limit-exceeded', 'Execution exceeded 50,000 evaluation steps.', span)
  }
  private fail(message: string, span: SourceSpan): never { throw new PythonLearningError('runtime-error', message, span) }
  private bind(frame: Frame, name: string, value: PyValue, span: SourceSpan) {
    if (!frame.values.has(name) && this.frames.reduce((sum, f) => sum + f.values.size, 0) >= PYTHON_LIMITS.variables) {
      throw new PythonLearningError('limit-exceeded', 'Variable allocation limit.', span)
    }
    frame.values.set(name, boundedValue(value, span))
  }
  private lookup(frame: Frame, name: string, span: SourceSpan): PyValue {
    if (frame.values.has(name)) return frame.values.get(name)!
    if (frame.locals?.has(name)) return this.fail(`UnboundLocalError: ${name} is used before assignment.`, span)
    if (this.globals.values.has(name)) return this.globals.values.get(name)!
    if (BUILTINS.includes(name)) return { kind: 'callable', name }
    return this.fail(`NameError: ${name} is not defined.`, span)
  }
  private async *expression(expr: Expression, frame: Frame): Evaluation<PyValue> {
    this.budget(expr)
    switch (expr.kind) {
      case 'literal': return expr.value
      case 'name': return this.lookup(frame, expr.name, expr)
      case 'unary': return unary(expr.operator, yield* this.expression(expr.value, frame), expr)
      case 'binary': {
        const left = yield* this.expression(expr.left, frame)
        if (expr.operator === 'and') return truthy(left) ? yield* this.expression(expr.right, frame) : left
        if (expr.operator === 'or') return truthy(left) ? left : yield* this.expression(expr.right, frame)
        return binary(expr.operator, left, yield* this.expression(expr.right, frame), expr)
      }
      case 'compare': {
        let left = yield* this.expression(expr.values[0], frame)
        for (let i = 0; i < expr.operators.length; i++) {
          const right = yield* this.expression(expr.values[i + 1], frame)
          if (!compare(expr.operators[i], left, right, expr)) return false
          left = right
        }
        return true
      }
      case 'call': {
        const callable = this.lookup(frame, expr.name, expr)
        if (!callable || typeof callable !== 'object' || callable.kind !== 'callable') return this.fail(`TypeError: ${expr.name} is not callable.`, expr)
        const args: PyValue[] = []
        for (const argument of expr.args) args.push(yield* this.expression(argument, frame))
        if (!callable.definition) return this.builtin(callable.name, args, expr)
        const definition = callable.definition
        if (args.length !== definition.parameters.length) return this.fail(`TypeError: ${callable.name} expects ${definition.parameters.length} arguments.`, expr)
        if (this.activeFunctions.has(definition)) throw new PythonLearningError('unsupported-syntax', 'Recursive calls are outside the learning subset.', expr)
        if (this.activeFunctions.size >= PYTHON_LIMITS.callDepth) throw new PythonLearningError('limit-exceeded', 'Function depth limit.', expr)
        const child: Frame = { values: new Map(), locals: new Set(definition.locals) }
        this.frames.push(child); this.activeFunctions.add(definition); this.metrics.functions++
        try {
          definition.parameters.forEach((name, index) => this.bind(child, name, args[index], expr))
          const flow = yield* this.statements(definition.body, child)
          return flow?.kind === 'return' ? flow.value : null
        } finally { this.frames.pop(); this.activeFunctions.delete(definition) }
      }
    }
  }
  private async builtin(name: string, args: PyValue[], span: SourceSpan): Promise<PyValue> {
    const arity = (min: number, max = min) => {
      if (args.length < min || args.length > max) this.fail(`TypeError: ${name} expects ${min === max ? min : `${min}-${max}`} arguments.`, span)
    }
    if (name === 'range') {
      arity(1, 3)
      const values = args.map(v => integer(v, span)), start = values.length === 1 ? 0n : values[0], stop = values.length === 1 ? values[0] : values[1], step = values[2] ?? 1n
      if (step === 0n) return this.fail('ValueError: range step cannot be zero.', span)
      return { kind: 'range', start, stop, step }
    }
    if (name === 'print') {
      const text = args.map(v => formatValue(v, span)).join(' ') + '\n'
      this.outputSize += sourceBytes(text)
      if (this.outputSize > PYTHON_LIMITS.outputBytes) throw new PythonLearningError('limit-exceeded', 'Output exceeds 64 KiB.', span)
      this.output.push(text); return null
    }
    if (name === 'abs') {
      arity(1); const value = args[0]
      if (isFloat(value)) return { kind: 'float', value: Math.abs(value.value) }
      const number = integer(value, span); return number < 0n ? -number : number
    }
    if (name === 'min' || name === 'max') {
      arity(2, 32)
      return args.slice(1).reduce((best, value) => compare(name === 'min' ? '<' : '>', value, best, span) ? value : best, args[0])
    }
    if (name === 'distance' || name === 'at_goal' || name === 'altitude') this.metrics.sensors++
    return this.capabilities.call(name, args, span)
  }
  private async *statements(body: Statement[], frame: Frame): Evaluation<Flow> {
    for (const statement of body) {
      this.budget(statement); this.metrics.statements++
      switch (statement.kind) {
        case 'assign': this.bind(frame, statement.name, yield* this.expression(statement.value, frame), statement); this.metrics.assignments++; break
        case 'def': this.bind(frame, statement.name, { kind: 'callable', name: statement.name, definition: statement }, statement); break
        case 'expression': yield* this.expression(statement.value, frame); break
        case 'return': {
          const value = statement.value ? yield* this.expression(statement.value, frame) : null
          yield statement; return { kind: 'return', value }
        }
        case 'break': case 'continue': yield statement; return { kind: statement.kind }
        case 'pass': break
        case 'if': {
          this.metrics.branches++
          let selected = statement.otherwise
          for (const branch of statement.branches) if (truthy(yield* this.expression(branch.condition, frame))) { selected = branch.body; break }
          yield statement
          const flow = yield* this.statements(selected, frame)
          if (flow) return flow
          continue
        }
        case 'while': {
          this.metrics.loops++
          while (true) {
            this.budget(statement)
            const keepGoing = truthy(yield* this.expression(statement.condition, frame)); yield statement
            if (!keepGoing) break
            const flow = yield* this.statements(statement.body, frame)
            if (flow?.kind === 'return') return flow
            if (flow?.kind === 'break') break
          }
          continue
        }
        case 'for': {
          this.metrics.loops++
          const range = yield* this.expression(statement.iterable, frame)
          if (!range || typeof range !== 'object' || range.kind !== 'range') return this.fail('TypeError: for supports range values only.', statement)
          for (let i = range.start; range.step > 0n ? i < range.stop : i > range.stop; i += range.step) {
            this.budget(statement); this.bind(frame, statement.name, i, statement); yield statement
            const flow = yield* this.statements(statement.body, frame)
            if (flow?.kind === 'return') return flow
            if (flow?.kind === 'break') break
          }
          break
        }
      }
      yield statement
    }
  }
  async *run(): Evaluation<void> { yield* this.statements(this.program.body, this.globals) }
  inspectVariables(): Record<string, string> {
    return Object.fromEntries([...this.globals.values].filter(([, value]) => !(value && typeof value === 'object' && value.kind === 'callable')).map(([key, value]) => [key, formatValue(value, { line: 1, column: 1 })]))
  }
}
