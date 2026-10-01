import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

/** Recovery follows the shared pointer owner's release/commit; it never races it. */
export function useThreeOverlayDragRecovery(args: {
  draggedNodeIdRef: MutableRefObject<string | null>
  dragOverridesRef: MutableRefObject<Record<string, [number, number, number]>>
  screenDragOverridesRef: MutableRefObject<Record<string, { sx: number; sy: number }>>
  headerDragRef: MutableRefObject<{ id: string; pointerId: number } | null>
  overlayPanRef: MutableRefObject<{ pointerId: number } | null>
  setDraggedNodeId: Dispatch<SetStateAction<string | null>>
}) {
  const { draggedNodeIdRef, dragOverridesRef, screenDragOverridesRef, headerDragRef, overlayPanRef, setDraggedNodeId } = args
  useEffect(() => {
    let disposed = false
    const clearStale = () => {
      const header = headerDragRef.current
      if (header) {
        delete dragOverridesRef.current[header.id]
        delete screenDragOverridesRef.current[header.id]
        headerDragRef.current = null
      }
      overlayPanRef.current = null
      if (draggedNodeIdRef.current != null) setDraggedNodeId(null)
    }
    const afterRelease = (event: PointerEvent) => {
      const header = headerDragRef.current
      const pan = overlayPanRef.current
      if (event.pointerId !== header?.pointerId && event.pointerId !== pan?.pointerId) return
      // Native dispatch can run microtasks between capture and the drag owner's listener.
      setTimeout(() => {
        if (!disposed && headerDragRef.current === header && overlayPanRef.current === pan) clearStale()
      }, 0)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') clearStale() }
    window.addEventListener('pointerup', afterRelease, true)
    window.addEventListener('pointercancel', afterRelease, true)
    window.addEventListener('pointerdown', clearStale, true)
    window.addEventListener('blur', clearStale)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.removeEventListener('pointerup', afterRelease, true)
      window.removeEventListener('pointercancel', afterRelease, true)
      window.removeEventListener('pointerdown', clearStale, true)
      window.removeEventListener('blur', clearStale)
      document.removeEventListener('visibilitychange', onVisibility)
      clearStale()
    }
  }, [draggedNodeIdRef, dragOverridesRef, screenDragOverridesRef, headerDragRef, overlayPanRef, setDraggedNodeId])
}
