import React from 'react'
import { Grid2X2, List, Rows3 } from 'lucide-react'
import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FloatingPanelCatalogHeader, FloatingPanelCatalogSearchControl, floatingPanelCatalogCompactRowClassName, floatingPanelCatalogThreeRowClassName, matchesFloatingPanelCatalogSearch, useFloatingPanelCatalogSearch } from '@/lib/ui/floatingPanelCatalogLayout'
import { resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import type { MediaCatalogLayout } from '@/features/command-menu/mediaCatalogTypes'

export default function PreviewMediaCatalog({ items, models = false }: { items: readonly CommandMenuRichMediaItem[]; models?: boolean }) {
  const search = useFloatingPanelCatalogSearch()
  const [layout, setLayout] = React.useState<MediaCatalogLayout>('card')
  const activeKey = useGraphStore(state => state.markdownPreviewActiveMediaKey)
  const setActiveKey = useGraphStore(state => state.setMarkdownPreviewActiveMediaKey)
  const setMermaidFocus = useGraphStore(state => state.setMarkdownPreviewMermaidFocus)
  const visible = items.filter(item => matchesFloatingPanelCatalogSearch(search.normalizedSearchQuery, [item.label, item.kind, item.alt]))
  const select = (item: CommandMenuRichMediaItem) => {
    setMermaidFocus(item.kind === 'mermaid' ? { code: item.code || '', frontmatterConfig: item.mermaidConfig } : null)
    setActiveKey(item.key)
  }
  return (
    <section className="min-w-0 space-y-2" aria-label={models ? 'Preview 3D models' : 'Preview document media'}>
      <FloatingPanelCatalogHeader title={models ? '3D for XR' : 'Media'} subtitle={`${items.length} in current document or selection`} actionsLabel="Preview media layout"
        actions={<section className="inline-flex" role="group" aria-label="Preview layout">
          {([{ value: 'list', Icon: List }, { value: 'card', Icon: Rows3 }, { value: 'grid', Icon: Grid2X2 }] as const).map(({ value, Icon }) =>
            <button key={value} type="button" aria-label={`Preview ${value} layout`} aria-pressed={layout === value} onClick={() => setLayout(value)} className={cn('rounded p-1', layout === value ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}>
              <Icon className="size-4" role="img" aria-label={`${value} layout`} />
            </button>)}
        </section>}
        searchControl={<FloatingPanelCatalogSearchControl state={search} id="kg-preview-media-search" buttonLabel="Search preview media" panelLabel="Search preview media" placeholder="Search current media" />} />
      {visible.length ? <ul className={cn('m-0 grid list-none gap-2 p-0', layout === 'grid' && 'grid-cols-2')} aria-label="Preview media items">
        {visible.slice(0, 100).map(item => {
          const Icon = resolveMediaKindOverlayIcon(item.kind)
          const thumbnail = item.thumbnailUrl || (item.kind === 'image' ? item.src : '')
          return <li key={item.key} className="min-w-0">
            <button type="button" aria-label={`Preview ${item.label}`} aria-pressed={activeKey === item.key} onClick={() => select(item)}
              className={cn('w-full', layout === 'list' ? floatingPanelCatalogCompactRowClassName() : layout === 'card' ? floatingPanelCatalogThreeRowClassName() : `grid gap-1 rounded border p-2 text-left ${UI_THEME_TOKENS.panel.border}`, activeKey === item.key && UI_THEME_TOKENS.button.activeBg)}>
              {thumbnail && layout !== 'list' ? <img src={thumbnail} alt={item.alt || item.label} className="h-20 w-full rounded object-contain" loading="lazy" decoding="async" /> : <Icon className="size-5" role="img" aria-label={item.kind} />}
              <span className="grid min-w-0 gap-1"><span className="line-clamp-2 font-medium">{item.label}</span><span className="text-xs">{item.kind} · {item.source === 'markdown' ? `Line ${item.startLine}` : 'Selected node'}</span></span>
            </button>
          </li>
        })}
      </ul> : <p role="status">{items.length ? 'No current media matches this search.' : models ? 'No 3D models in the current document or selection.' : 'No media in the current document or selection.'}</p>}
      {visible.length > 100 ? <p role="status">Showing the first 100 matches. Search to narrow the results.</p> : null}
    </section>
  )
}
