import {
  shouldCommitMarkdownEditorSsotSync,
  shouldScheduleMarkdownEditorSsotSync,
} from '@/features/markdown-workspace/useMarkdownEditorSsotSync'

export function testMarkdownEditorSsotSyncSkipsPendingWorkspaceDocumentSwitch() {
  const shouldSchedule = shouldScheduleMarkdownEditorSsotSync({
    activeDocumentKey: '/docs_/6706219f-f8d2-418a-90a9-aae18de752a7/6706219f-f8d2-418a-90a9-aae18de752a7.md',
    activeTextOwnedByActivePath: false,
    paused: false,
  })
  if (shouldSchedule) {
    throw new Error('expected editor SSOT sync to stay paused while active text ownership has not transferred to the selected workspace path')
  }

  const shouldCommit = shouldCommitMarkdownEditorSsotSync({
    scheduledDocumentKey: '/docs_/6706219f-f8d2-418a-90a9-aae18de752a7/6706219f-f8d2-418a-90a9-aae18de752a7.md',
    activeDocumentKey: '/docs_/6706219f-f8d2-418a-90a9-aae18de752a7/6706219f-f8d2-418a-90a9-aae18de752a7.md',
    activeText: '# Chat Stream Log\n\n- Provider: Agnes AI API · Global · agnes-2.0-flash\n',
    activeTextOwnedByActivePath: false,
  })
  if (shouldCommit) {
    throw new Error('expected editor SSOT sync commit to suppress stale chat-stream text until the selected workspace file owns the editor text')
  }
}

export function testMarkdownEditorSsotSyncAllowsOwnedActiveWorkspaceText() {
  const shouldSchedule = shouldScheduleMarkdownEditorSsotSync({
    activeDocumentKey: '/docs_/6706219f-f8d2-418a-90a9-aae18de752a7/6706219f-f8d2-418a-90a9-aae18de752a7.md',
    activeTextOwnedByActivePath: true,
    paused: false,
  })
  if (!shouldSchedule) {
    throw new Error('expected editor SSOT sync to schedule once the selected workspace file owns the active editor text')
  }

  const shouldCommit = shouldCommitMarkdownEditorSsotSync({
    scheduledDocumentKey: '/docs_/6706219f-f8d2-418a-90a9-aae18de752a7/6706219f-f8d2-418a-90a9-aae18de752a7.md',
    activeDocumentKey: '/docs_/6706219f-f8d2-418a-90a9-aae18de752a7/6706219f-f8d2-418a-90a9-aae18de752a7.md',
    activeText: '# Oil market blind spot analysis and price forecast\n',
    activeTextOwnedByActivePath: true,
  })
  if (!shouldCommit) {
    throw new Error('expected editor SSOT sync commit to allow owned editor text for the active workspace file')
  }
}

export function testMarkdownEditorSsotSyncRejectsStaleScheduledExplorerDocument() {
  const shouldCommit = shouldCommitMarkdownEditorSsotSync({
    scheduledDocumentKey: 'docs/workspace-readme.md',
    activeDocumentKey: 'docs/workspace-readme.md',
    activeText: '# Stale workspace readme',
    activeTextOwnedByActivePath: true,
    liveExplorerDocumentKey: 'docs/agentic-graph-agentic-video-canvas-demo.md',
  })
  if (shouldCommit) {
    throw new Error('expected a scheduled editor sync to revalidate the live Explorer document before mutating graph-owned Markdown state')
  }
}

export function testMarkdownEditorSsotSyncSkipsNonMarkdownWorkspaceSources() {
  const nonMarkdownKeys = [
    '/docs/data.json',
    '/docs/data.jsonld',
    '/docs/data.geojson',
    '/docs/table.csv',
    '/docs/table.tsv',
    '/docs/page.html',
  ]

  for (const activeDocumentKey of nonMarkdownKeys) {
    const shouldSchedule = shouldScheduleMarkdownEditorSsotSync({
      activeDocumentKey,
      activeTextOwnedByActivePath: true,
      paused: false,
    })
    if (shouldSchedule) {
      throw new Error(`expected editor SSOT sync to skip non-markdown workspace source ${activeDocumentKey}`)
    }

    const shouldCommit = shouldCommitMarkdownEditorSsotSync({
      scheduledDocumentKey: activeDocumentKey,
      activeDocumentKey,
      activeText: '{"rows":[]}',
      activeTextOwnedByActivePath: true,
    })
    if (shouldCommit) {
      throw new Error(`expected editor SSOT sync commit to skip non-markdown workspace source ${activeDocumentKey}`)
    }
  }
}
