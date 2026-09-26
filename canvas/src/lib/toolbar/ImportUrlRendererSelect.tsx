import React from 'react'
import { UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  WORKSPACE_URL_IMPORT_DOCUMENT_MODES,
  WORKSPACE_URL_IMPORT_CANVAS_RENDERERS,
  getWorkspaceUrlImportDocumentModeLabel,
  getWorkspaceUrlImportCanvasRendererLabel,
  isWorkspaceUrlImportDocumentModeId,
  isWorkspaceUrlImportCanvasRendererId,
  type WorkspaceUrlImportCanvasRendererId,
  type WorkspaceUrlImportDocumentModeId,
} from '@/features/markdown-workspace/workspaceImport/canvasPresets'

export type ImportUrlRendererPresetOptions = {
  canvas2dRenderer: WorkspaceUrlImportCanvasRendererId
  documentSemanticMode: WorkspaceUrlImportDocumentModeId
}
export type ImportUrlRendererSelection = 'default' | `${WorkspaceUrlImportCanvasRendererId}:${WorkspaceUrlImportDocumentModeId}`
export const DESIGN_IMPORT_URL_RENDERER_SELECTION: ImportUrlRendererSelection = 'design:document'

export function parseImportUrlRendererSelection(value: unknown): ImportUrlRendererPresetOptions | null {
  const raw = String(value || '').trim()
  const [rendererRaw, modeRaw] = raw.split(':')
  if (!isWorkspaceUrlImportCanvasRendererId(rendererRaw)) return null
  if (!isWorkspaceUrlImportDocumentModeId(modeRaw)) return null
  return {
    canvas2dRenderer: rendererRaw,
    documentSemanticMode: modeRaw,
  }
}

export function normalizeImportUrlRendererSelection(value: unknown): ImportUrlRendererSelection {
  const parsed = parseImportUrlRendererSelection(value)
  if (parsed) return `${parsed.canvas2dRenderer}:${parsed.documentSemanticMode}`
  return 'default'
}

export function ImportUrlRendererSelect(props: {
  value: ImportUrlRendererSelection
  onChange: (next: ImportUrlRendererSelection) => void
}) {
  return (
    <select
      className={cn(
        UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME,
        'w-full min-h-11 rounded border text-xs',
        UI_THEME_TOKENS.input.border,
        UI_THEME_TOKENS.input.bg,
        UI_THEME_TOKENS.input.text,
      )}
      value={props.value}
      onChange={e => props.onChange(normalizeImportUrlRendererSelection(e.target.value))}
      aria-label="Import URL renderer"
      title="Optional 2D Canvas layout"
    >
      <option value="default">Automatic (source defaults)</option>
      {WORKSPACE_URL_IMPORT_CANVAS_RENDERERS.map(renderer => (
        <optgroup key={renderer} label={getWorkspaceUrlImportCanvasRendererLabel(renderer)}>
          {WORKSPACE_URL_IMPORT_DOCUMENT_MODES.map(mode => (
            <option key={`${renderer}:${mode}`} value={`${renderer}:${mode}`}>
              {`${getWorkspaceUrlImportCanvasRendererLabel(renderer)} / ${getWorkspaceUrlImportDocumentModeLabel(mode)}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
