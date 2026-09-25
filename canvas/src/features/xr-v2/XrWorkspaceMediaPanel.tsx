import React from 'react'
import IconButton from '@/components/IconButton'
import { Activity, Boxes, ListTree, ScanSearch, Bot } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readSemanticObjectViewMarkdown } from './semanticObjectView'
import { readSemanticSpace, subscribeSemanticSpace } from './semanticSpaceStore'
import { selectSemanticObject } from './semanticSpaceCanvas'
import type { SpaceDocument } from './semanticSpaceRuntime'
import { activateAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'

const SceneOutline = React.lazy(() => import('./SemanticSceneOutline'))
const XrLibrary = React.lazy(() => import('@/features/command-menu/XrMediaLibraryPanel').then(m => ({ default: m.XrMediaLibraryPanel })))
const Inspector = React.lazy(() => import('@/features/gitgraph/TimelineBottomPanelView').then(m => ({ default: m.XrObjectInspector })))
const BrowserTools = React.lazy(() => import('@/features/agent-ready/WorkspaceActivityPanel').then(m => ({ default: m.WorkspaceBrowserTools })))
const Agents = React.lazy(() => import('@/features/agent-ready/AgentMissionConsolePanel'))
const tabs = [ ['assets', 'Assets', Boxes], ['outliner', 'Outliner', ListTree],
  ['inspector', 'Inspector', ScanSearch], ['agents', 'Agents', Bot] ] as const
type MediaView = typeof tabs[number][0]

/** Navigation only: scene, selection, inspector and Mission retain their existing owners. */
export default function XrWorkspaceMediaPanel({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<MediaView>('assets')
  const documentName = useGraphStore(s => s.markdownDocumentName)
  const markdown = useGraphStore(s => s.markdownDocumentText)
  const target = React.useMemo(() => readSemanticObjectViewMarkdown(markdown), [markdown])
  const [space, setSpace] = React.useState<SpaceDocument | null>(null)
  const [error, setError] = React.useState('')
  const [search, setSearch] = React.useState('')
  React.useEffect(() => {
    setSearch(''); setSpace(null); setError('')
    if (!target || view !== 'outliner') return
    let alive = true, generation = 0
    const refresh = () => { const request = ++generation; void readSemanticSpace().then(next => {
      if (alive && generation === request) { setSpace(next?.id === target.spaceId ? next : null); setError(next?.id === target.spaceId ? '' : 'The displayed space is unavailable. Reopen it from Assets.') }
    }, reason => { if (alive && generation === request) setError(String(reason.message || reason)) }) }
    refresh(); const unsubscribe = subscribeSemanticSpace(refresh)
    return () => { alive = false; unsubscribe() }
  }, [documentName, target?.spaceId, target?.evidenceSha256, view])
  return <section className="flex h-full min-h-0 flex-col" aria-label="XR Media workspace">
    <nav className="flex shrink-0 flex-wrap gap-1 border-b p-1" aria-label="XR Media views">
      {tabs.map(([id, label, Icon]) => <IconButton key={id} title={label} showTooltip
        className="App-toolbar__btn min-h-11" style={{ minWidth: 44, color: view === id ? 'var(--kg-accent-contrast)' : undefined }}
        aria-pressed={view === id} onClick={() => setView(id)}>
        <Icon className="size-4" aria-hidden /><span>{label}</span>
      </IconButton>)}
      <IconButton title="Activity" showTooltip className="App-toolbar__btn min-h-11" style={{ minWidth: 44 }} onClick={() => {
        const state = useGraphStore.getState(); state.setBottomSurfaceTab('activity'); state.setBottomSurfaceCollapsed(false)
      }}><Activity className="size-4" aria-hidden /></IconButton>
    </nav>
    <section className="min-h-0 flex-1 overflow-auto" aria-label={tabs.find(([id]) => id === view)![1]}>
      <React.Suspense fallback={<p role="status" className="p-2">Opening {view}…</p>}>
        {view === 'assets' ? children : view === 'outliner' ? <div className="p-2">
          {target ? space && space.id === target.spaceId ? <SceneOutline key={`${space.id}:${target.evidenceSha256}`}
            space={space} evidenceSha256={target.evidenceSha256} onSelect={async id => {
              const current = readSemanticObjectViewMarkdown(useGraphStore.getState().markdownDocumentText)
              if (current?.spaceId !== target.spaceId || current.evidenceSha256 !== target.evidenceSha256) throw Error('Scene changed. Select an object in the current scene.')
              await selectSemanticObject(space.id, id); setView('inspector')
            }} /> : <p role="status">{error || 'Opening the saved scene…'}</p>
            : <><label className="grid gap-1 text-xs">Find an object<input type="search" className="min-h-11 min-w-0 rounded border bg-transparent px-2"
              value={search} maxLength={80} onChange={event => setSearch(event.currentTarget.value)} /></label>
              <XrLibrary searchText={search} presentation="outliner" /></>}
        </div> : view === 'inspector' ? <Inspector emptyMessage="Select an object in the scene or Outliner to inspect it." /> : <>
          <button type="button" className="App-toolbar__btn min-h-11 m-2" onClick={() => activateAgentRunWorkspace('tree')}>Open Agent Mission</button>
          <BrowserTools /><Agents />
        </>}
      </React.Suspense>
    </section>
  </section>
}
