import fs from 'node:fs/promises'
import path from 'node:path'
import type { NativePdfAsset } from './types'
import { buildMarkdownForPage } from './pdfMarkdown'
import { extractTextFragmentsFromPage } from './pdfTextExtraction'
import { extractPageImages } from './pdfImages'
import type { PdfOcrEnhanceConfig } from './pdfOcrEnhance'
import { maybeEnhancePageWithOcr } from './pdfOcrEnhance'
import type { PdfDict, PdfRef } from './pdfObjects'
import { createPdfStreamDecodeCache, deref, expandObjectStreams, getDictValue, isArray, isDict, isName, isNumber, isRef, parseIndirectObjects, readStream } from './pdfObjects'

export type NativePdfPageObservation = {
  pageNumber: number
  contentByteCount: number
  contentStreamCount: number
  decodedContentStreamCount: number
  contentDecodeComplete: boolean
  contentTruncated: boolean
  contentShapeValid: boolean
  hasAnnotationsEntry: boolean
  textFragmentCount: number
  markdownTextLineCount: number
  structurallyBlank: boolean
}

export type NativePdfConversionResult = {
  markdown: string
  assets: NativePdfAsset[]
  pageObservations: NativePdfPageObservation[]
}

function isStructurallyBlankPdfPage(contentBytes: Buffer): boolean {
  const observable = contentBytes
    .toString('latin1')
    .replace(/%[^\r\n]*/g, ' ')
    .trim()
  if (!observable) return true
  return observable.split(/\s+/).every(token => token === 'q' || token === 'Q')
}

function escapeReservedPageMarkerLines(markdown: string): string {
  return markdown
    .split('\n')
    .map((line, index) => (
      index > 0 && /^## Page [1-9][0-9]*\s*$/.test(line.trim())
        ? line.replace(/^(\s*)##/, '$1\\##')
        : line
    ))
    .join('\n')
}

export async function convertPdfFileToMarkdown(args: {
  pdfPath: string
  title: string
  assetUrlPrefix?: string
  includeImages?: boolean
  maxPages?: number
  maxExtractedImagesPerPage?: number
  maxEmbeddedImagesPerPage?: number
  reconstructTables?: boolean
  tableMinColumns?: number
  tableMinRows?: number
  tableMaxRows?: number
  ocrEnhance?: PdfOcrEnhanceConfig | null
  streamDecodeCacheMaxBytes?: number
  contentStreamMaxDecodeBytes?: number
  pageContentMaxBytes?: number
  cmapMaxBytes?: number
  maxToUnicodeStreamBytes?: number
  toUnicodeMaxDecodeBytes?: number
  imageStreamMaxDecodeBytes?: number
  maxTextContentBytesPerPage?: number
  maxTextStreamBytes?: number
  maxFormXObjectBytes?: number
  maxFormXObjectStreamBytes?: number
  maxFormXObjectCount?: number
}): Promise<NativePdfConversionResult> {
  const buf = await fs.readFile(args.pdfPath)
  return await convertPdfBytesToMarkdown({
    pdfBytes: buf,
    title: args.title,
    assetUrlPrefix: args.assetUrlPrefix,
    includeImages: args.includeImages,
    maxPages: args.maxPages,
    maxExtractedImagesPerPage: args.maxExtractedImagesPerPage,
    maxEmbeddedImagesPerPage: args.maxEmbeddedImagesPerPage,
    reconstructTables: args.reconstructTables,
    tableMinColumns: args.tableMinColumns,
    tableMinRows: args.tableMinRows,
    tableMaxRows: args.tableMaxRows,
    ocrEnhance: args.ocrEnhance,
    streamDecodeCacheMaxBytes: args.streamDecodeCacheMaxBytes,
    contentStreamMaxDecodeBytes: args.contentStreamMaxDecodeBytes,
    pageContentMaxBytes: args.pageContentMaxBytes,
    cmapMaxBytes: args.cmapMaxBytes,
    maxToUnicodeStreamBytes: args.maxToUnicodeStreamBytes,
    toUnicodeMaxDecodeBytes: args.toUnicodeMaxDecodeBytes,
    imageStreamMaxDecodeBytes: args.imageStreamMaxDecodeBytes,
    maxTextContentBytesPerPage: args.maxTextContentBytesPerPage,
    maxTextStreamBytes: args.maxTextStreamBytes,
    maxFormXObjectBytes: args.maxFormXObjectBytes,
    maxFormXObjectStreamBytes: args.maxFormXObjectStreamBytes,
    maxFormXObjectCount: args.maxFormXObjectCount,
  })
}

export async function convertPdfBytesToMarkdown(args: {
  pdfBytes: Buffer
  title: string
  assetUrlPrefix?: string
  includeImages?: boolean
  maxPages?: number
  maxExtractedImagesPerPage?: number
  maxEmbeddedImagesPerPage?: number
  reconstructTables?: boolean
  tableMinColumns?: number
  tableMinRows?: number
  tableMaxRows?: number
  ocrEnhance?: PdfOcrEnhanceConfig | null
  streamDecodeCacheMaxBytes?: number
  contentStreamMaxDecodeBytes?: number
  pageContentMaxBytes?: number
  cmapMaxBytes?: number
  maxToUnicodeStreamBytes?: number
  toUnicodeMaxDecodeBytes?: number
  imageStreamMaxDecodeBytes?: number
  maxTextContentBytesPerPage?: number
  maxTextStreamBytes?: number
  maxFormXObjectBytes?: number
  maxFormXObjectStreamBytes?: number
  maxFormXObjectCount?: number
}): Promise<NativePdfConversionResult> {
  {
    const raw = String(process.env.KNOWGRPH_PDF_MAX_BYTES || '').trim()
    const n = raw ? Number(raw) : NaN
    const maxBytes = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    if (maxBytes > 0 && args.pdfBytes.length > maxBytes) throw new Error('PDF is too large')
  }

  const debugTiming = String(process.env.KNOWGRPH_PDF_DEBUG_TIMING || '').trim() === '1'
  const t0 = Date.now()
  const objects = parseIndirectObjects(args.pdfBytes)
  if (debugTiming) process.stderr.write(`[pdf] parseIndirectObjects: ${Date.now() - t0}ms\n`)

  const streamDecodeCache = createPdfStreamDecodeCache(typeof args.streamDecodeCacheMaxBytes === 'number' ? args.streamDecodeCacheMaxBytes : 0)
  const t1 = Date.now()
  expandObjectStreams(objects, streamDecodeCache)
  if (debugTiming) process.stderr.write(`[pdf] expandObjectStreams: ${Date.now() - t1}ms\n`)

  const catalogRef = (() => {
    for (const obj of objects.values()) {
      const t = getDictValue(obj.dict, 'Type')
      if (isName(t) && t.name === 'Catalog') return { obj: obj.obj, gen: obj.gen }
    }
    return null
  })()

  const catalog = catalogRef ? objects.get(catalogRef.obj)?.dict || null : null
  const pagesRef = (() => {
    const v = catalog ? getDictValue(catalog, 'Pages') : null
    return isRef(v) ? v : null
  })()

  const pages: { ref: PdfRef; resources: PdfDict | null; mediaBox: number[] | null; rotate: number }[] = []
  const walkPages = (ref: PdfRef | null, inherited: { resources: PdfDict | null; mediaBox: number[] | null; rotate: number }, depth = 0) => {
    if (!ref || depth > 50) return
    const dict = objects.get(ref.obj)?.dict || null
    if (!dict) return
    const t = getDictValue(dict, 'Type')
    const typeName = isName(t) ? t.name : ''
    const resources = (() => {
      const v = getDictValue(dict, 'Resources')
      const d = deref(objects, v)
      return isDict(d) ? d : inherited.resources
    })()
    const mediaBox = (() => {
      const v = getDictValue(dict, 'MediaBox')
      const d = deref(objects, v)
      if (isArray(d)) {
        const nums = d.items.filter(isNumber).map(n => n.value)
        if (nums.length >= 4) return nums.slice(0, 4)
      }
      return inherited.mediaBox
    })()
    const rotate = (() => {
      const v = getDictValue(dict, 'Rotate')
      if (isNumber(v)) return Math.floor(v.value) % 360
      return inherited.rotate
    })()
    if (typeName === 'Pages') {
      const kidsVal = getDictValue(dict, 'Kids')
      const kids = deref(objects, kidsVal)
      if (isArray(kids)) for (const k of kids.items) if (isRef(k)) walkPages(k, { resources, mediaBox, rotate }, depth + 1)
      return
    }
    if (typeName === 'Page' || typeName === '') {
      pages.push({ ref, resources, mediaBox, rotate })
      return
    }
  }
  walkPages(pagesRef, { resources: null, mediaBox: null, rotate: 0 }, 0)
  if (debugTiming) process.stderr.write(`[pdf] discoveredPages=${pages.length} totalElapsed=${Date.now() - t0}ms\n`)

  const includeImages = !!args.includeImages
  const assetUrlPrefix = String(args.assetUrlPrefix || '').trim()
  const shouldExtractImages = includeImages || !!args.ocrEnhance?.enabled
  const maxPages = typeof args.maxPages === 'number' && args.maxPages > 0 ? Math.floor(args.maxPages) : pages.length
  const maxExtractedImagesPerPage = typeof args.maxExtractedImagesPerPage === 'number' && args.maxExtractedImagesPerPage > 0 ? Math.floor(args.maxExtractedImagesPerPage) : 12
  const maxEmbeddedImagesPerPage = typeof args.maxEmbeddedImagesPerPage === 'number' && args.maxEmbeddedImagesPerPage >= 0 ? Math.floor(args.maxEmbeddedImagesPerPage) : 12
  const maxNeededImagesPerPage = Math.max(0, maxExtractedImagesPerPage)
  const usedPages = pages.slice(0, Math.max(0, Math.min(maxPages, pages.length)))

  const docLines: string[] = []
  docLines.push(`# ${String(args.title || '').trim() || 'document.pdf'}`)
  docLines.push('')

  const allAssets: NativePdfAsset[] = []
  const pageObservations: NativePdfPageObservation[] = []
  const toUnicodeCache = new Map<number, Map<string, string>>()

  for (let i = 0; i < usedPages.length; i += 1) {
    const tp0 = debugTiming ? Date.now() : 0
    const p = usedPages[i]
    const pageDict = objects.get(p.ref.obj)?.dict || null
    const contentVal = pageDict ? getDictValue(pageDict, 'Contents') : null
    const contentShapeValid = contentVal == null
      || isRef(contentVal)
      || (isArray(contentVal) && contentVal.items.every(isRef))
    const contentRefs = (() => {
      if (isRef(contentVal)) return [contentVal]
      if (isArray(contentVal)) return contentVal.items.filter(isRef)
      return []
    })()
    const hasAnnotationsEntry = pageDict
      ? getDictValue(pageDict, 'Annots') != null
      : false
    const content = (() => {
      const parts: Buffer[] = []
      const maxContentStreamDecodeBytes = (() => {
        if (typeof args.contentStreamMaxDecodeBytes === 'number' && args.contentStreamMaxDecodeBytes > 0) {
          return Math.floor(args.contentStreamMaxDecodeBytes)
        }
        const raw = String(process.env.KNOWGRPH_PDF_CONTENT_STREAM_MAX_DECODE_BYTES || '').trim()
        const n = raw ? Number(raw) : NaN
        if (Number.isFinite(n) && n > 0) return Math.floor(n)
        return 8 * 1024 * 1024
      })()
      const maxPageContentBytes = (() => {
        if (typeof args.pageContentMaxBytes === 'number' && args.pageContentMaxBytes > 0) {
          return Math.floor(args.pageContentMaxBytes)
        }
        const raw = String(process.env.KNOWGRPH_PDF_PAGE_CONTENT_MAX_BYTES || '').trim()
        const n = raw ? Number(raw) : NaN
        if (Number.isFinite(n) && n > 0) return Math.floor(n)
        return 8 * 1024 * 1024
      })()
      let used = 0
      let decodedContentStreamCount = 0
      let contentDecodeComplete = true
      let contentTruncated = false
      for (const r of contentRefs) {
        if (maxPageContentBytes > 0 && used >= maxPageContentBytes) break
        const st = readStream(objects, r, streamDecodeCache, { maxOutputLength: maxContentStreamDecodeBytes, onError: 'null' })
        if (!st.decodeComplete || !st.bytes) {
          contentDecodeComplete = false
          continue
        }
        decodedContentStreamCount += 1
        if (maxPageContentBytes > 0) {
          const remaining = maxPageContentBytes - used
          if (remaining <= 0) break
          if (st.bytes.length > remaining) contentTruncated = true
          parts.push(st.bytes.length > remaining ? st.bytes.subarray(0, remaining) : st.bytes)
          used += Math.min(remaining, st.bytes.length)
        } else {
          parts.push(st.bytes)
        }
      }
      return {
        bytes: parts.length > 0 ? Buffer.concat(parts) : Buffer.alloc(0),
        decodedContentStreamCount,
        contentDecodeComplete: contentDecodeComplete
          && decodedContentStreamCount === contentRefs.length,
        contentTruncated,
      }
    })()
    const contentBytes = content.bytes
    if (debugTiming) process.stderr.write(`[pdf] page=${i + 1}/${usedPages.length} contentBytes=${contentBytes.length}ms=${Date.now() - tp0}\n`)

    const tf0 = debugTiming ? Date.now() : 0
    const fragments = extractTextFragmentsFromPage({
      objects,
      pageResources: p.resources,
      contentBytes,
      maxDepth: 5,
      streamDecodeCache,
      toUnicodeCache,
      cmapMaxBytes: args.cmapMaxBytes,
      maxToUnicodeStreamBytes: args.maxToUnicodeStreamBytes,
      toUnicodeMaxDecodeBytes: args.toUnicodeMaxDecodeBytes,
      maxTextContentBytesPerPage: args.maxTextContentBytesPerPage,
      maxTextStreamBytes: args.maxTextStreamBytes,
      maxFormXObjectBytes: args.maxFormXObjectBytes,
      maxFormXObjectStreamBytes: args.maxFormXObjectStreamBytes,
      maxFormXObjectCount: args.maxFormXObjectCount,
    })
    const pageObservation = {
      pageNumber: i + 1,
      contentByteCount: contentBytes.length,
      contentStreamCount: contentRefs.length,
      decodedContentStreamCount: content.decodedContentStreamCount,
      contentDecodeComplete: content.contentDecodeComplete,
      contentTruncated: content.contentTruncated,
      contentShapeValid,
      hasAnnotationsEntry,
      textFragmentCount: fragments.length,
      markdownTextLineCount: 0,
      structurallyBlank: fragments.length === 0
        && contentShapeValid
        && !hasAnnotationsEntry
        && content.contentDecodeComplete
        && content.decodedContentStreamCount === contentRefs.length
        && !content.contentTruncated
        && isStructurallyBlankPdfPage(contentBytes),
    }
    if (debugTiming) process.stderr.write(`[pdf] page=${i + 1}/${usedPages.length} textFragments=${fragments.length}ms=${Date.now() - tf0}\n`)

    const ti0 = debugTiming ? Date.now() : 0
    const pageAssets = shouldExtractImages
      ? extractPageImages({
          objects,
          resources: p.resources,
          contentBytes,
          pageIndex: i,
          limit: args.ocrEnhance?.enabled ? maxExtractedImagesPerPage : maxNeededImagesPerPage,
          streamDecodeCache,
          imageStreamMaxDecodeBytes: args.imageStreamMaxDecodeBytes,
        })
      : []
    if (debugTiming) process.stderr.write(`[pdf] page=${i + 1}/${usedPages.length} images=${pageAssets.length}ms=${Date.now() - ti0}\n`)
    if (pageAssets.length > 0) allAssets.push(...pageAssets)

    const ocrMarkdown = await maybeEnhancePageWithOcr({
      pageIndex: i,
      textFragments: fragments,
      imageAssets: pageAssets,
      config: args.ocrEnhance || null,
    })

    const tm0 = debugTiming ? Date.now() : 0
    const pageMd = escapeReservedPageMarkerLines(buildMarkdownForPage({
      pageIndex: i,
      fragments,
      mediaBox: p.mediaBox,
      includeImages,
      imageAssets: pageAssets,
      assetUrlPrefix,
      maxImagesPerPage: maxEmbeddedImagesPerPage,
      ocrMarkdown,
      reconstructTables: args.reconstructTables,
      tableMinColumns: args.tableMinColumns,
      tableMinRows: args.tableMinRows,
      tableMaxRows: args.tableMaxRows,
    }))
    pageObservation.markdownTextLineCount = pageMd
      .split(/\r?\n/)
      .slice(1)
      .filter(line => line.trim()).length
    pageObservations.push(pageObservation)
    docLines.push(pageMd)
    if (debugTiming) process.stderr.write(`[pdf] page=${i + 1}/${usedPages.length} markdownChars=${pageMd.length}ms=${Date.now() - tm0}\n`)
  }

  return {
    markdown: docLines.join('\n'),
    assets: allAssets,
    pageObservations,
  }
}

export async function writePdfAssets(args: { assetsDir: string; assets: NativePdfAsset[] }): Promise<void> {
  const dir = String(args.assetsDir || '').trim()
  if (!dir) return
  await fs.mkdir(dir, { recursive: true })
  for (const asset of args.assets) {
    const filename = path.basename(String(asset.filename || '').trim())
    if (!filename) continue
    await fs.writeFile(path.join(dir, filename), asset.bytes)
  }
}
