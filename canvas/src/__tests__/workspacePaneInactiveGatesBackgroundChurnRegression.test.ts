import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertWorkspaceToolbarBoundaryStyle } from './canvasToolbarDockResponsiveContract.test'

export function testEmbeddedEditorShellPassesActiveToMarkdownWorkspace() {
  const p = resolve(process.cwd(), 'src', 'components', 'EmbeddedEditorShell.tsx')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('<MarkdownWorkspaceLazy active=')) {
    throw new Error('expected EmbeddedEditorShell to pass active flag to MarkdownWorkspace')
  }
}

export function testWorkspaceOpenCanvasToolbarDoesNotCoverEditorPaneControls() {
  const p = resolve(process.cwd(), 'src', 'pages', 'Canvas.tsx')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('UI_RESPONSIVE_CANVAS_WORKSPACE_TOOLBAR_DOCK_CLASSNAME')) {
    throw new Error('expected workspace-open canvas toolbar to use its shared responsive dock owner')
  }
  assertWorkspaceToolbarBoundaryStyle(text)
  if (!text.includes('canvasToolbarDockSpansViewport ? undefined : { left: workspacePaneBoundaryCss }')) {
    throw new Error('expected workspace-open canvas toolbar to keep the desktop pane boundary and span the mobile viewport')
  }
}
