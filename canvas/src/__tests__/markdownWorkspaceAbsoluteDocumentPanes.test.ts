import { resolveMarkdownWorkspaceInitialPaneVisibility } from '@/features/markdown-workspace/main/types'

export function testMarkdownWorkspaceAbsoluteDocumentPathsOpenMatchingPane() {
  const cases = [
    { path: '/.workspace/workflow-test/agent-mission.manifest.json', expected: { json: true, markdown: false, viewer: false, html: false } },
    { path: 'workspace:/notes/rows.json?revision=1#section', expected: { json: true, markdown: false, viewer: false, html: false } },
    { path: '/docs/table.csv', expected: { json: false, markdown: false, viewer: true, html: false } },
  ]
  for (const item of cases) {
    const actual = resolveMarkdownWorkspaceInitialPaneVisibility({ activeDocumentKey: item.path })
    if (
      actual.json !== item.expected.json ||
      actual.markdown !== item.expected.markdown ||
      actual.viewer !== item.expected.viewer ||
      actual.html !== item.expected.html
    ) {
      throw new Error(`expected ${item.path} to open its matching document pane`)
    }
  }
}
