export type ExportMenuActionKey =
  | 'duplicateInWorkspace'
  | 'workspaceFileJsonLd'
  | 'markdown'
  | 'png'
  | 'gltf'
  | 'glb'
  | 'mp4'
  | 'cancelMediaExport'
  | 'htmlWorkspace'
  | 'htmlViewer'
  | 'htmlCanvas'
  | 'json'
  | 'csv'
  | 'svg'
  | 'pdfPortrait'
  | 'pdfLandscape'

export type ExportMenuItem = {
  id: ExportMenuActionKey
  menuLabel: string
  toastLabel: string
}

export const WORKSPACE_EXPORT_MENU_ITEMS: readonly ExportMenuItem[] = [
  { id: 'duplicateInWorkspace', menuLabel: 'Duplicate in workspace', toastLabel: 'Duplicate in workspace' },
  { id: 'workspaceFileJsonLd', menuLabel: 'Workspace file (.jsonld)', toastLabel: 'Workspace file' },
  { id: 'markdown', menuLabel: 'Markdown (.md)', toastLabel: 'Markdown' },
  { id: 'png', menuLabel: 'PNG (.png)', toastLabel: 'PNG' },
  { id: 'gltf', menuLabel: 'GLTF (.gltf) - 3D scene', toastLabel: 'GLTF' },
  { id: 'mp4', menuLabel: 'MP4 (.mp4) — XR scene (silent)', toastLabel: 'XR MP4' },
  { id: 'cancelMediaExport', menuLabel: 'Cancel MP4 export', toastLabel: 'Cancel MP4 export' },
  { id: 'glb', menuLabel: 'GLB (.glb) - 3D scene', toastLabel: 'GLB' },
  { id: 'htmlWorkspace', menuLabel: 'HTML (.html) — Workspace', toastLabel: 'HTML Workspace' },
  { id: 'htmlViewer', menuLabel: 'HTML (.html) — Viewer', toastLabel: 'HTML Viewer' },
  { id: 'htmlCanvas', menuLabel: 'HTML (.html) — Canvas', toastLabel: 'HTML Canvas' },
  { id: 'json', menuLabel: 'JSON (.json)', toastLabel: 'JSON' },
  { id: 'csv', menuLabel: 'CSV (.csv)', toastLabel: 'CSV' },
  { id: 'svg', menuLabel: 'SVG (.svg)', toastLabel: 'SVG' },
  { id: 'pdfPortrait', menuLabel: 'PDF — Portrait 9:16 (Print…)', toastLabel: 'PDF Portrait' },
  { id: 'pdfLandscape', menuLabel: 'PDF — Landscape 16:9 (Print…)', toastLabel: 'PDF Landscape' },
]
