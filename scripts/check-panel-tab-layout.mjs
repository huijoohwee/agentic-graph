import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Run against a running Graph dev server. Each panel family gets a fresh browser context.
const url = process.argv[2] || 'http://localhost:5173/'
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined })
const families = ['floating', 'main', 'bottom']

async function openPanel(page, family) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const demo = page.getByRole('button', { name: 'Demo', exact: true })
  await demo.waitFor({ timeout: 3000 }).catch(() => {})
  if (await demo.isVisible()) await demo.click()
  if (family !== 'bottom') {
    await page.waitForFunction(family => {
      const main = family === 'main'
      if (document.querySelector(main ? '[aria-label="Main panel tabs"]' : '[data-kg-floating-panel-view-trigger]')) return true
      window.dispatchEvent(new CustomEvent(main ? 'kg:mainPanelOpen' : 'kg:floatingPanelOpen', {
        detail: { tab: main ? 'settings' : 'renderer', open: true },
      }))
      return false
    }, family)
  }
  return family === 'floating'
    ? page.getByRole('tablist').filter({ has: page.locator('[data-kg-floating-panel-view-trigger]') })
    : page.getByRole('tablist', { name: family === 'main' ? 'Main panel tabs' : 'Bottom panel views' })
}

function measure(tab) {
  const header = tab.querySelector('.agentic-panel-tab-header, .agentic-skills-header')
  const body = tab.querySelector('.agentic-panel-tab-body, .agentic-skills-body')
  const padding = el => ['Top', 'Right', 'Bottom', 'Left'].map(side => getComputedStyle(el)['padding' + side])
  const heading = header.querySelector('h2')
  const top = header.getBoundingClientRect().top
  body.scrollTop = 64
  const fixed = Math.abs(header.getBoundingClientRect().top - top) < 1
  body.scrollTop = 0
  return {
    title: heading.textContent.trim(), fixed, visible: body.clientHeight > 0,
    overflow: Math.max(header.scrollWidth - header.clientWidth, body.scrollWidth - body.clientWidth),
    layout: {
      outer: padding(tab.closest('.agentic-panel-body')), header: padding(header), body: padding(body),
      family: getComputedStyle(heading).fontFamily, size: getComputedStyle(heading).fontSize,
      weight: getComputedStyle(heading).fontWeight,
      left: Math.round(header.getBoundingClientRect().left - tab.getBoundingClientRect().left),
      right: Math.round(tab.getBoundingClientRect().right - header.getBoundingClientRect().right),
    },
  }
}

async function readClosedRowGeometry(owner, key) {
  const bulk = owner.getByRole('button', { name: /^collapse all$/i })
  if (await bulk.isVisible()) await bulk.click()
  const selector = key === 'skillsCommands'
    ? '.agentic-skills-group-section h3 button[aria-expanded="false"]'
    : '[aria-label="Renderer settings"] h3 button[aria-expanded="false"]'
  const rows = owner.locator(selector)
  await rows.nth(1).waitFor()
  return rows.evaluateAll(([first, second]) => {
    const body = first.closest('.agentic-skills-body,.agentic-panel-tab-body').getBoundingClientRect()
    const a = first.getBoundingClientRect(), b = second.getBoundingClientRect()
    return { left: a.left - body.left, right: body.right - a.right, height: a.height,
      gap: b.top - a.bottom, weight: getComputedStyle(first).fontWeight }
  })
}

try {
  for (const width of [1063, 390]) {
    let reference, referenceRows
    for (const family of families) {
      const page = await browser.newPage({ viewport: { width, height: 951 }, hasTouch: width === 390, colorScheme: width === 390 ? 'dark' : 'light' })
      const nav = await openPanel(page, family)
      await nav.waitFor()
      const tabs = nav.getByRole('tab')
      const keys = await tabs.evaluateAll(nodes => nodes.map(el => el.dataset.kgFloatingPanelViewTrigger || el.getAttribute('aria-label') || el.title))
      const order = keys.map((key, index) => ({ key, index })).sort((a, b) =>
        Number(b.key === 'skillsCommands') - Number(a.key === 'skillsCommands') || Number(a.key === 'Dashboard') - Number(b.key === 'Dashboard'))
      for (const { key, index } of order) {
        const trigger = tabs.nth(index)
        await trigger.evaluate(el => el.click())
        if (family === 'main' && key === 'Dashboard') {
          await nav.waitFor({ state: 'hidden' })
          continue
        }
        assert.equal(await trigger.getAttribute('aria-selected'), 'true', key)
        const shell = nav.locator('xpath=ancestor::aside[1]')
        const owner = shell.locator('.agentic-panel-tab-layout:visible, .agentic-skills-catalog:visible').first()
        await owner.locator('h2').first().waitFor()
        const result = await owner.evaluate(measure)
        assert(result.title && result.visible && result.fixed && result.overflow <= 1, JSON.stringify({ width, family, key, ...result }))
        if (key === 'skillsCommands') reference = result.layout
        assert.deepEqual(result.layout, reference, `${width}px ${family} ${key}`)
        if (key === 'skillsCommands') referenceRows = await readClosedRowGeometry(owner, key)
        if (key === 'renderer') assert.deepEqual(await readClosedRowGeometry(owner, key), referenceRows, 'Renderer disclosure geometry')
        const disclosure = owner.locator('h3 button.agentic-panel-section-toggle[aria-expanded]:visible').first()
        if (await disclosure.count()) {
          const before = await disclosure.getAttribute('aria-expanded')
          await disclosure.focus()
          await page.keyboard.press('Enter')
          assert.notEqual(await disclosure.getAttribute('aria-expanded'), before, key)
          await page.keyboard.press('Space')
          assert.equal(await disclosure.getAttribute('aria-expanded'), before, key)
        }
      }
      console.log(`PASS ${width}px ${family} · ${keys.length} registered tabs`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
