import { waitForMissionAsync } from './mission-card-face.mjs'

const readFloatingPanelOpen = targetPage => targetPage.evaluate(
  async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().floatingPanelOpen === true,
)

export async function closeFloatingPanel(
  targetPage,
  floatingPanel = targetPage.locator('[data-kg-floating-panel-root="true"]'),
) {
  if (!(await readFloatingPanelOpen(targetPage))) return
  const panel = floatingPanel.first()
  await panel.waitFor({ state: 'visible', timeout: 30000 })
  const closeButton = panel.getByRole('button', { name: 'Close', exact: true })
  try {
    await closeButton.click({ timeout: 5000 })
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
