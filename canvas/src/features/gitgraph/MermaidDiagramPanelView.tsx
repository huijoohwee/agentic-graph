import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { InteractiveMermaidDiagram, type InteractiveMermaidSelectionRow } from '@/lib/diagram/InteractiveMermaidDiagram'
import type { MermaidDiagramCodeModel, MermaidStructuredDiagramKind } from '@/lib/mermaid/mermaidDiagramCode'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  resolveDiagramRowKey,
} from '@/lib/diagram/diagramRowSelection'
import type { DiagramSelectionRow } from '@/lib/diagram/diagramRowSelection'
import {
  buildMermaidInteractiveSelectionRows,
  findMermaidDiagramRowKeyForSvgLabel,
  readMermaidDirectSelectionLabels,
} from '@/lib/mermaid/mermaidDiagramSelection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export type MermaidDiagramPanelRenderMode = 'diagram' | 'list' | 'split'
export type MermaidDiagramPanelRowFilter = (row: MermaidDiagramCodeModel['rows'][number], index: number) => boolean
export type MermaidDiagramPanelRowTreeNode = {
  depth: number
  expanded?: boolean
  hasChildren?: boolean
  leadingControl?: React.ReactNode
}
export type MermaidDiagramPanelRowTreeResolver = (args: {
  row: MermaidDiagramCodeModel['rows'][number]
  index: number
  key: string
}) => MermaidDiagramPanelRowTreeNode | null | undefined

const escapeSvgText = (value: unknown): string => String(value || '')
  .replace(/[&<>"']/g, char => (
    char === '&'
      ? '&amp;'
      : char === '<'
        ? '&lt;'
        : char === '>'
          ? '&gt;'
          : char === '"'
            ? '&quot;'
            : '&#39;'
  ))

const trimSvgLabel = (value: unknown, max = 42): string => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}.` : text
}

const buildStructuredMermaidFallbackSvg = (
  model: MermaidDiagramCodeModel,
  kind: MermaidStructuredDiagramKind,
): string => {
  if (kind !== 'architecture' && kind !== 'eventmodeling') return ''
  const rows = model.rows.filter(row => row.kind !== 'line').slice(0, 18)
  if (!rows.length) return ''
  const width = 860
  const height = kind === 'architecture'
    ? Math.max(260, 102 + rows.length * 50)
    : Math.max(260, 166 + Math.ceil(rows.length / 3) * 86)
  const accentByKind: Record<string, string> = {
    group: '#0f766e',
    service: '#2563eb',
    connection: '#64748b',
    ui: '#7c3aed',
    command: '#ea580c',
    event: '#16a34a',
    processor: '#0891b2',
    'read-model': '#9333ea',
    timeframe: '#64748b',
  }
  const title = kind === 'architecture' ? 'Architecture' : 'Event Model'
  const subtitle = kind === 'architecture'
    ? 'services, groups, and links parsed from mermaid_architecture'
    : 'commands, events, processors, and UI steps parsed from mermaid_eventmodeling'
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeSvgText(title)}" xmlns="http://www.w3.org/2000/svg">`
  svg += '<rect width="100%" height="100%" rx="10" fill="var(--kg-panel-bg,#fff)" stroke="var(--kg-border,#cbd5e1)"/>'
  svg += `<text x="24" y="34" font-size="18" font-weight="700" fill="currentColor">${escapeSvgText(title)}</text>`
  svg += `<text x="24" y="58" font-size="12" fill="var(--kg-text-secondary,#64748b)">${escapeSvgText(subtitle)}</text>`
  rows.forEach((row, index) => {
    const color = accentByKind[row.kind] || '#64748b'
    const key = escapeSvgText(resolveDiagramRowKey(row, index))
    const label = escapeSvgText(trimSvgLabel(row.label, kind === 'architecture' ? 30 : 38))
    const raw = escapeSvgText(trimSvgLabel(row.raw, 76))
    svg += `<g data-kg-mermaid-row-key="${key}" data-kg-mermaid-row-label="${label}" data-kg-mermaid-row-kind="${escapeSvgText(row.kind)}" data-kg-mermaid-row-line="${row.lineNumber}" data-kg-mermaid-row-target="1" aria-label="${label}" style="cursor:pointer">`
    if (kind === 'architecture') {
      const y = 84 + index * 50
      const x = row.kind === 'group' ? 34 : row.kind === 'service' ? 258 : row.kind === 'connection' ? 482 : 706
      svg += `<rect x="${x}" y="${y}" width="190" height="34" rx="6" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="1.5"/>`
      svg += `<text x="${x + 12}" y="${y + 21}" font-size="12" font-weight="650" fill="${color}">${escapeSvgText(row.kind)}</text>`
      svg += `<text x="${x + 86}" y="${y + 21}" font-size="12" fill="currentColor">${label}</text>`
      if (row.kind === 'connection') svg += `<path d="M416 ${y + 17} H482" stroke="${color}" stroke-width="2" marker-end="url(#kg-arrow)"/>`
    } else {
      const x = 34 + (index % 3) * 268
      const y = 84 + Math.floor(index / 3) * 86
      svg += `<rect x="${x}" y="${y}" width="228" height="58" rx="7" fill="${color}" fill-opacity=".13" stroke="${color}" stroke-width="1.5"/>`
      svg += `<text x="${x + 12}" y="${y + 22}" font-size="11" font-weight="700" fill="${color}">${escapeSvgText(row.kind.toUpperCase())}</text>`
      svg += `<text x="${x + 12}" y="${y + 43}" font-size="13" fill="currentColor">${label}</text>`
      if (index > 0 && index % 3 !== 0) {
        const prevX = 34 + ((index - 1) % 3) * 268 + 228
        const prevY = 84 + Math.floor((index - 1) / 3) * 86 + 29
        svg += `<path d="M${prevX} ${prevY} H${x}" stroke="#94a3b8" stroke-width="2" marker-end="url(#kg-arrow)"/>`
      }
    }
    svg += `<title>${raw}</title></g>`
  })
  svg += '<defs><marker id="kg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8"/></marker></defs>'
  svg += '</svg>'
  return svg
}

function StructuredMermaidFallbackPreview({
  model,
  kind,
  selectedRowKey,
  onSelectRowKey,
  compact,
}: {
  model: MermaidDiagramCodeModel
  kind: MermaidStructuredDiagramKind
  selectedRowKey?: string
  onSelectRowKey?: (key: string | null) => void
  compact?: boolean
}) {
  const svg = React.useMemo(() => buildStructuredMermaidFallbackSvg(model, kind), [kind, model])
  const handleClick = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target.closest('[data-kg-mermaid-row-key]') : null
    const key = String(target?.getAttribute('data-kg-mermaid-row-key') || '').trim()
    if (key) onSelectRowKey?.(key)
  }, [onSelectRowKey])
  if (!svg) return null
  return (
    <section
      className={cn(
        'relative min-h-0 overflow-auto rounded-md border',
        compact ? 'max-h-36' : 'min-h-36 flex-1',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      data-kg-mermaid-diagram-render="1"
      data-kg-mermaid-diagram-renderer="structured-fallback"
      data-kg-mermaid-diagram-kind={kind}
      data-kg-mermaid-diagram-selected-row={selectedRowKey || undefined}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function MermaidDiagramRenderPreview({
  code,
  model,
  kind,
  rootThemeMode,
  compact = false,
  rows = [],
  selectedRowKey = '',
  onSelectRowKey,
}: {
  code: string
  model: MermaidDiagramCodeModel
  kind: MermaidStructuredDiagramKind
  rootThemeMode: 'light' | 'dark'
  compact?: boolean
  rows?: readonly DiagramSelectionRow[]
  selectedRowKey?: string
  onSelectRowKey?: (key: string | null) => void
}) {
  const selectedRowIndex = React.useMemo(() => {
    if (!selectedRowKey) return -1
    return rows.findIndex((row, index) => resolveDiagramRowKey(row, index) === selectedRowKey)
  }, [rows, selectedRowKey])
  const selectedRow = selectedRowIndex >= 0 ? rows[selectedRowIndex] || null : null
  const selectedLabels = React.useMemo(() => readMermaidDirectSelectionLabels(selectedRow), [selectedRow])
  const selectionRows = React.useMemo<InteractiveMermaidSelectionRow[]>(() => {
    return buildMermaidInteractiveSelectionRows(rows)
  }, [rows])
  const selectRowBySvgLabel = React.useCallback((label: string) => {
    if (!rows.length || !onSelectRowKey) return
    if (!String(label || '').trim()) {
      onSelectRowKey(null)
      return
    }
    const key = findMermaidDiagramRowKeyForSvgLabel(rows, label)
    if (key) onSelectRowKey(key)
  }, [onSelectRowKey, rows])

  if (!code) return null
  if (kind === 'architecture' || kind === 'eventmodeling') {
    return (
      <StructuredMermaidFallbackPreview
        model={model}
        kind={kind}
        selectedRowKey={selectedRowKey}
        onSelectRowKey={onSelectRowKey}
        compact={compact}
      />
    )
  }
  return (
    <section
      className={cn(
        'relative min-h-0 overflow-auto rounded-md border',
        compact ? 'max-h-36' : 'min-h-36 flex-1',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      data-kg-mermaid-diagram-render="1"
      data-kg-mermaid-diagram-kind={kind}
      data-kg-mermaid-diagram-selected-row={selectedRowKey || undefined}
      data-kg-mermaid-diagram-direct-selection="1"
    >
      <InteractiveMermaidDiagram
        code={code}
        rootThemeMode={rootThemeMode}
        svgSurfaceKey={`mermaid:${kind}`}
        selectedLabels={selectedLabels}
        selectionRows={selectionRows}
        selectedRowKey={selectedRowKey}
        dimUnselected={!!selectedLabels.length}
        onSelectedLabelChange={selectRowBySvgLabel}
        onSelectedRowKeyChange={onSelectRowKey}
      />
    </section>
  )
}

export function MermaidDiagramPanelView({
  code,
  model,
  kind,
  title,
  emptyLabel,
  rootThemeMode,
  compact = false,
  surface,
  renderMode = surface === 'bottomPanel' ? 'diagram' : 'list',
  onSelectedRowKeyChange,
  rowFilter,
  rowTree,
  headerActions,
  controlledSelectedRowKey,
  shareSelection = true,
}: {
  code: string
  model: MermaidDiagramCodeModel
  kind: MermaidStructuredDiagramKind
  title: string
  emptyLabel: string
  rootThemeMode: 'light' | 'dark'
  compact?: boolean
  surface: 'floatingPanel' | 'bottomPanel'
  renderMode?: MermaidDiagramPanelRenderMode
  onSelectedRowKeyChange?: (rowKey: string | null) => void
  rowFilter?: MermaidDiagramPanelRowFilter
  rowTree?: MermaidDiagramPanelRowTreeResolver
  headerActions?: React.ReactNode
  controlledSelectedRowKey?: string
  shareSelection?: boolean
}) {
  const showDiagram = renderMode !== 'list'
  const showRowList = renderMode !== 'diagram'
  const { sharedSelectedRowKey, setMermaidDiagramSelectedRowKey } = useGraphStore(
    useShallow(state => ({
      sharedSelectedRowKey: state.mermaidDiagramSelectedRowKeyByKind[kind] || '',
      setMermaidDiagramSelectedRowKey: state.setMermaidDiagramSelectedRowKey,
    })),
  )
  const selectedRowKey = controlledSelectedRowKey ?? sharedSelectedRowKey
  const setSelectedRowKey = React.useCallback((rowKey: string | null) => {
    if (shareSelection) setMermaidDiagramSelectedRowKey(kind, rowKey)
    onSelectedRowKeyChange?.(rowKey)
  }, [kind, onSelectedRowKeyChange, setMermaidDiagramSelectedRowKey, shareSelection])
  const rowListRef = React.useRef<HTMLElement | null>(null)
  const panelAriaLabel = showDiagram ? `${title} Mermaid diagram` : `${title} Mermaid rows`
  const rowEntries = React.useMemo(() => {
    return model.rows
      .map((row, index) => ({ index, key: resolveDiagramRowKey(row, index), row }))
      .filter(entry => rowFilter ? rowFilter(entry.row, entry.index) : true)
  }, [model.rows, rowFilter])
  React.useEffect(() => {
    if (!selectedRowKey) return
    if (model.rows.some((row, index) => resolveDiagramRowKey(row, index) === selectedRowKey)) return
    setSelectedRowKey(null)
  }, [model.rows, selectedRowKey, setSelectedRowKey])
  React.useLayoutEffect(() => {
    if (!selectedRowKey || !showRowList) return
    const frame = window.requestAnimationFrame(() => {
      const row = rowListRef.current?.querySelector(`[data-kg-mermaid-diagram-command-selected="1"]`)
      if (row instanceof HTMLElement) row.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedRowKey, showRowList])
  if (!code) {
    return (
      <section
        className="flex h-full min-h-0 flex-col"
        aria-label={panelAriaLabel}
        data-kg-mermaid-diagram-panel="1"
        data-kg-mermaid-diagram-kind={kind}
        data-kg-mermaid-diagram-surface={surface}
        data-kg-mermaid-diagram-render-mode={renderMode}
        data-kg-mermaid-diagram-empty="1"
      >
        <header className="flex min-w-0 items-center justify-between gap-2 px-1 py-1">
          <span className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{title}</span>
          {headerActions}
        </header>
        <section className={cn('px-1 text-xs', UI_THEME_TOKENS.text.secondary)}>{emptyLabel}</section>
      </section>
    )
  }

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col gap-2', compact && 'gap-1')}
      aria-label={panelAriaLabel}
      data-kg-mermaid-diagram-panel="1"
      data-kg-mermaid-diagram-kind={kind}
      data-kg-mermaid-diagram-surface={surface}
      data-kg-mermaid-diagram-render-mode={renderMode}
    >
      <header className="flex min-w-0 items-center justify-between gap-2 px-1">
        <section className="min-w-0">
          <section className={cn('truncate text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>{title}</section>
          {showRowList ? (
            <section className={cn('truncate text-xs', UI_THEME_TOKENS.text.secondary)}>
              {rowEntries.length === model.rows.length
                ? `${model.rows.length} parsed rows`
                : `${rowEntries.length} / ${model.rows.length} parsed rows`}
            </section>
          ) : null}
        </section>
        {headerActions}
      </header>
      {showDiagram ? (
        <MermaidDiagramRenderPreview
          code={code}
          model={model}
          kind={kind}
          rootThemeMode={rootThemeMode}
          compact={compact && showRowList}
          rows={model.rows}
          selectedRowKey={selectedRowKey}
          onSelectRowKey={setSelectedRowKey}
        />
      ) : null}
      {showRowList ? (
        <section
          ref={rowListRef}
          className={cn(
            'min-h-0 overflow-auto rounded-md border',
            compact ? 'max-h-24' : 'flex-1',
            UI_THEME_TOKENS.panel.border,
          )}
          data-kg-mermaid-diagram-command-list="1"
          data-kg-mermaid-diagram-command-tree={rowTree ? '1' : undefined}
        >
          {rowTree ? (
            <ul className="flex flex-col" role="tree" aria-label={`${title} Mermaid row tree`}>
              {rowEntries.map(({ index, key, row }) => {
                const selected = key === selectedRowKey
                const treeNode = rowTree({ row, index, key }) || { depth: 1 }
                const rowClassName = [
                  'flex w-full min-w-0 items-center gap-2 border-b border-[var(--kg-border)] px-2 py-1.5 text-left last:border-b-0',
                  selected
                    ? 'text-[var(--kg-text-primary)] shadow-[inset_3px_0_0_var(--kg-canvas-accent)] ring-2 ring-inset ring-[var(--kg-canvas-accent)]'
                    : selectedRowKey
                      ? 'text-[var(--kg-text-tertiary)] opacity-45 hover:opacity-90'
                      : 'text-[var(--kg-text-secondary)] hover:bg-[var(--kg-panel-bg-hover)]',
                ].join(' ')
                const depth = Math.max(1, Math.floor(Number(treeNode.depth || 1)))
                return (
                  <li key={key || row.key} role="none">
                    <article
                      role="treeitem"
                      aria-level={depth}
                      aria-selected={selected}
                      aria-expanded={treeNode.hasChildren ? !!treeNode.expanded : undefined}
                      tabIndex={0}
                      className={rowClassName}
                      style={{
                        ...(selected ? {
                          backgroundColor: 'color-mix(in srgb, var(--kg-canvas-accent) 16%, var(--kg-panel-bg))',
                        } : undefined),
                        paddingLeft: `${8 + (depth - 1) * 18}px`,
                      }}
                      data-kg-mermaid-diagram-command-row="1"
                      data-kg-mermaid-diagram-command-kind={row.kind}
                      data-kg-mermaid-diagram-command-line={row.lineIndex}
                      data-kg-mermaid-diagram-command-selected={selected ? '1' : undefined}
                      data-kg-mermaid-diagram-command-treeitem="1"
                      onClick={() => setSelectedRowKey(key)}
                      onKeyDown={event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        setSelectedRowKey(key)
                      }}
                    >
                      {treeNode.leadingControl}
                      <span className="w-16 shrink-0 text-xs uppercase tracking-normal text-[var(--kg-text-tertiary)]">{row.kind}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.label}</span>
                      <span className="shrink-0 text-xs text-[var(--kg-text-tertiary)]">L{row.lineNumber}</span>
                    </article>
                  </li>
                )
              })}
            </ul>
          ) : rowEntries.map(({ index, key, row }) => {
            const selected = key === selectedRowKey
            return (
              <button
                key={key || row.key}
                type="button"
                className={[
                  'flex w-full min-w-0 items-center gap-2 border-b border-[var(--kg-border)] px-2 py-1.5 text-left last:border-b-0',
                  selected
                    ? 'text-[var(--kg-text-primary)] shadow-[inset_3px_0_0_var(--kg-canvas-accent)] ring-2 ring-inset ring-[var(--kg-canvas-accent)]'
                    : selectedRowKey
                      ? 'text-[var(--kg-text-tertiary)] opacity-45 hover:opacity-90'
                      : 'text-[var(--kg-text-secondary)] hover:bg-[var(--kg-panel-bg-hover)]',
                ].join(' ')}
                style={selected ? {
                  backgroundColor: 'color-mix(in srgb, var(--kg-canvas-accent) 16%, var(--kg-panel-bg))',
                } : undefined}
                data-kg-mermaid-diagram-command-row="1"
                data-kg-mermaid-diagram-command-kind={row.kind}
                data-kg-mermaid-diagram-command-line={row.lineIndex}
                data-kg-mermaid-diagram-command-selected={selected ? '1' : undefined}
                onClick={() => setSelectedRowKey(key)}
              >
                <span className="w-16 shrink-0 text-xs uppercase tracking-normal text-[var(--kg-text-tertiary)]">{row.kind}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.label}</span>
                <span className="shrink-0 text-xs text-[var(--kg-text-tertiary)]">L{row.lineNumber}</span>
              </button>
            )
          })}
        </section>
      ) : null}
    </section>
  )
}
