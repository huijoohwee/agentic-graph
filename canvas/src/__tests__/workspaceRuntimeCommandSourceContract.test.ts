import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorkspaceRuntimeCommand } from '@/features/agent-ready/workspaceRuntimeCommand'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'

export function testWorkspaceRuntimeCommandInstallsStableWindowCommand() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'features', 'agent-ready', 'workspaceRuntimeCommand.ts'), 'utf8')
  for (const snippet of [
    'export type WorkspaceRuntimeCommandState = {',
    'export type WorkspaceRuntimeCommandApplyDocumentArgs = {',
    'export type WorkspaceRuntimeCommandApplyAssistantResponseArgs = {',
    "export const WORKSPACE_RUNTIME_COMMAND_EVENT = 'agenticgraph-workspace-command'",
    "export const WORKSPACE_RUNTIME_COMMAND_RESULT_EVENT = 'agenticgraph-workspace-command-result'",
    'export const publishWorkspaceRuntimeCommandResult = (value: unknown): void => {',
    'export const summarizeWorkspaceRuntimeCommandResult = (value: unknown): unknown => {',
    'readState: () => WorkspaceRuntimeCommandState',
    'applyMarkdownDocument: (args: WorkspaceRuntimeCommandApplyDocumentArgs)',
    'applyChatAssistantResponse: (args: WorkspaceRuntimeCommandApplyAssistantResponseArgs)',
    'markdownDocumentText: string | null',
    'const state = useGraphStore.getState()',
    "markdownDocumentText: typeof state.markdownDocumentText === 'string' ? state.markdownDocumentText : null,",
    'state.setWorkspaceViewMode(args.workspaceViewMode)',
    'state.setWorkspaceCanvasPaneOpen(args.workspaceCanvasPaneOpen)',
    'state.setCanvasRenderMode(nextCanvasRenderMode)',
    'state.setCanvas2dRenderer(nextCanvas2dRenderer)',
    'state.setDocumentSemanticMode(nextDocumentSemanticMode)',
    'state.setFrontmatterModeEnabled(args.frontmatterModeEnabled)',
    'const workspacePath = normalizeWorkspacePath(name)',
    'await state.setActiveMarkdownDocument({',
    'useMarkdownExplorerStore.getState().setActivePath(workspacePath)',
    'appendChatHistoryWorkspaceFile({',
    'applyChatKgcWorkspaceDocumentToCanvas(workspacePath)',
    'useMarkdownExplorerStore.getState().setActivePath(workspacePath)',
    'installWorkspaceRuntimeCommandEventBridge(command)',
    'window.addEventListener(WORKSPACE_RUNTIME_COMMAND_EVENT',
    'writeWorkspaceRuntimeCommandResult(payload)',
    'window.agenticgraphWorkspaceCommand = command',
    "writeWorkspaceRuntimeCommandDataset('ready')",
    'delete window.agenticgraphWorkspaceCommand',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected workspace runtime command contract snippet: ${snippet}`)
    }
  }
}

export async function testWorkspaceRuntimeCommandApplyMarkdownDocumentPromotesExplorerActivePath() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const validationDocName = 'docs/runtime-command-validation.md'
  const validationWorkspacePath = `/${validationDocName}`
  try {
    resetWorkspaceFsForTests()
    const graph = useGraphStore.getState()
    graph.resetAll()
    useMarkdownExplorerStore.getState().setActivePath('/docs/workspace-readme.md')

    const result = await createWorkspaceRuntimeCommand().applyMarkdownDocument({
      name: validationDocName,
      text: [
        '---',
        'kgCanvasSurfaceMode: "2d"',
        'kgCanvasRenderMode: "2d"',
        'kgCanvas2dRenderer: "storyboard"',
        'kgDocumentSemanticMode: "document"',
        'kgFrontmatterModeEnabled: "true"',
        'kgStrybldrStoryboard: "true"',
        '---',
        '',
        '# Starter',
      ].join('\n'),
      applyToGraph: false,
      applyViewPreset: true,
      workspaceViewMode: 'canvas',
      workspaceCanvasPaneOpen: false,
    })

    const activePath = useMarkdownExplorerStore.getState().activePath
    if (activePath !== validationWorkspacePath) {
      throw new Error(`expected runtime markdown apply to promote explorer activePath to the applied document, got ${String(activePath || '')}`)
    }
    if (result.markdownDocumentName !== validationDocName || result.applied !== true) {
      throw new Error(`expected runtime markdown apply to succeed for the promoted explorer document, got ${JSON.stringify(result)}`)
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(null)
    useGraphStore.getState().resetAll()
    resetWorkspaceFsForTests()
    restoreDom()
    restoreWindow()
  }
}

export async function testWorkspaceRuntimeCommandAppliesMcpAssistantResponseThroughChatKgcPipeline() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = JSON.stringify({
      jsonrpc: '2.0',
      id: 'runtime-mcp-result',
      result: {
        structuredContent: {
          widgets: [{
            id: 'runtime-runner',
            label: 'Runtime Runner',
            nodeTypeId: 'TextGeneration',
            formId: 'textGeneration.openai',
            widgetTypeId: 'default',
            prompt: 'Uppercase the card output.',
            'flow:compute': "inputs => ({ text_out: String(inputs.prompt_in || '').trim().toUpperCase() })",
          }],
          cards: [{
            id: 'runtime-card',
            label: 'Runtime Card',
            output: 'runtime card output',
          }],
          panels: [{
            id: 'runtime-panel',
            label: 'Runtime Panel',
            output: 'Waiting for runtime compute.',
          }],
          media: [{
            id: 'runtime-video',
            label: 'Runtime Video',
            kind: 'video',
            videoUrl: 'https://example.com/runtime.mp4',
          }],
          edges: [
            { id: 'runtime-card-to-runner', source: 'runtime-card.output', target: 'runtime-runner.prompt_in' },
            { id: 'runtime-runner-to-panel', source: 'runtime-runner.text_out', target: 'runtime-panel.output' },
            { id: 'runtime-card-to-video', source: 'runtime-card.output', target: 'runtime-video.videoUrl' },
          ],
        },
      },
    })

    const result = await createWorkspaceRuntimeCommand().applyChatAssistantResponse({
      assistantText,
      requestText: 'Apply a literal MCP result from the runtime command.',
      requestedPath: '/chat-log/20260604T180000Z/kgc_20260604T180000Z.md',
      timestampMs: Date.UTC(2026, 5, 4, 18, 0, 0),
      traceId: 'trace-runtime-mcp',
      providerSummary: 'MCP runtime command test',
    })

    if (result.applied !== true || result.workspacePath !== '/chat-log/20260604T180000Z/kgc_20260604T180000Z.md') {
      throw new Error(`expected runtime command to persist and apply the canonical KGC workspace path, got ${JSON.stringify({ applied: result.applied, workspacePath: result.workspacePath })}`)
    }
    const persistedText = String((await (await getWorkspaceFs()).readFileText(result.workspacePath)) || '')
    if (!persistedText.includes('mcp-response-runtime-runner') || !persistedText.includes('mcp-response-runtime-video')) {
      throw new Error(`expected runtime command to materialize MCP structured content into KGC frontmatter, got ${persistedText}`)
    }

    const state = useGraphStore.getState()
    if (state.workspaceViewMode !== 'editor' || state.workspaceCanvasPaneOpen !== true) {
      throw new Error(`expected runtime command to land in Editor Workspace, got ${JSON.stringify({ workspaceViewMode: state.workspaceViewMode, workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen })}`)
    }
    if (!String(state.markdownDocumentText || '').includes('mcp-response-runtime-card')) {
      throw new Error('expected active editor markdown to contain the runtime MCP card')
    }
    const nodes = new Map((state.graphData?.nodes || []).map(node => [String(node.id || ''), node]))
    if (nodes.get('mcp-response-runtime-runner')?.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
      throw new Error(`expected runtime MCP runner to render as a TextGeneration widget, got ${JSON.stringify(nodes.get('mcp-response-runtime-runner'))}`)
    }
    if (nodes.get('mcp-response-runtime-card')?.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID || nodes.get('mcp-response-runtime-video')?.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
      throw new Error(`expected runtime MCP card/video to render as Rich Media Panels, got ${JSON.stringify(state.graphData?.nodes || [])}`)
    }
    const videoEdge = state.graphData?.edges.find(edge => edge.id === 'e-mcp-response-runtime-card-to-video')
    if (videoEdge?.properties?.['flow:sourcePortKey'] !== 'output' || videoEdge.properties?.['flow:targetPortKey'] !== 'videoUrl') {
      throw new Error(`expected runtime MCP rich-media edge to carry canonical dataflow handles, got ${JSON.stringify(videoEdge)}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export function testAppInstallsWorkspaceRuntimeCommand() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8')
  for (const snippet of [
    "import('@/features/agent-ready/workspaceRuntimeCommand')",
    'let cleanupWorkspaceRuntime = () => void 0',
    'cleanupWorkspaceRuntime = workspaceRuntimeModule.installWorkspaceRuntimeCommand()',
    'cleanupWorkspaceRuntime()',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected App to install workspace runtime command snippet: ${snippet}`)
    }
  }
}
