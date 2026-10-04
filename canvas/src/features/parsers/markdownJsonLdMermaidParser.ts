import { hashStringToHex } from '@/lib/hash/stringHash'
import { projectSequenceGraph } from '@/features/sequence/sequenceGraphProjection'
import { slugify } from './markdownJsonLdUtils'
import { readMermaidDiagramKind } from 'grph-shared/markdown/mermaidInput'
import {
  mapMermaidShapeToPrimitive,
  mergeMermaidNamedStyles,
  normalizeMermaidLinkStyle,
  parseMermaidNodeString,
  parseMermaidStyleString,
  readMermaidEdgeRelationProps,
} from './markdownJsonLdMermaidParser.helpers'

export interface MermaidParserContext {
  gid: string
  docId: string
  diagramId?: string
  diagramScope?: 'frontmatter' | 'block'
  startIndex: number
  ensureNode: (node: Record<string, unknown>) => void
  addRel: (src: string, key: string, tgt: string, relationProps?: Record<string, unknown>) => void
  mkMeta: (startLine: number, endLine: number) => Record<string, unknown>
}

/**
 * Parses Mermaid frontmatter code.
 * Supports:
 * - Flowchart (graph TD, LR, etc.)
 * - Subgraphs (nested, labeled)
 * - Nodes with labels (including Markdown strings in quotes)
 * - Edges (--> , ---, -.->, ==>) with labels
 * - Click events
 */
export const parseMermaidFrontmatter = (code: string, ctx: MermaidParserContext): void => {
  if (/^\s*sequenceDiagram\b/.test(code)) { projectSequenceGraph(code, ctx); return }
  if (readMermaidDiagramKind(code) !== 'flowchart') return

  const {
    gid,
    docId,
    diagramId,
    diagramScope,
    startIndex,
    ensureNode,
    addRel,
    mkMeta,
  } = ctx
  const scope: 'frontmatter' | 'block' = diagramScope === 'frontmatter' ? 'frontmatter' : 'block'
  const isFrontmatter = scope === 'frontmatter'

  const lines = String(code || '').split('\n')
  if (lines.length === 0) return

  const diagramKey = diagramId ? hashStringToHex(diagramId) : 'd'

  const mermaidNodeIdsByName = new Map<string, string>()
  const mermaidSubgraphIdsByName = new Map<string, string>()
  const docSubgraphIds = new Set<string>()
  const classDefs = new Map<string, Record<string, unknown>>()
  const nodeClasses = new Map<string, Set<string>>()
  const directStylesByName = new Map<string, Record<string, unknown>>()
  const linkStylesByIndex = new Map<number, Record<string, unknown>>()
  let defaultLinkStyle: Record<string, unknown> | null = null

  // Track active subgraphs stack
  const subgraphStack: Array<{ name: string; id: string }> = []

  const getMergedClassStyles = (nodeName: string): Record<string, unknown> => {
    const classes = nodeClasses.get(nodeName)
    if (!classes) return {}
    let mergedStyles: Record<string, unknown> = {}
    classes.forEach((cls) => {
      const def = classDefs.get(cls)
      if (def) mergedStyles = { ...mergedStyles, ...def }
    })
    return mergedStyles
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? ''
    if (!trimmed) continue
    if (trimmed.startsWith('%%')) continue

    if (trimmed.startsWith('classDef ')) {
      const parts = trimmed.substring(9).trim().split(/\s+/)
      const className = parts[0]
      const styleStr = parts.slice(1).join(' ')
      if (className && styleStr) {
        classDefs.set(className, parseMermaidStyleString(styleStr))
      }
      continue
    }

    if (trimmed.startsWith('class ')) {
      const parts = trimmed.substring(6).trim().replace(/;$/, '').split(/\s+/)
      if (parts.length < 2) continue
      const classNamesStr = parts[parts.length - 1]
      const nodesStr = parts.slice(0, parts.length - 1).join(' ')

      const nodeNames = nodesStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const classNames = String(classNamesStr || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      if (!nodeNames.length || !classNames.length) continue
      for (let j = 0; j < nodeNames.length; j += 1) {
        const nodeName = nodeNames[j]!
        if (!nodeClasses.has(nodeName)) nodeClasses.set(nodeName, new Set())
        const set = nodeClasses.get(nodeName)!
        for (let k = 0; k < classNames.length; k += 1) {
          set.add(classNames[k]!)
        }
      }
    }

    if (trimmed.startsWith('style ')) {
      const match = /^style\s+([A-Za-z0-9_.-]+)\s+(.+)$/.exec(trimmed)
      if (match) {
        const targetName = String(match[1] || '').trim()
        const styleStr = String(match[2] || '').trim()
        const style = parseMermaidStyleString(styleStr)
        mergeMermaidNamedStyles(directStylesByName, targetName, style)
      }
      continue
    }

    if (trimmed.startsWith('linkStyle ')) {
      const match = /^linkStyle\s+([^\s]+)\s+(.+)$/.exec(trimmed)
      if (match) {
        const indexesToken = String(match[1] || '').trim()
        const style = normalizeMermaidLinkStyle(parseMermaidStyleString(String(match[2] || '').trim()))
        if (indexesToken.toLowerCase() === 'default') {
          defaultLinkStyle = { ...(defaultLinkStyle || {}), ...style }
        } else {
          const parts = indexesToken.split(',').map(s => s.trim()).filter(Boolean)
          for (let i = 0; i < parts.length; i += 1) {
            const n = Number(parts[i])
            if (!Number.isFinite(n) || n < 0) continue
            const index = Math.floor(n)
            const prev = linkStylesByIndex.get(index) || {}
            linkStylesByIndex.set(index, { ...prev, ...style })
          }
        }
      }
      continue
    }
  }

  // Helper to get or create a node
  const getOrCreateNode = (
    name: string,
    label: string | null,
    lineIndex: number,
    className?: string,
    shape?: string | null,
  ): string => {
    const safeName = name.trim()
    if (!safeName) return ''

    const existing = mermaidNodeIdsByName.get(safeName)
    if (existing) return existing

    const nodeId = `mermaid:${gid}:${diagramKey}:${slugify(safeName)}`
    mermaidNodeIdsByName.set(safeName, nodeId)

    // Determine parent subgraph
    const currentSubgraph = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null
    
    const primitive = mapMermaidShapeToPrimitive(shape)
    const canonicalShape = typeof shape === 'string' ? shape.trim().toLowerCase() : ''
    const visualShape = canonicalShape === 'circle' || canonicalShape === 'rect' || canonicalShape === 'diamond' || canonicalShape === 'hex'
      ? canonicalShape
      : 'rect'
    const nodeProps: Record<string, unknown> = {
      nodeName: safeName,
      label: label ?? safeName,
      'visual:layer': Math.max(1, subgraphStack.length + 1),
      'visual:nestingDepth': subgraphStack.length,
      'visual:shape': visualShape,
      'visual:shapeCanonical': primitive,
      'frontmatter:primitive': primitive,
      mermaidScope: scope,
      ...(isFrontmatter ? { isMermaidFrontmatter: true } : {}),
      ...(diagramId ? { mermaidDiagramId: diagramId } : {}),
    }

    if (currentSubgraph) {
      nodeProps.mermaidSubgraphName = currentSubgraph.name
      nodeProps['visual:parentId'] = currentSubgraph.id
      nodeProps['visual:topParentId'] = subgraphStack.length > 0 ? subgraphStack[0]!.id : currentSubgraph.id
      addRel(currentSubgraph.id, 'hasMermaidNode', nodeId)
    }

    let classStyles = getMergedClassStyles(safeName)
    if (className) {
        const extra = classDefs.get(className)
        if (extra) {
            classStyles = { ...classStyles, ...extra }
        }
    }
    const directStyles = directStylesByName.get(safeName) || {}

    ensureNode({
      '@id': nodeId,
      '@type': 'MermaidNode',
      labels: ['MermaidNode'],
      name: label || safeName,
      chunk_text: (label || safeName).slice(0, 800),
      properties: { ...nodeProps, ...classStyles, ...directStyles },
      metadata: mkMeta(startIndex + lineIndex, startIndex + lineIndex),
    })
    
    // Link to document
    addRel(docId, 'hasMermaidNode', nodeId)

    return nodeId
  }

  // Helper to ensure subgraph exists
  const ensureSubgraph = (name: string, label: string | null, lineIndex: number): string => {
    const safeName = name.trim()
    if (!safeName) return ''
    
    const existing = mermaidSubgraphIdsByName.get(safeName)
    if (existing) return existing

    const subgraphId = `mermaid:${gid}:${diagramKey}:subgraph:${slugify(safeName)}`
    mermaidSubgraphIdsByName.set(safeName, subgraphId)

    const display = label || safeName
    const parent = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null
    
    const classStyles = getMergedClassStyles(safeName)
    const directStyles = directStylesByName.get(safeName) || {}
    ensureNode({
      '@id': subgraphId,
      '@type': 'MermaidSubgraph',
      labels: ['MermaidSubgraph'],
      name: display,
      chunk_text: display.slice(0, 800),
      subgraphName: safeName,
      label: display,
      properties: {
        subgraphName: safeName,
        nodeName: safeName,
        'frontmatter:primitive': 'cluster',
        'visual:layer': Math.max(1, subgraphStack.length + 1),
        'visual:nestingDepth': subgraphStack.length,
        'visual:shape': 'group',
        'visual:shapeCanonical': 'cluster',
        mermaidScope: scope,
        ...(isFrontmatter ? { isMermaidFrontmatter: true } : {}),
        ...(diagramId ? { mermaidDiagramId: diagramId } : {}),
        'visual:topParentId': subgraphStack.length > 0 ? subgraphStack[0]!.id : subgraphId,
        ...(parent ? { mermaidSubgraphName: parent.name } : {}),
        ...(parent ? { 'visual:parentId': parent.id } : {}),
        ...classStyles,
        ...directStyles,
      },
      metadata: mkMeta(startIndex + lineIndex, startIndex + lineIndex),
    })

    // If there is a parent subgraph, link it
    if (parent) {
      addRel(parent.id, 'hasMermaidSubgraph', subgraphId)
    } else {
      // Top level subgraph attached to document
       if (!docSubgraphIds.has(subgraphId)) {
        docSubgraphIds.add(subgraphId)
        addRel(docId, 'hasMermaidSubgraph', subgraphId)
      }
    }
    
    return subgraphId
  }

  // 2. Second pass: Parse nodes, edges, subgraphs
  let mermaidEdgeIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^(?:graph|flowchart)\b/i.test(trimmed)) continue
    if (trimmed.startsWith('%%')) continue

    // --- Subgraph Start ---
    if (trimmed.toLowerCase().startsWith('subgraph ')) {
      const unquote = (raw: string): string => {
        const v = String(raw || '').trim()
        if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
          return v.slice(1, -1)
        }
        return v
      }

      const m =
        /^subgraph\s+([A-Za-z0-9_.-]+)(?:\s*\[([^\]]+)\]|\s+"([^"]+)")?/.exec(trimmed) ||
        /^subgraph\s+"([^"]+)"$/.exec(trimmed) ||
        /^subgraph\s+(.+)$/.exec(trimmed)

      if (m) {
        const hasExplicitId = m.length > 1 && /^[A-Za-z0-9_.-]+$/.test(String(m[1] || '').trim())
        const id = hasExplicitId ? String(m[1] || '').trim() : slugify(String(m[1] || '').trim() || `subgraph-${i + 1}`)
        const labelRaw = hasExplicitId ? String(m[3] || m[2] || m[1] || '') : String(m[1] || '')
        const label = unquote(labelRaw) || id
        const subgraphId = ensureSubgraph(id, label, i)
        subgraphStack.push({ name: id, id: subgraphId })
      }
      continue
    }

    // --- Subgraph End ---
    if (trimmed.toLowerCase() === 'end') {
      subgraphStack.pop()
      continue
    }



    // --- Click Event ---
    const clickMatch =
      /^click\s+([A-Za-z0-9_.-]+)\s+(?:"(#[^"]+)"|'(#[^']+)')(?:\s+(?:"[^"]*"|'[^']*'))?\s*$/.exec(trimmed)
    if (clickMatch) {
      const nodeName = String(clickMatch[1] || '').trim()
      const href = String(clickMatch[2] || clickMatch[3] || '').trim()
      const anchor = href.startsWith('#') ? href.slice(1).trim() : ''
      const nodeId = nodeName ? mermaidNodeIdsByName.get(nodeName) : undefined
      if (nodeId && anchor) {
        addRel(nodeId, 'pointsTo', `anchor:${gid}:${anchor}`)
      }
      continue
    }

    // --- Nodes & Edges ---
    // Improved Arrow Regex: Allow spaces or no spaces
    // Use capture group to keep the delimiter
    // Regex matches: --text-->, -->, -.->, ==>
    // And optionally labeled like `|label|`
    // We split by: ( (arrow_part) (optional_label) )
    // BUT split regex in JS is tricky.
    
    // Let's use a simpler approach: Match (Node) (Link) (Node) (Link) ...
    // But nodes can contain special chars in labels.
    
    // We try to split by the link operators, keeping them.
    // Link operators:
    // \s*--+>\s*
    // \s*-\.->\s*
    // \s*==+>\s*
    // \s*---\s*
    // And labeled: \s*--\s*text\s*--\s* or \s*--\s*text\s*-->\s* (complex)
    
    // We stick to the basic arrows for now but make spaces optional.
    // The previous regex was `/\s+((?:--+|-\.-+|==+)(?:>)?(?:\|[^|]+\|)?)\s+/`
    // New regex: allow 0 spaces around arrow.
    // `/\s*((?:--+|-\.-+|==+)(?:>)?(?:\|[^|]+\|)?)\s*/`
    // Note: This might match `A-->B` as `A`, `-->`, `B`.
    
    // Updated to support multi-directional and circle/cross edges:
    // o--o, x--x, <-->
    const arrowRegex = /\s*((?:--+|-\.-+|==+)(?:\s+[^|]+\s+)(?:--+|-\.-+|==+)>?|(?:--+|-\.-+|==+|o--+o|x--+x|<--+>)(?:>)?(?:\s*\|[^|]+\|\s*)?)\s*/
    const parts = trimmed.split(arrowRegex)
    
    if (parts.length === 1) {
      const nodeDef = parseMermaidNodeString(parts[0])
      if (nodeDef) {
        getOrCreateNode(nodeDef.name, nodeDef.label, i, nodeDef.className, nodeDef.shape)
      }
    } else {
      let currentSrcName: string | null = null
      
      const n0 = parseMermaidNodeString(parts[0])
      if (n0) {
        getOrCreateNode(n0.name, n0.label, i, n0.className, n0.shape)
        currentSrcName = n0.name
      }
      
      for (let k = 1; k < parts.length; k += 2) {
        const nextNodeStr = parts[k+1] // This is the node
        
        // Check if nextNodeStr is empty (e.g. trailing arrow?)
        if (!nextNodeStr) continue;

        const nNext = parseMermaidNodeString(nextNodeStr)
        if (nNext && currentSrcName) {
           getOrCreateNode(nNext.name, nNext.label, i, nNext.className, nNext.shape)
           
           const srcId = mermaidNodeIdsByName.get(currentSrcName)
           const tgtId = mermaidNodeIdsByName.get(nNext.name)
           
           if (srcId && tgtId) {
             const edgeToken = String(parts[k] || '')
             const relationProps = {
               ...(defaultLinkStyle || {}),
               ...(linkStylesByIndex.get(mermaidEdgeIndex) || {}),
               ...(readMermaidEdgeRelationProps(edgeToken) || {}),
             }
             addRel(srcId, 'pointsTo', tgtId, Object.keys(relationProps).length > 0 ? relationProps : undefined)
             mermaidEdgeIndex += 1
           }
           
           currentSrcName = nNext.name
        }
      }
    }
  }
}
