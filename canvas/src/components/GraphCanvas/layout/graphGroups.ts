import type { GraphData } from '@/lib/graph/types'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { deriveMermaidSubgraphGroups } from '@/components/GraphCanvas/layout/mermaidSubgraphGroups'
import { deriveMarkdownHeadingGroups } from '@/components/GraphCanvas/layout/markdownHeadingGroups'
import { finalizeGroupBucketMemberNodeIds, pushGroupBucketMember, readUpdatedBucketLayoutMeta } from '@/components/GraphCanvas/layout/groupBuckets'
import { readSubgraphs, subgraphGroupId } from '@/lib/graph/subgraphs'
import { compareGroupsForZOrder } from '@/lib/canvas/groupZOrder'
import { getKgThemeFromDom, resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'
import { deriveNestedGroups } from '@/lib/graph/groupNesting'

export const deriveGraphGroups = (
  data: GraphData,
  options?: { forceDocumentStructure?: boolean; themeMode?: 'light' | 'dark' },
): GraphGroup[] => {
  const theme = options?.themeMode || getKgThemeFromDom()
  const edgeStrokeToken = resolveCssVarWithKgFallback('--kg-canvas-edge-stroke', theme)
  const accentToken = resolveCssVarWithKgFallback('--kg-canvas-accent', theme)
  const meta = (data.metadata || {}) as Record<string, unknown>
  const isKeywordGraph = meta.kind === 'keyword'
  const mermaid = (!isKeywordGraph || options?.forceDocumentStructure) ? (deriveMermaidSubgraphGroups(data) as GraphGroup[]) : []
  const headings = options?.forceDocumentStructure ? deriveMarkdownHeadingGroups(data) : []
  const keywordLayers = (() => {
    // Check if we have keyword roles in the data
    const nodes = Array.isArray(data.nodes) ? data.nodes : []
    const hasKeywordRoles = nodes.some(n => {
      const props = (n.properties || {}) as Record<string, unknown>
      const role = typeof props['keyword:role'] === 'string' ? props['keyword:role'].trim() : ''
      return role === 'subject' || role === 'object' || role === 'entity'
    })

    if (!isKeywordGraph && !options?.forceDocumentStructure && !hasKeywordRoles) return [] as GraphGroup[]
    const roleStroke = {
      subject: accentToken,
      object: theme === 'dark' ? '#34d399' : '#059669',
      entity: edgeStrokeToken,
    } as const
    const byKey = new Map<string, string[]>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const props = (n.properties || {}) as Record<string, unknown>
      const kind = typeof props['keyword:kind'] === 'string' ? props['keyword:kind'].trim() : ''
      const role = typeof props['keyword:role'] === 'string' ? props['keyword:role'].trim() : ''
      if (kind === 'entity' && (role === 'subject' || role === 'object' || role === 'entity')) {
        pushGroupBucketMember(byKey, `keywordRole:${role}`, n.id)
      }
    }
    const out: GraphGroup[] = []
    byKey.forEach((memberNodeIds, key) => {
      const ids = finalizeGroupBucketMemberNodeIds(memberNodeIds)
      if (ids.length === 0) return
      const role = key === 'keywordRole:subject' ? 'subject' : key === 'keywordRole:object' ? 'object' : 'entity'
      const label =
        key === 'keywordRole:subject'
          ? 'Subject'
          : key === 'keywordRole:object'
            ? 'Object'
            : key === 'keywordRole:entity'
              ? 'Entity'
              : key
      out.push({
        id: `keyword-layer:${key}`,
        label,
        source: 'keywordRole',
        depth: 1,
        memberNodeIds: ids,
        style: { stroke: roleStroke[role] },
      })
    })
    return out
  })()
  const keywordNerGroups = (() => {
    // Check if we have keyword:kind=entity and keyword:ner
    const nodes = Array.isArray(data.nodes) ? data.nodes : []
    const hasNer = nodes.some(n => {
      const props = (n.properties || {}) as Record<string, unknown>
      const kind = typeof props['keyword:kind'] === 'string' ? props['keyword:kind'].trim() : ''
      const ner = typeof props['keyword:ner'] === 'string' ? props['keyword:ner'].trim() : ''
      return kind === 'entity' && ner && ner !== 'O'
    })

    if (!isKeywordGraph && !options?.forceDocumentStructure && !hasNer) return [] as GraphGroup[]
    const byNer = new Map<string, string[]>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const props = (n.properties || {}) as Record<string, unknown>
      const kind = typeof props['keyword:kind'] === 'string' ? props['keyword:kind'].trim() : ''
      if (kind !== 'entity') continue
      const nerRaw = typeof props['keyword:ner'] === 'string' ? props['keyword:ner'].trim() : ''
      const ner = nerRaw ? nerRaw.toUpperCase() : ''
      if (!ner || ner === 'O') continue
      pushGroupBucketMember(byNer, ner, n.id)
    }

    if (byNer.size === 0) return [] as GraphGroup[]

    const strokeFor = (ner: string): string => {
      if (ner === 'PERSON') return accentToken
      if (ner === 'ORG') return theme === 'dark' ? '#fde047' : '#ca8a04'
      if (ner === 'GPE' || ner === 'LOC') return theme === 'dark' ? '#34d399' : '#059669'
      if (ner === 'DATE' || ner === 'TIME') return theme === 'dark' ? '#fb923c' : '#ea580c'
      if (ner === 'EVENT') return theme === 'dark' ? '#f87171' : '#dc2626'
      return edgeStrokeToken
    }

    const groups: Array<{ ner: string; ids: string[] }> = []
    byNer.forEach((memberNodeIds, ner) => {
      const ids = finalizeGroupBucketMemberNodeIds(memberNodeIds)
      if (ids.length < 2) return
      groups.push({ ner, ids })
    })
    groups.sort((a, b) => {
      if (b.ids.length !== a.ids.length) return b.ids.length - a.ids.length
      return a.ner.localeCompare(b.ner)
    })
    const keep = groups.slice(0, 10)

    return keep.map(g => ({
      id: `keyword-ner:${g.ner}`,
      label: g.ner,
      source: 'keywordNer' as const,
      depth: 2,
      memberNodeIds: g.ids,
      style: { stroke: strokeFor(g.ner) },
    }))
  })()
  const communities = (() => {
    const nodes = Array.isArray(data.nodes) ? data.nodes : []
    const byCommunity = new Map<string, string[]>()
    const propsByCommunity = new Map<string, { depth?: number; xIndex?: number; yIndex?: number }>()

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const props = (n.properties || {}) as Record<string, unknown>
      const raw = props['visual:community']
      const key =
        typeof raw === 'number'
          ? (Number.isFinite(raw) ? String(raw) : '')
          : typeof raw === 'string'
            ? raw.trim()
            : ''
      if (!key) continue
      pushGroupBucketMember(byCommunity, key, n.id)
      const explicitDepth = typeof props['visual:depth'] === 'number' ? props['visual:depth'] : typeof props['visual:zIndex'] === 'number' ? props['visual:zIndex'] : undefined
      propsByCommunity.set(key, readUpdatedBucketLayoutMeta(propsByCommunity.get(key), {
        bucketValue: raw,
        explicitDepth,
        xIndex: props['visual:xIndex'],
        yIndex: props['visual:yIndex'],
      }))
    }
    const out: GraphGroup[] = []
    byCommunity.forEach((memberNodeIds, key) => {
      const ids = finalizeGroupBucketMemberNodeIds(memberNodeIds)
      if (ids.length === 0) return
      const props = propsByCommunity.get(key)
      out.push({
        id: `community:${key}`,
        label: `Community ${key}`,
        source: 'community',
        depth: props?.depth ?? 0,
        xIndex: props?.xIndex,
        yIndex: props?.yIndex,
        memberNodeIds: ids,
        style: {},
      })
    })
    return out
  })()
  const layers = (() => {
    const nodes = Array.isArray(data.nodes) ? data.nodes : []
    const byLayer = new Map<string, string[]>()
    const propsByLayer = new Map<string, { depth?: number; xIndex?: number; yIndex?: number }>()

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const props = (n.properties || {}) as Record<string, unknown>
      if (props['visual:community'] != null) continue
      const raw = props['visual:layer']
      const key =
        typeof raw === 'number'
          ? (Number.isFinite(raw) ? String(raw) : '')
          : typeof raw === 'string'
            ? raw.trim()
            : ''
      if (!key) continue
      pushGroupBucketMember(byLayer, key, n.id)
      const explicitDepth = typeof props['visual:depth'] === 'number' ? props['visual:depth'] : typeof props['visual:zIndex'] === 'number' ? props['visual:zIndex'] : undefined
      propsByLayer.set(key, readUpdatedBucketLayoutMeta(propsByLayer.get(key), {
        bucketValue: raw,
        explicitDepth,
        xIndex: props['visual:xIndex'],
        yIndex: props['visual:yIndex'],
      }))
    }

    const out: GraphGroup[] = []
    byLayer.forEach((memberNodeIds, key) => {
      const ids = finalizeGroupBucketMemberNodeIds(memberNodeIds)
      if (ids.length === 0) return
      const props = propsByLayer.get(key)
      out.push({
        id: `layer:${key}`,
        label: key,
        source: 'layer',
        depth: props?.depth ?? 0,
        xIndex: props?.xIndex,
        yIndex: props?.yIndex,
        memberNodeIds: ids,
        style: {},
      })
    })
    return out
  })()
  const userSubgraphs = (() => {
    const subgraphs = readSubgraphs(data)
    if (subgraphs.length === 0) return [] as GraphGroup[]

    const byId = new Map<string, { parentId: string | null; memberNodeIds: string[]; label: string; kind: 'subgraph' | 'cluster' }>()
    for (let i = 0; i < subgraphs.length; i += 1) {
      const sg = subgraphs[i]
      byId.set(sg.id, {
        parentId: sg.parentId == null ? null : String(sg.parentId || '').trim() || null,
        memberNodeIds: Array.from(new Set(sg.memberNodeIds.map(x => String(x || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
        label: String(sg.label || sg.id).trim() || sg.id,
        kind: sg.kind === 'cluster' ? 'cluster' : 'subgraph',
      })
    }

    const nesting = deriveNestedGroups(
      Array.from(byId.entries()).map(([id, row]) => ({ id, parentId: row.parentId, memberNodeIds: row.memberNodeIds })),
    )

    const out: GraphGroup[] = []
    const meta = (data.metadata || {}) as Record<string, unknown>
    const isFlowchartGraph = String(meta.graphKind || '') === 'flowchart'
    byId.forEach((row, id) => {
      const gid = subgraphGroupId(id)
      if (!gid) return
      const depth = nesting.depthById.get(id) ?? 0
      const parentId = nesting.parentIdById.get(id) ?? null
      const parentGroupId = parentId ? subgraphGroupId(parentId) : null
      const memberNodeIds = nesting.descendantMemberNodeIdsById.get(id) || row.memberNodeIds
      out.push({
        id: gid,
        label: row.label,
        source: 'userSubgraph',
        depth,
        memberNodeIds,
        parentGroupId,
        containChildren: true,
        connectable: false,
        style:
          row.kind === 'cluster'
            ? {
                stroke: theme === 'dark' ? '#38bdf8' : '#0EA5E9',
                strokeWidth: isFlowchartGraph ? 2.8 : 2,
                fill: isFlowchartGraph
                  ? (theme === 'dark' ? 'rgba(56,189,248,0.24)' : 'rgba(14,165,233,0.16)')
                  : (theme === 'dark' ? 'rgba(56,189,248,0.16)' : 'rgba(14,165,233,0.10)'),
              }
            : {
                stroke: theme === 'dark' ? '#a78bfa' : '#7c3aed',
                strokeWidth: isFlowchartGraph ? 3.2 : 2,
                fill: isFlowchartGraph
                  ? (theme === 'dark' ? 'rgba(167,139,250,0.2)' : 'rgba(124,58,237,0.14)')
                  : (theme === 'dark' ? 'rgba(167,139,250,0.14)' : 'rgba(124,58,237,0.08)'),
              },
      })
    })
    out.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth
      return String(a.label || '').localeCompare(String(b.label || ''))
    })
    return out
  })()

  const merged = [...mermaid, ...headings, ...keywordLayers, ...keywordNerGroups, ...communities, ...layers, ...userSubgraphs]

  const nodeIdSet = (() => {
    const nodes = Array.isArray(data.nodes) ? data.nodes : []
    const s = new Set<string>()
    for (let i = 0; i < nodes.length; i += 1) {
      const id = String((nodes[i] as { id?: unknown } | null)?.id || '').trim()
      if (!id) continue
      s.add(id)
    }
    return s
  })()

  const collapsedNodeIdByGroupId = (() => {
    const nodes = Array.isArray(data.nodes) ? data.nodes : []
    const out = new Map<string, { nodeId: string; label: string; depth: number }>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i] as unknown as { id?: unknown; label?: unknown; properties?: unknown } | null
      const nodeId = String(n?.id || '').trim()
      if (!nodeId) continue
      const props = n?.properties && typeof n.properties === 'object' && !Array.isArray(n.properties)
        ? (n.properties as Record<string, unknown>)
        : null
      if (!props) continue
      if (props['kg:collapsed'] !== true) continue
      const groupId = typeof props['kg:groupId'] === 'string' ? props['kg:groupId'].trim() : ''
      if (!groupId) continue
      const depthRaw = props['kg:groupDepth']
      const depth = typeof depthRaw === 'number' && Number.isFinite(depthRaw) ? Math.max(0, Math.floor(depthRaw)) : 0
      const label = String(n?.label || groupId).trim() || groupId
      out.set(groupId, { nodeId, label, depth })
    }
    return out
  })()

  if (collapsedNodeIdByGroupId.size > 0) {
    for (let i = 0; i < merged.length; i += 1) {
      const g = merged[i]
      const gid = String(g.id || '').trim()
      if (!gid) continue
      const collapsed = collapsedNodeIdByGroupId.get(gid)
      if (!collapsed) continue
      const members = Array.isArray(g.memberNodeIds) ? g.memberNodeIds : []
      let hasLiveMember = false
      for (let j = 0; j < members.length; j += 1) {
        const nid = String(members[j] || '').trim()
        if (!nid) continue
        if (nodeIdSet.has(nid)) {
          hasLiveMember = true
          break
        }
      }
      if (hasLiveMember) continue
      merged[i] = { ...g, memberNodeIds: [collapsed.nodeId] }
    }

    collapsedNodeIdByGroupId.forEach((collapsed, groupId) => {
      const exists = merged.some(g => String(g.id || '').trim() === groupId)
      if (exists) return
      merged.push({
        id: groupId,
        label: collapsed.label,
        depth: collapsed.depth,
        memberNodeIds: [collapsed.nodeId],
        style: {},
      })
    })
  }

  merged.sort(compareGroupsForZOrder)
  return merged
}
