import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'

export type MarkdownWorkspaceRuntimeGetFs = () => Promise<WorkspaceFs>

export type MarkdownWorkspaceRuntimeSetActiveDocument = (args: {
  name: string
  text: string
  normalizeMermaidMmd?: boolean
  autoEnableFrontmatter?: boolean
  applyViewPreset?: boolean
  applyToGraph?: boolean
  forceApplyToGraph?: boolean
  canvasWorkspacePreset?: CanvasWorkspaceFrontmatterPreset | null
  sourceUrl?: string | null
  jsonSourceText?: string | null
  canonicalMarkdownText?: string | null
  expectedCurrentDocumentName?: string | null
  expectedCurrentDocumentText?: string | null
}) => Promise<boolean>
