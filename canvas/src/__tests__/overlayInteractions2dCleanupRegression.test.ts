import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useOverlayInteractions2d } from '@/components/GraphCanvasRoot/hooks/useOverlayInteractions2d'
import { startRichMediaPanelHeaderDrag } from '@/components/RichMediaPanelOverlayDrag'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testOverlayInteractions2dCleanupCancelsActiveDrags() {
  const p = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useOverlayInteractions2d.ts')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('return () =>') || !text.includes('cancelAllInteractions()')) {
    throw new Error('expected useOverlayInteractions2d cleanup to cancel active interactions')
  }
}

export async function testOverlayInteractions2dCommitsFastReleaseAcrossRevision() {
  const { dom, restore } = initJsdomHarness()
  const host = dom.window.document.createElement('section')
  const svg = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  dom.window.document.body.append(host, svg)
  const root = createRoot(host)
  const node: GraphNode = { id: 'figure', type: 'Image', label: 'Figure', properties: {}, x: 10, y: 20 }
  const graph: GraphData = { type: 'Graph', nodes: [node], edges: [] }
  const refs = {
    activeRef: { current: true }, svgRef: { current: svg }, zoomRef: { current: null },
    simulationRef: { current: null }, sceneGraphDataRef: { current: graph }, schemaRef: { current: defaultSchema },
  }
  let api: ReturnType<typeof useOverlayInteractions2d> | undefined
  const Harness = ({ revision }: { revision: number }) => {
    api = useOverlayInteractions2d({ ...refs, graphDataRevision: revision, requestOverlaySchedule: () => {} })
    return null
  }
  const event = (type: string, x: number, y: number) => {
    const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 })
    Object.defineProperties(e, { pointerId: { value: 61 }, pointerType: { value: 'mouse' } })
    return e as unknown as PointerEvent
  }
  const mode = useGraphStore.getState().workspaceViewMode
  try {
    useGraphStore.getState().setWorkspaceViewMode('canvas')
    await act(async () => { root.render(React.createElement(Harness, { revision: 1 })) })
    startRichMediaPanelHeaderDrag(event('pointerdown', 10, 20), {
      onHeaderDragStart: ({ clientX, clientY }) => api!.beginHeaderDrag('figure', clientX, clientY),
      onHeaderDrag: ({ dx, dy, clientX, clientY }) => api!.moveHeaderDrag(dx, dy, clientX, clientY),
      onHeaderDragEnd: () => api!.endHeaderDrag(),
    }, host)
    await act(async () => { root.render(React.createElement(Harness, { revision: 2 })) })
    await act(async () => {
      window.dispatchEvent(event('pointermove', 80, 65))
      window.dispatchEvent(event('pointerup', 80, 65))
    })
    if (node.x !== 80 || node.y !== 65) throw new Error(`fast release or revision lost final drag: ${node.x},${node.y}`)
    if (node.fx != null || node.fy != null) throw new Error('release must clear temporary node locks')
  } finally {
    await act(async () => root.unmount())
    useGraphStore.getState().setWorkspaceViewMode(mode)
    restore()
  }
}
