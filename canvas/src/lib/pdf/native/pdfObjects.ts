import zlib from 'node:zlib'

export type PdfRef = { obj: number; gen: number }
export type PdfName = { kind: 'name'; name: string }
export type PdfDict = { kind: 'dict'; map: Record<string, PdfValue> }
export type PdfArray = { kind: 'array'; items: PdfValue[] }
export type PdfString = { kind: 'string'; bytes: Buffer }
export type PdfHexString = { kind: 'hex'; bytes: Buffer }
export type PdfNumber = { kind: 'number'; value: number }
export type PdfBool = { kind: 'bool'; value: boolean }
export type PdfNull = { kind: 'null' }
export type PdfValue = PdfDict | PdfArray | PdfName | PdfString | PdfHexString | PdfNumber | PdfBool | PdfNull | PdfRef

export type ParsedIndirectObject = {
  obj: number
  gen: number
  dict: PdfDict | null
  stream: Buffer | null
  rawStart: number
  rawEnd: number
}

export type PdfStreamDecodeCache = {
  decodedByObj: Map<number, Buffer>
  maxBytes: number
  usedBytes: number
}

export function createPdfStreamDecodeCache(maxBytes: number): PdfStreamDecodeCache {
  const max = Number.isFinite(maxBytes) && maxBytes > 0 ? Math.floor(maxBytes) : 0
  return { decodedByObj: new Map<number, Buffer>(), maxBytes: max, usedBytes: 0 }
}

export function isRef(v: PdfValue | null | undefined): v is PdfRef {
  return !!v && typeof v === 'object' && 'obj' in v && 'gen' in v
}

export function isDict(v: PdfValue | null | undefined): v is PdfDict {
  return !!v && typeof v === 'object' && 'kind' in v && (v as { kind?: unknown }).kind === 'dict'
}

export function isArray(v: PdfValue | null | undefined): v is PdfArray {
  return !!v && typeof v === 'object' && 'kind' in v && (v as { kind?: unknown }).kind === 'array'
}

export function isName(v: PdfValue | null | undefined): v is PdfName {
  return !!v && typeof v === 'object' && 'kind' in v && (v as { kind?: unknown }).kind === 'name'
}

export function isNumber(v: PdfValue | null | undefined): v is PdfNumber {
  return !!v && typeof v === 'object' && 'kind' in v && (v as { kind?: unknown }).kind === 'number'
}

export function parseIndirectObjects(buf: Buffer): Map<number, ParsedIndirectObject> {
  const s = buf.toString('latin1')
  const re = /(\d+)\s+(\d+)\s+obj\b/g
  const out = new Map<number, ParsedIndirectObject>()
  const findNextLineKeyword = (keyword: string, from: number): number => {
    const a = s.indexOf(`\n${keyword}`, from)
    const b = s.indexOf(`\r${keyword}`, from)
    if (a < 0) return b
    if (b < 0) return a
    return Math.min(a, b)
  }
  const findNextStreamKeyword = (from: number, to: number): number => {
    let idx = s.indexOf('stream', from)
    while (idx >= 0 && idx < to) {
      const after = s[idx + 6] || ''
      if (after === '\n' || after === '\r') return idx
      idx = s.indexOf('stream', idx + 6)
    }
    return -1
  }
  let match: RegExpExecArray | null
  while ((match = re.exec(s)) != null) {
    const obj = Number(match[1])
    const gen = Number(match[2])
    if (!Number.isFinite(obj) || obj <= 0) continue
    const start = match.index
    const afterHeader = start + match[0].length
    const endobjLine = findNextLineKeyword('endobj', afterHeader)
    if (endobjLine < 0) continue
    const endobjKeyword = endobjLine + 1
    const streamKeyword = findNextStreamKeyword(afterHeader, endobjKeyword)
    const hasStream = streamKeyword >= 0
    const endstreamLine = hasStream ? findNextLineKeyword('endstream', streamKeyword + 6) : -1
    const endstreamKeyword = endstreamLine >= 0 ? endstreamLine + 1 : -1
    const endobjAfterStreamLine = endstreamKeyword >= 0 ? findNextLineKeyword('endobj', endstreamKeyword + 9) : -1
    const finalEndobjKeyword = endobjAfterStreamLine >= 0 ? endobjAfterStreamLine + 1 : endobjKeyword
    const rawStart = start
    const rawEnd = Math.min(s.length, finalEndobjKeyword + 6)
    const rawBody = s.slice(afterHeader, finalEndobjKeyword)
    const dict = (() => {
      const dictStart = rawBody.indexOf('<<')
      if (dictStart < 0) return null
      const dictAbsStart = afterHeader + dictStart
      const p = parseValue(s, dictAbsStart)
      return isDict(p.value) ? p.value : null
    })()
    const stream = (() => {
      if (!hasStream) return null
      const streamAbs = streamKeyword
      const eol = (() => {
        if (s[streamAbs + 6] === '\r' && s[streamAbs + 7] === '\n') return streamAbs + 8
        if (s[streamAbs + 6] === '\n') return streamAbs + 7
        if (s[streamAbs + 6] === '\r') return streamAbs + 7
        const n = s.indexOf('\n', streamAbs + 6)
        if (n >= 0) return n + 1
        const r = s.indexOf('\r', streamAbs + 6)
        if (r >= 0) return r + 1
        return streamAbs + 6
      })()
      if (endstreamLine < 0) return null
      const endstreamAbs = endstreamLine
      if (endstreamAbs < eol) return null
      return buf.slice(eol, endstreamAbs)
    })()
    out.set(obj, { obj, gen, dict, stream, rawStart, rawEnd })
    re.lastIndex = rawEnd
  }
  return out
}

export function expandObjectStreams(objects: Map<number, ParsedIndirectObject>, streamDecodeCache?: PdfStreamDecodeCache | null): void {
  const tryExpandOnce = () => {
    let added = 0
    for (const obj of objects.values()) {
      const dict = obj.dict
      if (!dict || !obj.stream) continue
      const t = getDictValue(dict, 'Type')
      if (!isName(t) || t.name !== 'ObjStm') continue
      const nVal = getDictValue(dict, 'N')
      const firstVal = getDictValue(dict, 'First')
      if (!isNumber(nVal) || !isNumber(firstVal)) continue
      const n = Math.max(0, Math.min(5000, Math.floor(nVal.value)))
      const first = Math.max(0, Math.floor(firstVal.value))
      if (n <= 0 || first <= 0) continue
      const stream = readStream(objects, { obj: obj.obj, gen: obj.gen }, streamDecodeCache, null)
      const decoded = stream.bytes
      if (!stream.decodeComplete || !decoded || decoded.length <= first) continue
      const header = decoded.slice(0, first).toString('latin1')
      const pairs: Array<{ obj: number; offset: number }> = []
      const pairRe = /(\d+)\s+(\d+)/g
      let pm: RegExpExecArray | null
      while ((pm = pairRe.exec(header)) != null) {
        pairs.push({ obj: Number(pm[1]), offset: Number(pm[2]) })
        if (pairs.length >= n) break
      }
      if (pairs.length === 0) continue
      const body = decoded.slice(first).toString('latin1')
      for (let i = 0; i < pairs.length; i += 1) {
        const entry = pairs[i]
        if (!Number.isFinite(entry.obj) || entry.obj <= 0) continue
        if (objects.has(entry.obj)) continue
        const start = Math.max(0, Math.floor(entry.offset))
        const end = i + 1 < pairs.length ? Math.max(start, Math.floor(pairs[i + 1].offset)) : body.length
        if (start >= body.length) continue
        const slice = body.slice(start, Math.min(body.length, end))
        try {
          const parsed = parseValue(slice, 0).value
          const d = isDict(parsed) ? parsed : null
          objects.set(entry.obj, { obj: entry.obj, gen: 0, dict: d, stream: null, rawStart: -1, rawEnd: -1 })
          added += 1
        } catch {
          void 0
        }
      }
    }
    return added
  }
  for (let i = 0; i < 6; i += 1) {
    const added = tryExpandOnce()
    if (added <= 0) break
  }
}

export function skipWs(s: string, i: number): number {
  let idx = i
  while (idx < s.length) {
    const c = s.charCodeAt(idx)
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c) {
      idx += 1
      continue
    }
    if (s[idx] === '%') {
      const nl = s.indexOf('\n', idx + 1)
      if (nl < 0) return s.length
      idx = nl + 1
      continue
    }
    break
  }
  return idx
}

export function parseNameToken(s: string, i: number): { name: string; next: number } {
  let idx = i
  if (s[idx] !== '/') return { name: '', next: idx }
  idx += 1
  const tokenDelims = '<>[]()/%'
  const start = idx
  while (idx < s.length) {
    const ch = s[idx]
    if (/\s/.test(ch) || tokenDelims.includes(ch)) break
    idx += 1
  }
  const raw = s.slice(start, idx)
  return { name: raw, next: idx }
}

export function parseNumberToken(s: string, i: number): { value: number; next: number } {
  let idx = i
  const start = idx
  while (idx < s.length) {
    const ch = s[idx]
    if (!/[0-9+.-]/.test(ch)) break
    idx += 1
  }
  const raw = s.slice(start, idx)
  const value = Number(raw)
  return { value: Number.isFinite(value) ? value : NaN, next: idx }
}

export function parseHexString(s: string, i: number): { bytes: Buffer; next: number } {
  let idx = i
  if (s[idx] !== '<' || s[idx + 1] === '<') return { bytes: Buffer.alloc(0), next: idx }
  idx += 1
  const start = idx
  const end = s.indexOf('>', start)
  if (end < 0) return { bytes: Buffer.alloc(0), next: s.length }
  const raw = s.slice(start, end).replace(/\s+/g, '')
  const padded = raw.length % 2 === 1 ? `${raw}0` : raw
  const bytes = Buffer.from(padded, 'hex')
  return { bytes, next: end + 1 }
}

export function parseLiteralString(s: string, i: number): { bytes: Buffer; next: number } {
  let idx = i
  if (s[idx] !== '(') return { bytes: Buffer.alloc(0), next: idx }
  idx += 1
  const out: number[] = []
  let depth = 1
  while (idx < s.length && depth > 0) {
    const ch = s[idx]
    if (ch === '\\') {
      const next = s[idx + 1] || ''
      if (next === 'n') out.push(0x0a)
      else if (next === 'r') out.push(0x0d)
      else if (next === 't') out.push(0x09)
      else if (next === 'b') out.push(0x08)
      else if (next === 'f') out.push(0x0c)
      else if (next === '(') out.push(0x28)
      else if (next === ')') out.push(0x29)
      else if (next === '\\') out.push(0x5c)
      else if (/[0-7]/.test(next)) {
        const oct = s.slice(idx + 1, idx + 4).match(/^[0-7]{1,3}/)?.[0] || ''
        if (oct) {
          out.push(parseInt(oct, 8) & 0xff)
          idx += oct.length - 1
        }
      } else {
        if (next) out.push(next.charCodeAt(0) & 0xff)
      }
      idx += 2
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (depth > 0) out.push(ch.charCodeAt(0) & 0xff)
    idx += 1
  }
  return { bytes: Buffer.from(out), next: idx }
}

export function parseValue(s: string, i: number): { value: PdfValue; next: number } {
  let idx = skipWs(s, i)
  if (idx >= s.length) return { value: { kind: 'null' }, next: idx }
  const ch = s[idx]
  if (ch === '<' && s[idx + 1] === '<') {
    idx += 2
    const map: Record<string, PdfValue> = {}
    while (idx < s.length) {
      idx = skipWs(s, idx)
      if (s[idx] === '>' && s[idx + 1] === '>') {
        idx += 2
        break
      }
      const n = parseNameToken(s, idx)
      const key = n.name
      idx = n.next
      if (!key) break
      const v = parseValue(s, idx)
      map[key] = v.value
      idx = v.next
    }
    return { value: { kind: 'dict', map }, next: idx }
  }
  if (ch === '[') {
    idx += 1
    const items: PdfValue[] = []
    while (idx < s.length) {
      idx = skipWs(s, idx)
      if (s[idx] === ']') {
        idx += 1
        break
      }
      const v = parseValue(s, idx)
      items.push(v.value)
      idx = v.next
    }
    return { value: { kind: 'array', items }, next: idx }
  }
  if (ch === '/') {
    const n = parseNameToken(s, idx)
    return { value: { kind: 'name', name: n.name }, next: n.next }
  }
  if (ch === '(') {
    const lit = parseLiteralString(s, idx)
    return { value: { kind: 'string', bytes: lit.bytes }, next: lit.next }
  }
  if (ch === '<') {
    const hx = parseHexString(s, idx)
    return { value: { kind: 'hex', bytes: hx.bytes }, next: hx.next }
  }
  if (s.startsWith('true', idx)) return { value: { kind: 'bool', value: true }, next: idx + 4 }
  if (s.startsWith('false', idx)) return { value: { kind: 'bool', value: false }, next: idx + 5 }
  if (s.startsWith('null', idx)) return { value: { kind: 'null' }, next: idx + 4 }

  const num = parseNumberToken(s, idx)
  if (Number.isFinite(num.value)) {
    const j = skipWs(s, num.next)
    const num2 = parseNumberToken(s, j)
    if (Number.isFinite(num2.value)) {
      const k = skipWs(s, num2.next)
      if (s[k] === 'R') {
        return { value: { obj: Math.floor(num.value), gen: Math.floor(num2.value) }, next: k + 1 }
      }
    }
    return { value: { kind: 'number', value: num.value }, next: num.next }
  }

  let end = idx
  const tokenDelims = '<>[]()/%'
  while (end < s.length && !/\s/.test(s[end]) && !tokenDelims.includes(s[end])) end += 1
  const word = s.slice(idx, end)
  return { value: { kind: 'name', name: word }, next: end }
}

export function getDictValue(dict: PdfDict | null, key: string): PdfValue | null {
  if (!dict) return null
  return Object.prototype.hasOwnProperty.call(dict.map, key) ? dict.map[key] : null
}

export function deref(objects: Map<number, ParsedIndirectObject>, value: PdfValue | null, depth = 0): PdfValue | null {
  if (!value) return null
  if (!isRef(value)) return value
  if (depth > 8) return null
  const obj = objects.get(value.obj)
  if (!obj) return null
  return obj.dict || null
}

export function readStream(
  objects: Map<number, ParsedIndirectObject>,
  ref: PdfRef | null,
  cache?: PdfStreamDecodeCache | null,
  opts?: { maxOutputLength?: number; onError?: 'raw' | 'null' } | null,
): { dict: PdfDict | null; bytes: Buffer | null; decodeComplete: boolean } {
  if (!ref) return { dict: null, bytes: null, decodeComplete: false }
  const obj = objects.get(ref.obj)
  if (!obj) return { dict: null, bytes: null, decodeComplete: false }
  const dict = obj.dict
  const bytes = obj.stream
  if (!bytes || !dict) return { dict: dict || null, bytes: bytes || null, decodeComplete: false }
  const filterVal = getDictValue(dict, 'Filter')
  const filterDescriptor = (() => {
    if (!filterVal) return { valid: true, filters: [] as string[] }
    if (isName(filterVal)) return { valid: true, filters: [filterVal.name] }
    if (isArray(filterVal) && filterVal.items.every(isName)) {
      return { valid: true, filters: filterVal.items.map(n => n.name) }
    }
    return { valid: false, filters: [] as string[] }
  })()
  const unsupported = () => ({
    dict,
    bytes: opts?.onError === 'null' ? null : bytes,
    decodeComplete: false,
  })
  if (!filterDescriptor.valid) return unsupported()
  if (filterDescriptor.filters.length === 0) return { dict, bytes, decodeComplete: true }
  const flateDecodeParmsAreTrivial = (() => {
    const declared = getDictValue(dict, 'DecodeParms')
    if (!declared) return true
    const value = deref(objects, declared)
    if (!value) return false
    const parameter = isArray(value)
      ? (value.items.length === 1 ? deref(objects, value.items[0]) : null)
      : value
    if (!parameter) return false
    if (typeof parameter === 'object' && 'kind' in parameter && parameter.kind === 'null') return true
    if (!isDict(parameter)) return false
    const predictor = deref(objects, getDictValue(parameter, 'Predictor'))
    return !predictor
      || (typeof predictor === 'object' && 'kind' in predictor && predictor.kind === 'null')
      || (isNumber(predictor) && predictor.value === 1)
  })()
  if (filterDescriptor.filters.length === 1
    && filterDescriptor.filters[0] === 'FlateDecode') {
    const cached = cache?.decodedByObj.get(ref.obj)
    if (cached) return { dict, bytes: cached, decodeComplete: flateDecodeParmsAreTrivial }
    try {
      const maxOutputLength = (() => {
        if (typeof opts?.maxOutputLength === 'number' && Number.isFinite(opts.maxOutputLength) && opts.maxOutputLength > 0) {
          return Math.floor(opts.maxOutputLength)
        }
        const raw = String(process.env.AGENTICGRAPH_PDF_STREAM_MAX_DECODE_BYTES || '').trim()
        const n = raw ? Number(raw) : NaN
        if (Number.isFinite(n) && n > 0) return Math.floor(n)
        return 32 * 1024 * 1024
      })()
      const decoded = zlib.inflateSync(bytes, { maxOutputLength })
      if (cache && cache.maxBytes > 0) {
        const size = decoded.length
        if (size > 0 && cache.usedBytes + size <= cache.maxBytes) {
          cache.decodedByObj.set(ref.obj, decoded)
          cache.usedBytes += size
        }
      }
      return { dict, bytes: decoded, decodeComplete: flateDecodeParmsAreTrivial }
    } catch {
      return unsupported()
    }
  }
  return unsupported()
}

export function sanitizeFilename(name: string): string {
  const s = String(name || '').trim().toLowerCase()
  const cleaned = s.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[._-]+|[._-]+$/g, '')
  return cleaned || 'asset'
}
