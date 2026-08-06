import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const baseUrl = String(process.env.KG_XR_V2_WORKSPACE_SMOKE_BASE_URL || 'http://localhost:4194').replace(/\/+$/u, '')
const browser = await chromium.launch({ headless: true, executablePath: findLocalChromiumExecutable() })
const context = await browser.newContext({ permissions: [] })
const page = await context.newPage()
const browserErrors = []
const coldStartTimeoutMs = 90_000
page.on('pageerror', error => browserErrors.push(error.message))
try {
  await page.goto(`${baseUrl}/knowgrph/`, { waitUntil: 'domcontentloaded' })
  const panel = page.locator('[data-kg-motion-control-floating-panel="1"]')
  await panel.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  const runtime = page.locator('[data-kg-xr-v2-authoring-runtime="1"]')
  await runtime.waitFor({ state: 'visible', timeout: coldStartTimeoutMs })
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-kg-xr-v2-authoring-runtime="1"]')
    return node?.getAttribute('data-kg-xr-v2-ecs-status') === 'ready'
      && Number(node?.getAttribute('data-kg-xr-v2-ecs-entity-count') || 0) >= 2
  }, undefined, { timeout: coldStartTimeoutMs })
  for (const selector of [
    '[data-kg-motion-control-start="1"]',
    '[data-kg-motion-control-stop="1"]',
    '[data-kg-motion-control-enable-sensors="1"]',
    '[data-kg-motion-control-disable-sensors="1"]',
  ]) assert.equal(await page.locator(selector).count(), 1, `missing ${selector}`)
  assert.equal(await panel.getAttribute('data-kg-motion-control-runtime'), 'off')
  assert.equal(await panel.getAttribute('data-kg-motion-control-device-sensors'), 'off')
  assert.deepEqual(browserErrors, [])
  console.log('XR v2 source-authored workspace seed browser smoke passed')
} finally {
  await context.close()
  await browser.close()
}
