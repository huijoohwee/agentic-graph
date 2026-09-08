// Exact plain-data keys. Caps: 8,192 visited values/keys, depth 64, 65,536 UTF-16 units.
// Property enumeration is native; this is not an execution sandbox for Proxy objects.
export function buildBoundedFlowCacheKey(value: unknown): string | null {
  let work = 8192, characters = 65536
  const parts: string[] = [], seen = new WeakMap<object, number>()
  let nextId = 0
  const append = (text: string): void => {
    if ((characters -= text.length) < 0) throw new Error('key budget')
    parts.push(text)
  }
  const string = (text: string): void => { append(`s${text.length}:`); append(text) }
  const visit = (current: unknown, depth: number): void => {
    if (--work < 0 || depth > 64) throw new Error('scan budget')
    if (current === null) { append('z'); return }
    if (typeof current === 'string') { string(current); return }
    if (typeof current === 'undefined') { append('u'); return }
    if (typeof current === 'boolean') { append(current ? 'b1' : 'b0'); return }
    if (typeof current === 'number') { append(`n${Object.is(current, -0) ? '-0' : String(current)};`); return }
    if (typeof current !== 'object') throw new Error('opaque value')
    const prior = seen.get(current)
    if (prior !== undefined) { append(`r${prior};`); return }
    const prototype = Object.getPrototypeOf(current)
    if (prototype !== Object.prototype && prototype !== null && !(Array.isArray(current) && prototype === Array.prototype)) throw new Error('opaque prototype')
    if (Object.getOwnPropertySymbols(current).length) throw new Error('symbol keys')
    if (Array.isArray(current) && (work -= current.length) < 0) throw new Error('array slots budget')
    const keys = Object.getOwnPropertyNames(current)
    if (keys.length > work) throw new Error('key count budget')
    seen.set(current, nextId++)
    append(Array.isArray(current) ? 'a{' : prototype === null ? 'p{' : 'o{')
    for (const key of keys) {
      if (--work < 0) throw new Error('key budget')
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (!descriptor || !('value' in descriptor)) throw new Error('accessor')
      string(key)
      append(`${+!!descriptor.enumerable}${+!!descriptor.configurable}${+!!descriptor.writable}:`)
      visit(descriptor.value, depth + 1)
    }
    append('}')
  }
  try { visit(value, 0); return parts.join('') } catch { return null }
}

// One global entry limit, including every graph, registry and target combination.
// Results are weakly held: caller mutations cannot enlarge retained cache payloads.
// Retention is capped at 1,048,576 serialized UTF-16 units, not a JS heap-size claim.
export function createFlowConnectedValuesCache<T extends Map<string, unknown>>() {
  const entries = new Map<string, { value: WeakRef<T>; wire: string; size: number }>()
  let retained = 0
  const remove = (key: string): void => {
    const entry = entries.get(key)
    if (entry) { retained -= entry.size; entries.delete(key) }
  }
  const resultKey = (value: T): string | null => {
    try { return value.size <= 8192 ? buildBoundedFlowCacheKey([...value]) : null } catch { return null }
  }
  return {
    read(key: string | null): T | null {
      if (key === null) return null
      const entry = entries.get(key)
      if (!entry) return null
      const value = entry.value.deref()
      if (!value || resultKey(value) !== entry.wire) { remove(key); return null }
      entries.delete(key); entries.set(key, entry)
      return value
    },
    write(key: string | null, value: T): void {
      if (key === null) return
      remove(key)
      if (key.length > 65536 || typeof WeakRef === 'undefined') return
      const wire = resultKey(value)
      if (wire === null) return
      const size = key.length + wire.length
      while (entries.size >= 64 || retained + size > 1048576) remove(entries.keys().next().value!)
      entries.set(key, { value: new WeakRef(value), wire, size }); retained += size
    },
  }
}
