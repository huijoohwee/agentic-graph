import { create } from 'zustand'
import type { SupplyChainMode } from './supplyChainScenario'

export type SupplyChainSelection = { kind: 'facility' | 'consignment'; id: string }
export type SupplyChainEntityFilter = 'all' | 'infrastructure' | 'resources'

type SupplyChainViewState = {
  selection: SupplyChainSelection
  modeFilter: SupplyChainMode | 'all'
  entityFilter: SupplyChainEntityFilter
  showLabels: boolean
  showEvents: boolean
  setSelection: (selection: SupplyChainSelection) => void
  setModeFilter: (mode: SupplyChainMode | 'all') => void
  setEntityFilter: (filter: SupplyChainEntityFilter) => void
  setShowLabels: (show: boolean) => void
  setShowEvents: (show: boolean) => void
}

export const useSupplyChainViewStore = create<SupplyChainViewState>(set => ({
  selection: { kind: 'consignment', id: 'consignment.air-2048' },
  modeFilter: 'all',
  entityFilter: 'all',
  showLabels: true,
  showEvents: true,
  setSelection: selection => set({ selection }),
  setModeFilter: modeFilter => set({ modeFilter }),
  setEntityFilter: entityFilter => set({ entityFilter }),
  setShowLabels: showLabels => set({ showLabels }),
  setShowEvents: showEvents => set({ showEvents }),
}))
