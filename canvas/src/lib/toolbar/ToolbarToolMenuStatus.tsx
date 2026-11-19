import React from 'react'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'

export type FloatingPanelDevStatusMetrics = {
  counter: string
  hierarchyBadge: string
  suffix: string
} | null

export function useFloatingPanelDevStatusMetrics(): FloatingPanelDevStatusMetrics {
  const activeGraphRenderData = useActiveGraphRenderData(true)
  return React.useMemo(() => {
    const isDev = (() => {
      try {
        const meta = import.meta as unknown as { env?: unknown }
        const env = meta && typeof meta.env === 'object' && meta.env ? (meta.env as Record<string, unknown>) : null
        return env ? env.DEV === true : false
      } catch {
        return false
      }
    })()
    if (!isDev) return null
    const data = activeGraphRenderData
    if (!data) return { counter: 'n0 e0 g0', hierarchyBadge: 'h0', suffix: 'bp:h0 s0 c0 m0' }
    const nodes = Array.isArray(data.nodes) ? data.nodes.length : 0
    const edges = Array.isArray(data.edges) ? data.edges.length : 0
    const groupsDerived = deriveGraphGroups(data, { forceDocumentStructure: false })
    const groups = groupsDerived.length
    const maxDepth = groupsDerived.reduce((depth, group) => {
      const groupDepth = typeof group.depth === 'number' && Number.isFinite(group.depth)
        ? Math.max(0, Math.floor(group.depth))
        : 0
      return Math.max(depth, groupDepth)
    }, 0)
    const hierarchyLevels = groups > 0 ? maxDepth + 1 : 0
    const hubs = (Array.isArray(data.nodes) ? data.nodes : []).filter(node => String(node.type || '').trim().toLowerCase() === 'hub').length
    const spokes = (Array.isArray(data.edges) ? data.edges : []).filter(edge => String(edge.label || '') === 'spokeTo').length
    const crosses = (Array.isArray(data.edges) ? data.edges : []).filter(edge => String(edge.label || '') === 'linksTo').length
    const members = (Array.isArray(data.nodes) ? data.nodes : []).filter(node => {
      const type = String(node.type || '').trim().toLowerCase()
      return type === 'problem' || type === 'solution'
    }).length
    return {
      counter: `n${nodes} e${edges} g${groups}`,
      hierarchyBadge: `h${hierarchyLevels}`,
      suffix: `bp:h${hubs} s${spokes} c${crosses} m${members}`,
    }
  }, [activeGraphRenderData])
}

export const FloatingPanelHeaderStatus = React.memo(function FloatingPanelHeaderStatus(props: {
  pipelineStatus: string | null
  exportStatus?: string | null
  devStatusMetrics: FloatingPanelDevStatusMetrics
}) {
  const { pipelineStatus, exportStatus, devStatusMetrics } = props
  const statusClassName = `${UI_THEME_TOKENS.text.tertiary} kg-truncate-chip`

  return (
    <span className={`${uiToolbarRowScrollClassName} gap-1 pl-1`}>
      {pipelineStatus && <span className={statusClassName}>{pipelineStatus}</span>}
      {devStatusMetrics && <span className={statusClassName}>{devStatusMetrics.counter}</span>}
      {devStatusMetrics && <span className={statusClassName}>{devStatusMetrics.hierarchyBadge}</span>}
      {devStatusMetrics && <span className={statusClassName}>{devStatusMetrics.suffix}</span>}
      {exportStatus && <span className={statusClassName}>{exportStatus}</span>}
    </span>
  )
})
