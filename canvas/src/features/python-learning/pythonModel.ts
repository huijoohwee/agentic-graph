export const PYTHON_RUNTIME_REVISION = 'learning-python-1'
export const PYTHON_LIMITS = Object.freeze({
  sourceBytes: 32768, astNodes: 4096, parseDepth: 32, steps: 50000,
  callDepth: 16, variables: 256, stringLength: 4096, integerBits: 1024,
  outputBytes: 65536, ticks: 7200, traceBytes: 1048576,
  computeMs: 5000, batchMs: 8, pausedMs: 900000,
})
export type SourceSpan = Readonly<{ line: number; column: number }>
export class PythonLearningError extends Error {
  constructor(readonly code: string, message: string, readonly span: SourceSpan = { line: 1, column: 1 }) {
    super(message)
    this.name = 'PythonLearningError'
  }
}
export type PyFloat = Readonly<{ kind: 'float'; value: number }>
export type PyRange = Readonly<{ kind: 'range'; start: bigint; stop: bigint; step: bigint }>
export type PyCallable = Readonly<{ kind: 'callable'; name: string; definition?: Statement & { kind: 'def' } }>
export type PyValue = bigint | PyFloat | boolean | string | null | PyRange | PyCallable
export type Expression = SourceSpan & (
  | { kind: 'literal'; value: PyValue }
  | { kind: 'name'; name: string }
  | { kind: 'unary'; operator: string; value: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
  | { kind: 'compare'; values: Expression[]; operators: string[] }
  | { kind: 'call'; name: string; args: Expression[] }
)
export type Statement = SourceSpan & (
  | { kind: 'assign'; name: string; value: Expression }
  | { kind: 'expression'; value: Expression }
  | { kind: 'if'; branches: { condition: Expression; body: Statement[] }[]; otherwise: Statement[] }
  | { kind: 'while'; condition: Expression; body: Statement[] }
  | { kind: 'for'; name: string; iterable: Expression; body: Statement[] }
  | { kind: 'def'; name: string; parameters: string[]; body: Statement[]; locals: string[] }
  | { kind: 'return'; value: Expression | null }
  | { kind: 'break' | 'continue' | 'pass' }
)
export type PythonProgram = Readonly<{ body: Statement[]; nodeCount: number }>
export const sourceBytes = (text: string): number => new TextEncoder().encode(text).byteLength
export function pythonError(error: unknown): Readonly<{ code: string; message: string; span: SourceSpan }> {
  return error instanceof PythonLearningError
    ? { code: error.code, message: error.message, span: error.span }
    : { code: 'runtime-error', message: error instanceof Error ? error.message : String(error), span: { line: 1, column: 1 } }
}
