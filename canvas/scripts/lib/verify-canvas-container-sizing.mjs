import assert from 'node:assert/strict'

export async function verifyCanvasContainerSizing(page) {
  await page.getByRole('region', { name: 'Markdown Workspace', exact: true })
    .getByRole('checkbox', { name: 'Show Canvas pane', exact: true }).check()
  const container = page.locator('[data-kg-canvas-view-container]')
  const editor = page.locator('[data-kg-workspace-left-pane="1"]')
  const frame = page.locator('[data-kg-canvas-container-frame="1"]')
  const configure = async mode => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Main panel', exact: true })
    await panel.getByRole('textbox', { name: 'Search settings…', exact: true }).fill('canvas.container.sizing')
    await panel.getByRole('combobox', { name: '', exact: true }).selectOption(mode)
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await page.waitForFunction(expected => document.querySelector('[data-kg-canvas-view-container]')?.getAttribute('data-kg-canvas-view-container') === expected, mode)
  }
  assert.equal(await container.getAttribute('data-kg-canvas-view-container'), 'full')
  await configure('inset')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-kg-canvas-view-container]')?.getBoundingClientRect()
    const editor = document.querySelector('[data-kg-workspace-left-pane="1"]')?.getBoundingClientRect()
    return canvas && editor && Math.abs(canvas.left - editor.right) < 1
  })
  const before = await container.boundingBox(), editorBefore = await editor.boundingBox()
  assert.ok(before.width > 0 && before.x >= editorBefore.x + editorBefore.width - 1)
  // The same mounted Dashboard resizes as the existing editor divider moves.
  const divider = await page.getByRole('separator', { name: 'Resize canvas', exact: true }).boundingBox()
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2)
  await page.mouse.down(); await page.mouse.move(divider.x - 48, divider.y + divider.height / 2, { steps: 4 }); await page.mouse.up()
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-kg-canvas-view-container]')?.getBoundingClientRect()
    const editor = document.querySelector('[data-kg-workspace-left-pane="1"]')?.getBoundingClientRect()
    return canvas && editor && Math.abs(canvas.left - editor.right) < 1
  })
  await configure('full')
  const full = await container.boundingBox(), workspace = await frame.boundingBox()
  assert.ok(Math.abs(full.x - workspace.x) < 1 && Math.abs(full.width - workspace.width) < 1)
  console.log('MainPanel full/inset canvas sizing and live editor resize passed')
}
