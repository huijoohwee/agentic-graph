import type { GraphData, JSONValue } from '@/lib/graph/types'
import { createUniqueId } from '@/lib/ids'

export type UserSubgraphKind = 'subgraph' | 'cluster'

export type UserSubgraph = {
  id: string
  label: string
  memberNodeIds: string[]
  parentId?: string | null
  kind?: UserSubgraphKind
  autoBounds?: boolean
}

export const KG_SUBGRAPHS_KEY = 'kg:subgraphs'

export const subgraphGroupId = (id: string): string => {
  const v = String(id || '').trim()
  return v ? `subgraph:${v}` : ''
}

export const subgraphIdFromGroupId = (groupId: string): string => {
  const value = String(groupId || '').trim()
  return value.startsWith('subgraph:') ? value.slice('subgraph:'.length).trim() : ''
}

const normalizeIds = (ids: unknown): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  if (!Array.isArray(ids)) return out
  for (let i = 0; i < ids.length; i += 1) {
    const id = String(ids[i] || '').trim()
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
}

const coerceSubgraph = (raw: unknown): UserSubgraph | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const id = String(r.id || '').trim()
  if (!id) return null
  const label = String(r.label || id).trim() || id
  const memberNodeIds = normalizeIds(r.memberNodeIds)
  const parentRaw = r.parentId
  const parentId = parentRaw == null ? null : String(parentRaw || '').trim() || null
  const rawKind = typeof r.kind === 'string' ? r.kind.trim() : ''
  const kind: UserSubgraphKind = rawKind === 'cluster' ? 'cluster' : 'subgraph'
  const autoBounds = r.autoBounds === true
  return { id, label, memberNodeIds, parentId, kind, ...(autoBounds ? { autoBounds: true } : {}) }
}

export const readSubgraphs = (data: GraphData | null | undefined): UserSubgraph[] => {
  const meta = (data?.metadata || {}) as Record<string, unknown>
  const raw = meta[KG_SUBGRAPHS_KEY]
  if (!Array.isArray(raw)) return []
  const out: UserSubgraph[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i += 1) {
    const sg = coerceSubgraph(raw[i])
    if (!sg) continue
    if (seen.has(sg.id)) continue
    seen.add(sg.id)
    out.push(sg)
  }
  out.sort((a, b) => a.label.localeCompare(b.label))
  return out
}

export const buildSubgraphsKey = (data: GraphData | null | undefined): string =>
  JSON.stringify(readSubgraphs(data).map(subgraph => ({
    id: subgraph.id,
    label: subgraph.label,
    memberNodeIds: subgraph.memberNodeIds,
    parentId: subgraph.parentId ?? null,
    kind: subgraph.kind ?? 'subgraph',
    autoBounds: subgraph.autoBounds === true,
  })))

export const writeSubgraphs = (data: GraphData, subgraphs: UserSubgraph[]): GraphData => {
  const meta = ((data.metadata || {}) as Record<string, JSONValue>) || {}
  const next: UserSubgraph[] = []
  const seen = new Set<string>()
  for (let i = 0; i < subgraphs.length; i += 1) {
    const sg = subgraphs[i]
    const id = String(sg.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      label: String(sg.label || id).trim() || id,
      memberNodeIds: normalizeIds(sg.memberNodeIds),
      parentId: sg.parentId == null ? null : String(sg.parentId || '').trim() || null,
      kind: sg.kind === 'cluster' ? 'cluster' : 'subgraph',
      ...(sg.autoBounds === true ? { autoBounds: true } : {}),
    })
  }
  next.sort((a, b) => a.label.localeCompare(b.label))
  return {
    ...data,
    metadata: {
      ...meta,
      [KG_SUBGRAPHS_KEY]: next as unknown as JSONValue,
    },
  }
}

export const filterSubgraphsByRetainedNodeIds = (data: GraphData, retainedNodeIds: ReadonlySet<string>): GraphData => {
  const subgraphs = readSubgraphs(data)
  if (subgraphs.length === 0) return data
  const retained = new Set<string>()
  retainedNodeIds.forEach(rawId => {
    const id = String(rawId || '').trim()
    if (id) retained.add(id)
  })
  const nextBase: UserSubgraph[] = []
  for (let i = 0; i < subgraphs.length; i += 1) {
    const sg = subgraphs[i]
    const memberNodeIds = normalizeIds(sg.memberNodeIds).filter(id => retained.has(id))
    if (memberNodeIds.length === 0) continue
    nextBase.push({ ...sg, memberNodeIds })
  }
  if (nextBase.length === 0) return writeSubgraphs(data, [])

  const nextIdSet = new Set(nextBase.map(sg => sg.id))
  const next = nextBase.map(sg => {
    const parentId = sg.parentId && sg.parentId !== sg.id && nextIdSet.has(sg.parentId) ? sg.parentId : null
    return { ...sg, parentId }
  })
  return writeSubgraphs(data, next)
}

export const createSubgraph = (
  data: GraphData,
  args: { nodeIds: string[]; label?: string; parentId?: string | null; kind?: UserSubgraphKind; autoBounds?: boolean },
) => {
  const subgraphs = readSubgraphs(data)
  const used = new Set<string>(subgraphs.map(s => s.id))
  const id = createUniqueId('sg', used)
  const label = String(args.label || `Subgraph ${id}`).trim() || `Subgraph ${id}`
  const memberNodeIds = normalizeIds(args.nodeIds)
  const parentId = args.parentId == null ? null : String(args.parentId || '').trim() || null
  const kind: UserSubgraphKind = args.kind === 'cluster' ? 'cluster' : 'subgraph'
  const sg: UserSubgraph = { id, label, memberNodeIds, parentId, kind, ...(args.autoBounds === true ? { autoBounds: true } : {}) }
  return { subgraph: sg, graphData: writeSubgraphs(data, [...subgraphs, sg]) }
}

export const updateSubgraph = (data: GraphData, id: string, patch: Partial<UserSubgraph>): GraphData => {
  const sid = String(id || '').trim()
  if (!sid) return data
  const subgraphs = readSubgraphs(data)
  const next = subgraphs.map(sg => {
    if (sg.id !== sid) return sg
    const label = patch.label == null ? sg.label : String(patch.label || '').trim() || sg.label
    const memberNodeIds = patch.memberNodeIds == null ? sg.memberNodeIds : normalizeIds(patch.memberNodeIds)
    const parentId = patch.parentId === undefined ? sg.parentId : patch.parentId == null ? null : String(patch.parentId || '').trim() || null
    const kind: UserSubgraphKind =
      patch.kind === undefined ? (sg.kind === 'cluster' ? 'cluster' : 'subgraph') : patch.kind === 'cluster' ? 'cluster' : 'subgraph'
    const autoBounds = patch.autoBounds === undefined ? sg.autoBounds === true : patch.autoBounds === true
    return { ...sg, label, memberNodeIds, parentId, kind, ...(autoBounds ? { autoBounds: true } : { autoBounds: undefined }) }
  })
  return writeSubgraphs(data, next)
}

export const removeSubgraph = (data: GraphData, id: string): GraphData => {
  const sid = String(id || '').trim()
  if (!sid) return data
  const subgraphs = readSubgraphs(data)
  const filtered = subgraphs.filter(sg => sg.id !== sid).map(sg => ({ ...sg, parentId: sg.parentId === sid ? null : sg.parentId }))
  return writeSubgraphs(data, filtered)
}
