import { useGraphStore } from '@/hooks/useGraphStore'

export async function testActiveMarkdownDocumentSwitchStampsMutationGuardWithoutPresetReplay() {
  const previous = useGraphStore.getState()
  const previousPatch = {
    workspaceViewMode: previous.workspaceViewMode,
    workspaceCanvasPaneOpen: previous.workspaceCanvasPaneOpen,
    markdownWorkspaceIndexingInFlight: previous.markdownWorkspaceIndexingInFlight,
    workspaceGraphMutationBlockUntilMs: previous.workspaceGraphMutationBlockUntilMs,
    workspaceGraphMutationBlockKey: previous.workspaceGraphMutationBlockKey,
    canvasRenderMode: previous.canvasRenderMode,
    canvas2dRenderer: previous.canvas2dRenderer,
    frontmatterModeEnabled: previous.frontmatterModeEnabled,
    documentSemanticMode: previous.documentSemanticMode,
    markdownDocumentName: previous.markdownDocumentName,
    markdownDocumentText: previous.markdownDocumentText,
    markdownDocumentApplyViewPreset: previous.markdownDocumentApplyViewPreset,
  }

  try {
    useGraphStore.setState({
      workspaceViewMode: 'canvas',
      workspaceCanvasPaneOpen: false,
      markdownWorkspaceIndexingInFlight: false,
      workspaceGraphMutationBlockUntilMs: 0,
      workspaceGraphMutationBlockKey: '',
      canvasRenderMode: '2d',
      canvas2dRenderer: 'd3',
      frontmatterModeEnabled: false,
      documentSemanticMode: 'keyword',
      markdownDocumentName: null,
      markdownDocumentText: null,
      markdownDocumentApplyViewPreset: true,
    } as never)
    const text = [
      '---',
      'kgCanvasSurfaceMode: "2d"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      '---',
      '',
      '# Passive Source File',
    ].join('\n')

    const ok = await useGraphStore.getState().setActiveMarkdownDocument({
      name: 'passive-source-file.md',
      text,
      autoEnableFrontmatter: false,
      applyViewPreset: false,
      applyToGraph: false,
    })
    const st = useGraphStore.getState()
    if (ok !== true) throw new Error('expected passive active markdown document switch to complete')
    if (!st.workspaceGraphMutationBlockKey || st.workspaceGraphMutationBlockUntilMs <= Date.now()) {
      throw new Error('expected active Source Files document switch to stamp a live graph mutation guard')
    }
    if (st.canvas2dRenderer !== 'd3' || st.documentSemanticMode !== 'keyword' || st.frontmatterModeEnabled !== false) {
      throw new Error('expected passive active Source Files document switch not to replay YAML frontmatter view presets')
    }
  } finally {
    useGraphStore.setState(previousPatch as never)
  }
}
