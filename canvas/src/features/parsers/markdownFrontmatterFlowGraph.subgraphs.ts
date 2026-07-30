type FlowSubgraph = {
  id: string
  label: string
  memberNodeIds: string[]
  parentId: string | null
  kind: 'subgraph' | 'cluster'
  autoBounds?: boolean
}

type ResolveTemplateString = (
  raw: string,
  vars: Record<string, unknown>,
  pathCache: Map<string, unknown>,
  declarationCache: Map<string, unknown>,
  resolvedStringCache: Map<string, string>,
) => string

const isRecord = (v: unknown): v is Record<string, unknown> => (
  typeof v === 'object' && v !== null && !Array.isArray(v)
)

const asString = (v: unknown): string => typeof v === 'string' ? v.trim() : ''

export function normalizeFlowSubgraphs(args: {
  rawSubgraphs: unknown
  vars: Record<string, unknown>
  flowVars: Record<string, unknown>
  pathCache: Map<string, unknown>
  declarationCache: Map<string, unknown>
  resolvedStringCache: Map<string, string>
  nodeIds: Set<string>
  resolveTemplateString: ResolveTemplateString
}): FlowSubgraph[] {
  const raw = Array.isArray(args.rawSubgraphs) ? args.rawSubgraphs : []
  if (raw.length === 0) return []
  const out: FlowSubgraph[] = []
  const seen = new Set<string>()
  const templateVars = { ...args.vars, ...args.flowVars }
  const resolveText = (value: unknown): string => {
    const s = asString(value)
    return s ? args.resolveTemplateString(s, templateVars, args.pathCache, args.declarationCache, args.resolvedStringCache).trim() : ''
  }
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i]
    if (!isRecord(row)) continue
    const id = resolveText(row.id)
    if (!id || seen.has(id)) continue
    const membersRaw = Array.isArray(row.memberNodeIds) ? row.memberNodeIds : []
    const memberSeen = new Set<string>()
    const memberNodeIds: string[] = []
    for (let j = 0; j < membersRaw.length; j += 1) {
      const memberId = resolveText(membersRaw[j])
      if (!memberId || memberSeen.has(memberId) || !args.nodeIds.has(memberId)) continue
      memberSeen.add(memberId)
      memberNodeIds.push(memberId)
    }
    if (memberNodeIds.length === 0) continue
    seen.add(id)
    memberNodeIds.sort((a, b) => a.localeCompare(b))
    const autoBounds = row.autoBounds === true
    out.push({
      id,
      label: resolveText(row.label) || id,
      memberNodeIds,
      parentId: resolveText(row.parentId) || null,
      kind: resolveText(row.kind).toLowerCase() === 'cluster' ? 'cluster' : 'subgraph',
      ...(autoBounds ? { autoBounds: true } : {}),
    })
  }
  return out
}
