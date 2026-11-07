import { resolvePanelStackBaseZIndex, Z_INDEX_FLOATING_PANEL_DEFAULT } from './zIndex'

export type PanelStackId = 'bottom' | 'floating' | 'main'
const INITIAL_ORDER: readonly PanelStackId[] = ['bottom', 'floating', 'main']

/** A bounded presentation order; mounting and focus never persist workspace state. */
export function createPanelStackController() {
  let order = [...INITIAL_ORDER]
  const entries = new Map<PanelStackId, Map<symbol, number>>()
  const listeners = new Set<() => void>()
  const emit = () => { for (const listener of [...listeners]) listener() }
  const baseFor = (id: PanelStackId, value: number) => Math.max(
    id === 'main' ? 1000 : 1, resolvePanelStackBaseZIndex(value),
  )
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    register(id: PanelStackId, baseZ = Z_INDEX_FLOATING_PANEL_DEFAULT) {
      const token = Symbol(id)
      const registrations = entries.get(id) ?? new Map<symbol, number>()
      registrations.set(token, baseFor(id, baseZ))
      entries.set(id, registrations)
      emit()
      return () => {
        if (!registrations.delete(token)) return
        if (registrations.size === 0) entries.delete(id)
        if (entries.size === 0) order = [...INITIAL_ORDER]
        emit()
      }
    },
    bringToFront(id: PanelStackId) {
      if (!entries.has(id)) return
      const activeOrder = order.filter(candidate => entries.has(candidate))
      const top = activeOrder[activeOrder.length - 1]
      if (top === id) return
      order = [...order.filter(candidate => candidate !== id), id]
      emit()
    },
    getZIndex(id: PanelStackId, fallback = Z_INDEX_FLOATING_PANEL_DEFAULT) {
      // The common maximum preserves every caller's floor without locking its rank.
      const base = Math.max(baseFor(id, fallback), ...[...entries.values()].flatMap(values => [...values.values()]))
      return base + order.indexOf(id)
    },
  }
}

export const panelStack = createPanelStackController()
