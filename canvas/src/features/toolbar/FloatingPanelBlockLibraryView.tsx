import * as React from 'react'
import { BLOCK_DEFINITIONS, type BlockInsertPosition } from '@/features/block-editor/blockLibrary'
import { readBlockSession, subscribeBlockSession } from '@/features/block-editor/blockSession'
import { BLOCK_VISUAL_TONES, blockDefinitionShape } from '@/features/block-editor/blockVisualLanguage'
import '@/features/block-editor/blockShapes.css'
import {
  FloatingPanelCatalogHeader, FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName, floatingPanelCatalogSurfaceClassName,
  matchesFloatingPanelCatalogSearch, useFloatingPanelCatalogSearch,
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
    <section className={floatingPanelCatalogBodyClassName('space-y-3 px-1.5 py-2')} aria-label="Block categories"
      style={{ backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--kg-border, #94a3b8) 64%, transparent) 0.8px, transparent 0.9px)', backgroundSize: '18px 18px' }}>
      {CATEGORIES.map(category => {
        const entries = BLOCK_DEFINITIONS.filter(item => item.category === category && matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [item.title, item.description, category]))
        if (!entries.length) return null
        const open = !!search.normalizedSearchQuery || expanded.has(category)
        const tone = BLOCK_VISUAL_TONES[category]
        return <section key={category} aria-label={`${category} blocks`} data-block-category={category}>
          <button type="button" aria-expanded={open} className="flex min-h-9 w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            style={{ borderColor: `color-mix(in srgb, ${tone} 55%, transparent)`, background: `color-mix(in srgb, ${tone} 12%, var(--kg-panel-bg, white))` }}
            onClick={() => setExpanded(previous => { const next = new Set(previous); if (!next.delete(category)) next.add(category); return next })}>
            <span className="h-4 w-1.5 rounded-full" aria-hidden="true" style={{ background: tone }} />
            <span className="min-w-0 flex-1">{category}</span><span className="rounded px-1 font-mono opacity-70">{entries.length}</span>
            <span aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
          {open && <ul className="space-y-1.5 pt-1.5">{entries.map(item => <li key={item.id}>
            <button type="button" onClick={() => { setSelectedId(item.id); setSelectedGeneration(session?.generation ?? null); setFeedback('') }} aria-pressed={selectedId === item.id}
              className={`block w-full rounded-lg border-l-[5px] px-2.5 py-2 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${selectedId === item.id ? 'ring-2 ring-blue-500' : ''}`}
              style={{ borderLeftColor: tone, background: `color-mix(in srgb, ${tone} 8%, var(--kg-panel-bg, white))`,
                outline: selectedId === item.id ? undefined : `1px solid color-mix(in srgb, ${tone} 45%, transparent)` }}>
              <span className="flex min-w-0 items-start gap-2">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: tone }}>{category[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold leading-4">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 opacity-75">{item.description}</span>
                </span>
              </span>
              <span aria-hidden="true" className="kg-block-preview mt-2 font-mono text-[11px] leading-4" data-shape={blockDefinitionShape(item.id)}
                style={{ '--block-tone': tone } as React.CSSProperties}>
                {item.snippet.split('\n').map((line, index) => <span key={index} className="block truncate">{line || ' '}</span>)}
              </span>
            </button>
          </li>)}</ul>}
        </section>
      })}
      {!BLOCK_DEFINITIONS.some(item => matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [item.title, item.description, item.category])) &&
        <p role="status" className="px-2 py-4 text-xs">No matching blocks.</p>}
    </section>
    <section className={`shrink-0 space-y-1 border-t px-2 py-2 text-xs ${UI_THEME_TOKENS.panel.border}`} aria-label="Block insertion">
      <p className="truncate" title={session?.documentId || ''}>{session ? `File: ${session.documentId.split('/').pop()} · Target: ${target?.title || 'none'}` : 'Open Block in Editor Workspace to select a target.'}</p>
      {selected ? <><p className="font-semibold">{selected.title} · {selected.category}</p><pre className="max-h-24 overflow-auto rounded border p-1.5 text-[11px]">{selected.snippet}</pre></> : <p>Select a block to preview it.</p>}
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
