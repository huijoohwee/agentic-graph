import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(process.cwd(), '..', repoRelativePath), 'utf8')

export function testDesignEditorBaselinePrdTadUsesImplementedDesignOwners(): void {
  const docs = readRepoFile('docs/documents/agenticgraph-design-editor-baseline-prd-tad.md')
  const owners = [
    'canvas/src/features/panels/mainPanelTabs.ts',
    'canvas/src/features/panels/MainPanel.tsx',
    'canvas/src/features/panels/views/DesignEditorMainPanelView.tsx',
    'canvas/src/components/DesignCanvas.tsx',
    'canvas/src/components/DesignCanvas/DesignCanvasRenderShell.tsx',
    'canvas/src/components/DesignCanvas/DesignCanvasEditorChrome.tsx',
    'canvas/src/components/DesignCanvas/useFrameDragController.ts',
    'canvas/src/components/DesignCanvas/useResizeMarqueeController.ts',
    'canvas/src/features/design/DesignFloatingPanelView.tsx',
    'canvas/src/features/design/DesignAgentVideoPanel.tsx',
    'canvas/src/features/design/designAgentVideoSpec.ts',
    'canvas/src/features/design/DesignLayersPanel.tsx',
    'canvas/src/features/design/DesignInspectorPanel.tsx',
    'canvas/src/features/design/DesignTokensPanel.tsx',
    'canvas/src/features/design/designTokenSummary.ts',
    'canvas/src/hooks/store/designHistorySlice.ts',
  ].map(readRepoFile).join('\n')

  const requiredDocTokens = [
    '**Status**: Accepted and implemented Design editor baseline',
    'Document Version**: 0.3.0',
    'Design editor baseline is implemented natively in AgenticGraph',
    'MainPanel Design tab | Shipped',
    'Shipped | `canvas/src/features/panels/mainPanelTabs.ts`; `canvas/src/features/panels/MainPanel.tsx`; `canvas/src/features/panels/views/DesignEditorMainPanelView.tsx`',
    'Editor chrome | Shipped | `canvas/src/components/DesignCanvas/DesignCanvasEditorChrome.tsx`',
    'Layers, Style, tokens, DOM tree, DOM inspect panels | Shipped | `canvas/src/features/design/DesignFloatingPanelView.tsx`',
    'Agent-native HTML video render | Shipped | `canvas/src/features/design/designAgentVideoSpec.ts`; `canvas/src/features/design/DesignAgentVideoPanel.tsx`',
    'Design-only history | Shipped | `canvas/src/hooks/store/designHistorySlice.ts`; `canvas/src/hooks/store/store-types/graph-state-design-history.ts`',
    "buildScopedGraphSemanticKey('design-token-summary'",
    'Any future collaborative Design operations must add source owners and tests before this document can mark them implemented.',
  ]
  for (const token of requiredDocTokens) {
    if (!docs.includes(token)) {
      throw new Error(`Expected Design PRD/TAD docs to include ${JSON.stringify(token)}`)
    }
  }

  const requiredOwnerTokens = [
    "key: 'design'",
    'DesignEditorMainPanelViewLazy',
    'DesignFloatingPanelView',
    'DesignCanvasEditorChrome',
    'setCanvasPointerMode2d',
    'dispatchRuntimeFitToViewSoon',
    'undoDesignHistory',
    'redoDesignHistory',
    'commitDesignFrameRectHistory',
    'commitDesignFramePosHistory',
    'commitDesignLayerStateHistory',
    'useFrameDragController',
    'useResizeMarqueeController',
    'DesignLayersPanel',
    'DesignInspectorPanel',
    'DesignTokensPanel',
    "buildScopedGraphSemanticKey('design-token-summary'",
    "buildScopedGraphSemanticKey('design-agent-video'",
    'createHtmlVideoEngineRegistryFromRuntimeConfig()',
  ]
  for (const token of requiredOwnerTokens) {
    if (!owners.includes(token)) {
      throw new Error(`Expected Design source owner token ${JSON.stringify(token)}`)
    }
  }

  const forbiddenDocTokens = [
    '**Status**: Proposed',
    'Proposed (Dev-only first)',
    'not yet a cohesive design-editor experience',
    'No Design-only undo/redo',
    'Design editor affordances are hidden',
    '0% | 100% of Design edits',
    'Introduce a DesignHistorySlice',
  ]
  for (const token of forbiddenDocTokens) {
    if (docs.includes(token)) {
      throw new Error(`Expected Design PRD/TAD docs to remove ${JSON.stringify(token)}`)
    }
  }
}
