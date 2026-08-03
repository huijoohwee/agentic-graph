import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import MainPanelFrame from '@/features/panels/ui/MainPanelFrame'
import IconButton from '@/components/IconButton'
import { Search as SearchIcon, Save as SaveIcon, RotateCcw as ResetIcon, RotateCcw as RestoreIcon, X as CloseIcon } from 'lucide-react'
import { useDebouncedValue } from '@/features/hooks/useDebouncedValue'
import { formatTimestamp } from '@/features/panels/utils/time'
import { normalized as normalizeText } from '@/features/panels/utils/json'
import { UI_LABELS } from '@/lib/config'
import { getIconSizeClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

export default function HistoryPanel({ onClose }: { onClose?: () => void }) {
  const { history, historyIndex, addHistory, undoHistory, redoHistory, restoreHistory, uiIconScale, uiIconStrokeWidth } = useGraphStore()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const debounced = useDebouncedValue(search, 200)
  const normalizedQuery = normalizeText(debounced).trim()
  const filtered = React.useMemo(
    () =>
      normalizedQuery
        ? history.filter(h =>
            normalizeText([h.label, String(h.timestamp)].join(' ')).includes(normalizedQuery),
          )
        : history,
    [history, normalizedQuery],
  )
  const applySnapshot = React.useCallback(() => { addHistory('Manual Snapshot') }, [addHistory])
  const reset = React.useCallback(() => { setSearch('') }, [])
  const iconSizeClass = getIconSizeClass(uiIconScale)
  return (
    <MainPanelFrame
      ariaLabel="History panel"
      searchVisible={searchOpen}
      searchPlaceholder="Search history"
      searchQuery={search}
      onSearchChange={setSearch}
      rightSlot={(
        <section className="Stack Stack_horizontal items-center">
          <IconButton className="App-toolbar__btn" title={UI_LABELS.search} onClick={() => setSearchOpen(v => !v)} showTooltip>
            <SearchIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
          </IconButton>
          <IconButton className="App-toolbar__btn" title={UI_LABELS.apply} onClick={applySnapshot} showTooltip>
            <SaveIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
          </IconButton>
          <IconButton className="App-toolbar__btn" title={UI_LABELS.reset} onClick={reset} showTooltip>
            <ResetIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
          </IconButton>
          <IconButton className="App-toolbar__btn" title={UI_LABELS.close} onClick={onClose} showTooltip>
            <CloseIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
          </IconButton>
        </section>
      )}
    >
      <section className="px-3">
        <section className="mb-2 flex items-center gap-2">
          <IconButton className="App-toolbar__btn" title={UI_LABELS.undo} onClick={() => undoHistory()} showTooltip>
            <ResetIcon className={`${iconSizeClass} rotate-180`} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
          </IconButton>
          <IconButton className="App-toolbar__btn" title={UI_LABELS.redo} onClick={() => redoHistory()} showTooltip>
            <ResetIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
          </IconButton>
        </section>
      </section>
      <section className="flex-1 min-h-0 overflow-auto px-3">
        {filtered.length === 0 ? (
          <section className={`px-3 py-2 text-sm ${UI_THEME_TOKENS.text.tertiary}`}>No history yet</section>
        ) : (
          <section>
            {filtered.map((h, idx) => (
              <section key={h.id} className={`px-3 py-2 text-sm flex items-center justify-between ${uiSelectedRowStateClassName(idx === historyIndex)}`}>
                <section>
                  <section className={UI_THEME_TOKENS.text.primary}>{h.label}</section>
                  <section className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>{formatTimestamp(h.timestamp)}</section>
                </section>
                <IconButton className="App-toolbar__btn" title={UI_LABELS.restore} onClick={() => restoreHistory(history.findIndex(x => x.id === h.id))} showTooltip>
                  <RestoreIcon className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden="true" />
                </IconButton>
              </section>
            ))}
          </section>
        )}
      </section>
    </MainPanelFrame>
  )
}
