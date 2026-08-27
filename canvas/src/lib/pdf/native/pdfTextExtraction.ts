import type { TextFragment } from './types'
import type { ParsedIndirectObject, PdfDict, PdfStreamDecodeCache } from './pdfObjects'
import { deref, getDictValue, isArray, isDict, isName, isRef, readStream } from './pdfObjects'
import { buildFontUnicodeMaps } from './pdfCmap'
import { parseContentStreamText } from './pdfContentText'
import { collectDoXObjectNames, resolveXObjectRef } from './pdfXObjects'

function resolveBoldFontKeys(
  objects: Map<number, ParsedIndirectObject>,
  resources: PdfDict | null,
  allowedFontKeys?: Set<string> | null,
): Set<string> {
  const boldKeys = new Set<string>()
  if (!resources) return boldKeys
  const fontVal = getDictValue(resources, 'Font')
  const fontDict = (() => {
    const v = deref(objects, fontVal)
    return isDict(v) ? v : null
  })()
  if (!fontDict) return boldKeys
  for (const [fontKey, fontEntry] of Object.entries(fontDict.map)) {
    if (allowedFontKeys && !allowedFontKeys.has(fontKey)) continue
    const ref = isRef(fontEntry) ? fontEntry : null
    if (!ref) continue
    const obj = objects.get(ref.obj)
    const dict = obj?.dict || null
    if (!dict) continue
    const baseFont = getDictValue(dict, 'BaseFont')
    const baseFontName = isName(baseFont) ? baseFont.name : ''
    const fontDescriptorRef = (() => {
      const v = getDictValue(dict, 'FontDescriptor')
      return isRef(v) ? v : null
    })()
    const fontDescriptorDict = fontDescriptorRef
      ? (() => {
          const d = objects.get(fontDescriptorRef.obj)?.dict || null
          return isDict(d) ? d : null
        })()
      : null
    const fontWeight = fontDescriptorDict
      ? (() => {
          const v = getDictValue(fontDescriptorDict, 'FontWeight')
          if (typeof v === 'number') return v
          return null
        })()
      : null
    const fontName = fontDescriptorDict
      ? (() => {
          const v = getDictValue(fontDescriptorDict, 'FontName')
          return isName(v) ? v.name : ''
        })()
      : ''
    const checkName = fontName || baseFontName
    const isBold =
      (fontWeight != null && fontWeight >= 700) ||
      /Bold/i.test(checkName) ||
      /Heavy/i.test(checkName) ||
      /Black/i.test(checkName)
    if (isBold) boldKeys.add(fontKey)
  }
  return boldKeys
}

export function extractTextFragmentsFromPage(args: {
  objects: Map<number, ParsedIndirectObject>
  pageResources: PdfDict | null
  contentBytes: Buffer
  maxDepth?: number
  streamDecodeCache?: PdfStreamDecodeCache | null
  toUnicodeCache?: Map<number, Map<string, string>> | null
  cmapMaxBytes?: number
  maxToUnicodeStreamBytes?: number
  toUnicodeMaxDecodeBytes?: number
  maxTextContentBytesPerPage?: number
  maxTextStreamBytes?: number
  maxFormXObjectBytes?: number
  maxFormXObjectStreamBytes?: number
  maxFormXObjectCount?: number
}): TextFragment[] {
  const maxDepth = typeof args.maxDepth === 'number' && args.maxDepth > 0 ? Math.floor(args.maxDepth) : 4
  const visited = new Set<number>()
  const debugTiming = String(process.env.AGENTICGRAPH_PDF_DEBUG_TIMING || '').trim() === '1'
  const maxTotalContentBytes = (() => {
    if (typeof args.maxTextContentBytesPerPage === 'number' && args.maxTextContentBytesPerPage > 0) {
      return Math.floor(args.maxTextContentBytesPerPage)
    }
    const raw = String(process.env.AGENTICGRAPH_PDF_MAX_TEXT_CONTENT_BYTES_PER_PAGE || '').trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 512 * 1024
  })()
  const maxSingleTextStreamBytes = (() => {
    if (typeof args.maxTextStreamBytes === 'number' && args.maxTextStreamBytes > 0) {
      return Math.floor(args.maxTextStreamBytes)
    }
    const raw = String(process.env.AGENTICGRAPH_PDF_MAX_TEXT_STREAM_BYTES || '').trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 256 * 1024
  })()
  const maxFormXObjectBytes = (() => {
    if (typeof args.maxFormXObjectBytes === 'number' && args.maxFormXObjectBytes > 0) {
      return Math.floor(args.maxFormXObjectBytes)
    }
    const raw = String(process.env.AGENTICGRAPH_PDF_MAX_FORM_XOBJECT_BYTES || '').trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 512 * 1024
  })()
  const maxFormXObjectStreamBytes = (() => {
    if (typeof args.maxFormXObjectStreamBytes === 'number' && args.maxFormXObjectStreamBytes > 0) {
      return Math.floor(args.maxFormXObjectStreamBytes)
    }
    const raw = String(process.env.AGENTICGRAPH_PDF_MAX_FORM_XOBJECT_STREAM_BYTES || '').trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 256 * 1024
  })()
  const maxFormXObjectCount = (() => {
    if (typeof args.maxFormXObjectCount === 'number' && args.maxFormXObjectCount >= 0) {
      return Math.floor(args.maxFormXObjectCount)
    }
    const raw = String(process.env.AGENTICGRAPH_PDF_MAX_FORM_XOBJECT_COUNT || '').trim()
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 64
  })()
  const allowFlateFormXObjectText = String(process.env.AGENTICGRAPH_PDF_TEXT_ALLOW_FLATE_FORM_XOBJECTS || '').trim() === '1'

  let totalBytes = 0

  const collectFontKeysFromContent = (contentBytes: Buffer): Set<string> => {
    const s = contentBytes.toString('latin1')
    const out = new Set<string>()
    const re = /\/([A-Za-z0-9#._+-]+)\s+[-+0-9.]+\s+Tf\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) != null) {
      const k = String(m[1] || '').trim()
      if (k) out.add(k)
      if (out.size >= 64) break
    }
    return out
  }

  const extractFromStream = (contentBytes: Buffer, resources: PdfDict | null, depth: number): TextFragment[] => {
    if (contentBytes.length > maxSingleTextStreamBytes) return []
    if (contentBytes.length > 0) {
      totalBytes += contentBytes.length
      if (totalBytes > maxTotalContentBytes) return []
    }
    const allowedFontKeys = collectFontKeysFromContent(contentBytes)
    const fontMaps = buildFontUnicodeMaps(args.objects, resources, args.streamDecodeCache, args.toUnicodeCache, allowedFontKeys, {
      cmapMaxBytes: args.cmapMaxBytes,
      maxToUnicodeStreamBytes: args.maxToUnicodeStreamBytes,
      toUnicodeMaxDecodeBytes: args.toUnicodeMaxDecodeBytes,
    })
    const boldKeys = resolveBoldFontKeys(args.objects, resources, allowedFontKeys)
    const fragments = parseContentStreamText(contentBytes, fontMaps)
    for (const f of fragments) {
      if (boldKeys.has(f.fontKey)) f.bold = true
    }
    if (debugTiming && depth === 0) process.stderr.write(`[pdf] textParse fragments=${fragments.length} depth=${depth} bytes=${contentBytes.length}\n`)
    if (depth >= maxDepth) return fragments
    const names = collectDoXObjectNames(contentBytes)
    if (debugTiming && depth === 0) process.stderr.write(`[pdf] xobjectNames count=${names.length}\n`)
    let followed = 0
    for (const name of names) {
      if (followed >= maxFormXObjectCount) break
      const ref = resolveXObjectRef(args.objects, resources, name)
      if (!ref || visited.has(ref.obj)) continue
      const obj = args.objects.get(ref.obj)
      const dict = obj?.dict || null
      if (!dict) continue
      const subtype = getDictValue(dict, 'Subtype')
      if (!isName(subtype) || subtype.name !== 'Form') continue
      const rawStreamLen = obj?.stream?.length || 0
      if (rawStreamLen > maxFormXObjectStreamBytes) continue

      const filterVal = getDictValue(dict, 'Filter')
      const filters: string[] = (() => {
        if (!filterVal) return []
        if (isName(filterVal)) return [filterVal.name]
        if (isArray(filterVal)) return filterVal.items.filter(isName).map(n => n.name)
        return []
      })()
      if (!allowFlateFormXObjectText && filters.includes('FlateDecode')) continue

      visited.add(ref.obj)
      const formResources = (() => {
        const rv = getDictValue(dict, 'Resources')
        const dv = deref(args.objects, rv)
        return isDict(dv) ? dv : resources
      })()
      const st = readStream(args.objects, ref, args.streamDecodeCache, { maxOutputLength: maxFormXObjectBytes, onError: 'null' })
      if (!st.decodeComplete || !st.bytes) continue
      if (st.bytes.length > maxFormXObjectBytes) continue
      followed += 1
      fragments.push(...extractFromStream(st.bytes, formResources, depth + 1))
    }
    return fragments
  }

  return extractFromStream(args.contentBytes, args.pageResources, 0)
}
