import type { GraphStateFiles } from './graph-state-files'
import type { GraphStateStructure } from './graph-state-structure'
import type { GraphStateEditorUi } from './graph-state-editor-ui'
import type { GraphStateChatImport } from './graph-state-chat-import'
import type { GraphStatePanelsMarkdown } from './graph-state-panels-markdown'
import type { GraphStateCanvasRuntime } from './graph-state-canvas-runtime'
import type { GraphStateDesignHistory } from './graph-state-design-history'
import type { DarkThemeVariant } from '@/lib/ui/theme'

export interface GraphState extends
  GraphStateFiles,
  GraphStateStructure,
  GraphStateEditorUi,
  GraphStateChatImport,
  GraphStatePanelsMarkdown,
  GraphStateCanvasRuntime,
  GraphStateDesignHistory {
  darkThemeVariant: DarkThemeVariant
  setDarkThemeVariant: (variant: DarkThemeVariant) => void
}
