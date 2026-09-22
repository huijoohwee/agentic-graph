import React from 'react'
import { createRoot } from 'react-dom/client'
import NativeTitleTooltip from '@/features/panels/ui/NativeTitleTooltip'
import Tooltip from '@/features/panels/ui/Tooltip'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 20))
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }

export async function testNativeTitleTooltipDelegation() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  try {
    root.render(<NativeTitleTooltip />)
    await tick()
    assert(!document.querySelector('[role="tooltip"]'), 'No idle tooltip should be mounted')
    const button = document.createElement('button')
    button.title = ' /motion.control\nMotion Capture '
    button.innerHTML = '<span>/motion.control</span>'
    let clicks = 0
    button.onclick = () => { clicks += 1 }
    document.body.append(button)
    const hover = (element: Element) => element.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))
    hover(button.firstElementChild!)
    await tick()
    let tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')
    assert(tooltip?.textContent === '/motion.control\nMotion Capture', 'Nested dynamically mounted labels should use their full title')
    assert(button.title === '', 'Suppress the browser-native popup while hovered')
    assert(button.getAttribute('aria-describedby') === tooltip?.id, 'Describe the trigger accessibly')
    assert(tooltip?.style.backgroundColor === 'var(--kg-tooltip-bg)', 'Use the shared background token')
    assert(tooltip?.style.color === 'var(--kg-tooltip-text)', 'Use the shared text token')
    assert(tooltip?.className.includes('pointer-events-none'), 'Tooltip must not intercept a click')
    button.click()
    assert(clicks === 1, 'Native click behavior must survive')
    button.title = '@canvas\nCanvas target'
    await tick()
    assert(document.querySelector('[role="tooltip"]')?.textContent === '@canvas\nCanvas target', 'A live title change should update the same tooltip')
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await tick()
    assert(!document.querySelector('[role="tooltip"]') && button.title === '', 'Escape dismisses without reviving native tips')
    button.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
    assert(button.title === '@canvas\nCanvas target', 'Leaving must restore the newest source title')
    button.focus()
    await tick()
    assert(document.querySelector('[role="tooltip"]')?.textContent === '@canvas\nCanvas target', 'Keyboard focus must show the same description')
    button.remove()
    await tick()
    assert(!document.querySelector('[role="tooltip"]'), 'Removing a trigger must dispose its tooltip')
    assert(button.title === '@canvas\nCanvas target' && !button.hasAttribute('aria-describedby'), 'Detached trigger attributes must be restored')
    const editChip = document.createElement('span')
    editChip.dataset.kgInlineInvocationMarkdown = '#pose'
    editChip.textContent = '#pose'
    document.body.append(editChip)
    hover(editChip)
    await tick()
    assert(document.querySelector('[role="tooltip"]')?.textContent === '#pose', 'Existing atomic edit spans should retain hover text')
    root.unmount()
    assert(!editChip.hasAttribute('title') && editChip.dataset.kgInlineInvocationMarkdown === '#pose', 'Cleanup must leave authored edit metadata unchanged')
  } finally { root.unmount(); restore() }
}

export async function testNativeTitleTooltipExplicitOwner() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  try {
    root.render(<><NativeTitleTooltip /><Tooltip content="Shared description" contentStyle={{ backgroundColor: 'grey', color: 'grey' }}><button title="Native duplicate">Command</button></Tooltip></>)
    await tick()
    const button = host.querySelector('button')!
    button.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))
    await tick()
    const tips = document.querySelectorAll<HTMLElement>('[role="tooltip"]')
    assert(tips.length === 1 && tips[0]?.textContent === 'Shared description', 'An explicit Tooltip must remain the only popup owner')
    assert(button.title === '', 'An explicit wrapper must also suppress native duplicate tips')
    assert(tips[0]?.style.backgroundColor === 'var(--kg-tooltip-bg)' && tips[0]?.style.color === 'var(--kg-tooltip-text)', 'Per-instance grey variants must not override shared colors')
    button.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
    await tick()
    assert(button.title === 'Native duplicate', 'Leaving an explicit tooltip must restore authored attributes')
  } finally { root.unmount(); restore() }
}
