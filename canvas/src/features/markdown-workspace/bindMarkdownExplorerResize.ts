import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'

/** One explorer separator: width on desktop, height when the panes stack. */
export function bindMarkdownExplorerResize({ el, minWidth, maxWidth, readWidth, setWidth }: {
  el: HTMLHRElement
  minWidth: number
  maxWidth: number
  readWidth: () => number
  setWidth: (next: number) => void
}) {
  const mobile = window.matchMedia('(pointer: coarse), (max-width: 768px)')
  const explorer = el.previousElementSibling as HTMLElement | null
  const syncOrientation = () => {
    el.setAttribute('aria-orientation', mobile.matches ? 'horizontal' : 'vertical')
    el.setAttribute('aria-valuemin', String(mobile.matches ? 80 : minWidth))
    el.setAttribute('aria-valuemax', String(mobile.matches ? (explorer?.parentElement?.clientHeight ?? window.innerHeight) * 0.45 : maxWidth))
    el.setAttribute('aria-valuenow', String(Math.round(mobile.matches ? explorer?.getBoundingClientRect().height ?? 80 : readWidth())))
  }
  const setValue = (next: number) => {
    if (mobile.matches) explorer?.style.setProperty('--kg-explorer-resize-height', `${next}px`)
    else setWidth(next)
    el.setAttribute('aria-valuenow', String(Math.round(next)))
  }
  syncOrientation()
  mobile.addEventListener('change', syncOrientation)
  const unbind = bindResizeSeparatorDragRuntime({
    resizeHandleEl: el,
    cursor: () => mobile.matches ? 'row-resize' : 'col-resize',
    readCurrentValue: () => mobile.matches ? explorer?.getBoundingClientRect().height ?? null : readWidth(),
    setPreviewValue: setValue,
    commitValue: setValue,
    resolveNextValueFromPointerDrag: ({ startValue, deltaX, deltaY }) => mobile.matches
      ? Math.max(80, Math.min((explorer?.parentElement?.clientHeight ?? window.innerHeight) * 0.45, Math.round(startValue + deltaY)))
      : Math.max(minWidth, Math.min(maxWidth, Math.round(startValue + deltaX))),
  })
  return () => {
    unbind()
    mobile.removeEventListener('change', syncOrientation)
  }
}
