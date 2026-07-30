import { resolveActiveMarkdownBaseGraph } from '@/hooks/active-graph-data/useActiveGraphData.impl'
import { readWorkspaceActiveDocumentResolvedText } from '@/features/source-files/sourceFilesRuntimeActive'
import { shouldProactivelyReapplyActiveWorkspaceMarkdownDocument } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testSourceFilesActiveGraphRejectsUnownedCanvasGraphForSelectedFile() {
  const staleGraph = {
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      source: '',
    },
    nodes: [
      { id: 'stale', label: 'Stale graph' },
    ],
    edges: [],
  } as never
  const active = resolveActiveMarkdownBaseGraph({
    baseGraphDataRaw: staleGraph,
    markdownName: 'docs/knowgrph-design-demo.md',
    markdownText: '---\nkgCanvas2dRenderer: "storyboard"\n---\n# Design',
  })
  const meta = ((active?.metadata || null) as Record<string, unknown> | null) || {}
  if (String(meta.source || '') !== 'markdown:docs/knowgrph-design-demo.md' || meta.pending !== true) {
    throw new Error(`expected active graph derivation to replace unowned stale graph with selected-document pending graph, got ${JSON.stringify(meta)}`)
  }
  if ((active?.nodes || []).some(node => String(node.id || '') === 'stale')) {
    throw new Error('expected active graph derivation to suppress stale unowned Canvas nodes after Source Files switch')
  }
}

export function testSourceFilesActiveWorkspaceReapplyAllowsEditorWorkspaceCanvasPane() {
  const shouldApply = shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath: '/docs/knowgrph-design-demo.md',
    markdownDocumentName: 'docs/model-asset-source.md',
    markdownDocumentText: '---\nkgCanvasSurfaceMode: "xr"\n---\n# XR',
    markdownDocumentApplyViewPreset: true,
  })
  if (!shouldApply) {
    throw new Error('expected Source Files active path switching to reapply the selected Markdown document/frontmatter with the Editor Workspace open')
  }
}

export async function testSourceFilesModelAssetSwitchUsesFileTypeFallbackCanvasPreset() {
  const modelAssetPath = '/docs/model-asset-source.glb'
  const modelAssetName = 'docs/model-asset-source.glb'
  const resolvedText = await readWorkspaceActiveDocumentResolvedText({
    activePath: modelAssetPath,
    currentText: 'glTF\u0002\u0000\u0000\u0000',
    fs: {
      readFileText: async () => '',
    } as never,
  })
  if (!resolvedText.includes('kgAssetFormat: "glb"') || !resolvedText.includes('kgCanvasSurfaceMode: "xr"')) {
    throw new Error(`expected empty GLB Source Files selection to synthesize XR model-asset frontmatter, got ${resolvedText}`)
  }

  useGraphStore.getState().resetAll()
  useGraphStore.getState().setCanvasRenderMode('2d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  const applied = await useGraphStore.getState().setActiveMarkdownDocument({
    name: modelAssetName,
    text: resolvedText,
    autoEnableFrontmatter: true,
    applyViewPreset: true,
    applyToGraph: true,
    forceApplyToGraph: true,
    normalizeMermaidMmd: false,
  })
  const state = useGraphStore.getState()
  if (applied !== true) {
    throw new Error('expected GLB Source Files switch to complete from synthesized model-asset document')
  }
  if (state.canvasRenderMode !== '3d' || state.canvas3dMode !== 'xr') {
    throw new Error(`expected GLB Source Files switch to apply XR Canvas preset, got ${state.canvasRenderMode}/${state.canvas3dMode}`)
  }
  if (state.markdownDocumentName !== modelAssetName || state.markdownDocumentText !== resolvedText) {
    throw new Error('expected active markdown document to reflect selected GLB fallback manifest')
  }
}
