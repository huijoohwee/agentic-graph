import * as React from 'react'
import { BLOCK_DEFINITIONS, type BlockInsertPosition } from '@/features/block-editor/blockLibrary'
import { readBlockSession, subscribeBlockSession } from '@/features/block-editor/blockSession'
import {
  FloatingPanelCatalogHeader, FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName, floatingPanelCatalogCompactIconFrameClassName,
  floatingPanelCatalogCompactRowClassName, floatingPanelCatalogCompactRowMetaClassName,
  floatingPanelCatalogCompactRowTitleClassName, floatingPanelCatalogCompactRowTokenClassName,
  floatingPanelCatalogSurfaceClassName, matchesFloatingPanelCatalogSearch,
  useFloatingPanelCatalogSearch,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const CATEGORIES = ['Logic', 'Loops', 'Math', 'Text', 'Variables', 'Functions'] as const

export function FloatingPanelBlockLibraryView() {
  const search = useFloatingPanelCatalogSearch()
  const session = React.useSyncExternalStore(subscribeBlockSession, readBlockSession, () => null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [selectedGeneration, setSelectedGeneration] = React.useState<number | null>(null)
  const [position, setPosition] = React.useState<BlockInsertPosition>('inside')
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(CATEGORIES))
  const [feedback, setFeedback] = React.useState('')
  const selected = BLOCK_DEFINITIONS.find(item => item.id === selectedId) || null
  const target = session?.target || null
  const canInsert = !!session && selectedGeneration === session.generation && !session.readOnly && !!target && (target.statement || target.id === 'program')
    && (position !== 'inside' || target.container) && (target.id !== 'program' || position === 'inside')
  const insert = () => {
    if (!selected || !session || !canInsert) return
    if (readBlockSession()?.generation !== selectedGeneration) { setFeedback('Source or target changed. Select the block again.'); return }
    try { session.insert(selected, position); setFeedback(`${selected.title} inserted into ${session.documentId.split('/').pop()}.`) }
    catch (error) { setFeedback(error instanceof Error ? error.message : String(error)) }
  }
  return <section className={floatingPanelCatalogSurfaceClassName()} aria-label="Block library">
    <FloatingPanelCatalogHeader title="Block library" subtitle="Local program definitions" actionsLabel="Block library actions"
      actions={<button type="button" className={`rounded border px-1 text-[10px] ${UI_THEME_TOKENS.panel.border}`}
        onClick={() => setExpanded(previous => previous.size === CATEGORIES.length ? new Set() : new Set(CATEGORIES))}>
        {expanded.size === CATEGORIES.length ? 'Collapse all' : 'Expand all'}</button>}
      searchControl={<FloatingPanelCatalogSearchControl id="block-library-search" buttonLabel="Search Block library"
        panelLabel="Search Block library" placeholder="Search blocks" state={search} />} />
    <section className={floatingPanelCatalogBodyClassName('space-y-2 px-1')} aria-label="Block categories">
      {CATEGORIES.map(category => {
        const entries = BLOCK_DEFINITIONS.filter(item => item.category === category && matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [item.title, item.description, category]))
        if (!entries.length) return null
        const open = !!search.normalizedSearchQuery || expanded.has(category)
        return <section key={category} aria-label={`${category} blocks`}>
          <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setExpanded(previous => { const next = new Set(previous); if (!next.delete(category)) next.add(category); return next })}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>{category}<span className="opacity-60">{entries.length}</span>
          </button>
          {open && <ul className="space-y-1">{entries.map(item => <li key={item.id}>
            <button type="button" onClick={() => { setSelectedId(item.id); setSelectedGeneration(session?.generation ?? null); setFeedback('') }} aria-pressed={selectedId === item.id}
              className={`${floatingPanelCatalogCompactRowClassName()} w-full ${selectedId === item.id ? 'ring-2 ring-blue-500' : ''}`}>
              <span aria-hidden="true" className={floatingPanelCatalogCompactIconFrameClassName('text-xs font-semibold')}>{category[0]}</span>
              <span className="min-w-0"><span className={floatingPanelCatalogCompactRowTitleClassName('block')}>{item.title}</span>
                <span className={floatingPanelCatalogCompactRowMetaClassName('block')}>{item.description}</span></span>
              <span className={floatingPanelCatalogCompactRowTokenClassName()}>{item.kind}</span>
            </button>
          </li>)}</ul>}
        </section>
      })}
      {!BLOCK_DEFINITIONS.some(item => matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [item.title, item.description, item.category])) &&
        <p role="status" className="px-2 py-4 text-xs">No matching blocks.</p>}
    </section>
    <section className={`shrink-0 space-y-1 border-t px-2 py-2 text-xs ${UI_THEME_TOKENS.panel.border}`} aria-label="Block insertion">
      <p className="truncate" title={session?.documentId || ''}>{session ? `File: ${session.documentId.split('/').pop()} · Target: ${target?.title || 'none'}` : 'Open Block in Editor Workspace to select a target.'}</p>
      {selected ? <><p className="font-semibold">{selected.title}</p><pre className="max-h-24 overflow-auto rounded border p-1 text-[11px]">{selected.snippet}</pre></> : <p>Select a block to preview it.</p>}
      <div className="flex items-center gap-1">
        <label htmlFor="block-insert-position">Place</label>
        <select id="block-insert-position" value={position} onChange={event => setPosition(event.target.value as BlockInsertPosition)} className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-1 ${UI_THEME_TOKENS.panel.border}`}>
          <option value="inside">Inside</option><option value="before">Before</option><option value="after">After</option>
        </select>
        <button type="button" disabled={!selected || !canInsert} onClick={insert} className="rounded border px-2 py-1 font-semibold disabled:opacity-50">Insert</button>
      </div>
      {feedback ? <p role="status" className="break-words">{feedback}</p> : null}
      {!canInsert && session ? <p className="opacity-70">{selected && selectedGeneration !== session.generation
        ? 'Source or target changed. Select this block again before inserting.'
        : 'Select a compatible program or statement target in Block.'}</p> : null}
    </section>
  </section>
}
