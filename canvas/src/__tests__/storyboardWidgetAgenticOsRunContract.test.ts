import fs from 'node:fs'
import path from 'node:path'

export function testStoryboardWidgetRunTargetsCanonicalAgenticOsWorkspaceDocument() {
  const filePath = path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const landingGuardSnippet = 'ensureEditorCanvasLandingForDuration(1500)'
  const applyCanonicalDocumentSnippet = 'applyMarkdownDocumentToGraph(canonicalPath, canonicalText, { force: true })'

  const requiredSnippets = [
    "!suppressLayoutMutation && activeWorkspacePath && isAgenticOsWorkspaceCompanionPath(activeWorkspacePath)",
    'const canonicalPath = toCanonicalAgenticOsWorkspacePath(activeWorkspacePath)',
    'useMarkdownExplorerStore.getState().setActivePath(canonicalPath)',
    landingGuardSnippet,
    applyCanonicalDocumentSnippet,
    'await emitAgenticOsRunOutput({',
  ]

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      throw new Error(`Expected StoryboardWidget Run handler to include canonical AGENTIC_OS runnable behavior: ${snippet}`)
    }
  }

  const landingGuardIndex = source.indexOf(landingGuardSnippet)
  const applyCanonicalDocumentIndex = source.indexOf(applyCanonicalDocumentSnippet)

  if (landingGuardIndex > applyCanonicalDocumentIndex) {
    throw new Error('Expected StoryboardWidget Run handler to install the editor canvas landing guard before applying the canonical AGENTIC_OS document')
  }
}

export function testStoryboardWidgetLandingGuardStopsAfterWorkspaceClose() {
  const filePath = path.resolve(process.cwd(), 'src/lib/toolbar/workspaceLandingGuard.ts')
  const source = fs.readFileSync(filePath, 'utf8')

  if (!source.includes("if (workspaceViewMode !== 'editor' || editorWorkspacePane !== 'markdown' || workspaceCanvasPaneOpen !== true)")) {
    throw new Error('Expected editor canvas landing guard to stop when workspace close or pane changes occur')
  }
  if (source.includes('try {\n        apply()')) {
    throw new Error('Expected editor canvas landing guard not to reapply editor mode from the subscription after user close')
  }
}
