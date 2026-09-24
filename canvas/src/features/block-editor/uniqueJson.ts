import { ProgramEditError } from './programError'

/** Reject duplicate object keys before JSON.parse can silently take the last value. */
export function parseUniqueJson(source: string): unknown {
  let index = 0
  const space = () => { while (/\s/.test(source[index] || '')) index++ }
  const fail = (): never => { throw new ProgramEditError('Malformed or duplicate-key program JSON.') }
  const quoted = (): string => {
    const start = index++
    if (source[start] !== '"') fail()
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue }
      if (source[index++] === '"') {
        try { return JSON.parse(source.slice(start, index)) as string } catch { fail() }
      }
    }
    return fail()
  }
  const value = (depth: number): void => {
    if (depth > 64) fail()
    space()
    const next = source[index]
    if (next === '"') { quoted(); return }
    if (next === '{') {
      index++; space(); const keys = new Set<string>()
      if (source[index] === '}') { index++; return }
      while (index < source.length) {
        space(); if (source[index] !== '"') fail()
        const key = quoted(); if (keys.has(key)) fail(); keys.add(key)
        space(); if (source[index++] !== ':') fail()
        value(depth + 1); space()
        if (source[index] === '}') { index++; return }
        if (source[index++] !== ',') fail()
      }
      return fail()
    }
    if (next === '[') {
      index++; space(); if (source[index] === ']') { index++; return }
      while (index < source.length) {
        value(depth + 1); space()
        if (source[index] === ']') { index++; return }
        if (source[index++] !== ',') fail()
      }
      return fail()
    }
    const scalar = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(index))
    if (!scalar) fail()
    index += scalar[0].length
  }
  value(0); space(); if (index !== source.length) fail()
  try { return JSON.parse(source) as unknown } catch { return fail() }
}
