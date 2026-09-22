import React from 'react'
import Tooltip from './Tooltip'

type ActiveTitle = { element: HTMLElement; title: string | null; text: string; delegated: boolean; dismissed: boolean; addedLabel: boolean }

// One event owner for existing and dynamically mounted title attributes. No page scan or per-chip state.
export default function NativeTitleTooltip() {
  const id = React.useId()
  const [tip, setTip] = React.useState<{ element: HTMLElement; text: string } | null>(null)
  React.useEffect(() => {
    let active: ActiveTitle | null = null
    let observer: MutationObserver | null = null
    const restore = () => {
      observer?.disconnect(); observer = null
      if (!active) return
      const { element, title, text, addedLabel } = active
      // Restore only our suppression; never overwrite a newer authored attribute.
      if (element.getAttribute('title') === '') {
        if (title === null) element.removeAttribute('title')
        else element.setAttribute('title', title)
      }
      if (addedLabel && element.getAttribute('aria-label') === text) element.removeAttribute('aria-label')
      const descriptions = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id)
      if (descriptions.length) element.setAttribute('aria-describedby', descriptions.join(' '))
      else element.removeAttribute('aria-describedby')
      active = null
      setTip(null)
    }
    const render = () => {
      if (!active) return
      setTip(active.delegated && !active.dismissed ? { element: active.element, text: active.text } : null)
    }
    const show = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return
      const element = target.closest<HTMLElement>('[title], [data-kg-inline-invocation-markdown]')
      if (element === active?.element) return
      const title = element?.getAttribute('title') ?? null
      // Click-edit already retains this exact invocation source on its atomic spans.
      const text = (title ?? element?.getAttribute('data-kg-inline-invocation-markdown'))?.trim()
      restore()
      if (!element || !text) return
      const delegated = !element.closest('[data-kg-tooltip-anchor="1"]')
      const addedLabel = !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby')
        && !element.textContent?.trim() && element.matches('button,a[href],input,select,textarea,[role="button"]')
      active = { element, title, text, delegated, dismissed: false, addedLabel }
      // An empty title also stops native inheritance from titled ancestors.
      element.setAttribute('title', '')
      if (addedLabel) element.setAttribute('aria-label', text)
      if (delegated) element.setAttribute('aria-describedby', [element.getAttribute('aria-describedby'), id].filter(Boolean).join(' '))
      render()
      observer = new window.MutationObserver(() => {
        if (!active) return
        if (!element.isConnected) { restore(); return }
        const next = element.getAttribute('title')
        if (next === '') return
        if (!next?.trim()) { restore(); return }
        active.title = next
        active.text = next.trim()
        element.setAttribute('title', '')
        if (active.addedLabel) element.setAttribute('aria-label', active.text)
        render()
      })
      // Observe only while a title is active; callbacks inspect that one element, never traverse the page.
      observer.observe(document.body, { childList: true, subtree: true })
      observer.observe(element, { attributes: true, attributeFilter: ['title'] })
    }
    const enter = (event: Event) => show(event.target)
    const leave = (event: MouseEvent | FocusEvent) => {
      if (!active) return
      if (event.relatedTarget instanceof Node && active.element.contains(event.relatedTarget)) return
      if (event.type === 'mouseout' && active.element.contains(document.activeElement)) return
      restore()
    }
    const dismiss = () => { if (active) { active.dismissed = true; setTip(null) } }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('mouseover', enter, true)
    document.addEventListener('mouseout', leave, true)
    document.addEventListener('focusin', enter, true)
    document.addEventListener('focusout', leave, true)
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mouseover', enter, true)
      document.removeEventListener('mouseout', leave, true)
      document.removeEventListener('focusin', enter, true)
      document.removeEventListener('focusout', leave, true)
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', key, true)
      restore()
    }
  }, [id])
  return tip ? <Tooltip key={tip.text} id={id} anchorElement={tip.element} content={tip.text} contentClassName="whitespace-pre-line"
    maxWidthPx={360} open interactive={false}>{null}</Tooltip> : null
}
