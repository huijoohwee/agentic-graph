import type {
  WorkspaceEntry,
  WorkspaceFs,
} from '@/features/workspace-fs/types'
import { CITY_SIM_DOCUMENT_PATH } from '@/features/game-city-sim/citySimModel'
import { useGraphStore } from '@/hooks/useGraphStore'

type StoreSnapshot = ReturnType<typeof useGraphStore.getState>

export function createCityWorkspace(initialDocument?: string): WorkspaceFs {
  const entries = new Map<string, WorkspaceEntry>()
  entries.set('/', {
    path: '/',
    parentPath: null,
    kind: 'folder',
    name: '',
    updatedAtMs: 0,
  })
  if (initialDocument !== undefined) {
    entries.set('/game-city-sim', {
      path: '/game-city-sim',
      parentPath: '/',
      kind: 'folder',
      name: 'game-city-sim',
      updatedAtMs: 0,
    })
    entries.set(CITY_SIM_DOCUMENT_PATH, {
      path: CITY_SIM_DOCUMENT_PATH,
      parentPath: '/game-city-sim',
      kind: 'file',
      name: 'city-grid.md',
      text: initialDocument,
      updatedAtMs: 0,
    })
  }
  return {
    ensureSeed: async () => false,
    listEntries: async () => [...entries.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    readFileText: async path => {
      const entry = entries.get(path)
      return entry?.kind === 'file' ? String(entry.text ?? '') : null
    },
    writeFileText: async (path, text) => {
      const entry = entries.get(path)
      if (!entry || entry.kind !== 'file') {
        throw new Error(`Cannot write missing city test file ${path}`)
      }
      entries.set(path, { ...entry, text, updatedAtMs: entry.updatedAtMs + 1 })
    },
    createFolder: async ({ parentPath, name }) => {
      const path = `${parentPath === '/' ? '' : parentPath}/${name}`
      entries.set(path, {
        path,
        parentPath,
        kind: 'folder',
        name,
        updatedAtMs: 0,
      })
      return path
    },
    createFile: async ({ parentPath, name, text }) => {
      const path = `${parentPath === '/' ? '' : parentPath}/${name}`
      entries.set(path, {
        path,
        parentPath,
        kind: 'file',
        name,
        text,
        updatedAtMs: 0,
      })
      return path
    },
    deleteEntry: async path => {
      const prefix = `${path}/`
      for (const candidate of [...entries.keys()]) {
        if (candidate === path || candidate.startsWith(prefix)) {
          entries.delete(candidate)
        }
      }
    },
  }
}

export function captureStoreState(): Pick<
  StoreSnapshot,
  | 'canvasRenderMode'
  | 'canvas3dMode'
  | 'canvasRenderModeLastFree'
  | 'canvasRenderModeIsAuto'
  | 'canvas2dRenderer'
  | 'documentSemanticMode'
  | 'frontmatterModeEnabled'
  | 'multiDimTableModeEnabled'
  | 'floatingPanelOpen'
  | 'floatingPanelView'
  | 'schema'
> {
  const state = useGraphStore.getState()
  return {
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    canvas2dRenderer: state.canvas2dRenderer,
    documentSemanticMode: state.documentSemanticMode,
    frontmatterModeEnabled: state.frontmatterModeEnabled,
    multiDimTableModeEnabled: state.multiDimTableModeEnabled,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    schema: state.schema,
  }
}

export function prepareCitySurface(): void {
  useGraphStore.setState({
    canvasRenderMode: '2d',
    canvas3dMode: '3d',
    canvasRenderModeLastFree: '2d',
    canvasRenderModeIsAuto: false,
    canvas2dRenderer: 'd3',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    floatingPanelOpen: true,
    floatingPanelView: 'media',
    schema: {
      layout: { mode: 'block' },
      behavior: {
        allowEdgeCreation: true,
        allowNodeDrag: true,
      },
      nodeStyles: {},
      edgeStyles: {},
      rules: [],
    },
  } as never)
}
