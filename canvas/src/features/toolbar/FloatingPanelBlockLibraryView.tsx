import { CollapsibleSection, ExpandCollapseAllButton, useCollapsibleSectionGroup } from 'agentic-design-system/react/panels'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'
import { PanelSelect } from '@/lib/ui/panelFormControls'
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
  const visibleGroups = CATEGORIES.map(category => ({
    category,
    entries: BLOCK_DEFINITIONS.filter(item => item.category === category &&
      matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [item.title, item.description, category])),
  })).filter(group => group.entries.length)
  const categories = useCollapsibleSectionGroup(visibleGroups.map(group => group.category))
  const results = useCollapsibleSectionGroup(visibleGroups.map(group => group.category))
  const { expandAll: expandSearchResults } = results
  React.useEffect(() => { expandSearchResults() }, [search.normalizedSearchQuery, expandSearchResults])
  const group = search.normalizedSearchQuery ? results : categories
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
      actions={visibleGroups.length ? <ExpandCollapseAllButton allCollapsed={group.allCollapsed}
        onCollapseAll={group.collapseAll} onExpandAll={group.expandAll} /> : null}
      searchControl={<FloatingPanelCatalogSearchControl id="block-library-search" buttonLabel="Search Block library"
        panelLabel="Search Block library" placeholder="Search blocks" state={search} />} />
    <section className={floatingPanelCatalogBodyClassName()} aria-label="Block categories">
      {visibleGroups.map(({ category, entries }) => {
        const tone = BLOCK_VISUAL_TONES[category]
        return <section key={category} aria-label={`${category} blocks`} data-block-category={category}>
          <CollapsibleSection headingAs="h3" title={`${category} (${entries.length})`}
            collapsed={group.collapsedKeys.has(category)} onToggle={collapsed => group.setCollapsed(category, collapsed)}>
            <ul className="space-y-1.5">{entries.map(item => <li key={item.id}>
              <button type="button" onClick={() => { setSelectedId(item.id); setSelectedGeneration(session?.generation ?? null); setFeedback('') }} aria-pressed={selectedId === item.id}
                className={`block w-full rounded-lg border border-transparent px-2.5 py-2 text-left shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--agentic-control-focus)] ${uiSelectedRowStateClassName(selectedId === item.id)}`}
                style={{ background: `color-mix(in srgb, ${tone} 8%, var(--agentic-panel-background))`,
                  outline: selectedId === item.id ? undefined : `1px solid color-mix(in srgb, ${tone} 45%, transparent)` }}>
                <span className="flex min-w-0 items-start gap-2">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: tone }}>{category[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold leading-4">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-4 opacity-75">{item.description}</span>
                  </span>
                </span>
                <span aria-hidden="true" className="kg-block-preview mt-2 font-mono text-xs leading-4" data-shape={blockDefinitionShape(item.id)}
                  style={{ '--block-tone': tone } as React.CSSProperties}>
                  {item.snippet.split('\n').map((line, index) => <span key={index} className="block truncate">{line || ' '}</span>)}
                </span>
              </button>
            </li>)}</ul>
          </CollapsibleSection>
        </section>
      })}
      {!visibleGroups.length &&
        <p role="status" className="px-2 py-4 text-xs">No matching blocks.</p>}
    </section>
    <section className={`shrink-0 space-y-1 border-t px-2 py-2 text-xs ${UI_THEME_TOKENS.panel.border}`} aria-label="Block insertion">
      <p className="truncate" title={session?.documentId || ''}>{session ? `File: ${session.documentId.split('/').pop()} · Target: ${target?.title || 'none'}` : 'Open Block in Editor Workspace to select a target.'}</p>
      {selected ? <><p className="font-semibold">{selected.title} · {selected.category}</p><pre className="max-h-24 overflow-auto rounded border p-1.5 text-xs">{selected.snippet}</pre></> : <p>Select a block to preview it.</p>}
      <div className="flex items-center gap-1">
        <label htmlFor="block-insert-position">Place</label>
        <PanelSelect id="block-insert-position" value={position} onValueChange={selectedValueInput => setPosition(selectedValueInput as BlockInsertPosition)} className={`min-w-0 flex-1 rounded border bg-transparent px-1 py-1 ${UI_THEME_TOKENS.panel.border}`}>
          <option value="inside">Inside</option><option value="before">Before</option><option value="after">After</option>
        </PanelSelect>
        <button type="button" disabled={!selected || !canInsert} onClick={insert} className="rounded border px-2 py-1 font-semibold disabled:opacity-50">Insert</button>
      </div>
      {feedback ? <p role="status" className="break-words">{feedback}</p> : null}
      {!canInsert && session ? <p className="opacity-70">{selected && selectedGeneration !== session.generation
        ? 'Source or target changed. Select this block again before inserting.'
        : 'Select a compatible program or statement target in Block.'}</p> : null}
    </section>
  </section>
}
