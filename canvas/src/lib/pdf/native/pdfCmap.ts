import type { ParsedIndirectObject, PdfDict, PdfStreamDecodeCache } from './pdfObjects'
import { deref, getDictValue, isDict, isRef, readStream } from './pdfObjects'

export function parseToUnicodeCMap(bytes: Buffer, opts?: { maxBytes?: number }): Map<string, string> {
  const maxBytes = (() => {
    if (typeof opts?.maxBytes === 'number' && opts.maxBytes > 0) return Math.floor(opts.maxBytes)
    const raw = String(process.env.KNOWGRPH_PDF_CMAP_MAX_BYTES || '').trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 256 * 1024
  })()
  if (bytes.length > maxBytes) return new Map<string, string>()

  const s = bytes.toString('latin1')
  const map = new Map<string, string>()
  const decodeUtf16be = (b: Buffer) => {
    if (!b || b.length === 0) return ''
    const len = b.length - (b.length % 2)
    const swapped = Buffer.allocUnsafe(len)
    for (let i = 0; i + 1 < len; i += 2) {
      swapped[i] = b[i + 1]
      swapped[i + 1] = b[i]
    }
    return swapped.toString('utf16le')
  }
  const parseHex = (hex: string) => Buffer.from(hex.replace(/[<>\s]/g, ''), 'hex')

  const bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g
  let m: RegExpExecArray | null
  while ((m = bfcharRe.exec(s)) != null) {
    const body = m[1] || ''
    const lineRe = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g
    let lm: RegExpExecArray | null
    while ((lm = lineRe.exec(body)) != null) {
      const src = lm[1]
      const dst = lm[2]
      const dstBytes = parseHex(`<${dst}>`)
      map.set(src.toUpperCase(), decodeUtf16be(dstBytes))
    }
  }

  const bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g
  while ((m = bfrangeRe.exec(s)) != null) {
    const body = m[1] || ''
    const rangeRe = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+(<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g
    let rm: RegExpExecArray | null
    while ((rm = rangeRe.exec(body)) != null) {
      const startHex = rm[1]
      const endHex = rm[2]
      const start = parseInt(startHex, 16)
      const end = parseInt(endHex, 16)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
      if (rm[4]) {
        const baseBytes = parseHex(`<${rm[4]}>`)
        const baseStr = decodeUtf16be(baseBytes)
        const baseCode = baseStr.codePointAt(0) ?? 0
        for (let code = start; code <= end && code - start <= 2048; code += 1) {
          map.set(code.toString(16).toUpperCase().padStart(startHex.length, '0'), String.fromCodePoint(baseCode + (code - start)))
        }
      } else if (rm[5]) {
        const arrBody = rm[5]
        const items = [...arrBody.matchAll(/<([0-9A-Fa-f]+)>/g)].map(mm => mm[1])
        for (let i = 0; i < items.length && start + i <= end; i += 1) {
          const dstBytes = parseHex(`<${items[i]}>`)
          map.set((start + i).toString(16).toUpperCase().padStart(startHex.length, '0'), decodeUtf16be(dstBytes))
        }
      }
    }
  }

  return map
}

export function buildFontUnicodeMaps(
  objects: Map<number, ParsedIndirectObject>,
  resources: PdfDict | null,
  streamDecodeCache?: PdfStreamDecodeCache | null,
  toUnicodeCache?: Map<number, Map<string, string>> | null,
  allowedFontKeys?: Set<string> | null,
  limits?: {
    cmapMaxBytes?: number
    maxToUnicodeStreamBytes?: number
    toUnicodeMaxDecodeBytes?: number
  } | null,
): Record<string, Map<string, string>> {
  const out: Record<string, Map<string, string>> = {}
  if (!resources) return out

   const debugTiming = String(process.env.KNOWGRPH_PDF_DEBUG_TIMING || '').trim() === '1'
   const startedAt = debugTiming ? Date.now() : 0
   let visitedFonts = 0
   let parsedCmaps = 0
  const fontVal = getDictValue(resources, 'Font')
  const fontDict = (() => {
    const v = deref(objects, fontVal)
    return isDict(v) ? v : null
  })()
  if (!fontDict) return out
  for (const [fontKey, fontEntry] of Object.entries(fontDict.map)) {
    if (allowedFontKeys && !allowedFontKeys.has(fontKey)) continue
    visitedFonts += 1
    const ref = isRef(fontEntry) ? fontEntry : null
    if (!ref) continue
    const obj = objects.get(ref.obj)
    const dict = obj?.dict || null
    if (!dict) continue
    const toUnicodeVal = getDictValue(dict, 'ToUnicode')
    const toUnicodeRef = isRef(toUnicodeVal) ? toUnicodeVal : null
    if (!toUnicodeRef) continue

    const maxToUnicodeStreamBytes = (() => {
      if (typeof limits?.maxToUnicodeStreamBytes === 'number' && limits.maxToUnicodeStreamBytes > 0) return Math.floor(limits.maxToUnicodeStreamBytes)
      const raw = String(process.env.KNOWGRPH_PDF_MAX_TO_UNICODE_STREAM_BYTES || '').trim()
      const n = raw ? Number(raw) : NaN
      if (Number.isFinite(n) && n > 0) return Math.floor(n)
      return 256 * 1024
    })()
    const toUnicodeObj = objects.get(toUnicodeRef.obj)
    const toUnicodeStreamLen = toUnicodeObj?.stream?.length || 0
    if (toUnicodeStreamLen > maxToUnicodeStreamBytes) continue

    if (debugTiming) process.stderr.write(`[pdf] toUnicode font=${fontKey} obj=${toUnicodeRef.obj} rawLen=${toUnicodeStreamLen}\n`)

    const cached = toUnicodeCache?.get(toUnicodeRef.obj)
    if (cached) {
      out[fontKey] = cached
      continue
    }
    const maxToUnicodeDecodeBytes = (() => {
      if (typeof limits?.toUnicodeMaxDecodeBytes === 'number' && limits.toUnicodeMaxDecodeBytes > 0) return Math.floor(limits.toUnicodeMaxDecodeBytes)
      const raw = String(process.env.KNOWGRPH_PDF_TOUNICODE_MAX_DECODE_BYTES || '').trim()
      const n = raw ? Number(raw) : NaN
      if (Number.isFinite(n) && n > 0) return Math.floor(n)
      return 512 * 1024
    })()
    const st = readStream(objects, toUnicodeRef, streamDecodeCache, { maxOutputLength: maxToUnicodeDecodeBytes, onError: 'null' })
    if (!st.decodeComplete || !st.bytes) continue
    try {
      const cmap = parseToUnicodeCMap(st.bytes, { maxBytes: limits?.cmapMaxBytes })
      out[fontKey] = cmap
      toUnicodeCache?.set(toUnicodeRef.obj, cmap)
      parsedCmaps += 1
    } catch {
      void 0
    }
  }
  if (debugTiming) process.stderr.write(`[pdf] buildFontUnicodeMaps fonts=${visitedFonts} cmaps=${parsedCmaps}ms=${Date.now() - startedAt}\n`)
  return out
}

export function decodePdfTextBytes(bytes: Buffer, cmap: Map<string, string> | null): string {
  if (!bytes || bytes.length === 0) return ''
  const decodeWinAnsiByte = (b: number): string => {
    const x = b & 0xff
    if (x < 0x80 || x >= 0xa0) return String.fromCharCode(x)
    switch (x) {
      case 0x80:
        return '€'
      case 0x82:
        return '‚'
      case 0x83:
        return 'ƒ'
      case 0x84:
        return '„'
      case 0x85:
        return '…'
      case 0x86:
        return '†'
      case 0x87:
        return '‡'
      case 0x88:
        return 'ˆ'
      case 0x89:
        return '‰'
      case 0x8a:
        return 'Š'
      case 0x8b:
        return '‹'
      case 0x8c:
        return 'Œ'
      case 0x8e:
        return 'Ž'
      case 0x91:
        return '‘'
      case 0x92:
        return '’'
      case 0x93:
        return '“'
      case 0x94:
        return '”'
      case 0x95:
        return '•'
      case 0x96:
        return '–'
      case 0x97:
        return '—'
      case 0x98:
        return '˜'
      case 0x99:
        return '™'
      case 0x9a:
        return 'š'
      case 0x9b:
        return '›'
      case 0x9c:
        return 'œ'
      case 0x9e:
        return 'ž'
      case 0x9f:
        return 'Ÿ'
      default:
        return String.fromCharCode(x)
    }
  }
  const decodeWinAnsiBytes = (b: Buffer): string => {
    let out = ''
    for (let i = 0; i < b.length; i += 1) out += decodeWinAnsiByte(b[i] || 0)
    return out
  }

  if (!cmap || cmap.size === 0) return decodeWinAnsiBytes(bytes)
  const preferredLen = (() => {
    const preferredLenByMap: WeakMap<Map<string, string>, number> = (decodePdfTextBytes as unknown as {
      __preferredLenByMap?: WeakMap<Map<string, string>, number>
    }).__preferredLenByMap ?? new WeakMap<Map<string, string>, number>()
    ;(decodePdfTextBytes as unknown as { __preferredLenByMap?: WeakMap<Map<string, string>, number> }).__preferredLenByMap = preferredLenByMap

    const cached = preferredLenByMap.get(cmap)
    if (typeof cached === 'number') return cached

    const counts = new Map<number, number>()
    for (const k of cmap.keys()) {
      const n = Math.max(1, Math.floor(String(k).length / 2))
      if (n > 0 && n <= 16) counts.set(n, (counts.get(n) || 0) + 1)
    }
    let best = 1
    let bestCount = 0
    for (const [n, c] of counts.entries()) {
      if (c > bestCount) {
        best = n
        bestCount = c
      }
    }
    const computed = Math.max(1, Math.min(4, best))
    preferredLenByMap.set(cmap, computed)
    return computed
  })()
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const len = Math.min(preferredLen, bytes.length - i)
    let matched = false
    for (let n = len; n >= 1; n -= 1) {
      const key = bytes.slice(i, i + n).toString('hex').toUpperCase()
      const u = cmap.get(key)
      if (u != null) {
        out += u
        i += n
        matched = true
        break
      }
    }
    if (!matched) {
      out += decodeWinAnsiByte(bytes[i] || 0)
      i += 1
    }
  }
  return out
}

export function isPdfBytesToken(tok: unknown): tok is { kind: 'bytes'; bytes: Buffer } {
  if (!tok || typeof tok !== 'object') return false
  if (!('kind' in tok) || (tok as { kind?: unknown }).kind !== 'bytes') return false
  return Buffer.isBuffer((tok as { bytes?: unknown }).bytes)
}

export function isPdfNameToken(tok: unknown): tok is { kind: 'name'; name: string } {
  if (!tok || typeof tok !== 'object') return false
  if (!('kind' in tok) || (tok as { kind?: unknown }).kind !== 'name') return false
  return typeof (tok as { name?: unknown }).name === 'string'
}
