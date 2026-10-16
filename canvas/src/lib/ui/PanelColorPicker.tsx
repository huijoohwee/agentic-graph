import React from 'react'
import { Palette } from 'lucide-react'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { resolvePaletteColor } from '@/lib/ui/colorValue'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { emitToolbarDropdownOpen, subscribeToolbarDropdownOpen } from '@/components/toolbar/dropdownOpenEvents'
import { UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const ColorPalette = React.lazy(() => import('./ColorPalette'))
export type PanelColorPickerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (value: string) => void
}

/** One inspectable colour control; all editing happens in page-owned semantic HTML. */
export function PanelColorPicker({ value, onValueChange, className = '', disabled, onClick, onKeyDown, ...props }: PanelColorPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [inferredLabel, setInferredLabel] = React.useState('Colour')
  const anchor = React.useRef<HTMLButtonElement>(null)
  const id = React.useId()
  const { panelTextClass } = usePanelTypography()
  const color = resolvePaletteColor(value) || '#000000'
  const label = props['aria-label'] || props.title || inferredLabel
  const close = React.useCallback((focus = false) => { setOpen(false); if (focus) anchor.current?.focus({ preventScroll: true }) }, [])
  React.useLayoutEffect(() => {
    const field = anchor.current?.labels?.[0] || anchor.current?.closest('dd')?.parentElement?.querySelector('dt')
    if (!field) return
    const copy = field.cloneNode(true) as Element
    copy.querySelectorAll('button,input,svg').forEach(node => node.remove())
    setInferredLabel(copy.textContent?.trim() || 'Colour')
  })
  React.useEffect(() => subscribeToolbarDropdownOpen(detail => { if (detail.sourceId !== id) close() }), [close, id])
  React.useEffect(() => { if (disabled) close() }, [disabled, close])
  return <>
    <button {...props} type="button" ref={anchor} disabled={disabled} value={color}
      data-kg-color-picker="true" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-palette` : undefined}
      className={`${UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME} kg-color-picker-trigger inline-flex shrink-0 items-center justify-center rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.focus.primaryBorderRing} ${className}`}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.defaultPrevented || !['Enter', ' ', 'ArrowDown'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        emitToolbarDropdownOpen(id); setOpen(true)
      }}
      onClick={event => {
        event.stopPropagation(); onClick?.(event)
        if (event.defaultPrevented) return
        if (open) close(); else { emitToolbarDropdownOpen(id); setOpen(true) }
      }}>
      <svg role="img" aria-label={`Current colour ${color}`} viewBox="0 0 24 24" width="20" height="20"><rect x="2" y="2" width="20" height="20" rx="4" fill={color} stroke="currentColor" /></svg>
    </button>
    {open && <AnchorOverlay anchorRef={anchor} open onClose={() => close()} align="bottom-right">
      <section id={`${id}-palette`} role="dialog" aria-modal="false" aria-label={`${label} palette`}
        className={`kg-color-palette rounded border shadow-[var(--kg-shadow-overlay)] ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border} ${panelTextClass}`}
        onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(true) } }}>
        <header className="flex min-w-0 items-center gap-2"><Palette role="img" aria-label="Colour palette" className="h-4 w-4 shrink-0" /><strong className="min-w-0 flex-1 truncate">{label}</strong><button type="button" className="App-toolbar__btn" onClick={() => close(true)}>Done</button></header>
        <React.Suspense fallback={<p role="status">Loading palette…</p>}><ColorPalette value={color} onValueChange={onValueChange} /></React.Suspense>
      </section>
    </AnchorOverlay>}
  </>
}
