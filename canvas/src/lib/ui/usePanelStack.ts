import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react'
import type { FocusEventHandler, PointerEventHandler, SyntheticEvent } from 'react'
import { panelStack, type PanelStackId } from './panelStack'
import { resolvePanelStackBaseZIndex, Z_INDEX_FLOATING_PANEL_DEFAULT } from './zIndex'

function ownsEvent(event: SyntheticEvent<HTMLElement>): boolean {
  const { currentTarget, target } = event
  // React portals bubble through their component parent, outside its DOM panel.
  if (!target || !currentTarget.contains(target as Node)) return false
  const element = (target as Node).nodeType === 1 ? target as Element : (target as Node).parentElement
  const nearestPanel = element?.closest('[data-kg-panel-layer]')
  return !nearestPanel || nearestPanel === currentTarget
}

export function usePanelStack(
  id: PanelStackId, baseZ = Z_INDEX_FLOATING_PANEL_DEFAULT, active = true,
) {
  const base = resolvePanelStackBaseZIndex(baseZ)
  useLayoutEffect(() => active ? panelStack.register(id, base) : undefined, [id, base, active])
  const snapshot = useCallback(() => active ? panelStack.getZIndex(id, base) : base, [active, base, id])
  const zIndex = useSyncExternalStore(panelStack.subscribe, snapshot, snapshot)
  const activate = useCallback((event: SyntheticEvent<HTMLElement>) => {
    if (active && ownsEvent(event)) panelStack.bringToFront(id)
  }, [id, active])
  return {
    zIndex,
    onPointerDownCapture: activate as PointerEventHandler<HTMLElement>,
    onFocusCapture: activate as FocusEventHandler<HTMLElement>,
  }
}
