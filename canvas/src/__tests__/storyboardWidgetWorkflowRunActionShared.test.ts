import { readFileSync } from 'node:fs'

export function testStoryboardWidgetWorkflowRunActionIsSharedBetweenStoryboardWidgetAndStoryboard() {
  const sharedSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction.ts', import.meta.url), 'utf8')
  const hookSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions.ts', import.meta.url), 'utf8')
  const storyboardSource = readFileSync(new URL('../components/StoryboardCanvas.tsx', import.meta.url), 'utf8')

  for (const snippet of [
    'export function createStoryboardWidgetWorkflowNodeRunner',
    "export { resolveStoryboardWidgetBaseGraphKind } from './storyboardWidgetWorkflowRunTypes'",
    "export type { StoryboardWidgetWorkflowNodeRunner, StoryboardWidgetWorkflowNodeRunnerArgs } from './storyboardWidgetWorkflowRunTypes'",
    'const executeRunWorkflowNode: StoryboardWidgetWorkflowNodeRunner = async',
    'scheduleWorkflowOutputEdgeRefresh()\n    if (deferredError)',
  ]) {
    if (!sharedSource.includes(snippet)) {
      throw new Error(`expected shared workflow run action to contain snippet: ${snippet}`)
    }
  }

  if (!hookSource.includes("import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'")) {
    throw new Error('expected Storyboard Widget workflow hook to import the shared workflow run action')
  }
  if (!hookSource.includes('const runWorkflowNode = React.useMemo(() => createStoryboardWidgetWorkflowNodeRunner({')) {
    throw new Error('expected Storyboard Widget workflow hook to build runWorkflowNode from the shared workflow run action')
  }
  if (!hookSource.includes('captureExecutionAnchor: args.captureExecutionAnchor')) {
    throw new Error('expected Storyboard Widget workflow hook to pass the live Run execution-anchor authority')
  }
  if (hookSource.includes('const runWorkflowNode = React.useCallback(async (nodeId: string')) {
    throw new Error('expected Storyboard Widget workflow hook to avoid owning an inline runWorkflowNode implementation')
  }

  if (!storyboardSource.includes("import { createStoryboardWidgetWorkflowNodeRunner, resolveStoryboardWidgetBaseGraphKind } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'")) {
    throw new Error('expected StoryboardCanvas to import the shared workflow run action utilities')
  }
  if (!storyboardSource.includes('const runStoryboardWorkflowNode = React.useMemo(() => createStoryboardWidgetWorkflowNodeRunner({')) {
    throw new Error('expected StoryboardCanvas to build its Run action from the shared workflow run action')
  }
  if (!storyboardSource.includes("scheduleOverlayEdgeUpdate: () => {}")) {
    throw new Error('expected StoryboardCanvas to provide a neutral overlay-edge adapter to the shared workflow run action')
  }
  if (
    !storyboardSource.includes('const captureStoryboardRunExecutionAnchor = React.useCallback((rawNodeId: string) => {')
    || !storyboardSource.includes('buildStoryboardWidgetRunExecutionAnchorSnapshot({')
    || !storyboardSource.includes('captureExecutionAnchor: captureStoryboardRunExecutionAnchor')
  ) {
    throw new Error('expected StoryboardCanvas Run to share the same live execution-anchor contract as Storyboard Widget')
  }
}
