import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetRenderGraphHelperBecomesRuntimeSsot() {
  const helperPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetRenderGraph.ts')
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const selectionBookkeepingPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetSelectionBookkeeping.ts')
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const overlayEdgesPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayEdges.ts')
  const workflowActionsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowActions.ts')
  const workflowRunActionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts')
  const workflowRichMediaPanelPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRichMediaPanel.ts')
  const workflowRichMediaPublicationPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRichMediaPublication.ts')
  const workflowRunInputsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunInputs.ts')
  const workflowWritebackPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowWriteback.ts')

  const helperText = readFileSync(helperPath, 'utf8')
  const overlaySurfaceText = readFileSync(overlaySurfacePath, 'utf8')
  const selectionBookkeepingText = readFileSync(selectionBookkeepingPath, 'utf8')
  const collisionText = readFileSync(collisionPath, 'utf8')
  const overlayEdgesText = readFileSync(overlayEdgesPath, 'utf8')
  const workflowActionsText = readFileSync(workflowActionsPath, 'utf8')
  const workflowRunActionText = readFileSync(workflowRunActionPath, 'utf8')
  const workflowRichMediaPanelText = readFileSync(workflowRichMediaPanelPath, 'utf8')
  const workflowRichMediaPublicationText = readFileSync(workflowRichMediaPublicationPath, 'utf8')
  const workflowRunInputsText = readFileSync(workflowRunInputsPath, 'utf8')
  const workflowWritebackText = readFileSync(workflowWritebackPath, 'utf8')

  if (!helperText.includes('export function getCachedStoryboardWidgetRenderGraph(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize render-graph lookup derivation in a shared helper')
  }
  if (!helperText.includes('const graphSemanticKey = buildScopedGraphSemanticKey(scope, {')) {
    throw new Error('expected StoryboardWidget render-graph helper to derive one semantic key per scoped graph snapshot')
  }
  if (!helperText.includes('cacheScope: scope,') || !helperText.includes('getCachedGraphLookup({')) {
    throw new Error('expected StoryboardWidget render-graph helper to own the shared graph lookup reuse contract')
  }
  if (!helperText.includes('incidentEdgesByNodeId: baseLookup.incidentEdgesByNodeId')) {
    throw new Error('expected StoryboardWidget render-graph helper to carry forward cached incident-edge summaries')
  }
  if (!helperText.includes('eligibleNodeIds: buildFlowWidgetEligibleNodeIdSet(nodes)')) {
    throw new Error('expected StoryboardWidget render-graph helper to own widget-eligibility summary derivation')
  }
  if (!helperText.includes('const nodeIdsByInnerId = new Map<string, string[]>()')) {
    throw new Error('expected StoryboardWidget render-graph helper to own canonical inner-id alias indexing')
  }
  if (!helperText.includes('export function getCachedStoryboardWidgetOverlayEdgeGraph(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize overlay-edge filtered graph derivation in the shared helper')
  }
  if (!helperText.includes("scope: 'storyboard-widget-overlay-edges-base-graph'")) {
    throw new Error('expected StoryboardWidget overlay-edge helper to derive its filtered subset from the shared render-graph SSOT')
  }
  if (!helperText.includes('const nodeHandleSemanticKey = buildOverlayNodeHandleSignature(baseGraph.nodes)')) {
    throw new Error('expected StoryboardWidget overlay-edge helper to key cache invalidation from live node handle semantics')
  }
  if (!helperText.includes("const cacheKey = hashSignatureParts([\n    'overlay-graph-lookup',")) {
    throw new Error('expected StoryboardWidget overlay-edge helper to cache filtered node and edge subsets by semantic overlay-node signature')
  }
  if (!helperText.includes('const defaultPortKeyByNodeId = new Map<string, { in: string; out: string }>()')) {
    throw new Error('expected StoryboardWidget overlay-edge helper to own default port fallback derivation')
  }
  if (!helperText.includes('const rawEdgeById = new Map<string, GraphEdge>()')) {
    throw new Error('expected StoryboardWidget overlay-edge helper to own raw edge lookups for downstream style resolution')
  }
  if (!helperText.includes('export function getCachedStoryboardWidgetPlacementContext(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize widget placement context derivation in the shared helper')
  }
  if (!helperText.includes("scope: 'storyboard-widget-widget-placement-base-graph'")) {
    throw new Error('expected StoryboardWidget placement context to derive from the shared render-graph SSOT')
  }
  if (!helperText.includes("const cacheKey = hashSignatureParts([\n    'storyboard-widget-widget-placement-context',")) {
    throw new Error('expected StoryboardWidget placement context to be cached by semantic graph and open-widget signatures')
  }
  if (!helperText.includes('const defaultPinnedInCanvas = resolveDefaultFlowWidgetPinnedInCanvas({ graphMetaKind })')) {
    throw new Error('expected StoryboardWidget placement context to own shared default pinning decisions')
  }
  if (!helperText.includes('const frontmatterOverlayNodeIds = isFrontmatterFlow')) {
    throw new Error('expected StoryboardWidget placement context to own frontmatter overlay node derivation')
  }
  if (!helperText.includes('const effectiveOpenWidgetNodeIds = isFrontmatterFlow')) {
    throw new Error('expected StoryboardWidget placement context to own effective open-widget resolution')
  }
  if (!helperText.includes('export function getCachedStoryboardWidgetWorkflowRunPlan(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize workflow run-all planning in the shared helper')
  }
  if (!helperText.includes("scope: 'storyboard-widget-workflow-actions-draft-graph'")) {
    throw new Error('expected StoryboardWidget workflow run-all planning to derive from the shared draft render-graph snapshot')
  }
  if (!helperText.includes("const cacheKey = hashSignatureParts([\n    'storyboard-widget-workflow-run-plan',")) {
    throw new Error('expected StoryboardWidget workflow run-all planning to cache by semantic draft graph signature')
  }
  if (!helperText.includes('const ordered = buildFlowRunAllNodeSequence({')) {
    throw new Error('expected StoryboardWidget workflow run-all planning to own the shared sequencing derivation')
  }
  if (!helperText.includes('export function getCachedStoryboardWidgetWorkflowNodeResolutionContext(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize workflow single-node cross-graph lookup context in the shared helper')
  }
  if (!helperText.includes("scope: 'storyboard-widget-workflow-node-resolution-draft-graph'")) {
    throw new Error('expected StoryboardWidget workflow node-resolution context to derive from shared draft graph snapshots')
  }
  if (!helperText.includes("const cacheKey = hashSignatureParts([\n    'storyboard-widget-workflow-node-resolution-context',")) {
    throw new Error('expected StoryboardWidget workflow node-resolution context to cache by semantic multi-graph signatures')
  }
  if (!helperText.includes('export function resolveStoryboardWidgetWorkflowRunTarget(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to own initial workflow run-target resolution')
  }
  if (!helperText.includes('export function resolveStoryboardWidgetWorkflowWritableNodeId(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to own draft write-target resolution for composed ids')
  }
  if (!helperText.includes('export function resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to own cross-graph node lookup reuse for workflow writes')
  }
  if (!helperText.includes('export function listStoryboardWidgetWorkflowNodesAcrossGraphs(args: {')) {
    throw new Error('expected StoryboardWidget runtime helper to own cross-graph node aggregation for rich-media panel discovery')
  }
  if (!workflowRichMediaPanelText.includes('export function resolveStoryboardWidgetWorkflowRichMediaPanelTargetNodeId(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize rich-media panel target resolution in a shared helper')
  }
  if (!workflowRichMediaPanelText.includes('export function ensureStoryboardWidgetWorkflowRichMediaPanelNodeId(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize rich-media panel creation fallback in a shared helper')
  }
  if (!workflowRichMediaPanelText.includes('export function applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize rich-media panel draft patch writes in a shared helper')
  }
  if (!workflowRichMediaPanelText.includes('const activePanel = panels.find(n => {')) {
    throw new Error('expected shared rich-media panel helper to own active-panel preference before panel creation fallback')
  }
  if (!workflowRichMediaPanelText.includes('const nextDraft = bumpStoryboardWidgetDraftGraphDataRevision({ ...currentDraft, nodes: nextNodes })')) {
    throw new Error('expected shared rich-media panel helper to reuse the neutral Storyboard Widget draft revision bump helper')
  }
  if (!workflowRunInputsText.includes('export function resolveStoryboardWidgetWorkflowConnectedValuesInput(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize single-node connected-values input resolution in a shared helper')
  }
  if (!workflowRunInputsText.includes('if (args.context.renderGraph) candidateGraphs.push(args.context.renderGraph)')) {
    throw new Error('expected shared run-input helper to prefer render graph data before other workflow graphs')
  }
  if (!workflowRunInputsText.includes('const resolvedTargetNodeId = String(resolveGraphNodeByCanonicalId(graphData, writableNodeId)?.id || \'\').trim()')) {
    throw new Error('expected shared run-input helper to resolve canonical writable ids against each candidate graph')
  }
  if (!workflowRunInputsText.includes('const connectedValuesByNodeId = computeFlowConnectedValuesBySchemaPath({')) {
    throw new Error('expected shared run-input helper to own connected-values computation after graph selection')
  }
  if (!workflowWritebackText.includes('export function updateStoryboardWidgetWorkflowOutputForKnownNodeIds(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize known-node output writeback in a shared helper')
  }
  if (!workflowWritebackText.includes('export function setStoryboardWidgetWorkflowRunLoadingStateForKnownNodeIds(args: {')) {
    throw new Error('expected StoryboardWidget runtime to centralize run loading-state writeback in a shared helper')
  }
  if (!workflowWritebackText.includes('export function collectStoryboardWidgetWorkflowCandidateNodeIds(nodeIds: ReadonlyArray<string>): Set<string>')) {
    throw new Error('expected StoryboardWidget workflow writeback helper to own canonical candidate-id expansion')
  }
  if (!workflowWritebackText.includes('export function areStoryboardWidgetWorkflowRecordValuesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean')) {
    throw new Error('expected StoryboardWidget workflow writeback helper to own semantic property equality checks')
  }
  if (!workflowWritebackText.includes("import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'")) {
    throw new Error('expected StoryboardWidget workflow writeback helper to reuse neutral draft graph revision bumps for writeback invalidation')
  }
  if (!workflowWritebackText.includes('if (updated) args.scheduleWorkflowOutputEdgeRefresh()')) {
    throw new Error('expected StoryboardWidget workflow writeback helper to refresh overlay edges only after actual graph-store writes')
  }

  if (!overlaySurfaceText.includes('getCachedStoryboardWidgetRenderGraph,') || !overlaySurfaceText.includes('getCachedStoryboardWidgetPlacementContext,')) {
    throw new Error('expected StoryboardWidget overlay surface to consume the shared render-graph and widget placement helpers')
  }
  if (!overlaySurfaceText.includes("scope: 'storyboard-widget-overlay-surface-render-graph'")) {
    throw new Error('expected StoryboardWidget overlay surface to request the shared render-graph snapshot under its scoped cache key')
  }
  if (overlaySurfaceText.includes('getCachedGraphLookup({')) {
    throw new Error('expected StoryboardWidget overlay surface to stop rebuilding local graph lookups')
  }
  if (!overlaySurfaceText.includes('const renderGraphPlacementContext = React.useMemo(() => {')) {
    throw new Error('expected StoryboardWidget overlay surface to memoize the shared widget placement context')
  }
  if (!overlaySurfaceText.includes('const sorted = renderGraphPlacementContext?.frontmatterOverlayNodeIds || []')) {
    throw new Error('expected StoryboardWidget overlay surface to reuse shared frontmatter overlay ids')
  }

  if (!selectionBookkeepingText.includes("import { getCachedStoryboardWidgetRenderGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'")) {
    throw new Error('expected StoryboardWidget selection bookkeeping to consume the shared render-graph helper')
  }
  if (!selectionBookkeepingText.includes("scope: 'storyboard-widget-selection-bookkeeping-draft-graph'")) {
    throw new Error('expected StoryboardWidget selection bookkeeping to request the shared render-graph snapshot under its scoped cache key')
  }
  if (selectionBookkeepingText.includes('getCachedGraphLookup({')) {
    throw new Error('expected StoryboardWidget selection bookkeeping to stop rebuilding local graph lookups')
  }

  if (!collisionText.includes("import { getCachedStoryboardWidgetRenderGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'")) {
    throw new Error('expected StoryboardWidget overlay collision to consume the shared render-graph helper')
  }
  if (!collisionText.includes("scope: 'storyboard-widget-overlay-collision-graph'")) {
    throw new Error('expected StoryboardWidget overlay collision to request the shared render-graph snapshot under its scoped cache key')
  }
  if (!collisionText.includes("nodeTypeId: String(nodeById?.get(id)?.type || '').trim()")) {
    throw new Error('expected StoryboardWidget overlay collision to read node-type placement hints from the shared node lookup SSOT')
  }
  if (collisionText.includes('getCachedGraphLookup({')) {
    throw new Error('expected StoryboardWidget overlay collision to stop rebuilding local graph lookups')
  }
  if (collisionText.includes('const nodeTypeById = new Map<string, string>()')) {
    throw new Error('expected StoryboardWidget overlay collision to stop rescanning raw graph nodes for node-type metadata')
  }

  if (!overlayEdgesText.includes("import {\n  getCachedStoryboardWidgetOverlayEdgeGraph,\n  readCanonicalStoryboardWidgetOverlayIdentity,\n} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'")) {
    throw new Error('expected StoryboardWidget overlay edges to consume the shared render-graph helper exports')
  }
  if (!overlayEdgesText.includes('const graphLookup = getCachedStoryboardWidgetOverlayEdgeGraph({')) {
    throw new Error('expected StoryboardWidget overlay edges to reuse the shared filtered overlay-edge graph helper')
  }
  if (!overlayEdgesText.includes('const graphSemanticKey = graphLookup?.graphSemanticKey || \'\'')) {
    throw new Error('expected StoryboardWidget overlay edges to reuse the shared filtered graph semantic key for downstream caches')
  }
  if (overlayEdgesText.includes('const overlayGraphLookupCacheRef = React.useRef<{')) {
    throw new Error('expected StoryboardWidget overlay edges to stop owning a hook-local filtered graph cache')
  }
  if (overlayEdgesText.includes('function buildOverlayNodeHandleSignature(')) {
    throw new Error('expected StoryboardWidget overlay edges to stop owning local node-handle signature derivation')
  }
  const workflowRunAllPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowRunAll.ts')
  const workflowRunAllText = readFileSync(workflowRunAllPath, 'utf8')
  if (!workflowRunAllText.includes('getCachedStoryboardWidgetWorkflowRunPlan') || !workflowRunActionText.includes('getCachedStoryboardWidgetWorkflowNodeResolutionContext,')) {
    throw new Error('expected StoryboardWidget workflow runtime to consume the shared workflow run-plan and node-resolution helpers')
  }
  if (!workflowRunAllText.includes('const runPlan = getCachedStoryboardWidgetWorkflowRunPlan({')) {
    throw new Error('expected StoryboardWidget run-all helper to reuse the shared run-all plan instead of rebuilding eligibility locally')
  }
  if (!workflowActionsText.includes('createStoryboardWidgetWorkflowNodeRunner({')
    || !workflowRunActionText.includes('const workflowNodeResolutionContext = getCachedStoryboardWidgetWorkflowNodeResolutionContext({')) {
    throw new Error('expected StoryboardWidget workflow hook to delegate execution to the runner that reuses the shared node-resolution context')
  }
  if (!workflowRunActionText.includes('const resolvedRunTarget = resolveStoryboardWidgetWorkflowRunTarget({')) {
    throw new Error('expected StoryboardWidget workflow runner to reuse the shared initial run-target resolver')
  }
  if (!workflowRunActionText.includes('resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs({')) {
    throw new Error('expected StoryboardWidget workflow runner to reuse the shared cross-graph node resolver for output writes')
  }
  if (!workflowRichMediaPublicationText.includes('ensureStoryboardWidgetWorkflowRichMediaPanelNodeId({')
    || !workflowRichMediaPublicationText.includes('applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch({')) {
    throw new Error('expected StoryboardWidget workflow publication to reuse the shared rich-media panel helper set instead of owning local panel targeting and patching')
  }
  if (!workflowRunActionText.includes('const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({')) {
    throw new Error('expected StoryboardWidget workflow runner to reuse the shared connected-values input helper')
  }
  if (!workflowRunActionText.includes('updateStoryboardWidgetWorkflowOutputForKnownNodeIds({')) {
    throw new Error('expected StoryboardWidget workflow runner to reuse the shared output writeback helper')
  }
  if (!workflowRunActionText.includes('setStoryboardWidgetWorkflowRunLoadingStateForKnownNodeIds({')) {
    throw new Error('expected StoryboardWidget workflow runner to reuse the shared loading-state writeback helper')
  }
  if (workflowRunActionText.includes('buildFlowWidgetEligibleNodeIdSet(nodes)')) {
    throw new Error('expected StoryboardWidget workflow actions to stop rebuilding widget eligibility locally for run-all')
  }
  if (workflowRunActionText.includes('const ordered = buildFlowRunAllNodeSequence({')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local run-all sequencing')
  }
  if (workflowRunActionText.includes('const resolved = [draft, args.renderGraphDataOverride as GraphData | null, args.baseGraphData]')) {
    throw new Error('expected StoryboardWidget workflow actions to stop rebuilding local initial graph scan order for run targets')
  }
  if (workflowRunActionText.includes('const pickWritableNodeId = () => {')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local writable-node resolution logic')
  }
  if (workflowRunActionText.includes('const resolveNodeByIdAcrossGraphs = (candidateId: string): GraphNode | null => {\n        const cid = String(candidateId || \'\').trim()')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local cross-graph node lookup loops')
  }
  if (workflowRunActionText.includes('const resolveRichMediaPanelTargetNodeId = (): string | null => {')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local rich-media panel target resolution')
  }
  if (workflowRunActionText.includes('const ensureRichMediaPanelNodeId = (anchorNode: GraphNode): string | null => {')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local rich-media panel creation fallback')
  }
  if (workflowRunActionText.includes('const updatePanelInDraft = (panelId: string, patch: Record<string, unknown>) => {')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local rich-media panel draft patch writeback')
  }
  if (workflowRunActionText.includes('computeFlowConnectedValuesBySchemaPath({')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning inline connected-values graph selection for single-node runs')
  }
  if (workflowRunActionText.includes('function areRecordValuesEqual')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local semantic property equality helpers')
  }
  if (workflowRunActionText.includes('function bumpDraftGraphDataRevision(graphData: GraphData): GraphData')) {
    throw new Error('expected StoryboardWidget workflow actions to stop owning local draft graph revision bump helpers')
  }
  const runtimeScenePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const runtimeSceneText = readFileSync(runtimeScenePath, 'utf8')
  if (!runtimeSceneText.includes("import { getCachedStoryboardWidgetPlacementContext } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'")) {
    throw new Error('expected StoryboardWidget runtime scene to consume the shared widget placement context helper')
  }
  if (!runtimeSceneText.includes('const widgetPlacementContext = getCachedStoryboardWidgetPlacementContext({')) {
    throw new Error('expected StoryboardWidget runtime scene to reuse the shared widget placement context for frontmatter seeding decisions')
  }
  if (runtimeSceneText.includes("const graphMetaKind = String((((graphDataForSeeding || null)?.metadata || {}) as Record<string, unknown>).kind || '').trim()")) {
    throw new Error('expected StoryboardWidget runtime scene to stop decoding graphMetaKind directly from raw graph metadata')
  }
  if (runtimeSceneText.includes('deriveFrontmatterFlowOverlayNodeIds(graphDataForSeeding)')) {
    throw new Error('expected StoryboardWidget runtime scene to stop deriving frontmatter overlay ids locally')
  }
}
