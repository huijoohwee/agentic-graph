import { flushSync } from 'react-dom'

function openMenu(trigger: HTMLButtonElement) {
  if (trigger.getAttribute('aria-expanded') !== 'true') flushSync(() => trigger.click())
  const menu = trigger.ownerDocument.getElementById(trigger.getAttribute('aria-controls') || '')
  if (!menu) throw new Error(`No visible menu for ${trigger.getAttribute('aria-label')}`)
  return menu
}

/** Inspect the real options, then restore the closed field for the next assertion. */
export function readMenuOptions(trigger: HTMLButtonElement | null | undefined): HTMLButtonElement[] {
  if (!trigger) return []
  const options = [...openMenu(trigger).querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]')]
  flushSync(() => trigger.click())
  return options
}

export function selectMenuValue(trigger: HTMLButtonElement, value: string) {
  const option = [...openMenu(trigger).querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]')]
    .find(item => item.value === value)
  if (!option || option.disabled) throw new Error(`Unavailable ${trigger.getAttribute('aria-label')} option: ${value}`)
  flushSync(() => option.click())
}
