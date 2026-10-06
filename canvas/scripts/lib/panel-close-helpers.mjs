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
  await panel.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 30000 })
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
  const closeButton = region.locator('[data-kg-workspace-toolbar-close="1"]')
  try {
    await closeButton.click({ timeout: 5000 })
  } catch {
    try {
      await closeButton.click({ force: true, timeout: 5000 })
    } catch {
      await targetPage.keyboard.press('Escape')
      try {
        await region.waitFor({ state: 'hidden', timeout: 2000 })
        return
      } catch {}
      await closeButton.click({ timeout: 5000 })
    }
  }
  // Canvas retains the warmed editor shell for cheap reopen; closing hides it.
  try {
    await region.waitFor({ state: 'hidden', timeout: 10000 })
  } catch (error) {
    const state = await targetPage.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      const current = useGraphStore.getState()
      return {
        workspaceViewMode: current.workspaceViewMode,
        workspaceCanvasPaneOpen: current.workspaceCanvasPaneOpen,
        workspaceGraphMutationLayoutLockActive: current.workspaceGraphMutationLayoutLockActive,
      }
    }).catch(() => null)
    throw new Error(`Workspace close left the editor shell visible: ${JSON.stringify(state)}`, { cause: error })
  }
}
