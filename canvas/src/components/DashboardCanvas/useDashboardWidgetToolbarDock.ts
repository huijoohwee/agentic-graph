import React from 'react'
import { WIDGET_ACTIONS_TOOLBAR_CLEARANCE_PX, WIDGET_ACTIONS_TOOLBAR_OFFSET_PX } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'

/** Match Widget Card above/inside docking within the palette or Canvas scroll bounds. */
export function useDashboardWidgetToolbarDock(frame: React.RefObject<HTMLElement>, visible: boolean) {
  const [top, setTop] = React.useState(-WIDGET_ACTIONS_TOOLBAR_OFFSET_PX)
  useIsomorphicLayoutEffect(() => {
    const element = frame.current
    if (!visible || !element) return
    const update = () => {
      let boundaryTop = 0
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/auto|scroll|hidden|clip/.test(window.getComputedStyle(parent).overflowY)) {
          boundaryTop = Math.max(boundaryTop, parent.getBoundingClientRect().top)
        }
      }
      setTop(element.getBoundingClientRect().top - boundaryTop >= WIDGET_ACTIONS_TOOLBAR_CLEARANCE_PX
        ? -WIDGET_ACTIONS_TOOLBAR_OFFSET_PX : 8)
    }
    update()
    document.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      document.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [frame, visible])
  return top
}
