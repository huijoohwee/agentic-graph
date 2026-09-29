import React from 'react'
import { GraphHoverTooltip, type HoverInfo } from '@/components/GraphHoverTooltip'
import type { GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { XrMotionReferenceSubject } from './xrMotionReferenceModel'

type HoverPoint = { clientX: number; clientY: number }
type SubjectHover = {
  show: (subject: XrMotionReferenceSubject, point: HoverPoint) => void
  leave: (id: string) => void
  remove: (id: string) => void
}
const XrSubjectHoverContext = React.createContext<SubjectHover | null>(null)
export const useXrSubjectHover = () => React.useContext(XrSubjectHoverContext)

/** XR subjects project into the existing hover box without mutating the source graph. */
export function XrSubjectHoverProvider({ children, containerRef, enabled, documentKey, schema }: {
  children: React.ReactNode
  containerRef: React.RefObject<HTMLElement | null>
  enabled: boolean
  documentKey: string
  schema: GraphSchema
}) {
  const [hover, setHover] = React.useState<HoverInfo | null>(null)
  const [nodes, setNodes] = React.useState<GraphNode[]>([])
  const clear = React.useCallback(() => setHover(null), [])
  const actions = React.useMemo<SubjectHover>(() => ({
    show: (subject, point) => {
      setNodes(previous => {
        const existing = previous.find(node => node.id === subject.id)
        if (existing?.label === subject.label && existing.type === subject.category
          && existing.properties.asset === subject.assetId && existing.properties.color === subject.color
          && existing.properties.scale === subject.scale) return previous
        return [...previous.filter(node => node.id !== subject.id), { id: subject.id, label: subject.label, type: subject.category,
          properties: { asset: subject.assetId, color: subject.color, scale: subject.scale } }]
      })
      setHover({ kind: 'node', id: subject.id, clientX: point.clientX, clientY: point.clientY })
    },
    leave: id => setHover(previous => previous?.id === id ? null : previous),
    remove: id => {
      setHover(previous => previous?.id === id ? null : previous)
      setNodes(previous => previous.filter(node => node.id !== id))
    },
  }), [])
  React.useEffect(() => { setHover(null); setNodes([]) }, [documentKey, enabled])
  return <XrSubjectHoverContext.Provider value={enabled ? actions : null}>
    {children}
    {enabled ? <GraphHoverTooltip key={documentKey} hoverInfo={hover} containerRef={containerRef}
      nodes={nodes} edges={[]} schema={schema} tooltipInteractive onRequestClose={clear} /> : null}
  </XrSubjectHoverContext.Provider>
}
