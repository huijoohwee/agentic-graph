import { resolveMarkdownWorkspaceIndexingFreshText } from '@/lib/markdown-workspace-runtime/markdownWorkspaceIndexingFreshText'

export function testMarkdownWorkspaceIndexingPrefersGraphAuthoredActiveDocumentText() {
  const path = 'docs/agentic-graph-storyboard-widget-computing-flow-template.md' as never
  const scheduledLastLoaded = { path, text: 'input_metric_target: 500' }
  const staleFsText = 'input_metric_target: 500'
  const graphAuthoredText = 'input_metric_target: 50'

  const resolved = resolveMarkdownWorkspaceIndexingFreshText({
    path,
    nextText: staleFsText,
    scheduledLastLoaded,
    liveLoaded: scheduledLastLoaded,
    liveMarkdownDocumentName: path,
    liveMarkdownDocumentText: graphAuthoredText,
  })

  if (resolved !== graphAuthoredText) {
    throw new Error(`expected stale indexing text to yield to graph-authored active document text, got ${JSON.stringify(resolved)}`)
  }
}

export function testMarkdownWorkspaceIndexingKeepsNewerLoadedRefAheadOfScheduledText() {
  const path = 'docs/agentic-graph-storyboard-widget-computing-flow-template.md' as never
  const scheduledLastLoaded = { path, text: 'input_metric_target: 500' }
  const liveLoaded = { path, text: 'input_metric_target: 75' }

  const resolved = resolveMarkdownWorkspaceIndexingFreshText({
    path,
    nextText: 'input_metric_target: 500',
    scheduledLastLoaded,
    liveLoaded,
    liveMarkdownDocumentName: path,
    liveMarkdownDocumentText: '',
  })

  if (resolved !== liveLoaded.text) {
    throw new Error(`expected newer live loaded text to win over stale scheduled indexing text, got ${JSON.stringify(resolved)}`)
  }
}
