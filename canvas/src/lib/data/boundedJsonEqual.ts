/** Exact equality for plain data; uncertainty retains the caller's change.
 * Caps: 8192 value/key steps, 262144 UTF-16 code units, depth 64. No accessors run.
 */
export function boundedJsonEqual(left: unknown, right: unknown): boolean {
  let remaining = 8192, characters = 262144
  const forward = new WeakMap<object, object>(), reverse = new WeakMap<object, object>()
  const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
  const equal = (a: unknown, b: unknown, depth: number): boolean => {
    if (--remaining < 0 || depth > 64) return false
    if (typeof a === 'string' || typeof b === 'string') {
      characters -= (typeof a === 'string' ? a.length : 0) + (typeof b === 'string' ? b.length : 0)
      return characters >= 0 && a === b
    }
    if (Object.is(a, b)) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && (a.length !== (b as unknown[]).length || a.length > remaining)) return false
    for (const value of [a, b]) {
      const prototype = Object.getPrototypeOf(value)
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false
      if (Object.getOwnPropertySymbols(value).length) return false
    }
    if (forward.has(a) || reverse.has(b)) return forward.get(a) === b && reverse.get(b) === a
    forward.set(a, b); reverse.set(b, a)
    let keys = 0
    for (const key in a) {
      if (--remaining < 0) return false
      if (!own(a, key)) continue
      if ((characters -= key.length) < 0 || !own(b, key)) return false
      const first = Object.getOwnPropertyDescriptor(a, key)!, second = Object.getOwnPropertyDescriptor(b, key)!
      if (!('value' in first) || !('value' in second) || !equal(first.value, second.value, depth + 1)) return false
      keys += 1
    }
    for (const key in b) {
      if (--remaining < 0) return false
      if (!own(b, key)) continue
      if (--keys < 0) return false
    }
    return keys === 0
  }
  try { return equal(left, right, 0) } catch { return false }
}
