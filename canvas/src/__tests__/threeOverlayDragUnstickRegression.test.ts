import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useThreeOverlayDragRecovery } from '@/lib/three/useThreeOverlayDragRecovery'
import { startRichMediaPanelHeaderDrag } from '@/components/RichMediaPanelOverlayDrag'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testThreeGraphHasOverlayDragGlobalFailsafe() {
  const { dom, restore } = initJsdomHarness()
  const target = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(target)
  const root = createRoot(target)
  const headerDragRef = { current: null as { id: string; pointerId: number } | null }
  const dragOverridesRef = { current: {} as Record<string, [number, number, number]> }
  const screenDragOverridesRef = { current: {} as Record<string, { sx: number; sy: number }> }
  const draggedNodeIdRef = { current: null as string | null }
  const overlayPanRef = { current: null as { pointerId: number } | null }
  const setDraggedNodeId: React.Dispatch<React.SetStateAction<string | null>> = value => {
    draggedNodeIdRef.current = typeof value === 'function' ? value(draggedNodeIdRef.current) : value
  }
  const Harness = () => {
    useThreeOverlayDragRecovery({ headerDragRef, dragOverridesRef, screenDragOverridesRef, draggedNodeIdRef, overlayPanRef, setDraggedNodeId })
    return null
  }
  const event = (type: string, pointerId: number, clientX = 0) => {
    const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX, buttons: type === 'pointerup' ? 0 : 1 })
    Object.defineProperties(e, { pointerId: { value: pointerId }, pointerType: { value: 'mouse' } })
    return e as unknown as PointerEvent
  }
  try {
    await act(async () => { root.render(React.createElement(Harness)) })
    let committed = -1
    await act(async () => {
      window.dispatchEvent(event('pointerdown', 8))
      startRichMediaPanelHeaderDrag(event('pointerdown', 8), {
        onHeaderDragStart: ({ pointerId }) => {
          headerDragRef.current = { id: 'figure', pointerId }
          draggedNodeIdRef.current = 'figure'
        },
        onHeaderDrag: ({ dx }) => { dragOverridesRef.current.figure = [dx, 0, 0] },
        onHeaderDragEnd: () => {
          committed = dragOverridesRef.current.figure?.[0] ?? -1
          delete dragOverridesRef.current.figure
          headerDragRef.current = null
          setDraggedNodeId(null)
        },
      }, target)
      window.dispatchEvent(event('pointermove', 8, 75))
      window.dispatchEvent(event('pointerup', 8, 75))
    })
    if (committed !== 75) throw new Error(`release must commit final drag position before recovery: ${committed}`)
    headerDragRef.current = { id: 'stale', pointerId: 9 }
    draggedNodeIdRef.current = 'stale'
    dragOverridesRef.current.stale = [1, 2, 3]
    window.dispatchEvent(event('pointerup', 90))
    await new Promise(resolve => setTimeout(resolve, 0))
    if (!headerDragRef.current) throw new Error('unrelated pointer must not cancel active drag')
    window.dispatchEvent(event('pointercancel', 9))
    await Promise.resolve()
    if (!headerDragRef.current) throw new Error('native capture microtask checkpoint must not race the pointer owner')
    await new Promise(resolve => setTimeout(resolve, 0))
    if (headerDragRef.current || dragOverridesRef.current.stale || draggedNodeIdRef.current) throw new Error('abandoned drag must recover after cancellation')
    headerDragRef.current = { id: 'old', pointerId: 10 }
    window.dispatchEvent(event('pointerup', 10))
    headerDragRef.current = { id: 'new', pointerId: 11 }
    await new Promise(resolve => setTimeout(resolve, 0))
    if (headerDragRef.current?.id !== 'new') throw new Error('queued recovery must not clear a replacement drag')
    window.dispatchEvent(new dom.window.Event('blur'))
    if (headerDragRef.current) throw new Error('blur must release abandoned drag state')
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}
