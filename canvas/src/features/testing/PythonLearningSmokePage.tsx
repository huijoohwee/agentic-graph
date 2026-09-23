import React from 'react'
import { MarkdownWorkspaceMain } from '../markdown-workspace/main/MarkdownWorkspaceMain'
import type { MarkdownWorkspaceLayoutMode } from '../markdown-explorer/workspaceUi'
import type { MonacoTextEditorHandle } from '../monaco/MonacoTextEditor'
import { getLearningWorkspace } from '../python-learning/learningPersistence'
import { LEARNING_LESSONS } from '../python-learning/learningLessons'
import { pythonLearningRuntime } from '../python-learning/learningRuntime'
import { createLearningToolExecutor } from '../python-learning/learningWebMcp'
import { CanvasViewport } from '@/components/CanvasViewport'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'

// Imported only by the owned smoke runner's temporary entry. No production route or auto-run.
export default function PythonLearningSmokePage() {
  const [source, setSource] = React.useState(''), [loaded, setLoaded] = React.useState(false)
  const [mode, setMode] = React.useState<MarkdownWorkspaceLayoutMode>('editor')
  const view = useGraphStore(s => s.workspaceViewMode)
  const writes = React.useRef(Promise.resolve())
  const editorRef = React.useRef<MonacoTextEditorHandle | null>(null), presentationRef = React.useRef(null)
  React.useEffect(() => {
    let live = true
    useMarkdownExplorerStore.getState().setActivePath('/learning.py')
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    void getLearningWorkspace().then(async fs => {
      let text = await fs.readFileText('/learning.py')
      if (text === null) { text = LEARNING_LESSONS[0].starter; await fs.createFile({ parentPath: '/', name: 'learning.py', text }) }
      if (live) { setSource(text); setLoaded(true) }
    })
    const bridge = { flush: () => writes.current, read: pythonLearningRuntime.read, tools: createLearningToolExecutor(), lessons: LEARNING_LESSONS }
    Object.assign(window, { __pythonLearningProof: bridge })
    return () => { live = false; Reflect.deleteProperty(window, '__pythonLearningProof') }
  }, [])
  const change = (text: string) => {
    setSource(text)
    writes.current = writes.current.then(async () => { const fs = await getLearningWorkspace(); await fs.writeFileText('/learning.py', text) })
  }
  return <div style={{ position: 'relative', height: '100dvh', minWidth: 0 }}>
    <CanvasViewport variant="workspace" geospatialModeEnabled={false} canvasRenderMode="2d" canvas3dMode="xr" canvas2dRenderer="d3" workspaceEditorOverlayOpen={view === 'editor'} />
    <section hidden={view !== 'editor'} data-kg-workspace-left-pane="1" style={{ position: 'absolute', inset: '0 auto 0 0', width: 'min(100%,420px)', background: '#fff', display: view === 'editor' ? 'flex' : 'none' }}>
    {loaded ? <MarkdownWorkspaceMain themeMode="dark" uiPanelTextFontClass="" uiPanelMonospaceTextClass=""
      explorerOpen={false} setExplorerOpen={() => {}} layoutMode={mode} setLayoutMode={setMode}
      markdownWordWrap={true} setMarkdownWordWrap={() => {}} markdownTextHighlight={false} setMarkdownTextHighlight={() => {}}
      onToggleFullscreen={() => {}} presentationApiRef={presentationRef} isMarkdown={false} activeText={source} setActiveText={change}
      activeDocumentKey="/learning.py" highlightedLineRange={null} revealLineInEditor={line => editorRef.current?.revealLine(line)}
      showInViewer={() => {}} showInPresentation={() => {}} showInGallery={() => {}} editorUri="workspace:///learning.py"
      editorLanguage="python" editorRef={editorRef} /> : <p role="status">Loading native workspace storage…</p>}
    </section>
  </div>
}
