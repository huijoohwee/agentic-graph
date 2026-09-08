import type { GraphNode } from '@/lib/graph/types'

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const hasFiniteXY = (n: GraphNode): boolean =>
  isFiniteNumber((n as unknown as { x?: unknown }).x) && isFiniteNumber((n as unknown as { y?: unknown }).y)

export const hash01 = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

export const seedMissingNodePositions = (
  nodes: GraphNode[],
  width: number,
  height: number,
  seedCenter: { x: number; y: number } | null,
  options?: { ignoreCommunities?: boolean },
) => {
  if (!nodes || nodes.length === 0) return
  const sorted = [...nodes].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
  const existing = sorted.filter(hasFiniteXY)
  const missing = sorted.filter(n => !hasFiniteXY(n))
  if (missing.length === 0) return

  let cx = 0
  let cy = 0
  if (existing.length > 0) {
    let sx = 0
    let sy = 0
    for (let i = 0; i < existing.length; i += 1) {
      const n = existing[i]!
      sx += (n.x as number)
      sy += (n.y as number)
    }
    cx = sx / existing.length
    cy = sy / existing.length
  } else if (seedCenter) {
    const x = typeof seedCenter.x === 'number' && Number.isFinite(seedCenter.x) ? seedCenter.x : 0
    const y = typeof seedCenter.y === 'number' && Number.isFinite(seedCenter.y) ? seedCenter.y : 0
    cx = x
    cy = y
  } else {
    cx = width / 2
    cy = height / 2
  }

  const pad = 40
  const innerW = Math.max(1, Math.floor(width) - pad * 2)
  const innerH = Math.max(1, Math.floor(height) - pad * 2)
  const area = innerW * innerH
  const spacingBase = Math.sqrt(area / Math.max(1, sorted.length))
  const spacing = Math.max(72, Math.min(320, spacingBase * 1.9))

  const coerceCommunityKey = (n: GraphNode): string => {
    const props = (n.properties || {}) as Record<string, unknown>
    const raw = props['visual:community']
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    return ''
  }

  const ignoreCommunities = options?.ignoreCommunities === true

  const missingByCommunity = (() => {
    const map = new Map<string, GraphNode[]>()
    for (let i = 0; i < missing.length; i += 1) {
      const n = missing[i]!
      const key = coerceCommunityKey(n)
      if (!key) continue
      const arr = map.get(key) || []
      arr.push(n)
      map.set(key, arr)
    }
    return map
  })()

  const hasCommunities = !ignoreCommunities && missingByCommunity.size >= 2

  if (!hasCommunities) {
    const aspect = innerW / Math.max(1, innerH)
    const idealCols = Math.ceil(Math.sqrt(Math.max(1, missing.length) * Math.max(0.35, aspect)))
    const maxColsByWidth = Math.max(1, Math.floor(innerW / spacing))
    const cols = Math.max(1, Math.min(maxColsByWidth, idealCols))
    const rows = Math.max(1, Math.ceil(missing.length / cols))
    const gridW = (cols - 1) * spacing
    const gridH = (rows - 1) * spacing
    const startX = cx - gridW / 2
    const startY = cy - gridH / 2
    for (let i = 0; i < missing.length; i += 1) {
      const n = missing[i]!
      const col = i % cols
      const row = Math.floor(i / cols)
      const jx = (hash01(`${String(n.id)}:x`) - 0.5) * Math.min(18, spacing * 0.15)
      const jy = (hash01(`${String(n.id)}:y`) - 0.5) * Math.min(18, spacing * 0.15)
      n.x = startX + col * spacing + jx
      n.y = startY + row * spacing + jy
      n.vx = 0
      n.vy = 0
      n.fx = null
      n.fy = null
    }
    return
  }

  const communityKeys = Array.from(missingByCommunity.keys()).sort((a, b) => a.localeCompare(b))
  const clusterCount = communityKeys.length
  const clusterSpacing = Math.max(260, Math.min(720, spacing * 3.1))
  const aspect = innerW / Math.max(1, innerH)
  const idealClusterCols = Math.ceil(Math.sqrt(Math.max(1, clusterCount) * Math.max(0.55, aspect)))
  const maxClusterColsByWidth = Math.max(1, Math.floor(innerW / clusterSpacing))
  const clusterCols = Math.max(1, Math.min(maxClusterColsByWidth, idealClusterCols))
  const clusterRows = Math.max(1, Math.ceil(clusterCount / clusterCols))
  const clusterGridW = (clusterCols - 1) * clusterSpacing
  const clusterGridH = (clusterRows - 1) * clusterSpacing
  const clusterStartX = cx - clusterGridW / 2
  const clusterStartY = cy - clusterGridH / 2

  const microSpacing = Math.max(48, Math.min(200, spacing * 0.72))

  for (let gi = 0; gi < communityKeys.length; gi += 1) {
    const key = communityKeys[gi]!
    const members = missingByCommunity.get(key) || []
    if (members.length === 0) continue
    const cc = gi % clusterCols
    const rr = Math.floor(gi / clusterCols)
    const centerX = clusterStartX + cc * clusterSpacing
    const centerY = clusterStartY + rr * clusterSpacing

    const localAspect = 1
    const localIdealCols = Math.ceil(Math.sqrt(Math.max(1, members.length) * Math.max(0.55, localAspect)))
    const maxColsLocal = Math.max(1, Math.floor(clusterSpacing / microSpacing))
    const cols = Math.max(1, Math.min(maxColsLocal, localIdealCols))
    const rows = Math.max(1, Math.ceil(members.length / cols))
    const gridW = (cols - 1) * microSpacing
    const gridH = (rows - 1) * microSpacing
    const startX = centerX - gridW / 2
    const startY = centerY - gridH / 2

    for (let i = 0; i < members.length; i += 1) {
      const n = members[i]!
      const col = i % cols
      const row = Math.floor(i / cols)
      const jx = (hash01(`${String(n.id)}:x`) - 0.5) * Math.min(16, microSpacing * 0.18)
      const jy = (hash01(`${String(n.id)}:y`) - 0.5) * Math.min(16, microSpacing * 0.18)
      n.x = startX + col * microSpacing + jx
      n.y = startY + row * microSpacing + jy
      n.vx = 0
      n.vy = 0
      n.fx = null
      n.fy = null
    }
  }
}

