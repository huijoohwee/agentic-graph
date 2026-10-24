import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { expandWebpageDisclosures, hasCollapsedWebpageDisclosures } from '../lib/websites/webpageDisclosureExpansion'

test('expands native and accessible disclosures while leaving menus and form actions alone', async () => {
  const dom = new JSDOM(`<!doctype html><details><summary>More</summary><p>Details</p></details>
    <button id="disclosure" aria-expanded="false" aria-controls="panel">Show</button>
    <section id="panel" hidden>Panel content</section>
    <button id="menu" aria-expanded="false" aria-haspopup="menu" aria-controls="menu-panel">Menu</button>
    <section id="menu-panel" role="menu" hidden>Menu content</section>
    <button id="language" role="combobox" aria-expanded="false" aria-controls="language-panel">Language</button>
    <section id="language-panel" role="listbox" hidden><button role="option">English</button></section>
    <button id="stubborn" aria-expanded="false">No state update</button>
    <form><button id="submit" aria-expanded="false" type="submit">Submit</button></form>`)
  const globals = ['document', 'window'] as const
  const previous = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  let menuClicks = 0
  let languageClicks = 0
  let stubbornClicks = 0
  let submitClicks = 0
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 24, bottom: 24, width: 24, height: 24, toJSON: () => ({}),
  })
  dom.window.document.querySelector('#disclosure')?.addEventListener('click', event => {
    const control = event.currentTarget as HTMLElement
    control.setAttribute('aria-expanded', 'true')
    dom.window.document.querySelector('#panel')?.removeAttribute('hidden')
  })
  dom.window.document.querySelector('#menu')?.addEventListener('click', () => { menuClicks += 1 })
  dom.window.document.querySelector('#language')?.addEventListener('click', () => { languageClicks += 1 })
  dom.window.document.querySelector('#stubborn')?.addEventListener('click', () => { stubbornClicks += 1 })
  dom.window.document.querySelector('#submit')?.addEventListener('click', () => { submitClicks += 1 })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window })

  try {
    const result = await expandWebpageDisclosures({ maxDurationMs: 500 })
    assert.equal(result.detailsOpened, 1)
    assert.equal(result.controlsActivated, 2)
    assert.equal(result.preservedPanels, 2)
    assert.equal(result.limited, false)
    assert.equal(dom.window.document.querySelector('details')?.hasAttribute('open'), true)
    assert.equal(dom.window.document.querySelector('#panel')?.hasAttribute('hidden'), false)
    assert.equal(menuClicks, 0)
    assert.equal(languageClicks, 0)
    assert.equal(dom.window.document.querySelector('#language-panel')?.hasAttribute('hidden'), true)
    assert.equal(stubbornClicks, 1)
    assert.equal(submitClicks, 0)
  } finally {
    for (const name of globals) {
      const descriptor = previous.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    dom.window.close()
  }
})

test('preserves every panel in a single-open accordion for the captured DOM', async () => {
  const dom = new JSDOM(`<!doctype html><main><section id="accordion">
    <article><h3><button id="first" aria-expanded="true" data-state="open" aria-controls="panel-first">First</button></h3><div id="panel-first" role="region" data-state="open">Content for First</div></article>
    <article><h3><button id="second" aria-expanded="false" data-state="closed" aria-controls="panel-second">Second</button></h3><div id="panel-second" role="region" data-state="closed" hidden></div></article>
    <article><h3><button id="third" aria-expanded="false" data-state="closed" aria-controls="panel-third">Third</button></h3><div id="panel-third" role="region" data-state="closed" hidden></div></article>
  </section></main>`)
  const globals = ['document', 'window'] as const
  const previous = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 24, bottom: 24, width: 24, height: 24, toJSON: () => ({}),
  })
  const buttons = Array.from(dom.window.document.querySelectorAll('#accordion button[aria-controls]')) as HTMLButtonElement[]
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const candidate of buttons) {
        candidate.setAttribute('aria-expanded', 'false')
        candidate.setAttribute('data-state', 'closed')
        const panel = dom.window.document.getElementById(candidate.getAttribute('aria-controls') || '') as HTMLElement | null
        panel?.setAttribute('data-state', 'closed')
        panel?.setAttribute('hidden', '')
        if (panel) panel.textContent = ''
      }
      button.setAttribute('aria-expanded', 'true')
      button.setAttribute('data-state', 'open')
      const panel = dom.window.document.getElementById(button.getAttribute('aria-controls') || '') as HTMLElement | null
      panel?.removeAttribute('hidden')
      panel?.setAttribute('data-state', 'open')
      if (panel) panel.textContent = `Content for ${button.textContent}`
    })
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window })

  try {
    const result = await expandWebpageDisclosures({ maxDurationMs: 1800 })
    assert.equal(result.controlsActivated, 2)
    assert.equal(result.preservedPanels, 3)
    assert.deepEqual(
      Array.from(dom.window.document.querySelectorAll('[role="region"]') as NodeListOf<HTMLElement>).map(panel => panel.textContent),
      ['Content for First', 'Content for Second', 'Content for Third'],
    )
    assert.equal(dom.window.document.querySelectorAll('button[aria-expanded="true"]').length, 1)
  } finally {
    for (const name of globals) {
      const descriptor = previous.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    dom.window.close()
  }
})

test('detects collapsed semantic content without matching expanded details', () => {
  assert.equal(hasCollapsedWebpageDisclosures('<details><summary>More</summary></details>'), true)
  assert.equal(hasCollapsedWebpageDisclosures('<button aria-expanded="false">More</button>'), true)
  assert.equal(hasCollapsedWebpageDisclosures('<details open><summary>More</summary></details>'), false)
  assert.equal(hasCollapsedWebpageDisclosures('<main>Rendered content</main>'), false)
})
