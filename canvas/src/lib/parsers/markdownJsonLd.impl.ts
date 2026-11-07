import {
  parseMarkdownBlocks,
  parseMarkdownFrontmatter,
  splitMarkdownLines,
} from '@/lib/markdown'
import { normalizeGitHubBlobLikeUrl } from '@/lib/url'
import { AGENTIC_RAG_SCHEMA_URL } from '@/lib/agenticrag'
import {
  slugify,
  extractMarkdownInlineRefs,
  extractBareHttpUrls,
  classifyMediaFromAltAndUrl,
} from '@/features/parsers/markdownJsonLdUtils'
import {
  mermaidDensityConfig,
  computeMermaidTreeSeparation,
} from '@/features/parsers/markdownJsonLdMermaid'
import {
  parseMermaidFrontmatter,
  MermaidParserContext,
} from '@/features/parsers/markdownJsonLdMermaidParser'
import { MarkdownGraphBuilder } from '@/features/parsers/markdownJsonLdBuilder'
import { buildNodeMediaProperties } from '@/lib/canvas/graph-elements/mediaProperties'
import * as wikiLinks from 'grph-shared/markdown/wikiLinks'
import { normalizeMarkdownAsciiBlocks } from 'grph-shared/markdown/asciiBlocks'
import {
  isMermaidCodeFenceLang,
  normalizeMermaidCodeForRuntime,
  readMermaidDiagramDeclaration,
  readMermaidDiagramKind,
  splitMermaidDiagrams,
} from 'grph-shared/markdown/mermaidInput'
import { extractHtmlAttr, looksLikeSingleTagBlock } from 'grph-shared/markdown/mediaHtml'
import { sanitizeIframeSrcdoc } from '@/lib/render/sanitizeIframeSrcdoc'
import { extractMarkdownAppendixMetadataEntries } from '@/lib/markdown/markdownCommentMarker'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

export { slugify } from '@/features/parsers/markdownJsonLdUtils'

const buildMarkdownPipeTable = (args: { header?: string[]; rows?: string[][] }): string => {
  const header = (args.header || []).map(s => String(s || '').trim())
  const rows = (args.rows || []).map(r => (Array.isArray(r) ? r : []).map(s => String(s || '').trim()))
  const colCount = Math.max(
    header.length,
    rows.reduce((m, r) => Math.max(m, r.length), 0),
  )
  if (colCount <= 0) return ''

  const pad = (cells: string[]) => {
    const out = cells.slice(0, colCount)
    while (out.length < colCount) out.push('')
    return out
  }

  const headerRow = header.length ? pad(header) : new Array(colCount).fill('').map((_, i) => `Col ${i + 1}`)
  const body = rows.map(pad)
  return serializeMarkdownPipeTable({ columns: headerRow, rows: body }).join('\n')
}

export const buildMarkdownJsonLd = (name: string, markdownText: string): Record<string, unknown> => {
  const rawText = String(markdownText || '')
  const asciiNormalized = normalizeMarkdownAsciiBlocks(rawText)
  const normalizedText =
    asciiNormalized.includes('[[') || /(?:^|\s)\^[A-Za-z0-9]/m.test(asciiNormalized)
      ? (typeof wikiLinks.normalizeMarkdownWikiLinksAndBlockIds === 'function'
          ? wikiLinks.normalizeMarkdownWikiLinksAndBlockIds(asciiNormalized)
          : asciiNormalized)
      : asciiNormalized
  const rawLines = splitMarkdownLines(normalizedText)
  const { meta, startIndex } = parseMarkdownFrontmatter(rawLines)
  const blocks = parseMarkdownBlocks(rawLines, startIndex)
  const appendixMetadataEntries = extractMarkdownAppendixMetadataEntries(rawLines).map(entry => ({
    type: entry.metadataType,
    value: entry.value,
    note: entry.note,
    lineStart: entry.lineStart,
    lineEnd: entry.lineEnd,
  }))

  const frontmatterNodeAnchorById = (() => {
    const out = new Map<string, string>()
    const metaRec = meta as unknown
    if (!metaRec || typeof metaRec !== 'object' || Array.isArray(metaRec)) return out
    const rec = metaRec as Record<string, unknown>
    const nodesRaw = rec.nodes
    if (!Array.isArray(nodesRaw)) return out
    for (let i = 0; i < nodesRaw.length; i += 1) {
      const row = nodesRaw[i]
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const node = row as Record<string, unknown>
      const id = typeof node.id === 'string' ? node.id.trim() : ''
      if (!id) continue
      const propsRaw = node.properties
      if (!propsRaw || typeof propsRaw !== 'object' || Array.isArray(propsRaw)) continue
      const props = propsRaw as Record<string, unknown>
      const anchorRaw = props['doc:anchorId']
      const anchorId = typeof anchorRaw === 'string' ? anchorRaw.trim() : ''
      if (!anchorId) continue
      if (!out.has(id)) out.set(id, anchorId)
    }
    return out
  })()

  const frontmatterNodeIdSet = (() => {
    const out = new Set<string>()
    const metaRec = meta as unknown
    if (!metaRec || typeof metaRec !== 'object' || Array.isArray(metaRec)) return out
    const rec = metaRec as Record<string, unknown>
    const nodesRaw = rec.nodes
    if (!Array.isArray(nodesRaw)) return out
    for (let i = 0; i < nodesRaw.length; i += 1) {
      const row = nodesRaw[i]
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const node = row as Record<string, unknown>
      const id = typeof node.id === 'string' ? node.id.trim() : ''
      if (id) out.add(id)
    }
    return out
  })()

  const frontmatterTemplateVarSourceByName = (() => {
    const out = new Map<string, { nodeId: string; portKey: string }>()
    const metaRec = meta as unknown
    if (!metaRec || typeof metaRec !== 'object' || Array.isArray(metaRec)) return out
    const rec = metaRec as Record<string, unknown>
    const nodesRaw = rec.nodes
    if (!Array.isArray(nodesRaw)) return out

    const baseNameFromPort = (portKey: string): string => {
      const raw = String(portKey || '').trim()
      if (!raw) return ''
      const lowered = raw.toLowerCase()
      const strip = (suffix: string) =>
        lowered.endsWith(suffix) ? raw.slice(0, Math.max(0, raw.length - suffix.length)).trim() : ''
      return strip('_out') || strip('_output') || strip('out') || raw
    }

    for (let i = 0; i < nodesRaw.length; i += 1) {
      const row = nodesRaw[i]
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const node = row as Record<string, unknown>
      const nodeId = typeof node.id === 'string' ? node.id.trim() : ''
      if (!nodeId) continue
      const outputsRaw = node.outputs
      if (!Array.isArray(outputsRaw)) continue
      for (let j = 0; j < outputsRaw.length; j += 1) {
        const outRow = outputsRaw[j]
        if (!outRow || typeof outRow !== 'object' || Array.isArray(outRow)) continue
        const outRec = outRow as Record<string, unknown>
        const portKey = typeof outRec.port === 'string' ? outRec.port.trim() : ''
        if (!portKey) continue
        const base = baseNameFromPort(portKey)
        const k = base.trim().toLowerCase()
        if (!k) continue
        if (!out.has(k)) out.set(k, { nodeId, portKey })
      }
    }
    return out
  })()

  const frontmatterNamespaceSource = (() => {
    const out = new Map<string, { nodeId: string }>()
    const metaRec = meta as unknown
    if (!metaRec || typeof metaRec !== 'object' || Array.isArray(metaRec)) return out
    const rec = metaRec as Record<string, unknown>
    const nodesRaw = rec.nodes
    if (!Array.isArray(nodesRaw)) return out

    const addFirstByType = (namespace: string, typeId: string) => {
      const key = namespace.toLowerCase()
      if (out.has(key)) return
      for (let i = 0; i < nodesRaw.length; i += 1) {
        const row = nodesRaw[i]
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const node = row as Record<string, unknown>
        const nodeType = typeof node.type === 'string' ? node.type.trim() : ''
        if (nodeType !== typeId) continue
        const nodeId = typeof node.id === 'string' ? node.id.trim() : ''
        if (!nodeId) continue
        out.set(key, { nodeId })
        return
      }
    }

    addFirstByType('strings', 'SourceStrings')
    addFirstByType('variables', 'SourceVariables')
    addFirstByType('constants', 'SourceConstants')
    addFirstByType('svo', 'SourceSVO')
    return out
  })()
  const templateVarInlineDeclarations = new Map<string, string>()
  const templateVarKeyRe = /^[A-Za-z0-9_.-]{1,64}$/
  const readFrontmatterPath = (path: string): unknown => {
    const parts = String(path || '')
      .trim()
      .split('.')
      .map(s => s.trim())
      .filter(Boolean)
    if (parts.length <= 0) return undefined
    let cur: unknown = meta
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      if (!part) return undefined
      if (Array.isArray(cur)) {
        const idx = Number(part)
        if (!Number.isFinite(idx) || idx < 0 || Math.floor(idx) !== idx) return undefined
        cur = cur[idx]
        continue
      }
      if (!cur || typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[part]
    }
    return cur
  }
  const stringifyTemplateVarValue = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
      const primitiveOnly = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      if (primitiveOnly) return value.map(v => String(v)).join(', ')
      try {
        return JSON.stringify(value)
      } catch {
        return ''
      }
    }
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return ''
      }
    }
    return ''
  }
  const parseTemplateVarExpr = (rawExpr: string): {
    key: string
    declaredValue: string | null
    fallback: string | null
  } | null => {
    const expr = String(rawExpr || '').trim()
    if (!expr) return null
    const declMatch = /^([A-Za-z0-9_.-]{1,64})\s*:\s*([^}]+)$/.exec(expr)
    if (declMatch) {
      const key = String(declMatch[1] || '').trim()
      const declaredValue = String(declMatch[2] || '').trim()
      if (!templateVarKeyRe.test(key) || !declaredValue) return null
      return { key, declaredValue, fallback: null }
    }
    const fallbackMatch = /^([A-Za-z0-9_.-]{1,64})\s*\|\s*([^}]+)$/.exec(expr)
    if (fallbackMatch) {
      const key = String(fallbackMatch[1] || '').trim()
      const fallback = String(fallbackMatch[2] || '').trim()
      if (!templateVarKeyRe.test(key) || !fallback) return null
      return { key, declaredValue: null, fallback }
    }
    if (!templateVarKeyRe.test(expr)) return null
    return { key: expr, declaredValue: null, fallback: null }
  }
  const resolveTemplateVarValue = (rawKey: string): {
    found: boolean
    value: string
    source: 'frontmatter' | 'inline' | 'unresolved'
    resolvedKey: string
  } => {
    const key = String(rawKey || '').trim()
    if (!key) return { found: false, value: '', source: 'unresolved', resolvedKey: '' }
    const fmValue = readFrontmatterPath(key)
    if (typeof fmValue !== 'undefined') {
      return {
        found: true,
        value: stringifyTemplateVarValue(fmValue),
        source: 'frontmatter',
        resolvedKey: key,
      }
    }
    const inlineValue = templateVarInlineDeclarations.get(key.toLowerCase())
    if (typeof inlineValue === 'string') {
      return {
        found: true,
        value: inlineValue,
        source: 'inline',
        resolvedKey: key,
      }
    }
    return { found: false, value: '', source: 'unresolved', resolvedKey: key }
  }
  const resolveTemplateVarSources = (rawVarName: string) => {
    const source = frontmatterTemplateVarSourceByName.get(rawVarName.toLowerCase())
    const dotted = rawVarName.includes('.') ? rawVarName : ''
    const ns = dotted ? rawVarName.slice(0, rawVarName.indexOf('.')).trim().toLowerCase() : ''
    const nsRest = dotted ? rawVarName.slice(rawVarName.indexOf('.') + 1).trim() : ''
    const nsSource = !source && ns ? frontmatterNamespaceSource.get(ns) || null : null
    const metaSource = !source && ns === 'meta' ? `frontmatter-meta:${gid}` : ''
    return { source, nsSource, nsRest, metaSource }
  }

  const mediaPoiImageUrlByName = (() => {
    const out = new Map<string, string>()
    const metaRec = meta as unknown
    const mediaRaw = metaRec && typeof metaRec === 'object' && !Array.isArray(metaRec) ? (metaRec as Record<string, unknown>).media : null
    if (!mediaRaw || typeof mediaRaw !== 'object' || Array.isArray(mediaRaw)) return out
    const poiImagesRaw = (mediaRaw as Record<string, unknown>).poi_images
    if (!Array.isArray(poiImagesRaw)) return out
    for (const item of poiImagesRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const rec = item as Record<string, unknown>
      const poi = typeof rec.poi === 'string' ? rec.poi.trim() : ''
      const url = typeof rec.url === 'string' ? rec.url.trim() : ''
      if (!poi || !url) continue
      const key = poi.toLowerCase()
      if (!out.has(key)) out.set(key, url)
    }
    return out
  })()

  const normalizedName = String(name || '').replace(/\\/g, '/').trim()
  const fmGraphId = String(meta.graphId || meta.graph_id || meta.graph || '').trim()
  const baseName = normalizedName.split('/').pop() || ''
  const stem = baseName.replace(/\.(md|markdown|mmd)$/i, '')
  const gid = fmGraphId || (stem ? `md:${slugify(stem)}` : 'md:x')

  const fmTitle = String(meta.title || '').trim()
  const title =
    fmTitle ||
    (() => {
      const h1 = blocks.find(b => b.kind === 'heading' && b.level === 1 && b.text.trim())
      return h1 && h1.kind === 'heading' ? h1.text.trim() : ''
    })() ||
    'Markdown Document'

  const sourceUrl = (() => {
    const fromName = /^https?:\/\//i.test(normalizedName) ? normalizedName : ''
    const fromFrontmatter = (() => {
      const rec = meta as unknown as Record<string, unknown>
      const candidates = [
        typeof rec.kgWebpageUrl === 'string' ? rec.kgWebpageUrl : '',
        typeof rec.sourceUrl === 'string' ? rec.sourceUrl : '',
        typeof rec.sourceFile === 'string' ? rec.sourceFile : '',
        typeof rec['source-file'] === 'string' ? (rec['source-file'] as string) : '',
      ]
      for (const c of candidates) {
        const u = String(c || '').trim()
        if (/^https?:\/\//i.test(u)) return u
      }
      return ''
    })()
    const raw = fromName || fromFrontmatter
    if (!raw) return ''
    const normalized = normalizeGitHubBlobLikeUrl(raw) || raw
    return /^https?:\/\//i.test(normalized) ? normalized : ''
  })()

  const documentPath = (() => {
    if (sourceUrl) return sourceUrl
    if (!normalizedName) return baseName
    const stripped = normalizedName.split('#')[0]?.split('?')[0]?.trim() || ''
    if (!stripped) return baseName
    const isAbsolutePosix = stripped.startsWith('/')
    const isAbsoluteWindows = /^[A-Za-z]:\//.test(stripped)
    return isAbsolutePosix || isAbsoluteWindows ? baseName : stripped
  })()
  const mkMeta = (startLine: number, endLine: number): Record<string, unknown> => ({
    documentPath,
    ...(sourceUrl ? { documentUrl: sourceUrl } : {}),
    lineStart: startLine,
    lineEnd: endLine,
  })

  const docId = `doc:${gid}`
  const builder = new MarkdownGraphBuilder({ gid, docId, sourceUrl, mkMeta })

  if (frontmatterNodeIdSet.size > 0) {
    const metaRec = meta as unknown
    const nodesRaw =
      metaRec && typeof metaRec === 'object' && !Array.isArray(metaRec) ? (metaRec as Record<string, unknown>).nodes : null
    if (Array.isArray(nodesRaw)) {
      for (let i = 0; i < nodesRaw.length; i += 1) {
        const row = nodesRaw[i]
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const node = row as Record<string, unknown>
        const id = typeof node.id === 'string' ? node.id.trim() : ''
        if (!id || !frontmatterNodeIdSet.has(id)) continue
        const type = typeof node.type === 'string' && node.type.trim() ? node.type.trim() : 'FlowNode'
        const label = typeof node.label === 'string' && node.label.trim() ? node.label.trim() : id
        builder.ensureNode({
          '@id': id,
          '@type': type,
          labels: [type],
          name: label,
          chunk_text: label,
          properties: { placeholder: true },
          metadata: mkMeta(1, 1),
        })
      }
    } else {
      for (const id of frontmatterNodeIdSet) {
        builder.ensureNode({
          '@id': id,
          '@type': 'FlowNode',
          labels: ['FlowNode'],
          name: id,
          chunk_text: id,
          properties: { placeholder: true },
          metadata: mkMeta(1, 1),
        })
      }
    }
  }

  const wikiDocNodeIdByKey = new Map<string, string>()
  const ensureWikiDocNode = (docKey: string, lineNo: number): string => {
    const key = String(docKey || '').trim()
    if (!key) return ''
    const existing = wikiDocNodeIdByKey.get(key)
    if (existing) return existing
    const id = `wikidoc:${gid}:${slugify(key)}`
    wikiDocNodeIdByKey.set(key, id)
    builder.ensureNode({
      '@id': id,
      '@type': 'WikiDocument',
      labels: ['WikiDocument'],
      name: key,
      chunk_text: key,
      properties: { docKey: key },
      metadata: mkMeta(lineNo, lineNo),
    })
    return id
  }

  const emitInternalLinkFromHref = (args: {
    href: string
    label: string
    lineNo: number
    parentId?: string
  }): void => {
    const hrefRaw = String(args.href || '').trim()
    const label = String(args.label || '').trim()
    if (!hrefRaw) return
    const lineNo = Math.max(1, Math.floor(args.lineNo))
    const parentId = typeof args.parentId === 'string' && args.parentId.trim() ? args.parentId.trim() : null

    const tryEmitForWikiHref = (): boolean => {
      if (!hrefRaw.startsWith(wikiLinks.MARKDOWN_WIKI_HREF_PREFIX)) return false
      const parsed = wikiLinks.parseMarkdownWikiHref(hrefRaw)
      if (!parsed) return true
      const docKey = String(parsed.docKey || '').trim()
      const anchorId = typeof parsed.anchorId === 'string' ? parsed.anchorId.trim() : ''
      const isFrontmatterNode = docKey ? frontmatterNodeIdSet.has(docKey) : false
      const resolvedTargetId = (() => {
        if (isFrontmatterNode) return docKey
        if (docKey) return ensureWikiDocNode(docKey, lineNo)
        if (anchorId) return `anchor:${gid}:${anchorId}`
        return ''
      })()

      const internalId = `internal-wikilink:${gid}:${slugify(label || docKey || anchorId)}:${slugify(docKey || anchorId)}`
      builder.createInternalLinkNode(
        internalId,
        label || docKey || anchorId || hrefRaw,
        {
          kind: 'wikilink',
          label,
          ...(docKey ? { docKey } : {}),
          ...(anchorId ? { anchorId } : {}),
          ...(isFrontmatterNode ? { nodeId: docKey } : {}),
        },
        mkMeta(lineNo, lineNo),
      )
      if (resolvedTargetId) {
        builder.addRel(internalId, 'pointsTo', resolvedTargetId)
      }
      if (parentId) builder.addRel(parentId, 'hasInternalLink', internalId)
      return true
    }

    if (tryEmitForWikiHref()) return
    if (!hrefRaw.startsWith('#')) return
    const anchorIdRaw = hrefRaw.slice(1).trim()
    if (!anchorIdRaw) return
    const internalId = `internal-link:${gid}:${slugify(label || anchorIdRaw)}:${slugify(anchorIdRaw)}`
    builder.createInternalLinkNode(internalId, label || anchorIdRaw, { anchorId: anchorIdRaw, label }, mkMeta(lineNo, lineNo))
    const anchorNodeId = `anchor:${gid}:${anchorIdRaw}`
    builder.addRel(internalId, 'pointsTo', anchorNodeId)
    if (parentId) builder.addRel(parentId, 'hasInternalLink', internalId)
  }

  const emitTemplateVarInternalLinks = (args: {
    text: string
    parentId: string
    startLine: number
    endLine: number
    scopeKey: string
  }): void => {
    const text = String(args.text || '')
    if (!text.includes('{{')) return
    const parentId = String(args.parentId || '').trim()
    if (!parentId) return
    const startLine = Math.max(1, Math.floor(args.startLine))
    const endLine = Math.max(startLine, Math.floor(args.endLine))
    const scopeKey = String(args.scopeKey || '').trim() || parentId

    const templateVarRe = /\{\{([^{}]+)\}\}/g
    templateVarRe.lastIndex = 0
    let idx = 0
    for (;;) {
      const m = templateVarRe.exec(text)
      if (!m) break
      idx += 1
      const parsedExpr = parseTemplateVarExpr(String(m[1] || ''))
      if (!parsedExpr) continue
      const rawVar = parsedExpr.key
      const key = rawVar.toLowerCase()
      if (!key) continue
      let declarationApplied = false
      if (typeof parsedExpr.declaredValue === 'string' && parsedExpr.declaredValue && !templateVarInlineDeclarations.has(key)) {
        templateVarInlineDeclarations.set(key, parsedExpr.declaredValue)
        declarationApplied = true
      }
      const primaryResolved = resolveTemplateVarValue(rawVar)
      let resolvedValue = primaryResolved.value
      let resolvedValueSource: 'frontmatter' | 'inline' | 'fallback' | 'unresolved' =
        primaryResolved.found ? primaryResolved.source : 'unresolved'
      let resolvedVarKey = primaryResolved.resolvedKey || rawVar
      let fallbackKey = ''
      const fallbackRaw = typeof parsedExpr.fallback === 'string' ? parsedExpr.fallback.trim() : ''
      if (!primaryResolved.found && fallbackRaw) {
        if (templateVarKeyRe.test(fallbackRaw)) {
          fallbackKey = fallbackRaw
          const fallbackResolved = resolveTemplateVarValue(fallbackRaw)
          if (fallbackResolved.found) {
            resolvedValue = fallbackResolved.value
            resolvedValueSource = 'fallback'
            resolvedVarKey = fallbackResolved.resolvedKey || fallbackRaw
          } else {
            resolvedValue = fallbackRaw
            resolvedValueSource = 'fallback'
            resolvedVarKey = fallbackRaw
          }
        } else {
          resolvedValue = fallbackRaw
          resolvedValueSource = 'fallback'
          resolvedVarKey = rawVar
        }
      }
      const internalId = `template-var:${gid}:${slugify(rawVar)}:${startLine}:${slugify(scopeKey)}:${idx}`
      const { source, nsSource, nsRest, metaSource } = resolveTemplateVarSources(resolvedVarKey || rawVar)

      if (metaSource) {
        const metaRec = meta as unknown
        const metaObj = metaRec && typeof metaRec === 'object' && !Array.isArray(metaRec) ? (metaRec as Record<string, unknown>).meta : null
        if (metaObj && typeof metaObj === 'object' && !Array.isArray(metaObj)) {
          const json = (() => {
            try {
              return JSON.stringify(metaObj)
            } catch {
              return ''
            }
          })()
          builder.ensureNode({
            '@id': metaSource,
            '@type': 'FrontmatterMeta',
            labels: ['FrontmatterMeta'],
            name: 'Frontmatter Meta',
            chunk_text: json ? json.slice(0, 800) : 'Frontmatter Meta',
            properties: { placeholder: false },
            metadata: mkMeta(1, 1),
          })
        }
      }
      builder.createInternalLinkNode(
        internalId,
        rawVar,
        {
          kind: 'templateVar',
          varName: rawVar,
          templateOp: declarationApplied ? 'def' : 'ref',
          ...(declarationApplied && parsedExpr.declaredValue ? { declaredValue: parsedExpr.declaredValue } : {}),
          ...(fallbackRaw ? { fallback: fallbackRaw } : {}),
          ...(fallbackKey ? { fallbackKey } : {}),
          value: resolvedValueSource === 'unresolved' ? null : resolvedValue,
          valueSource: resolvedValueSource,
          originKey: scopeKey,
          ...(source ? { nodeId: source.nodeId, portKey: source.portKey } : {}),
          ...(nsSource ? { nodeId: nsSource.nodeId, path: nsRest || undefined } : {}),
          ...(metaSource ? { nodeId: metaSource, path: nsRest || undefined } : {}),
        },
        mkMeta(startLine, endLine),
      )
      if (source?.nodeId) {
        builder.addRel(internalId, 'pointsTo', source.nodeId)
      }
      if (nsSource?.nodeId) {
        builder.addRel(internalId, 'pointsTo', nsSource.nodeId)
      }
      if (metaSource) {
        builder.addRel(internalId, 'pointsTo', metaSource)
      }
      builder.addRel(parentId, 'hasInternalLink', internalId)
    }
  }
  
  let mermaidTreeLayout: {
    orientation?: 'vertical' | 'horizontal'
    direction?: 'source-target' | 'target-source'
  } | null = null

  const docProps: Record<string, unknown> = { format: 'text/markdown', graphId: gid }
  if (documentPath) docProps.path = documentPath
  if (appendixMetadataEntries.length > 0) docProps.documentMetadataEntries = appendixMetadataEntries
  builder.createDocumentNode(title, `${title}\n\nSource: ${documentPath || baseName || 'inline'}`, docProps, mkMeta(1, Math.max(1, rawLines.length)))

  const mermaidRaw = typeof meta.mermaid === 'string' ? meta.mermaid : ''
  const mermaidCode = String(mermaidRaw || '').trim()
  const mermaidAnchorsOnlyRaw = (meta as Record<string, unknown>).mermaidAnchorsOnly
  const mermaidAnchorsOnly =
    typeof mermaidAnchorsOnlyRaw === 'boolean'
      ? mermaidAnchorsOnlyRaw
      : typeof mermaidAnchorsOnlyRaw === 'string'
      ? mermaidAnchorsOnlyRaw.trim().toLowerCase() === 'true'
      : false

  const mermaidDensityParts: string[] = []
  const trySetMermaidTreeLayoutFromCode = (code: string) => {
    if (mermaidTreeLayout) return
    const declaration = readMermaidDiagramDeclaration(code)
    if (!declaration || declaration.kind !== 'flowchart') return
    const parts = declaration.line.split(/\s+/)
    const dir = parts[1]?.toUpperCase()
    if (!dir) return
    if (dir === 'TD' || dir === 'TB' || dir === 'DT') {
      mermaidTreeLayout = { orientation: 'vertical', direction: 'source-target' }
    } else if (dir === 'BT') {
      mermaidTreeLayout = { orientation: 'vertical', direction: 'target-source' }
    } else if (dir === 'LR') {
      mermaidTreeLayout = { orientation: 'horizontal', direction: 'source-target' }
    } else if (dir === 'RL') {
      mermaidTreeLayout = { orientation: 'horizontal', direction: 'target-source' }
    }
  }
  
  if (mermaidCode) {
    const diagrams = splitMermaidDiagrams(mermaidCode)
    trySetMermaidTreeLayoutFromCode(diagrams[0]?.code || mermaidCode)

    let mermaidStartLine = 1
    for (let i = 0; i < startIndex; i++) {
      const line = rawLines[i] || ''
      if (line.trim().startsWith('mermaid:')) {
        if (line.includes('|') || line.includes('>')) {
          mermaidStartLine = i + 2
        } else {
          const afterKey = line.slice(line.indexOf('mermaid:') + 8).trim()
          if (afterKey) {
            mermaidStartLine = i + 1
          } else {
            mermaidStartLine = i + 2
          }
        }
        break
      }
    }

    for (let idx = 0; idx < diagrams.length; idx += 1) {
      const diagram = diagrams[idx]!
      mermaidDensityParts.push(diagram.code)
      const diagramStart = Math.max(1, mermaidStartLine + diagram.offset)
      const diagramLineCount = Math.max(1, diagram.code.split('\n').length)
      const diagramEnd = Math.max(diagramStart, diagramStart + diagramLineCount - 1)
      const mermaidId = idx === 0 ? `mermaid:${gid}:frontmatter` : `mermaid:${gid}:frontmatter:${idx + 1}`
      const mermaidName = idx === 0 ? 'Frontmatter Mermaid Diagram' : `Frontmatter Mermaid Diagram ${idx + 1}`
      builder.createMermaidNode(mermaidId, diagram.code, mkMeta(diagramStart, diagramEnd), mermaidName, {
        scope: 'frontmatter',
        diagramKind: diagram.kind,
      })

      if (diagram.kind === 'flowchart' || diagram.kind === 'sequence') {
        const parserCtx: MermaidParserContext = {
          gid,
          docId,
          diagramId: mermaidId,
          diagramScope: 'frontmatter',
          startIndex: diagramStart,
          ensureNode: (n) => builder.ensureNode(n),
          addRel: (s, k, t, relationProps) => builder.addRel(s, k, t, relationProps),
          mkMeta,
        }
        parseMermaidFrontmatter(normalizeMermaidCodeForRuntime(diagram.code), parserCtx)
      }
    }
  }

  const sectionStack: Array<{ level: number; id: string }> = []
  let currentSectionId: string = docId
  let lastBlockId: string | null = null
  const indexByParent = new Map<string, number>()
  let anchorsOnlyParagraphEmitted = false
  let currentAnchorId: string | null = null
  let pendingExplicitAnchorId: { id: string; line: number } | null = null
  let hasMermaidBlock = false

  const extractHtmlAnchorIds = (line: string): string[] => {
    const out: string[] = []
    const anchorRe = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>\s*<\/a>/gi
    anchorRe.lastIndex = 0
    for (;;) {
      const match = anchorRe.exec(line)
      if (!match) break
      const anchorIdRaw = String(match[1] || match[2] || match[3] || '').trim()
      if (anchorIdRaw) out.push(anchorIdRaw)
    }
    return out
  }

  for (const b of blocks) {
    const scanStart = Math.max(1, b.startLine - 2)
    const scanEnd = Math.max(1, b.startLine - 1)
    for (let ln = scanStart; ln <= scanEnd; ln += 1) {
      const line = rawLines[ln - 1] ?? ''
      const ids = extractHtmlAnchorIds(line)
      for (const id of ids) {
        const anchorNodeId = `anchor:${gid}:${id}`
        builder.createAnchorNode(anchorNodeId, id, { anchorId: id, kind: 'html' }, mkMeta(ln, ln))
        pendingExplicitAnchorId = { id, line: ln }
      }
    }

    for (let ln = Math.max(1, b.startLine); ln <= Math.max(1, Math.min(b.endLine, rawLines.length)); ln += 1) {
      const line = rawLines[ln - 1] ?? ''
      const ids = extractHtmlAnchorIds(line)
      for (const id of ids) {
        const anchorNodeId = `anchor:${gid}:${id}`
        builder.createAnchorNode(anchorNodeId, id, { anchorId: id, kind: 'html' }, mkMeta(ln, ln))
      }
    }

    const isMermaidBlock =
      b.kind === 'code' &&
      (isMermaidCodeFenceLang(b.language) ||
        String(b.language || '').trim().toLowerCase() === 'graph' ||
        String(b.language || '').trim().toLowerCase() === 'gitgraph' ||
        (String(b.language || '').trim() === '' &&
          (() => {
            return readMermaidDiagramKind(b.text) !== 'unknown'
          })()))

    if (mermaidAnchorsOnly && !isMermaidBlock) {
      if (b.kind !== 'paragraph' || anchorsOnlyParagraphEmitted) continue
    }

    // Process Mermaid blocks to extract graph nodes
    if (isMermaidBlock) {
      hasMermaidBlock = true
      const diagrams = splitMermaidDiagrams(b.text)
      for (let idx = 0; idx < diagrams.length; idx += 1) {
        const diagram = diagrams[idx]!
        mermaidDensityParts.push(diagram.code)
        trySetMermaidTreeLayoutFromCode(diagram.code)
        const diagramStart = Math.max(1, b.startLine + 1 + diagram.offset)
        const diagramLineCount = Math.max(1, diagram.code.split('\n').length)
        const diagramEnd = Math.max(diagramStart, diagramStart + diagramLineCount - 1)
        const mermaidId = `mermaid:${gid}:code:${b.startLine}:${idx + 1}`
        builder.createMermaidNode(mermaidId, diagram.code, mkMeta(diagramStart, diagramEnd), `Mermaid Diagram L${diagramStart}`, {
          scope: 'block',
          diagramKind: diagram.kind,
        })

        if (diagram.kind === 'flowchart' || diagram.kind === 'sequence') {
          const parserCtx: MermaidParserContext = {
            gid,
            docId,
            diagramId: mermaidId,
            diagramScope: 'block',
            startIndex: diagramStart,
            ensureNode: (n) => builder.ensureNode(n),
            addRel: (s, k, t, relationProps) => builder.addRel(s, k, t, relationProps),
            mkMeta,
          }
          parseMermaidFrontmatter(normalizeMermaidCodeForRuntime(diagram.code), parserCtx)
        }
      }
      
      // If we are in anchors-only mode, we might want to skip creating the CodeBlock node itself
      // to keep the graph clean (only semantic nodes).
      // However, if we want the "source" to be visible as a node, we should keep it.
      // Given "Anchors Only" usually means "Concept Map", we probably skip the container block.
      if (mermaidAnchorsOnly) {
        continue
      }
    }

    if (b.kind === 'heading') {
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1]!.level >= b.level) {
          sectionStack.pop()
        }
        const parentId = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1]!.id : docId
        const anchor = slugify(b.text)
        const secId = `sec:${gid}:${anchor}:${b.startLine}`
        const order = (indexByParent.get(parentId) || 0) + 1
        indexByParent.set(parentId, order)
        
        builder.createSectionNode(secId, b.text, { heading: b.text, level: b.level, anchor, order }, mkMeta(b.startLine, b.endLine), parentId)
        const headingAnchorNodeId = `anchor:${gid}:${anchor}`
        builder.createAnchorNode(headingAnchorNodeId, anchor, { anchorId: anchor, kind: 'heading' }, mkMeta(b.startLine, b.startLine))
        if (pendingExplicitAnchorId && Math.abs(pendingExplicitAnchorId.line - b.startLine) <= 2) {
          const explicitAnchorNodeId = `anchor:${gid}:${pendingExplicitAnchorId.id}`
          builder.addRel(explicitAnchorNodeId, 'pointsTo', headingAnchorNodeId)
          currentAnchorId = pendingExplicitAnchorId.id
        } else {
          currentAnchorId = anchor
        }
        pendingExplicitAnchorId = null
        
        builder.setNext(lastBlockId, secId)
        lastBlockId = secId
        sectionStack.push({ level: b.level, id: secId })
        currentSectionId = secId
        continue
      }

      const parentId = currentSectionId || docId
      const order = (indexByParent.get(parentId) || 0) + 1
      indexByParent.set(parentId, order)

      if (b.kind === 'paragraph') {
        const id = `blk:${gid}:p:${b.startLine}:${order}`
        const firstLine = String(b.text || '').split('\n')[0] || ''
        const calloutMatch = /^>\s*\[!([A-Za-z0-9_-]+)([+-])?\]\s*(.*)$/.exec(firstLine.trim())
        const isCallout = !!calloutMatch
        const calloutType = calloutMatch ? String(calloutMatch[1] || '').trim().toLowerCase() : ''
        const calloutFoldable = calloutMatch ? String(calloutMatch[2] || '').trim() : ''
        const calloutTitle = calloutMatch ? String(calloutMatch[3] || '').trim() : ''
        const name = isCallout ? `Callout ${calloutType || 'note'}` : `Paragraph ${order}`
        const props: Record<string, unknown> = {
          text: b.text,
          order,
          charCount: (b.text || '').length,
          name,
          ...(isCallout
            ? {
                calloutType: true,
                calloutKind: calloutType || null,
                calloutFoldable: calloutFoldable || null,
                calloutTitle: calloutTitle || null,
              }
            : {}),
        }
        builder.createParagraphNode(id, b.text, props, mkMeta(b.startLine, b.endLine), parentId)

        const tryCreateHtmlMediaNode = () => {
          const rawHtml = String(b.text || '').trim()
          if (!rawHtml) return
          if (!rawHtml.toLowerCase().includes('<iframe')) return
          if (!looksLikeSingleTagBlock(rawHtml, 'iframe')) return
          const title = extractHtmlAttr(rawHtml, 'title')
          const src = extractHtmlAttr(rawHtml, 'src')
          const srcdocRaw = extractHtmlAttr(rawHtml, 'srcdoc')
          const srcdoc = srcdocRaw ? sanitizeIframeSrcdoc(srcdocRaw) : ''
          if (!src && !srcdoc) return
          const style = extractHtmlAttr(rawHtml, 'style')
          const iframeId = `dom:${gid}:iframe:${b.startLine}:${order}`
          const name = title || 'Inline Iframe'
          const chunkText = title || 'iframe'
          const domProps: Record<string, unknown> = {
            ...(src ? { 'dom:attrs:src': src } : {}),
            ...(srcdoc ? { 'dom:attrs:srcdoc': srcdoc } : {}),
            ...(title ? { 'dom:attrs:title': title } : {}),
            ...(style ? { 'dom:attrs:style': style } : {}),
            ...(src
              ? buildNodeMediaProperties({
                  kind: 'iframe',
                  url: src,
                  interactive: true,
                })
              : {
                  media_kind: 'iframe',
                  media_interactive: true,
                }),
          }
          builder.createWebpageElementNode({
            id: iframeId,
            tag: 'IFRAME',
            name,
            chunkText,
            props: domProps,
            meta: mkMeta(b.startLine, b.endLine),
            parentId: id,
          })
        }
        tryCreateHtmlMediaNode()

        emitTemplateVarInternalLinks({
          text: b.text || '',
          parentId: id,
          startLine: b.startLine,
          endLine: b.endLine,
          scopeKey: `p:${b.startLine}:${order}`,
        })

        if (isCallout && currentAnchorId) {
          builder.addRel(id, 'pointsTo', `anchor:${gid}:${currentAnchorId}`)
        }
        
        builder.setNext(lastBlockId, id)
        lastBlockId = id
        if (mermaidAnchorsOnly) anchorsOnlyParagraphEmitted = true
        const standaloneUrl = (() => {
          const raw = String(b.text || '').trim()
          if (!raw) return null
          const singleLine = raw.split('\n').map(l => l.trim()).filter(Boolean)
          if (singleLine.length !== 1) return null
          const line = singleLine[0] || ''
          const mdLink = line.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
          if (mdLink && mdLink[2]) return String(mdLink[2]).trim()
          const angle = line.match(/^<([^>]+)>$/)
          if (angle && angle[1]) return String(angle[1]).trim()
          if (/^https?:\/\/\S+$/i.test(line)) return line
          return null
        })()
        const refs = extractMarkdownInlineRefs(b.text || '', { baseUrl: sourceUrl || undefined })
        for (const link of refs.links) {
          const url = String(link.url || '').trim()
          if (!url) continue
          if (url.startsWith('#')) {
            emitInternalLinkFromHref({ href: url, label: link.label || '', lineNo: b.startLine, parentId: id })
            continue
          }
          builder.createLinkNode(url, link.label, mkMeta(b.startLine, b.endLine), id, {
            preferMedia: !!standaloneUrl && standaloneUrl === url,
          })
        }
        const bareUrls = extractBareHttpUrls(b.text || '', { baseUrl: sourceUrl || undefined })
        for (const url of bareUrls) {
          builder.createLinkNode(url, url, mkMeta(b.startLine, b.endLine), id, {
            preferMedia: !!standaloneUrl && standaloneUrl === url,
          })
        }
        for (const img of refs.images) {
          const normalizedUrl = (() => {
            const raw = String(img.url || '').trim()
            if (!raw) return ''
            const fromGitHub = normalizeGitHubBlobLikeUrl(raw)
            return fromGitHub || raw
          })()
          const imgId = `img:${slugify(normalizedUrl || img.url)}`
          const { type, props: mediaProps } = classifyMediaFromAltAndUrl(normalizedUrl, img.alt)
          builder.createImageNode(imgId, type, img.alt || normalizedUrl || img.url, (img.alt || normalizedUrl || img.url).slice(0, 800), mediaProps, mkMeta(b.startLine, b.endLine), id)
        }
        continue
      }

      if (b.kind === 'code') {
        const id = `blk:${gid}:code:${b.startLine}:${order}`
        const props: Record<string, unknown> = { code: b.text, order, charCount: (b.text || '').length }
        if (b.language) props.language = b.language
        builder.createCodeBlockNode(id, `Code ${order}`, (b.text || '').slice(0, 800), props, mkMeta(b.startLine, b.endLine), parentId)
        
        builder.setNext(lastBlockId, id)
        lastBlockId = id
        continue
      }

      if (b.kind === 'table') {
        const id = `blk:${gid}:table:${b.startLine}:${order}`
        const headerRaw = (b as unknown as { tableHeader?: unknown }).tableHeader
        const rowsRaw = (b as unknown as { tableRows?: unknown }).tableRows
        const formatRaw = (b as unknown as { tableFormat?: unknown }).tableFormat
        const format = typeof formatRaw === 'string' ? String(formatRaw || '').trim().toLowerCase() : ''
        const header = Array.isArray(headerRaw) ? (headerRaw as unknown[]).map(v => String(v || '').trim()).filter(Boolean) : []
        const rows = Array.isArray(rowsRaw)
          ? (rowsRaw as unknown[]).map(r =>
              Array.isArray(r) ? (r as unknown[]).map(v => String(v || '').trim()) : [],
            )
          : []
        const markdown =
          format === 'ascii' && (header.length > 0 || rows.length > 0)
            ? buildMarkdownPipeTable({ header, rows })
            : String(b.text || '')
        const cols = Math.max(
          header.length,
          rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0),
        )
        const rowCount = rows.length + (header.length ? 1 : 0)
        const visualWidth = Math.min(520, Math.max(220, 140 + cols * 120))
        const visualHeight = Math.min(420, Math.max(160, 120 + rowCount * 34))
        builder.createTableNode(
          id,
          `Table ${order}`,
          markdown.slice(0, 800),
          {
            order,
            markdown,
            ...(format === 'ascii' ? { ascii: String(b.text || '') } : {}),
            ...(header.length ? { 'table:header': header } : {}),
            ...(rows.length ? { 'table:rows': rows } : {}),
            ...(cols > 0 ? { 'table:cols': cols } : {}),
            ...(rowCount > 0 ? { 'table:rowCount': rowCount } : {}),
            'visual:shape': 'rect',
            'visual:width': visualWidth,
            'visual:height': visualHeight,
          },
          mkMeta(b.startLine, b.endLine),
          parentId,
        )

        if (header.length > 0) {
          for (let c = 0; c < header.length; c += 1) {
            const cell = header[c] || ''
            emitTemplateVarInternalLinks({
              text: cell,
              parentId: id,
              startLine: b.startLine,
              endLine: b.endLine,
              scopeKey: `t:${b.startLine}:${order}:h:${c + 1}`,
            })
          }
        }
        if (rows.length > 0) {
          for (let r = 0; r < rows.length; r += 1) {
            const row = rows[r] || []
            for (let c = 0; c < row.length; c += 1) {
              const cell = row[c] || ''
              emitTemplateVarInternalLinks({
                text: cell,
                parentId: id,
                startLine: b.startLine,
                endLine: b.endLine,
                scopeKey: `t:${b.startLine}:${order}:r:${r + 1}:c:${c + 1}`,
              })
            }
          }
        }
        
        builder.setNext(lastBlockId, id)
        lastBlockId = id
        continue
      }

      if (b.kind === 'list') {
        const listId = `blk:${gid}:list:${b.startLine}:${order}`
        builder.createListNode(listId, `List ${order}`, b.items.map(it => it.text).join('\n').slice(0, 800), { order }, mkMeta(b.startLine, b.endLine), parentId)
        
        builder.setNext(lastBlockId, listId)
        lastBlockId = listId
        for (let idx = 0; idx < b.items.length; idx++) {
          const item = b.items[idx]!
          const itId = `blk:${gid}:li:${b.startLine}:${idx + 1}`
          builder.createListItemNode(itId, (item.text || '').slice(0, 80) || `Item ${idx + 1}`, (item.text || '').slice(0, 800), {
            text: item.text,
            ordered: !!item.ordered,
            index: item.index ?? null,
            order: idx + 1,
          }, mkMeta(b.startLine, b.endLine), listId)

          emitTemplateVarInternalLinks({
            text: item.text || '',
            parentId: itId,
            startLine: b.startLine,
            endLine: b.endLine,
            scopeKey: `li:${b.startLine}:${idx + 1}`,
          })
        }
        continue
      }
  }

  if (mermaidAnchorsOnly && !anchorsOnlyParagraphEmitted) {
    const bodyText = rawLines.slice(startIndex).join('\n').trim()
    const paragraphText = bodyText || title || baseName || 'Mermaid Diagram'
    const parentId = docId
    const order = 1
    const safeLine = rawLines.length > 0 ? rawLines.length : 1
    const startLine = Math.min(safeLine, Math.max(1, startIndex + 1))
    const endLine = startLine
    const id = `blk:${gid}:p:${startLine}:${order}`
    builder.createParagraphNode(
      id,
      paragraphText,
      { text: paragraphText, order, charCount: paragraphText.length, name: `Paragraph ${order}` },
      mkMeta(startLine, endLine),
      parentId,
    )
    builder.setNext(lastBlockId, id)
    lastBlockId = id
  }

  for (let i = startIndex; i < rawLines.length; i += 1) {
    const line = rawLines[i] ?? ''
    const trimmed = line.trim()
    if (!trimmed) continue
    const lineNo = i + 1

    const anchorRe = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>\s*<\/a>/gi
    anchorRe.lastIndex = 0
    for (;;) {
      const match = anchorRe.exec(line)
      if (!match) break
      const anchorIdRaw = String(match[1] || match[2] || match[3] || '').trim()
      if (!anchorIdRaw) continue
      const anchorNodeId = `anchor:${gid}:${anchorIdRaw}`
      builder.createAnchorNode(anchorNodeId, anchorIdRaw, { anchorId: anchorIdRaw }, mkMeta(lineNo, lineNo))
    }

    const blockIdRe = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_-]{0,127})(?=\s*$)/g
    blockIdRe.lastIndex = 0
    for (;;) {
      const match = blockIdRe.exec(line)
      if (!match) break
      const rawId = String(match[1] || '').trim()
      if (!rawId) continue
      const anchorIdRaw = `^${rawId}`
      const anchorNodeId = `anchor:${gid}:${anchorIdRaw}`
      builder.createAnchorNode(anchorNodeId, anchorIdRaw, { anchorId: anchorIdRaw, kind: 'block' }, mkMeta(lineNo, lineNo))
    }

    const internalLinkRe = /\[([^\]]+)\]\(#([^)]+)\)/g
    internalLinkRe.lastIndex = 0
    for (;;) {
      const match = internalLinkRe.exec(line)
      if (!match) break
      const label = String(match[1] || '').trim()
      const anchorIdRaw = String(match[2] || '').trim()
      if (!anchorIdRaw) continue
      emitInternalLinkFromHref({ href: `#${anchorIdRaw}`, label, lineNo })
    }

    const wikiRe = /\[\[([^\]\r\n]+)\]\]/g
    wikiRe.lastIndex = 0
    for (;;) {
      const match = wikiRe.exec(line)
      if (!match) break
      const innerRaw = String(match[1] || '').trim()
      if (!innerRaw) continue
      if (innerRaw.startsWith('#')) {
        const isBlock = innerRaw.startsWith('#^')
        const rawTarget = isBlock ? `^${innerRaw.slice(2).trim()}` : slugify(innerRaw.slice(1).trim())
        if (!rawTarget) continue
        const label = isBlock ? rawTarget : innerRaw.slice(1).trim()
        const linkId = `internal-wikilink:${gid}:${slugify(label || rawTarget)}:${slugify(rawTarget)}`
        builder.createInternalLinkNode(
          linkId,
          label || rawTarget,
          { anchorId: rawTarget, label, kind: 'wikilink' },
          mkMeta(lineNo, lineNo),
        )
        const anchorNodeId = `anchor:${gid}:${rawTarget}`
        if (builder.hasAnchor(anchorNodeId)) {
          builder.addRel(linkId, 'pointsTo', anchorNodeId)
        }
        continue
      }

      const nodeId = innerRaw
      const anchorFromFrontmatter = frontmatterNodeAnchorById.get(nodeId)
      const label = nodeId
      if (frontmatterNodeIdSet.has(nodeId)) {
        const linkId = `internal-wikilink:${gid}:${slugify(label || nodeId)}:${slugify(nodeId)}`
        builder.createInternalLinkNode(
          linkId,
          label || nodeId,
          { label, kind: 'wikilink', nodeId, docKey: nodeId },
          mkMeta(lineNo, lineNo),
        )
        builder.addRel(linkId, 'pointsTo', nodeId)
      } else {
        const wikiDocId = ensureWikiDocNode(nodeId, lineNo)
        const linkId = `internal-wikilink:${gid}:${slugify(label || nodeId)}:${slugify(nodeId)}`
        builder.createInternalLinkNode(
          linkId,
          label || nodeId,
          { label, kind: 'wikilink', docKey: nodeId },
          mkMeta(lineNo, lineNo),
        )
        if (wikiDocId) builder.addRel(linkId, 'pointsTo', wikiDocId)
      }
    }

    if (!mermaidAnchorsOnly) {
      const refs = extractMarkdownInlineRefs(line, { baseUrl: sourceUrl || undefined })
      for (const link of refs.links) {
        const url = String(link.url || '').trim()
        if (!url || url.startsWith('#')) continue
        builder.createLinkNode(url, link.label, mkMeta(lineNo, lineNo), docId)
      }
      const bareUrls = extractBareHttpUrls(line, { baseUrl: sourceUrl || undefined })
      for (const url of bareUrls) {
        if (!url || url.startsWith('#')) continue
        builder.createLinkNode(url, url, mkMeta(lineNo, lineNo), docId)
      }
      for (const img of refs.images) {
        const normalizedUrl = (() => {
          const raw = String(img.url || '').trim()
          if (!raw) return ''
          const fromGitHub = normalizeGitHubBlobLikeUrl(raw)
          return fromGitHub || raw
        })()
        const imgId = `img:${slugify(normalizedUrl || img.url)}`
        const { type, props: mediaProps } = classifyMediaFromAltAndUrl(normalizedUrl, img.alt)
        builder.createImageNode(imgId, type, img.alt || normalizedUrl || img.url, (img.alt || normalizedUrl || img.url).slice(0, 800), mediaProps, mkMeta(lineNo, lineNo), docId)
      }
    }
  }

  const ctx = {
    '@version': 1.1,
    '@language': 'en-us',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    kg: `${AGENTIC_RAG_SCHEMA_URL}/v1/kg#`,
    rag: `${AGENTIC_RAG_SCHEMA_URL}/v1/rag#`,
    prov: 'http://www.w3.org/ns/prov#',
    name: 'rdfs:label',
    chunk_text: 'rag:chunk_text',
    properties: { '@id': 'kg:properties', '@type': '@json' },
    metadata: { '@id': 'kg:metadata', '@type': '@json' },
    hasSection: { '@id': 'kg:hasSection', '@type': '@id' },
    hasBlock: { '@id': 'kg:hasBlock', '@type': '@id' },
    hasItem: { '@id': 'kg:hasItem', '@type': '@id' },
    linksTo: { '@id': 'kg:linksTo', '@type': '@id' },
    embedsImage: { '@id': 'kg:embedsImage', '@type': '@id' },
    embedsMedia: { '@id': 'kg:embedsMedia', '@type': '@id' },
    hasMermaid: { '@id': 'kg:hasMermaid', '@type': '@id' },
    hasMermaidNode: { '@id': 'kg:hasMermaidNode', '@type': '@id' },
    hasAnchor: { '@id': 'kg:hasAnchor', '@type': '@id' },
    hasInternalLink: { '@id': 'kg:hasInternalLink', '@type': '@id' },
    pointsTo: { '@id': 'kg:pointsTo', '@type': '@id' },
    next: { '@id': 'kg:next', '@type': '@id' },
  }

  const hasMermaid = !!mermaidCode || hasMermaidBlock
  const mermaidDensitySource = (() => {
    const combined = mermaidDensityParts.join('\n\n').trim()
    if (!combined) return ''
    const maxChars = 50_000
    return combined.length > maxChars ? combined.slice(0, maxChars) : combined
  })()

  const treeMeta: {
    edgeLabels?: string[]
    direction?: 'source-target' | 'target-source'
    orientation?: 'vertical' | 'horizontal'
    separation?: number
    mermaidDensity?: {
      statementCount: number
      density: 'none' | 'sparse' | 'medium' | 'dense'
      anchorsOnly: boolean
      config: {
        sparseMaxStatements: number
        denseMaxStatements: number
        anchorsOnly: { sparse: number; medium: number; dense: number }
        defaultDiagram: { sparse: number; medium: number; dense: number }
      }
    }
  } = {}

  if (hasMermaid) {
    treeMeta.edgeLabels = ['pointsTo']
    if (mermaidTreeLayout?.orientation) {
      treeMeta.orientation = mermaidTreeLayout.orientation
    } else {
      treeMeta.orientation = 'horizontal'
    }
    if (mermaidTreeLayout?.direction) {
      treeMeta.direction = mermaidTreeLayout.direction
    }
    const density = computeMermaidTreeSeparation(mermaidDensitySource || mermaidCode, mermaidAnchorsOnly)
    treeMeta.separation = density.separation
    treeMeta.mermaidDensity = {
      statementCount: density.statementCount,
      density: density.density,
      anchorsOnly: mermaidAnchorsOnly,
      config: mermaidDensityConfig,
    }
  } else {
    treeMeta.edgeLabels = [
      'hasSection',
      'hasBlock',
      'hasItem',
      'hasMermaid',
      'hasMermaidNode',
      'hasAnchor',
      'hasInternalLink',
    ]
  }

  const metadata = {
    graphId: gid,
    layoutMode: hasMermaid ? 'mermaid' : 'tree',
    ...(appendixMetadataEntries.length > 0 ? { documentMetadataEntries: appendixMetadataEntries } : {}),
    ...(hasMermaid ? { mermaid: treeMeta } : { tree: treeMeta }),
  }

  const nodes = builder.getNodes()
  if (mediaPoiImageUrlByName.size > 0) {
    for (const nodeAny of nodes) {
      if (!nodeAny || typeof nodeAny !== 'object' || Array.isArray(nodeAny)) continue
      const node = nodeAny as Record<string, unknown>
      const nameRaw = typeof node.name === 'string' ? node.name.trim() : ''
      if (!nameRaw) continue
      const nameKey = nameRaw.toLowerCase()
      let url = mediaPoiImageUrlByName.get(nameKey)
      if (!url) {
        for (const [poiKey, poiUrl] of mediaPoiImageUrlByName.entries()) {
          if (nameKey.includes(poiKey)) {
            url = poiUrl
            break
          }
        }
      }
      if (!url) continue
      const propsRaw = node.properties
      if (!propsRaw || typeof propsRaw !== 'object' || Array.isArray(propsRaw)) {
        node.properties = buildNodeMediaProperties({ kind: 'image', url })
        continue
      }
      const props = propsRaw as Record<string, unknown>
      const existing =
        typeof props.image === 'string'
          ? props.image.trim()
          : typeof props.imageUrl === 'string'
            ? props.imageUrl.trim()
            : typeof props.media_url === 'string'
              ? props.media_url.trim()
              : typeof props.mediaUrl === 'string'
                ? props.mediaUrl.trim()
                : ''
      if (existing) continue
      node.properties = {
        ...props,
        ...buildNodeMediaProperties({ kind: 'image', url }),
      }
    }
  }

  return { '@context': ctx, metadata, '@graph': nodes }
}
