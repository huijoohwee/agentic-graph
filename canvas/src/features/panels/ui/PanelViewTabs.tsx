import React from 'react'
import IconButton from '@/components/IconButton'
import { uiPrimaryPillActiveClassName, uiPrimaryIconInactiveClassName, uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import { usePanelTypography } from '@/lib/ui/panelTypography'

// Shell mechanics have no document, renderer, capability, or content dependency.
export function PanelViewTabs({ activeKey, children, className = '', ...props }: React.HTMLAttributes<HTMLElement> & {
  activeKey: string
}) {
  const navRef = React.useRef<HTMLElement>(null)
  const { fontClass } = usePanelTypography()
  React.useEffect(() => {
    const nav = navRef.current
    const selected = nav?.querySelector<HTMLElement>('button[aria-selected="true"], button[aria-pressed="true"]')
    if (!nav || !selected) return
    const rail = nav.getBoundingClientRect()
    const tab = selected.getBoundingClientRect()
    if (tab.left < rail.left) nav.scrollLeft -= rail.left - tab.left
    else if (tab.right > rail.right) nav.scrollLeft += tab.right - rail.right
  }, [activeKey])
  return <nav {...props} ref={navRef} className={`${uiToolbarRowScrollClassName} min-w-0 flex-1 flex-nowrap gap-1 [&>span]:shrink-0 overflow-x-auto overflow-y-hidden overscroll-x-contain ${fontClass} ${className}`} data-kg-panel-view-tabs="true">{children}</nav>
}

export function PanelViewTab({ title, children, ...props }: Omit<React.ComponentProps<typeof IconButton>, 'className' | 'style' | 'showTooltip'>) {
  const selected = props['aria-selected'] === true || props['aria-pressed'] === true
  const icon = React.isValidElement<React.SVGProps<SVGSVGElement>>(children)
    ? React.cloneElement(children, { role: 'img', 'aria-label': title, 'aria-hidden': undefined })
    : children
  return <IconButton {...props} title={title} showTooltip className={`App-toolbar__btn shrink-0 ${selected ? uiPrimaryPillActiveClassName : uiPrimaryIconInactiveClassName}`} style={{ minWidth: 'var(--kg-control-height, 28px)', minHeight: 'var(--kg-control-height, 28px)' }}>{icon}</IconButton>
}
