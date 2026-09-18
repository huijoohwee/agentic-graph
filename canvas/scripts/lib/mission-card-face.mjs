/** Exercise the shared selectable toolbar, never invoke a hidden control. */
export async function showMissionFace(scope, back) {
  const frame = scope.locator('[data-dashboard-widget="mission:tree"]')
  if (!await frame.count()) return
  if ((await frame.getAttribute('aria-expanded') === 'true') === back) return
  if (!await frame.locator('[data-kg-toolbar-action="flip"]').count()) await frame.press('Enter')
  await frame.locator('[data-kg-toolbar-action="flip"]').click()
  await frame.locator(`[data-kg-widget-face="${back ? 'back' : 'front'}"]`).waitFor()
}
export const sourceText = text => /retained matches|No runs in|Runtime unavailable|Local validation observation|Imported local trace|Paused while hidden|Offline|Manual refresh/.test(text)
export async function waitForMissionAsync(page, predicate) {
  const deadline = Date.now() + 60000
  while (!await page.evaluate(predicate)) {
    if (Date.now() >= deadline) throw Error('Asynchronous workspace condition did not become ready')
    await page.waitForTimeout(50)
  }
}
