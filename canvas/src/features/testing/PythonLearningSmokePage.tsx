import React from 'react'
import { LiveCanvasHeroEditorial } from '@/components/LiveCanvasHero'
import { buildLiveCanvasHeroModel } from '@/features/agentic-os/liveCanvasHeroModel'
import { loadPromptPresetCatalog } from '@/features/chat/promptPresetCatalog'
import { activateLiveCanvasHeroDemo } from '@/features/agentic-os/activateLiveCanvasHeroDemo'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
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
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'

// Imported only by the owned smoke runner's temporary entry. No production route or auto-run.
export default function PythonLearningSmokePage({ catalogText }: { catalogText?: string } = {}) {
  const [documentPath, setDocumentPath] = React.useState('/learning.py')
  const catalogRuntime = React.useMemo(() => {
    const fs = { readFileText: async () => catalogText } as unknown as WorkspaceFs
    return { loadCatalog: () => loadPromptPresetCatalog(fs), loadPrompt: async (id: string) => {
      const result = await loadPromptPresetCatalog(fs)
      const preset = result.ok ? result.presets.find(item => item.id === id) : null
      return preset ? { ok: true as const, prompt: preset.prompt } : { ok: false as const, error: 'Candidate preset unavailable.' }
    } }
  }, [catalogText])
  const [source, setSource] = React.useState(''), [loaded, setLoaded] = React.useState(false)
  const [mode, setMode] = React.useState<MarkdownWorkspaceLayoutMode>('editor')
  const view = useGraphStore(s => s.workspaceViewMode)
  const writes = React.useRef(Promise.resolve())
  const editorRef = React.useRef<MonacoTextEditorHandle | null>(null), presentationRef = React.useRef(null)
  React.useEffect(() => {
    let live = true
    if (!catalogText) useMarkdownExplorerStore.getState().setActivePath('/learning.py')
    useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    if (!catalogText) void getLearningWorkspace().then(async fs => {
      let text = await fs.readFileText('/learning.py')
      if (text === null) { text = LEARNING_LESSONS[0].starter; await fs.createFile({ parentPath: '/', name: 'learning.py', text }) }
      if (live) {
        // This isolated entry owns only the verified local file; the ordinary app bootstraps its full workspace.
        completeSourceFilesBootstrap(); setSource(text); setLoaded(true)
      }
    })
    const bridge = { flush: () => writes.current, read: pythonLearningRuntime.read, tools: createLearningToolExecutor(), lessons: LEARNING_LESSONS }
    Object.assign(window, { __pythonLearningProof: bridge })
    return () => { live = false; Reflect.deleteProperty(window, '__pythonLearningProof') }
  }, [])
  const change = (text: string) => {
    setSource(text)
    writes.current = writes.current.then(async () => { const fs = await getLearningWorkspace(); await fs.writeFileText(documentPath, text) })
  }
  if (catalogText && !loaded) return <><p>Candidate catalog preview · local source · no production publication</p><LiveCanvasHeroEditorial model={buildLiveCanvasHeroModel()}
    promptPresetsRuntime={catalogRuntime} activateDemo={async selection => {
      completeSourceFilesBootstrap()
      await activateLiveCanvasHeroDemo(selection)
      const state = useGraphStore.getState()
      setDocumentPath(useMarkdownExplorerStore.getState().activePath!)
      setSource(state.markdownDocumentText); setLoaded(true)
    }} /></>
  return <div style={{ position: 'relative', height: '100dvh', minWidth: 0 }}>
    <CanvasViewport variant="workspace" geospatialModeEnabled={false} canvasRenderMode="2d" canvas3dMode="xr" canvas2dRenderer="d3" workspaceEditorOverlayOpen={view === 'editor'} />
    <section hidden={view !== 'editor'} data-kg-workspace-left-pane="1" style={{ position: 'absolute', zIndex: 70, inset: '0 auto 0 0', width: 'min(100%,420px)', background: '#fff', display: view === 'editor' ? 'flex' : 'none' }}>
    {loaded ? <MarkdownWorkspaceMain themeMode="dark" uiPanelTextFontClass="" uiPanelMonospaceTextClass=""
      explorerOpen={false} setExplorerOpen={() => {}} layoutMode={mode} setLayoutMode={setMode}
      markdownWordWrap={true} setMarkdownWordWrap={() => {}} markdownTextHighlight={false} setMarkdownTextHighlight={() => {}}
      onToggleFullscreen={() => {}} presentationApiRef={presentationRef} isMarkdown={false} activeText={source} setActiveText={change}
      activeDocumentKey={documentPath} highlightedLineRange={null} revealLineInEditor={line => editorRef.current?.revealLine(line)}
      showInViewer={() => {}} showInPresentation={() => {}} showInGallery={() => {}} editorUri={`workspace://${documentPath}`}
      editorLanguage="python" editorRef={editorRef} /> : <p role="status">Loading native workspace storage…</p>}
    </section>
  </div>
}
