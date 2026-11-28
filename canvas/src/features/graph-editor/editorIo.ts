import type { GraphData } from '@/lib/graph/types'
import { pickTextFileWithExtensions } from '@/lib/graph/file'
import { useGraphStore } from '@/hooks/useGraphStore'
import { exportGraphJsonFromStore } from '@/features/parsers/storeExportActions'

export async function importGraphEditorJsonLocal() {
  try {
    const picked = await pickTextFileWithExtensions(['.json'])
    if (!picked) return
    const raw = JSON.parse(picked.text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const graphData = raw as GraphData
    const store = useGraphStore.getState()
    if (store.canvasAuthoringTurn) return
    store.setGraphData(graphData)
    store.setWorkspaceViewMode('editor')
  } catch {
    void 0
  }
}

export function exportGraphEditorJson() {
  try {
    exportGraphJsonFromStore()
  } catch {
    void 0
  }
}

