import React from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRoot } from 'react-dom/client'
import { NativeTitleTooltip } from 'agentic-design-system/react/hover'
import Tooltip from 'agentic-design-system/react/hover'
import { existsSync } from 'node:fs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 20))
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }

export async function testNativeTitleTooltipDelegation() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  try {
    root.render(<NativeTitleTooltip fallbackAttribute="data-kg-inline-invocation-markdown" />)
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
    assert(tooltip?.classList.contains('agentic-hover-panel'), 'Use the central panel presentation')
    assert(!tooltip?.style.color && !tooltip?.style.backgroundColor, 'No per-instance color overrides')
    assert(dom.window.getComputedStyle(tooltip!).zIndex === 'var(--agentic-hover-layer)', 'Use the shared hover layer')
    assert(tooltip?.dataset.interactive === 'false', 'Tooltip must not intercept a click')
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
    const label = document.createElement('label'), input = document.createElement('input')
    label.htmlFor = input.id = 'native-labelled-capacity'; label.textContent = 'Capacity'; input.title = 'Default: 10; Min: 0; Max: 20'
    document.body.append(label, input); hover(input)
    input.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); input.focus(); await tick()
    assert(!input.hasAttribute('aria-label') && input.labels?.[0] === label, 'Native label must remain the accessible name')
    assert(document.querySelectorAll('[role="tooltip"]').length === 1 && input.hasAttribute('aria-describedby'), 'Pointer-to-focus restores one description')
    input.blur(); input.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
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
    root.render(<><NativeTitleTooltip fallbackAttribute="data-kg-inline-invocation-markdown" /><Tooltip content="Shared description" contentStyle={{ backgroundColor: 'grey', color: 'grey' }}><button title="Native duplicate">Command</button></Tooltip></>)
    await tick()
    const button = host.querySelector('button')!
    button.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))
    button.closest('[data-agentic-hover-anchor]')!.dispatchEvent(new dom.window.MouseEvent('mouseenter'))
    await tick()
    const tips = document.querySelectorAll<HTMLElement>('[role="tooltip"]')
    assert(tips.length === 1 && tips[0]?.textContent === 'Shared description', 'An explicit Tooltip must remain the only popup owner')
    assert(button.title === '', 'An explicit wrapper must also suppress native duplicate tips')
    assert(!tips[0]?.style.backgroundColor && !tips[0]?.style.color && tips[0]?.classList.contains('agentic-hover-panel'), 'Per-instance grey variants must not override shared colors')
    button.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
    button.closest('[data-agentic-hover-anchor]')!.dispatchEvent(new dom.window.MouseEvent('mouseleave', { relatedTarget: document.body }))
    await tick()
    assert(button.title === 'Native duplicate', 'Leaving an explicit tooltip must restore authored attributes')
  } finally { root.unmount(); restore() }
}

export function testSharedTooltipIsTheOnlyTooltipOwner() {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  assert(!existsSync(path.join(srcRoot, 'features/panels/ui/Tooltip.tsx')), 'No Graph hover implementation remains')
  const stack = [srcRoot]
  const tooltipOwners: string[] = []
  while (stack.length) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'tests') stack.push(path.join(dir, entry.name))
        continue
      }
      if (!entry.isFile() || !/\.(tsx|jsx|css)$/.test(entry.name)) continue
      const file = path.join(dir, entry.name)
      const source = readFileSync(file, 'utf8')
      assert(!source.includes('z-[10000]'), `Legacy tooltip layer is forbidden in ${path.relative(srcRoot, file)}`)
      if (/role\s*=\s*["']tooltip["']/.test(source)) tooltipOwners.push(file)
    }
  }
  assert(tooltipOwners.length === 0,
    `Only the shared Tooltip may render role=tooltip; found ${tooltipOwners.map(file => path.relative(srcRoot, file)).join(', ')}`)
}
