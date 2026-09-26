import { waitForMissionAsync } from './mission-card-face.mjs'

const readFloatingPanelOpen = targetPage => targetPage.evaluate(
  async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().floatingPanelOpen === true,
)
const floatingPanelCard = (targetPage, candidates) => candidates.and(targetPage.locator(
  '[data-kg-floating-panel-root="true"]:not([data-kg-strybldr-bottom-timeline-panel])',
)).first()

// Use the rendered control so this also works against the production preview,
// where source-module imports are unavailable.
export async function dismissVisibleFloatingPanel(
  targetPage,
  floatingPanel = targetPage.locator('[data-kg-floating-panel-root="true"]'),
) {
  const panel = floatingPanelCard(targetPage, floatingPanel)
  if (!(await panel.isVisible())) return false
  await panel.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 5000 })
  await panel.waitFor({ state: 'detached', timeout: 30000 })
  return true
}

export async function closeFloatingPanel(
  targetPage,
  floatingPanel = targetPage.locator('[data-kg-floating-panel-root="true"]'),
) {
  if (!(await readFloatingPanelOpen(targetPage))) return
  const panel = floatingPanelCard(targetPage, floatingPanel)
  // Editor Workspace can retain an open Canvas panel without mounting its card.
  // Dismiss a rendered card first; otherwise clear the retained state below.
  try {
    await dismissVisibleFloatingPanel(targetPage, panel)
  } catch {
    try {
      await targetPage.keyboard.press('Escape')
    } catch {}
  }
  const closeStore = async () => {
    await targetPage.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      useGraphStore.getState().setFloatingPanelOpen(false)
    })
  }
  if (await readFloatingPanelOpen(targetPage)) await closeStore()
  await waitForMissionAsync(
    targetPage,
    async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      if (useGraphStore.getState().floatingPanelOpen) useGraphStore.getState().setFloatingPanelOpen(false)
      return !useGraphStore.getState().floatingPanelOpen
    },
  )
}

export async function closePanelRegion(region, targetPage) {
  const closeButton = region.getByRole('button', { name: 'Close', exact: true })
  try {
    await closeButton.click({ timeout: 5000 })
  } catch {
    try {
      await closeButton.click({ force: true, timeout: 5000 })
    } catch {
      await targetPage.keyboard.press('Escape')
    }
  }
  await region.waitFor({ state: 'detached', timeout: 30000 })
}
