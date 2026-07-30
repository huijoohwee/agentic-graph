import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetTextRunsPersistWorkspaceOutputArtifacts() {
  const workflowActionsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const headlessTextRunText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetHeadlessTextRun.ts'), 'utf8')
  const richMediaPublicationText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRichMediaPublication.ts'), 'utf8')
  const richMediaRunText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'richMediaRun.ts'), 'utf8')

  if (!richMediaRunText.includes('export const writeTextWidgetRunOutputArtifact = async (args: {')) {
    throw new Error('expected text widget run outputs to use one shared workspace artifact writer')
  }
  if (!richMediaRunText.includes('writeWorkspaceTextArtifactAtPath({') || !richMediaRunText.includes('applyWorkspaceImportToCanvas({')) {
    throw new Error('expected shared text widget artifact writer to persist Workspace FS text and passively register Source Files')
  }
  if (!headlessTextRunText.includes('writeTextWidgetRunOutputArtifact({')) {
    throw new Error('expected Storyboard Widget text/transcript run finalizers to land generated output in the Editor Workspace')
  }
  if (!richMediaPublicationText.includes('outputPath: panelArgs.outputPath') || !workflowActionsText.includes("model: 'youtube', outputPath })") || !headlessTextRunText.includes('outputPath: projection.artifactPath')) {
    throw new Error('expected Storyboard Widget text run patches to carry the shared workspace output path into widgets and Rich Media Panels')
  }
}

export function testStoryboardWidgetRichMediaRunsPersistWorkspaceManifests() {
  const workflowMediaHandlersText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowMediaRunHandlers.ts'), 'utf8')
  const richMediaRunText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'richMediaRun.ts'), 'utf8')

  if (!richMediaRunText.includes('export const writeRichMediaWidgetRunOutputArtifact = async (args: {')) {
    throw new Error('expected image/video widget run outputs to use one shared rich-media workspace artifact writer')
  }
  if (!richMediaRunText.includes('writeWorkspaceBlobArtifactAtPath({') || !richMediaRunText.includes('writeWorkspaceTextArtifactAtPath({') || !richMediaRunText.includes('buildGeneratedMediaManifestMarkdown({')) {
    throw new Error('expected shared rich-media artifact writer to persist the binary asset and editable markdown manifest')
  }
  if (!richMediaRunText.includes('createdPaths: [outputPath, outputManifestPath]') || !richMediaRunText.includes('workspaceEntries: buildGeneratedMediaWorkspaceEntries({') || !richMediaRunText.includes('applyToGraph: false')) {
    throw new Error('expected generated rich-media binary and manifest to register in Source Files without graph recomposition')
  }
  if (!workflowMediaHandlersText.includes('outputManifestPath: richMediaResult.outputManifestPath')) {
    throw new Error('expected Storyboard Widget image/video run patches to carry the shared workspace manifest path')
  }
}

export function testGeneratedArtifactsAndCanvasDocumentsUseDurablePersistenceContract() {
  const workspaceOutputText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'chatHistoryWorkspace.output.ts'), 'utf8')
  const sharedWorkspaceWriteText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'chatWorkspaceFsWrite.ts'), 'utf8')
  const graphSourceText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardCardMediaGraphSource.ts'), 'utf8')
  const graphSourceOwnerText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardCardMediaGraphSourceOwner.ts'), 'utf8')
  const sourceLayersText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'graph', 'sourceLayers.ts'), 'utf8')
  const graphFlowSyncText = readFileSync(resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataFrontmatterFlowSync.ts'), 'utf8')
  const graphSourceWriteQueueText = readFileSync(resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'workspaceSourceTextWriteQueue.ts'), 'utf8')
  const workflowRunText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const workflowRunTypesText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunTypes.ts'), 'utf8')
  const canvasRuntimeText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const graphCommitText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardCardMediaGraphCommit.ts'), 'utf8')

  if (!workspaceOutputText.includes('await writeWorkspaceFileTextEnsuringFile({')
    || !sharedWorkspaceWriteText.includes('const persistedText = await fs.readFileText(normalized)')
    || !sharedWorkspaceWriteText.includes('Workspace text artifact persistence verification failed')) {
    throw new Error('expected the shared text artifact writer to verify durable Workspace FS readback')
  }
  if (workspaceOutputText.includes('try {\n    await writeWorkspaceFileTextEnsuringFile({')) {
    throw new Error('generated text artifact persistence failures must not be swallowed')
  }
  if (!workspaceOutputText.includes('return persisted ? outputPath : null')) {
    throw new Error('generated binary artifacts must expose a path only after the host persistence endpoint succeeds')
  }
  if (!graphSourceText.includes('export async function persistStoryboardCardMediaGraphSource')
    || !graphSourceText.includes('resolveStoryboardCardMediaGraphSourceOwner({')
    || !graphSourceText.includes('resolveStoryboardCardMediaGraphSourceGraph({')
    || !graphSourceOwnerText.includes('projectComposedGraphToSourceLayer({')
    || !sourceLayersText.includes('export function projectComposedGraphToSourceLayer(args: {')
    || !graphSourceText.includes('shouldUpdateStoryboardCardMediaGraphActiveDocument({')
    || !graphSourceText.includes('const persisted = await writeActiveMarkdownDocumentTextIfPresent({')
    || !graphSourceText.includes('if (!sourceSync.accepted) return false')
    || !graphSourceText.includes("if (typeof sourceSync.markdownDocumentText !== 'string') return true")
    || !graphSourceText.includes('markdownDocumentApplyViewPreset: false')
    || !graphSourceText.includes('if (!persisted) throw new Error(')) {
    throw new Error('expected generated Canvas documents to persist without treating same-document graph publication as a viewport-resetting document switch')
  }
  if (!graphFlowSyncText.includes('return enqueueWorkspaceSourceTextWrite(activePath, args.text)')
    || !graphSourceWriteQueueText.includes('pendingWorkspaceSourceTextWrites.get(workspacePath)')
    || !graphSourceWriteQueueText.includes('pendingWorkspaceSourceTextWrites.set(workspacePath, next)')) {
    throw new Error('expected shared Canvas document writes to serialize by workspace path and preserve generation order')
  }
  if (!workflowRunTypesText.includes('options?: StoryboardCardMediaGraphPersistenceOptions')
    || !workflowRunText.includes('await args.persistDraftGraphData(durableGraph, runOptions?.sourcePersistence)')) {
    throw new Error('expected every workflow generator to await the required shared graph-document persistence contract')
  }
  if (!canvasRuntimeText.includes('useStoryboardCardMediaGraphCommit({')
    || !canvasRuntimeText.includes('sourceOwner: { documentName: markdownDocumentName, documentText: markdownDocumentText }')
    || !canvasRuntimeText.includes('commitPublishedGraphData: publishStoryboardCardMediaGraph')
    || !graphCommitText.includes('const publish = React.useCallback((graphData: GraphData): GraphData => {')
    || !graphCommitText.includes('sourceOwner: options?.sourceOwner || sourceOwner')) {
    throw new Error('expected live graph publication to stay synchronous while the Canvas persistence adapter returns the durable document commit promise')
  }
}
