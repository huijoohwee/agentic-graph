import { dump as dumpYaml, load as parseYaml } from 'js-yaml'
import { getMarkdownWorkspaceActionBridge, type WorkspaceAgentGraphArtifactRequest } from '@/features/markdown-explorer/workspaceActionBridge'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { buildAgentGraphCanvasProjection } from '@/features/agent-graph/agentGraphCanvasProjection'
import { createAgentGraphHostAdapter } from '@/features/agent-graph/agentGraphHostAdapter'
import { buildAgentGraphWorkspaceArtifactMarkdown, retainAgentGraphWorkspaceProjection } from '@/features/agent-graph/agentGraphWorkspaceArtifact'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { activateFirstImportedWorkspaceFile } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { useGraphStore } from '@/hooks/useGraphStore'
import { whenFloatingPanelBridgeReady } from '@/features/toolbar/floatingPanelBridge'
import { openFloatingPanelChat } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { handoffLiveCanvasHeroDemoHistory } from './activateLiveCanvasHeroDemo'
import { LIVE_CANVAS_HERO_DEMO_SOURCE, type LiveCanvasHeroDemo } from './liveCanvasHeroDemoSource'
import type { LiveCanvasHeroPresetSelection } from './liveCanvasHeroPresetDemo'

export function buildLiveCanvasHeroRepositoryDemoDocument(
  selection: LiveCanvasHeroPresetSelection, demo: LiveCanvasHeroDemo, id: string,
  request: WorkspaceAgentGraphArtifactRequest, projectionPath: string,
) {
  const graph = buildAgentGraphCanvasProjection(request.result)
  const { counts, acquisition, projection } = request.result
  const clusters = new Set(graph.nodes.map(node => node.properties['visual:layer']).filter(Boolean)).size
  const reply = [
    `Imported [${demo.repository}](${demo.repository}) into the knowledge graph canvas.`,
    `Acquired commit: ${acquisition?.commitSha || 'unavailable'}.`,
    `Parsed snapshot: ${counts.sources} source files, ${counts.nodes} nodes, ${counts.edges} edges.`,
    `2D Renderer: D3. Visible projection: ${graph.nodes.length} nodes, ${clusters} source-directory clusters, ${graph.edges.length} edges.`,
    projection.truncated ? 'The canvas is a bounded projection. Native graph queries inspect the full parsed snapshot.' : 'The complete snapshot fits on the canvas.',
    '', 'Select a node, source-directory cluster or edge in D3. Inspect its source path and parser explanation before using it as evidence.',
    'Submit the selected /launch-copilot outline reference prompt to create the five editable PRD, TAD, ADR, MVP and GTM documents without a model call. Proposed work stays NEW in a separate overlay.',
    '', 'The following planning examples are hypotheses, not generated proposals or code evidence.',
    ...demo.outputs.flatMap(output => [`### ${output.title}`, '', output.text, '']),
  ].join('\n').trim()
  const messages: ChatMessage[] = [
    { id: `${id}:prompt`, role: 'user', content: `Import URL: ${demo.repository}\n\n${selection.prompt}` },
    { id: `${id}:import`, role: 'assistant', content: reply },
  ]
  const receipt = extractYamlFrontmatterBlock(buildAgentGraphWorkspaceArtifactMarkdown(request, { projectionPath }))!
  const meta = { ...parseYaml(receipt.yamlText) as Record<string, unknown>,
    title: `${demo.title} · Codebase demo`, graphId: id, demo_only: true,
    demo_source: LIVE_CANVAS_HERO_DEMO_SOURCE, preset_id: selection.id,
    prompt_source: 'agentic-canvas-os/docs/PROMPT-PRESETS.md',
  }
  const text = ['---', dumpYaml(meta, { lineWidth: 100, noRefs: true }).trimEnd(), '---', '',
    `# ${demo.title} · Codebase demo`, '', '## Prompt preset', '', messages[0].content, '',
    '## Import result and next steps', '', reply, '', receipt.bodyText,
  ].join('\n')
  return { text, messages }
}

/** Explicit Demo uses the native Import URL pipeline and its validated read-only projection. */
export async function activateLiveCanvasHeroRepositoryDemo(
  selection: LiveCanvasHeroPresetSelection, demo: LiveCanvasHeroDemo,
  options?: Pick<Parameters<typeof runLaunchImportUrl>[0], 'bridge' | 'resolveMcpInvocation'>,
): Promise<void> {
  if (!demo.repository || selection.id !== demo.id) throw new Error('Choose a repository demo first.')
  const id = `preset-demo-${selection.id}-${crypto.randomUUID()}`
  const bridge = options?.bridge || getMarkdownWorkspaceActionBridge()
  await runLaunchImportUrl({
    urlRaw: demo.repository, opts: { canvas2dRenderer: 'd3' },
    resolveMcpInvocation: options?.resolveMcpInvocation,
    fallback: async () => { throw new Error('The codebase demo requires the native repository importer.') },
    // Home precedes the toolbar that registers this same native host adapter.
    bridge: { ...bridge, agentGraph: bridge.agentGraph || createAgentGraphHostAdapter(), materializeAgentGraphImport: async request => {
      const graph = buildAgentGraphCanvasProjection(request.result)
      const projectionPath = await retainAgentGraphWorkspaceProjection(graph)
      const { text, messages } = buildLiveCanvasHeroRepositoryDemoDocument(selection, demo, id, request, projectionPath)
      const fs = await getWorkspaceFs()
      const parentPath = `/notes/demos/${selection.id}/${id}`
      await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
      const path = await fs.createFile({ parentPath, name: 'demo.md', text, mirrorToHost: false })
      await applyWorkspaceImportToCanvas({ fs, createdPaths: [path], opts: { applyToGraph: false, skipComposedGraphApply: true } })
      useGraphStore.getState().setWorkspaceViewMode('editor')
      if (!await activateFirstImportedWorkspaceFile({ fs, createdPaths: [path], applyToGraph: false })) {
        throw new Error('The imported graph is ready, but its demo document could not open. Select demo.md in Source Files.')
      }
      handoffLiveCanvasHeroDemoHistory(id, text, messages)
      whenFloatingPanelBridgeReady(() => { openFloatingPanelChat() })
      return { path }
    } },
  })
}
