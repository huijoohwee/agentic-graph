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
const beginWorkspaceCloseTransitionTrace = targetPage => targetPage.evaluate(async () => {
  const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
  const target = globalThis
  target.__agenticGraphWorkspaceCloseTraceUnsubscribe?.()
  const read = state => ({
    workspaceViewMode: state.workspaceViewMode,
    workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
    workspaceGraphMutationLayoutLockActive: state.workspaceGraphMutationLayoutLockActive,
  })
  let previous = read(useGraphStore.getState())
  target.__agenticGraphWorkspaceCloseTransitions = []
  target.__agenticGraphWorkspaceCloseTraceUnsubscribe = useGraphStore.subscribe(state => {
    const next = read(state)
    if (JSON.stringify(next) === JSON.stringify(previous)) return
    previous = next
    if (target.__agenticGraphWorkspaceCloseTransitions.length < 8) target.__agenticGraphWorkspaceCloseTransitions.push(next)
  })
})
const endWorkspaceCloseTransitionTrace = targetPage => targetPage.evaluate(() => {
  const target = globalThis
  const transitions = target.__agenticGraphWorkspaceCloseTransitions || []
  target.__agenticGraphWorkspaceCloseTraceUnsubscribe?.()
  delete target.__agenticGraphWorkspaceCloseTraceUnsubscribe
  delete target.__agenticGraphWorkspaceCloseTransitions
  return transitions
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
    return { mode: 'normal' }
  } catch (normalError) {
    try {
      await closeButton.click({ force: true, timeout: 5000 })
      return { mode: 'forced', normalError: String(normalError.message || normalError).slice(0, 500) }
    } catch (forcedError) {
      await targetPage.keyboard.press('Escape')
      return {
        mode: 'escape',
        normalError: String(normalError.message || normalError).slice(0, 500),
        forcedError: String(forcedError.message || forcedError).slice(0, 500),
      }
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
  await beginWorkspaceCloseTransitionTrace(targetPage)
  closeTrace.push({
    stage: 'workspace-close-hit-test',
    target: await closeButton.first().evaluate(element => {
      const box = element.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return {
        tagName: hit?.tagName || null,
        className: hit instanceof HTMLElement ? hit.className : null,
        sameControl: hit === element || element.contains(hit),
      }
    }).catch(() => null),
  })
  closeTrace.push({ stage: 'first-workspace-close-action', action: await clickWorkspaceClose(closeButton, targetPage) })
  await recordWorkspaceState('after-first-workspace-close')
  // The Mission handoff can retain a just-replaced toolbar callback for one
  // render. Confirm the actual store transition, then retry that same control.
  if (!await waitForWorkspaceEditorClose(targetPage, 1000)) {
    await recordWorkspaceState('before-second-workspace-close')
    closeTrace.push({ stage: 'second-workspace-close-action', action: await clickWorkspaceClose(closeButton, targetPage) })
    await recordWorkspaceState('after-second-workspace-close')
  }
  // Canvas retains the warmed editor shell for cheap reopen; closing hides it.
  try {
    await region.waitFor({ state: 'hidden', timeout: 10000 })
  } catch (error) {
    const storeTransitions = await endWorkspaceCloseTransitionTrace(targetPage).catch(() => null)
    const closeControl = await closeButton.first().evaluate(element => ({
      html: element.outerHTML,
      hidden: element instanceof HTMLElement ? element.hidden : null,
      disabled: element instanceof HTMLButtonElement ? element.disabled : null,
      reactProps: (() => {
        const key = Object.keys(element).find(candidate => candidate.startsWith('__reactProps$'))
        const props = key ? element[key] : null
        return {
          found: Boolean(key),
          onClick: typeof props?.onClick,
          onPointerDown: typeof props?.onPointerDown,
        }
      })(),
      rect: (() => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } })(),
    })).catch(() => null)
    const state = await readWorkspaceViewState(targetPage).catch(() => null)
    throw new Error(`Workspace close left the editor shell visible: ${JSON.stringify({ state, closeTrace, storeTransitions, closeControl })}`, { cause: error })
  }
  await endWorkspaceCloseTransitionTrace(targetPage)
}
