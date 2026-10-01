import type { GraphNode } from '@/lib/graph/types'
import type { MarkdownDesignLayout } from '@/features/markdown-edgeless/markdownDesignLayout'
import { looksLikeSingleTagBlock } from 'grph-shared/markdown/mediaHtml'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { toMetadataRecord } from '@/lib/graph/documentMetadata'
import { readNodeProperties } from '@/lib/graph/nodeProperties'

export type MarkdownPanelLineRanges = {
  table: ReadonlySet<number>
  code: ReadonlySet<number>
  blockquote: ReadonlySet<number>
  iframe: ReadonlySet<number>
}

function readLineStart(n: GraphNode): number | null {
  const raw = toMetadataRecord(n.metadata).lineStart
  const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(v)) return null
  return Math.max(1, Math.floor(v))
}

function isPanelOnlyParagraphNode(n: GraphNode): boolean {
  const typeLower = String(n.type || '').trim().toLowerCase()
  if (typeLower !== 'paragraph') return false
  const propsObj = readNodeProperties(n)
  const text = typeof propsObj.text === 'string' ? String(propsObj.text || '').trim() : ''
  if (propsObj.calloutType === true) return true
  if (text.startsWith('>')) return true
  if (text && /<\s*iframe\b/i.test(text) && text.toLowerCase().startsWith('<iframe') && looksLikeSingleTagBlock(text, 'iframe')) return true
  if (getNodeMediaSpec(n)?.kind === 'iframe') return true
  return false
}

export function computeMarkdownAnchorNodeIdByBlockId(args: {
  layout: MarkdownDesignLayout | null
  nodes: GraphNode[]
  allowedKinds?: readonly string[]
}): Record<string, string> | null {
  const layout = args.layout
  if (!layout || !Array.isArray(layout.blocks) || layout.blocks.length === 0) return null
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  if (nodes.length === 0) return null
  const allowedKindsSet = (() => {
    const raw = Array.isArray(args.allowedKinds) ? args.allowedKinds : null
    if (!raw || raw.length === 0) return null
    return new Set(raw.map(v => String(v || '').trim()).filter(Boolean))
  })()

  const tableByStart = new Map<number, string>()
  const codeByStart = new Map<number, string>()
  const paraByStart = new Map<number, string>()
  const mediaIframeByStart = new Map<number, string>()

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    const id = String(n?.id || '').trim()
    if (!id) continue

    const start = readLineStart(n)
    if (start == null) continue

    const typeLower = String(n.type || '').trim().toLowerCase()
    if (typeLower === 'table' && !tableByStart.has(start)) tableByStart.set(start, id)
    else if (typeLower === 'codeblock' && !codeByStart.has(start)) codeByStart.set(start, id)
    else if (typeLower === 'paragraph' && !paraByStart.has(start)) paraByStart.set(start, id)

    const spec = getNodeMediaSpec(n)
    if (spec?.kind === 'iframe' && !mediaIframeByStart.has(start)) mediaIframeByStart.set(start, id)
  }

  const out: Record<string, string> = {}
  for (let i = 0; i < layout.blocks.length; i += 1) {
    const b = layout.blocks[i]!
    const blockId = String(b.id || '').trim()
    if (!blockId) continue
    if (allowedKindsSet && !allowedKindsSet.has(String(b.type || '').trim())) continue
    const start = Math.max(1, Math.floor(Number(b.startLine) || 1))

    if (b.type === 'table') {
      const nid = tableByStart.get(start)
      if (nid) out[blockId] = nid
    } else if (b.type === 'code') {
      const nid = codeByStart.get(start)
      if (nid) out[blockId] = nid
    } else if (b.type === 'blockquote' || b.type === 'callout') {
      const nid = paraByStart.get(start)
      if (nid) out[blockId] = nid
    } else if (b.type === 'html') {
      const raw = String(b.preview.kind === 'html' ? (b.preview.html?.raw || '') : '').trim()
      if (/<\s*iframe\b/i.test(raw)) {
        const nid = mediaIframeByStart.get(start) || paraByStart.get(start)
        if (nid) out[blockId] = nid
      }
    }
  }
  return Object.keys(out).length ? out : null
}

export function buildPanelOnlyNodeIdSetFromGraphNodes(nodes: GraphNode[]): Set<string> {
  const out = new Set<string>()
  const list = Array.isArray(nodes) ? nodes : []
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i]!
    const id = String(n?.id || '').trim()
    if (!id) continue
    const typeLower = String(n.type || '').trim().toLowerCase()
    if (typeLower === 'table' || typeLower === 'codeblock') {
      out.add(id)
      continue
    }
    if (isPanelOnlyParagraphNode(n)) out.add(id)
  }
  return out
}

export function buildMarkdownIframeNodeIdSetFromGraphNodes(args: {
  nodes: GraphNode[]
  iframeLineStarts: ReadonlySet<number> | null | undefined
}): Set<string> {
  const out = new Set<string>()
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  const iframeLineStarts = args.iframeLineStarts || null
  if (nodes.length === 0 || !iframeLineStarts || iframeLineStarts.size === 0) return out
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!
    const id = String(node?.id || '').trim()
    if (!id) continue
    const lineStart = readLineStart(node)
    if (lineStart == null || !iframeLineStarts.has(lineStart)) continue
    const spec = getNodeMediaSpec(node)
    if (spec?.kind === 'iframe') out.add(id)
  }
  return out
}

export function buildMarkdownMatchedBlockNodeIdSetFromGraphNodes(args: {
  nodes: GraphNode[]
  lineRanges: MarkdownPanelLineRanges | null | undefined
  includeIframeRanges?: boolean
  requireBlockNodeIds?: boolean
}): Set<string> {
  const out = new Set<string>()
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  const lineRanges = args.lineRanges || null
  if (nodes.length === 0 || !lineRanges) return out
  const includeIframeRanges = args.includeIframeRanges !== false
  const requireBlockNodeIds = args.requireBlockNodeIds === true

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!
    const id = String(node?.id || '').trim()
    if (!id) continue
    if (requireBlockNodeIds && !id.startsWith('blk:')) continue

    const lineStart = readLineStart(node)
    if (lineStart == null) continue

    const typeLower = String(node.type || '').trim().toLowerCase()
    if (typeLower === 'table' && lineRanges.table.has(lineStart)) {
      out.add(id)
      continue
    }
    if (typeLower === 'codeblock' && lineRanges.code.has(lineStart)) {
      out.add(id)
      continue
    }
    if (typeLower === 'paragraph' && lineRanges.blockquote.has(lineStart)) {
      out.add(id)
      continue
    }
    if (!includeIframeRanges || !lineRanges.iframe.has(lineStart)) continue
    const spec = getNodeMediaSpec(node)
    if (spec?.kind === 'iframe') out.add(id)
  }

  return out
}
