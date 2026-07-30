import { clearRichMediaOutputProperties } from '@/features/chat/richMediaRun'
import {
  executeNativeImportUrlInvocation,
  isNativeImportUrlInvocationAttempt,
  NATIVE_IMPORT_URL_INVOCATION_ERROR,
  parseNativeImportUrlInvocation,
} from '@/features/chat/nativeImportUrlInvocation'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphNode } from '@/lib/graph/types'
import type { StoryboardWidgetTextRunOutputPublisher } from './storyboardWidgetWorkflowRichMediaPublication'

type OutputUpdater = (buildPatch: (nodeProps: Record<string, unknown>) => Record<string, unknown>) => void

export async function runStoryboardWidgetNativeImportUrlInvocation(args: {
  id: string
  prompt: string
  node: GraphNode
  updateOutput: OutputUpdater
  publishOutput: StoryboardWidgetTextRunOutputPublisher
  upsertToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
  reportFailure: (message: string, ttlMs?: number) => void
  onCanvasAuthorityChanged: () => void
}): Promise<boolean> {
  const invocation = parseNativeImportUrlInvocation(args.prompt)
  if (!isNativeImportUrlInvocationAttempt(args.prompt)) return false
  const title = args.node.label || 'URL import'
  const updateStatus = (status: 'running' | 'done' | 'error') => args.updateOutput(nodeProps => ({
    ...clearRichMediaOutputProperties(nodeProps),
    workflowOutputPanelOnly: true,
    workflowRunStatus: status,
    lastRunAt: new Date().toISOString(),
  }))
  if (!invocation) {
    updateStatus('error')
    args.reportFailure(NATIVE_IMPORT_URL_INVOCATION_ERROR, 4200)
    try {
      args.publishOutput({
        anchorNode: args.node,
        outputText: NATIVE_IMPORT_URL_INVOCATION_ERROR,
        title,
        model: 'native-import-url',
        loading: false,
        outputKey: 'url-import-report',
        panelLabel: 'URL import report',
        outputIndex: 0,
      })
    } catch {
      // The Card status and visible failure remain authoritative if output publication is unavailable.
    }
    return true
  }
  const loadingText = `Importing ${invocation.url} through the native workspace importer…`
  let terminalOutput = loadingText
  let outputPath: string | null = null
  let canvasAuthorityBefore: {
    graphData: unknown
    graphDataRevision: unknown
    markdownDocumentName: unknown
  } | null = null
  let canvasAuthorityChanged = false
  const readCanvasAuthority = () => {
    const state = useGraphStore.getState()
    return {
      graphData: state.graphData,
      graphDataRevision: state.graphDataRevision,
      markdownDocumentName: state.markdownDocumentName,
    }
  }
  const detectCanvasAuthorityChange = () => {
    if (!canvasAuthorityBefore) return false
    const current = readCanvasAuthority()
    const changed = current.graphData !== canvasAuthorityBefore.graphData
      || current.graphDataRevision !== canvasAuthorityBefore.graphDataRevision
      || current.markdownDocumentName !== canvasAuthorityBefore.markdownDocumentName
    if (changed && !canvasAuthorityChanged) {
      canvasAuthorityChanged = true
      args.onCanvasAuthorityChanged()
    }
    return changed
  }
  updateStatus('running')
  try {
    args.publishOutput({
      anchorNode: args.node,
      outputText: loadingText,
      title,
      model: 'native-import-url',
      sourceUrl: invocation.url,
      loading: true,
      loadingLabel: 'Importing URL…',
      outputKey: 'url-import-report',
      panelLabel: 'URL import report',
      outputIndex: 0,
    })
    canvasAuthorityBefore = readCanvasAuthority()
    const result = await executeNativeImportUrlInvocation(invocation)
    terminalOutput = result.outputText
    let successMessage = ''
    if ('createdPaths' in result) {
      outputPath = result.createdPaths[0] || null
      successMessage = `Imported ${result.createdPaths.length} workspace file${result.createdPaths.length === 1 ? '' : 's'} from URL.`
    } else {
      outputPath = null
      successMessage = `Imported knowledge graph with ${result.counts.nodes} nodes and ${result.counts.edges} edges.`
    }
    if (!detectCanvasAuthorityChange()) updateStatus('done')
    args.upsertToast({
      id: `storyboard-widget-run-${args.id}`,
      kind: 'success',
      message: successMessage,
      ttlMs: 3000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Native URL import failed.'
    terminalOutput = message
    if (!detectCanvasAuthorityChange()) updateStatus('error')
    args.reportFailure(message, 4200)
  } finally {
    if (!canvasAuthorityChanged) {
      try {
        args.publishOutput({
          anchorNode: args.node,
          outputText: terminalOutput,
          title,
          model: 'native-import-url',
          sourceUrl: invocation.url,
          outputPath,
          loading: false,
          outputKey: 'url-import-report',
          panelLabel: 'URL import report',
          outputIndex: 0,
        })
      } catch {
        // The Rich Media Panel remains the output authority if teardown writeback is transiently unavailable.
      }
    }
  }
  return true
}
