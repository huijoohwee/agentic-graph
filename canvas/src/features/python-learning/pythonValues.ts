import { PYTHON_LIMITS, PythonLearningError, type PyFloat, type PyValue, type SourceSpan } from './pythonModel'

const fail = (message: string, span: SourceSpan): never => { throw new PythonLearningError('runtime-error', message, span) }
export function boundedValue(value: PyValue, span: SourceSpan): PyValue {
  if (typeof value === 'bigint' && (value < 0n ? -value : value).toString(2).length > PYTHON_LIMITS.integerBits) {
    throw new PythonLearningError('limit-exceeded', 'Integer exceeds the 1,024-bit learning limit.', span)
  }
  if (typeof value === 'string' && Array.from(value).length > PYTHON_LIMITS.stringLength) {
    throw new PythonLearningError('limit-exceeded', 'String exceeds the 4,096-character learning limit.', span)
  }
  if (isFloat(value) && !Number.isFinite(value.value)) {
    throw new PythonLearningError('limit-exceeded', 'Only finite floats are supported.', span)
  }
  return value
}
export const isFloat = (v: PyValue): v is PyFloat => typeof v === 'object' && v !== null && v.kind === 'float'
const isNumeric = (v: PyValue): v is bigint | boolean | PyFloat => typeof v === 'bigint' || typeof v === 'boolean' || isFloat(v)
export function integer(v: PyValue, span: SourceSpan): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'boolean') return v ? 1n : 0n
  return fail('TypeError: expected an integer.', span)
}
export function numeric(v: PyValue, span: SourceSpan): number {
  if (isFloat(v)) return v.value
  return Number(integer(v, span))
}
export function truthy(v: PyValue): boolean {
  if (isFloat(v)) return v.value !== 0
  if (v && typeof v === 'object' && v.kind === 'range') return v.step > 0n ? v.start < v.stop : v.start > v.stop
  return Boolean(v)
}
export function formatValue(v: PyValue, span: SourceSpan): string {
  if (v === null) return 'None'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'string' || typeof v === 'bigint') return String(v)
  if (isFloat(v)) {
    if (Object.is(v.value, -0)) return '-0.0'
    const absolute = Math.abs(v.value)
    let result = absolute !== 0 && (absolute < 1e-4 || absolute >= 1e16) ? v.value.toExponential() : String(v.value)
    if (!/[.e]/.test(result)) result += '.0'
    return result.replace(/e([+-]?)(\d+)$/, (_, sign: string, digits: string) => `e${sign || '+'}${digits.padStart(2, '0')}`)
  }
  if (v.kind === 'range') return `range(${v.start}, ${v.stop}${v.step === 1n ? '' : `, ${v.step}`})`
  return fail('Displaying callable values is outside the learning subset.', span)
}
export function unary(operator: string, value: PyValue, span: SourceSpan): PyValue {
  if (operator === 'not') return !truthy(value)
  const v = isFloat(value) ? value.value : integer(value, span)
  return boundedValue(typeof v === 'number' ? { kind: 'float', value: operator === '-' ? -v : v } : operator === '-' ? -v : v, span)
}
export function compare(operator: string, a: PyValue, b: PyValue, span: SourceSpan): boolean {
  let comparison: number
  if (isNumeric(a) && isNumeric(b)) {
    // JS relational BigInt/Number comparison preserves the integer operand exactly.
    const left = isFloat(a) ? a.value : integer(a, span), right = isFloat(b) ? b.value : integer(b, span)
    comparison = left < right ? -1 : left > right ? 1 : 0
  } else if (typeof a === 'string' && typeof b === 'string') {
    const left = Array.from(a, c => c.codePointAt(0)!), right = Array.from(b, c => c.codePointAt(0)!)
    let i = 0
    while (i < left.length && i < right.length && left[i] === right[i]) i++
    comparison = i === left.length ? (i === right.length ? 0 : -1) : i === right.length ? 1 : left[i] < right[i] ? -1 : 1
  } else if ((operator === '==' || operator === '!=') && a && b && typeof a === 'object' && typeof b === 'object' && a.kind === 'range' && b.kind === 'range') {
    const length = (r: typeof a) => (r.step > 0n ? r.stop <= r.start : r.stop >= r.start) ? 0n : ((r.stop - r.start + r.step + (r.step < 0n ? 1n : -1n)) / r.step)
    const count = length(a)
    comparison = count === length(b) && (!count || (a.start === b.start && (count === 1n || a.step === b.step))) ? 0 : 1
  } else if ((operator === '==' || operator === '!=') && a && b && typeof a === 'object' && typeof b === 'object' && a.kind === 'callable' && b.kind === 'callable') {
    comparison = a.name === b.name && a.definition === b.definition ? 0 : 1
  } else if (operator === '==' || operator === '!=') comparison = a === b ? 0 : 1
  else return fail('TypeError: these values cannot be ordered.', span)
  switch (operator) {
    case '==': return comparison === 0
    case '!=': return comparison !== 0
    case '<': return comparison < 0
    case '<=': return comparison <= 0
    case '>': return comparison > 0
    case '>=': return comparison >= 0
    default: return fail('Unsupported comparison.', span)
  }
}
function divideIntegers(left: bigint, right: bigint): number {
  if (!right) throw new Error('ZeroDivisionError: division by zero.')
  const negative = (left < 0n) !== (right < 0n), numerator = left < 0n ? -left : left, denominator = right < 0n ? -right : right
  if (!numerator) return negative ? -0 : 0
  let exponent = numerator.toString(2).length - denominator.toString(2).length
  if (exponent >= 0 ? numerator < (denominator << BigInt(exponent)) : (numerator << BigInt(-exponent)) < denominator) exponent--
  const unitExponent = Math.max(exponent - 52, -1074)
  const n = unitExponent < 0 ? numerator << BigInt(-unitExponent) : numerator
  const d = unitExponent > 0 ? denominator << BigInt(unitExponent) : denominator
  let quotient = n / d
  const twiceRemainder = 2n * (n % d)
  if (twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n)) quotient++
  const result = Number(quotient) * 2 ** unitExponent
  return negative ? -result : result
}
export function binary(operator: string, a: PyValue, b: PyValue, span: SourceSpan): PyValue {
  if (operator === '+' && typeof a === 'string' && typeof b === 'string') {
    if (a.length + b.length > PYTHON_LIMITS.stringLength * 2) throw new PythonLearningError('limit-exceeded', 'String allocation limit.', span)
    return boundedValue(a + b, span)
  }
  if (operator === '*' && (typeof a === 'string' || typeof b === 'string')) {
    const text = typeof a === 'string' ? a : b as string, count = integer(typeof a === 'string' ? b : a, span)
    if (count <= 0n || !text) return ''
    if (count * BigInt(Array.from(text).length) > BigInt(PYTHON_LIMITS.stringLength)) throw new PythonLearningError('limit-exceeded', 'String allocation limit.', span)
    return text.repeat(Number(count))
  }
  if (!isNumeric(a) || !isNumeric(b)) return fail('TypeError: arithmetic requires compatible numeric values.', span)
  if (operator === '/' && !isFloat(a) && !isFloat(b)) {
    const divisor = integer(b, span)
    if (!divisor) return fail('ZeroDivisionError: division by zero.', span)
    return boundedValue({ kind: 'float', value: divideIntegers(integer(a, span), divisor) }, span)
  }
  if (isFloat(a) || isFloat(b)) {
    const left = numeric(a, span), right = numeric(b, span)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return fail('OverflowError: integer cannot be converted to float.', span)
    if (['/', '//', '%'].includes(operator) && right === 0) return fail('ZeroDivisionError: division by zero.', span)
    let result: number
    if (operator === '+') result = left + right
    else if (operator === '-') result = left - right
    else if (operator === '*') result = left * right
    else if (operator === '/') result = left / right
    else {
      // Correct floor division from a remainder, including rounding near integers.
      let remainder = left % right, quotient = (left - remainder) / right
      if (remainder !== 0 && (remainder < 0) !== (right < 0)) { remainder += right; quotient -= 1 }
      if (remainder === 0) remainder = right < 0 ? -0 : 0
      let floor = quotient ? Math.floor(quotient) : (left / right < 0 || Object.is(left / right, -0) ? -0 : 0)
      if (quotient - floor > 0.5) floor += 1
      result = operator === '%' ? remainder : floor
    }
    return boundedValue({ kind: 'float', value: result }, span)
  }
  const left = integer(a, span), right = integer(b, span)
  if (['//', '%'].includes(operator) && right === 0n) return fail('ZeroDivisionError: integer division by zero.', span)
  let value: bigint
  if (operator === '+') value = left + right
  else if (operator === '-') value = left - right
  else if (operator === '*') {
    const bits = (v: bigint) => (v < 0n ? -v : v).toString(2).length
    if (left && right && bits(left) + bits(right) - 1 > PYTHON_LIMITS.integerBits) throw new PythonLearningError('limit-exceeded', 'Integer multiplication limit.', span)
    value = left * right
  } else {
    let quotient = left / right, remainder = left % right
    if (remainder !== 0n && (remainder < 0n) !== (right < 0n)) { quotient -= 1n; remainder += right }
    value = operator === '//' ? quotient : remainder
  }
  return boundedValue(value, span)
}
