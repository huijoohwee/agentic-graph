import { yamlQuote } from './yaml'
import { DEFAULT_URL_IMPORT_RENDERER, URL_IMPORT_RENDERERS } from '@/features/agent-ready/importUrlAgentReadyContract.mjs'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import type { Canvas2dRendererId } from '@/lib/config.render'

const rendererLabels = {
  'dashboard': 'Dashboard',
  'd3': 'D3 Graph',
  'design': 'Design',
  'storyboard': 'Storyboard',
} as const satisfies Partial<Record<Canvas2dRendererId, string>>

export type WorkspaceUrlImportCanvasRendererId = keyof typeof rendererLabels
export const WORKSPACE_URL_IMPORT_CANVAS_RENDERERS: readonly WorkspaceUrlImportCanvasRendererId[] = URL_IMPORT_RENDERERS
export const WORKSPACE_URL_IMPORT_DOCUMENT_MODES = ['document', 'keyword'] as const

export type WorkspaceUrlImportDocumentModeId = (typeof WORKSPACE_URL_IMPORT_DOCUMENT_MODES)[number]

export function isWorkspaceUrlImportCanvasRendererId(value: unknown): value is WorkspaceUrlImportCanvasRendererId {
  return WORKSPACE_URL_IMPORT_CANVAS_RENDERERS.some(renderer => renderer === value)
}

export function isWorkspaceUrlImportDocumentModeId(value: unknown): value is WorkspaceUrlImportDocumentModeId {
  return value === 'document' || value === 'keyword'
}

export function normalizeWorkspaceUrlImportDocumentMode(value: unknown): WorkspaceUrlImportDocumentModeId {
  return value === 'keyword' ? 'keyword' : 'document'
}

export function getWorkspaceUrlImportCanvasRendererLabel(value: WorkspaceUrlImportCanvasRendererId): string {
  return rendererLabels[value]
}

export function getWorkspaceUrlImportDocumentModeLabel(value: WorkspaceUrlImportDocumentModeId): string {
  return value === 'keyword' ? 'Keyword Mode' : 'Document Structure Mode'
}

export const DEFAULT_URL_IMPORT_CANVAS_PRESET = {
  canvasSurfaceMode: '2d',
  canvasRenderMode: '2d',
  canvas2dRenderer: DEFAULT_URL_IMPORT_RENDERER,
  documentSemanticMode: 'document',
  frontmatterModeEnabled: false,
  multiDimTableModeEnabled: false,
} as const satisfies CanvasWorkspaceFrontmatterPreset

export const normalizeWorkspaceUrlImportCanvas2dRenderer = (value: unknown): WorkspaceUrlImportCanvasRendererId | null => {
  return isWorkspaceUrlImportCanvasRendererId(value) ? value : null
}

export const getWorkspaceUrlImportCanvasPreset = (
  canvas2dRenderer: Canvas2dRendererId | null | undefined,
  documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null,
): CanvasWorkspaceFrontmatterPreset | null => {
  if (!isWorkspaceUrlImportCanvasRendererId(canvas2dRenderer)) return null
  return { ...DEFAULT_URL_IMPORT_CANVAS_PRESET, canvas2dRenderer, documentSemanticMode: normalizeWorkspaceUrlImportDocumentMode(documentSemanticMode) }
}

export function buildCanvasPresetLines(preset: CanvasWorkspaceFrontmatterPreset | null | undefined): string[] {
  if (!preset) return []
  const lines: string[] = []
  if (preset.canvasSurfaceMode) lines.push(`kgCanvasSurfaceMode: ${yamlQuote(preset.canvasSurfaceMode)}`)
  if (preset.canvasRenderMode) lines.push(`kgCanvasRenderMode: ${yamlQuote(preset.canvasRenderMode)}`)
  if (preset.canvas3dMode) lines.push(`kgCanvas3dMode: ${yamlQuote(preset.canvas3dMode)}`)
  if (preset.canvas2dRenderer) lines.push(`kgCanvas2dRenderer: ${yamlQuote(preset.canvas2dRenderer)}`)
  if (preset.documentSemanticMode) lines.push(`kgDocumentSemanticMode: ${yamlQuote(preset.documentSemanticMode)}`)
  if (preset.frontmatterModeEnabled != null) lines.push(`kgFrontmatterModeEnabled: ${yamlQuote(preset.frontmatterModeEnabled ? 'true' : 'false')}`)
  if (preset.multiDimTableModeEnabled != null) {
    lines.push(`kgMultiDimTableModeEnabled: ${yamlQuote(preset.multiDimTableModeEnabled ? 'true' : 'false')}`)
  }
  if (preset.documentStructureBaselineLock != null) {
    lines.push(`kgDocumentStructureBaselineLock: ${yamlQuote(preset.documentStructureBaselineLock ? 'true' : 'false')}`)
  }
  return lines
}

export function videoUrlImportCanvasLines(
  renderer?: Canvas2dRendererId | null,
  mode?: WorkspaceUrlImportDocumentModeId | null,
): string[] {
  return buildCanvasPresetLines({
    canvasRenderMode: '2d',
    canvas2dRenderer: normalizeWorkspaceUrlImportCanvas2dRenderer(renderer) ?? DEFAULT_URL_IMPORT_RENDERER,
    documentSemanticMode: normalizeWorkspaceUrlImportDocumentMode(mode),
  })
}

export function withUrlImportRendererDefault(
  preset: CanvasWorkspaceFrontmatterPreset | null, sourceUrl?: string | null,
): CanvasWorkspaceFrontmatterPreset | null {
  if (!/^https?:\/\//i.test(sourceUrl || '') || preset?.canvas2dRenderer || preset?.canvas3dMode
    || (preset?.canvasRenderMode && preset.canvasRenderMode !== '2d')
    || (preset?.canvasSurfaceMode && preset.canvasSurfaceMode !== '2d')) return preset
  return { ...preset, canvasRenderMode: '2d', canvas2dRenderer: DEFAULT_URL_IMPORT_RENDERER }
}
