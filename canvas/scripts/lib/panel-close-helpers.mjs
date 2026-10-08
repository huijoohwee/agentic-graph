import { waitForMissionAsync } from './mission-card-face.mjs'

const readFloatingPanelOpen = targetPage => targetPage.evaluate(
  async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().floatingPanelOpen === true,
)
const floatingPanelCard = (targetPage, candidates) => candidates.and(targetPage.locator(
  '[data-kg-floating-panel-root="true"]:not([data-kg-strybldr-bottom-timeline-panel])',
)).first()
const workspaceEditorClosed = targetPage => targetPage.evaluate(
  async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().workspaceViewMode === 'canvas',
)
const readWorkspaceViewState = targetPage => targetPage.evaluate(async () => {
  const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
  const current = useGraphStore.getState()
  return {
    workspaceViewMode: current.workspaceViewMode,
    workspaceCanvasPaneOpen: current.workspaceCanvasPaneOpen,
    workspaceGraphMutationLayoutLockActive: current.workspaceGraphMutationLayoutLockActive,
  }
})

async function waitForWorkspaceEditorClose(targetPage, timeout) {
  const deadline = Date.now() + timeout
  while (!await workspaceEditorClosed(targetPage)) {
    if (Date.now() >= deadline) return false
    await targetPage.waitForTimeout(50)
  }
  return true
}

async function clickWorkspaceClose(closeButton, targetPage) {
  try {
    await closeButton.click({ timeout: 5000 })
  } catch {
    try {
      await closeButton.click({ force: true, timeout: 5000 })
    } catch {
      await targetPage.keyboard.press('Escape')
    }
  }
}

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
  const closeTrace = []
  const recordWorkspaceState = async stage => {
    closeTrace.push({ stage, state: await readWorkspaceViewState(targetPage).catch(() => null) })
  }
  const floatingPanel = floatingPanelCard(targetPage,
    targetPage.locator('[data-kg-floating-panel-root="true"]'))
  if (await floatingPanel.isVisible()) {
    const panelClose = floatingPanel.getByRole('button', { name: 'Close', exact: true }).first()
    if (await panelClose.isVisible()) {
      try {
        await panelClose.click({ timeout: 5000 })
      } catch {
        try {
          await panelClose.click({ force: true, timeout: 5000 })
        } catch {
          await targetPage.keyboard.press('Escape')
        }
      }
      await floatingPanel.waitFor({ state: 'hidden', timeout: 10000 })
    }
  }
  await recordWorkspaceState('before-workspace-close')
  await clickWorkspaceClose(closeButton, targetPage)
  await recordWorkspaceState('after-first-workspace-close')
  // The Mission handoff can retain a just-replaced toolbar callback for one
  // render. Confirm the actual store transition, then retry that same control.
  if (!await waitForWorkspaceEditorClose(targetPage, 1000)) {
    await recordWorkspaceState('before-second-workspace-close')
    await clickWorkspaceClose(closeButton, targetPage)
    await recordWorkspaceState('after-second-workspace-close')
  }
  // Canvas retains the warmed editor shell for cheap reopen; closing hides it.
  try {
    await region.waitFor({ state: 'hidden', timeout: 10000 })
  } catch (error) {
    const closeControl = await closeButton.first().evaluate(element => ({
      html: element.outerHTML,
      hidden: element instanceof HTMLElement ? element.hidden : null,
      disabled: element instanceof HTMLButtonElement ? element.disabled : null,
      rect: (() => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } })(),
    })).catch(() => null)
    const state = await readWorkspaceViewState(targetPage).catch(() => null)
    throw new Error(`Workspace close left the editor shell visible: ${JSON.stringify({ state, closeTrace, closeControl })}`, { cause: error })
  }
}
