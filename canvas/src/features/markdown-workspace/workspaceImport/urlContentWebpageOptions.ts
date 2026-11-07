import type { Canvas2dRendererId } from '@/lib/config.render'
import { restoreWebpageMarkdownSyntaxFidelity } from '@/lib/markdown/webpageMarkdownSyntaxFidelity'
import { normalizeWebpageCardAndListBlocks } from './htmlTextFallback'
import type { FetchMode, WebpageViewMode } from './urlContentHeuristics'
import type { getWorkspaceUrlImportCanvasPreset } from './canvasPresets'

export type FetchWorkspaceUrlContentOpts = {
  mode?: FetchMode
  onProgress?: (percentage: number) => void
  viewHint?: WebpageViewMode
  canvas2dRenderer?: Canvas2dRendererId | null
  documentSemanticMode?: 'document' | 'keyword' | null
  preferDirectFetch?: boolean
  bypassCache?: boolean
  browserSessionId?: string
  signal?: AbortSignal
}

export const normalizeRecoveredWebpageMarkdown = (markdown: string): string =>
  restoreWebpageMarkdownSyntaxFidelity(normalizeWebpageCardAndListBlocks(markdown)).trim()
