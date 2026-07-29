import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardWidgetCanvasRunSetsSharedOutputLoadingState() {
  const runtime = (...segments: string[]) => resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', ...segments)
  const text = readFileSync(runtime('useStoryboardWidgetWorkflowActions.ts'), 'utf8')
  const runAction = readFileSync(runtime('storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const headlessTextRun = readFileSync(runtime('storyboardWidgetHeadlessTextRun.ts'), 'utf8')
  const mediaHandlers = readFileSync(runtime('storyboardWidgetWorkflowMediaRunHandlers.ts'), 'utf8')
  const execution = `${runAction}\n${headlessTextRun}\n${mediaHandlers}`
  const renderGraph = readFileSync(runtime('storyboardWidgetRenderGraph.ts'), 'utf8')
  const writeback = readFileSync(runtime('storyboardWidgetWorkflowWriteback.ts'), 'utf8')
  const publication = readFileSync(runtime('storyboardWidgetWorkflowRichMediaPublication.ts'), 'utf8')
  if (!writeback.includes('export function setStoryboardWidgetWorkflowRunLoadingStateForKnownNodeIds(args: {') || !writeback.includes('kind?: StoryboardWidgetWorkflowOutputLoadingKind')) throw new Error('expected StoryboardWidget runtime helper to centralize output loading state patching')
  if (!mediaHandlers.includes("setRunLoadingStateForKnownNodeIds({ loading: true, kind: richMediaKind })") || !headlessTextRun.includes('args.setLoading(true)')) throw new Error('expected run paths to publish loading state before generation')
  if (!writeback.includes('nextProps.lastRunAt = new Date().toISOString()') || !writeback.includes('delete nextProps.outputLoading') || !writeback.includes('delete nextProps.outputLoadingKind')) throw new Error('expected run loading state to stamp its signal and delete terminal flags')
  if (!publication.includes('mergeStoryboardWidgetWorkflowPropertyPatch(existingPanelProps, patch)')) throw new Error('expected Rich Media publication to reuse deletion-aware patches')
  if (!headlessTextRun.includes('const projectResponse = (projection: {')) throw new Error('expected one text output publishing SSOT')
  if (!execution.includes('const runProvider = normalizedProvider || args.generationRuntime.chatProvider') || !execution.includes('const runEndpointUrl = args.generationRuntime.chatEndpointUrl.trim() || getChatDefaultEndpointUrlForProvider(runProvider)')) throw new Error('expected active provider and provider-scoped endpoint fallback')
  if (execution.includes('const runProvider = CHAT_PROVIDER_BYTEPLUS') || execution.includes('getChatDefaultEndpointUrlForProvider(CHAT_PROVIDER_BYTEPLUS)')) throw new Error('expected no BytePlus-only provider pinning')
  if (!headlessTextRun.includes('nextText => {') || !headlessTextRun.includes('projectResponse({ responseText: nextText, loading: true })')) throw new Error('expected progressive text updates')
  if (!text.includes('args.draftGraphDataRef.current || args.draftGraphData') || !runAction.includes('args.readDraftGraphData()')) throw new Error('expected output updates to use latest draft graph state')
  if (!writeback.includes('if (updated) args.scheduleWorkflowOutputEdgeRefresh()')) throw new Error('expected output writes to refresh overlay edges')
  if (!renderGraph.includes('export function getCachedStoryboardWidgetWorkflowRunPlan(args: {')) throw new Error('expected centralized workflow plan derivation')
  const runAll = readFileSync(runtime('useStoryboardWidgetWorkflowRunAll.ts'), 'utf8')
  if (!runAll.includes('const runPlan = getCachedStoryboardWidgetWorkflowRunPlan({') || !runAll.includes("import type { UiToastInput } from '@/hooks/store/types'")) throw new Error('expected Run all to reuse the workflow plan and toast input contract')
  if (!runAll.includes('isStoryboardWidgetProbeTreeLineageOnlyRootNode(draft, node)')) throw new Error('expected Run all to keep a generated Probe-Tree root as lineage while selected children own continuation runs')
  for (const snippet of ["const toastId = 'storyboard-widget-run-all'", "const upsertRunAllStatus = (status: WorkflowRunAllStatus, toast: Omit<UiToastInput, 'id'>) => {", 'ttlMs: null', 'dismissible: false', 'busy: true', '`Run All starting: 0/${ids.length} nodes. ${phaseSummary}`', '`Run All running ${index + 1}/${ids.length}: ${label}`', '`Run All completed ${index + 1}/${ids.length}: ${label}`', "`Run All complete: ran ${ids.length} node${ids.length === 1 ? '' : 's'}.`"]) {
    if (!runAll.includes(snippet)) throw new Error(`expected Run all progress toast contract snippet: ${snippet}`)
  }
  for (const snippet of ['sourcePersistence: {', "detail.source === 'chat' ? 'Chat Run All' : 'Run All'", "source: 'gitGraph'"]) {
    if (!runAll.includes(snippet)) throw new Error(`expected Run all Git-style source tracking contract snippet: ${snippet}`)
  }
  if (runAll.includes("args.upsertUiToast({ id: 'storyboard-widget-run-all-done'")) throw new Error('expected Run all completion to resolve its shared progress toast')
  if (runAll.includes('}, [args])')) throw new Error('expected Run All event ownership to use stable member dependencies instead of the render-local args object')
  const runnerMemoStart = text.indexOf('const runWorkflowNode = React.useMemo(')
  const runnerMemoEnd = text.indexOf('useStoryboardWidgetWorkflowRunAll({', runnerMemoStart)
  const runnerMemo = text.slice(runnerMemoStart, runnerMemoEnd)
  if (!runnerMemo || runnerMemo.includes('}), [args])')) throw new Error('expected the shared node runner to remain stable across toolbar pointer-down layout-lock renders')
}
