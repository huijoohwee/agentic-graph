import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureTwoDimensionalSurface, RENDERER_SELECTION_TIMEOUT_MS, selectMarkdownBodyTable, selectRenderer } from '../verify-data-views-dev.mjs'

test('Dev renderer selection waits for the bounded semantic toolbar convergence', async () => {
  const target = 'Multi-dimensional Table'
  const labels = ['Canvas View Mode: 2D Renderer: Storyboard', 'Canvas View Mode: XR Mode']
  let label = labels.shift()
  let menuClicks = 0
  const waits = []
  const delays = []
  const expectedLabel = 'Canvas View Mode: 2D Renderer: ' + target
  const page = {
    locator(selector) {
      if (selector === 'button[aria-label="' + expectedLabel + '"]') {
        return { waitFor: async options => waits.push(options) }
      }
      return {
        getAttribute: async name => name === 'aria-label' ? labels.shift() || label : null,
        waitFor: async options => waits.push(options),
        click: async () => { menuClicks += 1 },
      }
    },
    getByRole(role, options) {
      assert.equal(role, 'button')
      assert.deepEqual(options, { name: '2D Renderer: ' + target, exact: true })
      return { click: async () => { label = expectedLabel } }
    },
    waitForTimeout: async milliseconds => delays.push(milliseconds),
  }

  await selectRenderer(page, target)

  assert.equal(menuClicks, 1)
  assert.deepEqual(waits, [
    { state: 'visible', timeout: RENDERER_SELECTION_TIMEOUT_MS },
    { state: 'visible', timeout: RENDERER_SELECTION_TIMEOUT_MS },
  ])
  assert.deepEqual(delays, [250, 250])
  assert.equal(RENDERER_SELECTION_TIMEOUT_MS, 45_000)
})

test('Dev surface selection retries once when initial hydration restores XR mode', async () => {
  let label = 'Canvas View Mode: XR Mode'
  let twoDimensionalClicks = 0
  const waits = []
  const mode = {
    waitFor: async options => waits.push(options),
    getAttribute: async name => name === 'aria-label' ? label : null,
    click: async () => {},
  }
  const page = {
    locator(selector) {
      if (selector === 'button[aria-label^="Canvas View Mode:"]') return mode
      assert.equal(selector, 'button[aria-label^="Canvas View Mode: 2D Renderer:"]')
      return { waitFor: async options => waits.push(options) }
    },
    getByRole(role, options) {
      assert.equal(role, 'button')
      if (options.name === 'Surface Mode') return { click: async () => {} }
      assert.deepEqual(options, { name: '2D Mode', exact: true })
      return { click: async () => {
        twoDimensionalClicks += 1
        if (twoDimensionalClicks === 2) label = 'Canvas View Mode: 2D Renderer: Storyboard'
      } }
    },
    waitForTimeout: async () => {},
  }

  await ensureTwoDimensionalSurface(page)

  assert.equal(twoDimensionalClicks, 2)
  assert.equal(waits.length, 4)
})

test('Dev table verification selects the imported Markdown body semantically', async () => {
  let selected = false
  const waits = []
  const body = {
    waitFor: async options => waits.push(options),
    getAttribute: async name => name === 'aria-selected' ? String(selected) : null,
    click: async () => { selected = true },
  }
  const workspace = {
    locator(selector) {
      assert.equal(selector, 'section[aria-label="Table selector"]')
      return {
        getByRole(role, options) {
          assert.equal(role, 'tab')
          assert.deepEqual(options, { name: 'Markdown Body', exact: true })
          return body
        },
        locator(activeSelector) {
          assert.equal(activeSelector, 'button[role="tab"][aria-selected="true"]')
          return { filter: options => {
            assert.deepEqual(options, { hasText: 'Markdown Body' })
            return { waitFor: async wait => waits.push(wait) }
          } }
        },
      }
    },
  }

  await selectMarkdownBodyTable(workspace)

  assert.equal(selected, true)
  assert.deepEqual(waits, [
    { state: 'visible', timeout: 20_000 },
    { state: 'visible', timeout: 20_000 },
  ])
})
