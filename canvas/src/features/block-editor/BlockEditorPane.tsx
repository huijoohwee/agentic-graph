import * as React from 'react'
import { parseLearningPython } from '@/features/python-learning/pythonParser'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import { BlockProgramRow } from './BlockProgramRow'
import { insertBlock, programTree, type BlockTreeNode } from './blockLibrary'
import { blockSource, deleteBlock, moveBlock, replaceBlock } from './blockEdits'
import { clearBlockSession, publishBlockSession } from './blockSession'
import { ProgramEditError } from './programError'

export default function BlockEditorPane(props: {
  source: string; onChange: (next: string) => void; documentId: string; readOnly: boolean
}) {
  const owner = React.useRef(Symbol('Block editor'))
  const sourceRef = React.useRef(props.source), documentRef = React.useRef(props.documentId)
  sourceRef.current = props.source; documentRef.current = props.documentId
  const [selectedId, setSelectedId] = React.useState('program')
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const [notice, setNotice] = React.useState('')
  const [edit, setEdit] = React.useState<{ documentId: string; source: string; targetId: string; draft: string } | null>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const parsed = React.useMemo(() => {
    try { const program = parseLearningPython(props.source); return { rows: programTree(program), error: '' } }
    catch (error) { return { rows: [] as BlockTreeNode[], error: error instanceof Error ? error.message : String(error) } }
  }, [props.source])
  React.useEffect(() => { setSelectedId('program'); setCollapsed(new Set()); setNotice('') }, [props.documentId])
  const rows = parsed.rows
  const byId = new Map(rows.map(row => [row.id, row]))
  const selected = byId.get(selectedId) || rows[0] || null
  let actionTarget = selected
  while (actionTarget && !actionTarget.statement && actionTarget.parentId) actionTarget = byId.get(actionTarget.parentId) || null
  const visible = rows.filter(row => {
    for (let parent = row.parentId; parent; parent = byId.get(parent)?.parentId || null) if (collapsed.has(parent)) return false
    return true
  })
  const visibleDepths = visible.map(row => row.depth)
  const focusedId = visible.some(row => row.id === selectedId) ? selectedId : visible[0]?.id
  React.useLayoutEffect(() => {
    publishBlockSession(owner.current, {
      documentId: props.documentId, source: props.source, target: selected, readOnly: props.readOnly || !!parsed.error,
      insert: (definition, position) => {
        if (documentRef.current !== props.documentId || sourceRef.current !== props.source) throw new ProgramEditError('Source changed. Select a current target.')
        if (props.readOnly || parsed.error || !selected) throw new ProgramEditError('Block editing is unavailable for this source.')
        const next = insertBlock(props.source, selected.id, position, definition)
        props.onChange(next); setNotice(`${definition.title} inserted. Save status follows the workspace source file.`)
        return next
      },
    })
  }, [parsed.error, props.documentId, props.onChange, props.readOnly, props.source, selected])
  React.useEffect(() => () => clearBlockSession(owner.current), [])
  const focus = (index: number) => listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')[index]?.focus()
  const toggle = (id: string) => setCollapsed(previous => { const next = new Set(previous); if (!next.delete(id)) next.add(id); return next })
  const navigate = (event: React.KeyboardEvent, index: number, row: BlockTreeNode, hasChildren: boolean, expanded: boolean) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowDown') focus(Math.min(index + 1, visible.length - 1))
    if (event.key === 'ArrowUp') focus(Math.max(index - 1, 0))
    if (event.key === 'Home') focus(0)
    if (event.key === 'End') focus(visible.length - 1)
    if (event.key === 'Enter' || event.key === ' ') setSelectedId(row.id)
    if (event.key === 'ArrowRight' && hasChildren) { if (!expanded) toggle(row.id); else focus(index + 1) }
    if (event.key === 'ArrowLeft') {
      if (hasChildren && expanded) toggle(row.id)
      else { const parent = visible.findIndex(item => item.id === row.parentId); if (parent >= 0) focus(parent) }
    }
  }
  const openLibrary = () => {
    const state = useGraphStore.getState()
    state.setFloatingPanelView('blockLibrary')
    state.setFloatingPanelOpen(true)
  }
  const change = (operation: () => string, message: string) => {
    if (props.readOnly || parsed.error) return
    try { const next = operation(); props.onChange(next); setNotice(message); setEdit(null); setSelectedId('program') }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const beginEdit = () => {
    if (!actionTarget?.statement) return
    try { setEdit({ documentId: props.documentId, source: props.source, targetId: actionTarget.id, draft: blockSource(props.source, actionTarget.id) }); setNotice('') }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const editStale = !!edit && (edit.documentId !== props.documentId || edit.source !== props.source)
  return <section className={`flex h-full min-h-0 flex-col ${UI_THEME_TOKENS.panel.bg}`} aria-label="Block editor">
    <header className={`border-b px-3 py-2 ${UI_THEME_TOKENS.panel.border}`}>
      <h2 className="text-sm font-semibold">Block</h2>
      <p className="truncate text-xs opacity-70">{props.documentId.split('/').pop()} · {parsed.error ? 'Source preserved' : `${rows.length - 1} nodes`}</p>
      <div className="mt-1 flex flex-wrap gap-1 text-xs">
        <button type="button" onClick={openLibrary} className="rounded border px-2 py-1">Block library</button>
        <button type="button" disabled={props.readOnly || !actionTarget?.statement || !!parsed.error} onClick={beginEdit} className="rounded border px-2 py-1 disabled:opacity-50">Edit</button>
        <button type="button" disabled={props.readOnly || !actionTarget?.statement || !!parsed.error} onClick={() => actionTarget && change(() => deleteBlock(props.source, actionTarget.id), 'Statement deleted.')} className="rounded border px-2 py-1 disabled:opacity-50">Delete</button>
        <button type="button" disabled={props.readOnly || !actionTarget?.statement || !!parsed.error} onClick={() => actionTarget && change(() => moveBlock(props.source, actionTarget.id, 'up'), 'Statement moved up.')} className="rounded border px-2 py-1 disabled:opacity-50" aria-label="Move statement up">↑</button>
        <button type="button" disabled={props.readOnly || !actionTarget?.statement || !!parsed.error} onClick={() => actionTarget && change(() => moveBlock(props.source, actionTarget.id, 'down'), 'Statement moved down.')} className="rounded border px-2 py-1 disabled:opacity-50" aria-label="Move statement down">↓</button>
      </div>
    </header>
    {parsed.error ? <p role="alert" className="p-3 text-sm">Blocks are read only for this source: {parsed.error}. Edit Python to continue.</p> : <>
      {notice ? <p role="status" className="px-3 py-1 text-xs">{notice}</p> : null}
      {edit ? <div className={`space-y-1 border-b p-2 text-xs ${UI_THEME_TOKENS.panel.border}`}>
        <label className="block font-semibold" htmlFor="block-source-edit">Edit {byId.get(edit.targetId)?.title || 'statement'} source</label>
        <textarea id="block-source-edit" aria-label="Selected block source" spellCheck={false} value={edit.draft}
          onChange={event => setEdit({ ...edit, draft: event.target.value })} className="h-28 w-full rounded border bg-transparent p-2 font-mono" />
        {editStale ? <p role="alert">Source changed. Copy this draft or cancel before editing the current source.</p> : null}
        <div className="flex gap-1"><button type="button" disabled={editStale || props.readOnly} onClick={() => change(() => replaceBlock(props.source, edit.targetId, edit.draft), 'Statement updated.')} className="rounded border px-2 py-1 disabled:opacity-50">Apply block edit</button>
          <button type="button" onClick={() => setEdit(null)} className="rounded border px-2 py-1">Cancel</button></div>
      </div> : null}
      <p className="px-3 py-2 text-xs opacity-70">Select a step to edit, or open the library to add one. Arrow keys move through the program.</p>
      <ul ref={listRef} role="tree" aria-label="Program hierarchy" className="min-h-0 flex-1 overflow-auto py-2"
        style={{ backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--kg-border, #94a3b8) 72%, transparent) 0.8px, transparent 0.9px)', backgroundSize: '18px 18px' }}>
        {visible.map((row, index) => {
          const hasChildren = rows.some(item => item.parentId === row.id), expanded = !collapsed.has(row.id)
          return <li key={row.id} role="none"><BlockProgramRow row={row} index={index} visibleDepths={visibleDepths}
            selected={selected?.id === row.id} focused={focusedId === row.id} hasChildren={hasChildren} expanded={expanded}
            onClick={() => setSelectedId(row.id)} onToggle={() => toggle(row.id)}
            onKeyDown={event => navigate(event, index, row, hasChildren, expanded)} />
          </li>
        })}
      </ul>
    </>}
  </section>
}
