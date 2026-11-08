import React from 'react'
import { createRoot } from 'react-dom/client'
import IconButton from '@/components/IconButton'
import { WidgetEditorActionsToolbar } from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testToolbarIconTooltipsDoNotInterceptClicks() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    let clicks = 0
    const root = createRoot(container)
    root.render(
      <IconButton title="Status" onClick={() => { clicks += 1 }} showTooltip>
        <span>OK</span>
      </IconButton>,
    )

    await tick()

    const btn = dom.window.document.querySelector('button[aria-label="Status"]') as HTMLButtonElement | null
    if (!btn) throw new Error('expected Status IconButton')

    const wrapper = btn.parentElement as HTMLElement | null
    if (!wrapper) throw new Error('expected IconButton wrapper')
    wrapper.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))

    await tick()

    const tooltip = dom.window.document.querySelector('[data-kg-tooltip-root="1"]') as HTMLElement | null
    if (!tooltip) throw new Error('expected tooltip to mount on hover')
    if (!tooltip.className.includes('pointer-events-none')) {
      throw new Error('expected tooltip to use pointer-events-none to avoid intercepting clicks')
    }

    btn.click()
    await tick()
    if (clicks !== 1) throw new Error(`expected click handler to fire once, got ${clicks}`)

    root.unmount()
  } finally {
    restore()
  }
}

export async function testIconButtonStopsPropagation() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    let parentClicks = 0
    let buttonClicks = 0

    const root = createRoot(container)
    root.render(
      <section
        onClick={() => {
          parentClicks += 1
        }}
      >
        <IconButton
          title="Launch"
          onClick={() => {
            buttonClicks += 1
          }}
          showTooltip
        >
          <span>Go</span>
        </IconButton>
      </section>,
    )

    await tick()

    const btn = dom.window.document.querySelector('button[aria-label="Launch"]') as HTMLButtonElement | null
    if (!btn) throw new Error('expected Launch IconButton')

    // A pointerup may activate a moving control without a follow-up click.
    // The next keyboard click (detail 0) must still activate it.
    const activations = [
      ['pointerdown', 0], ['pointerup', 0], ['click', 0],
      ['pointerdown', 0], ['pointerup', 0], ['click', 1],
    ] as const
    for (const [type, detail] of activations) {
      btn.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, detail }))
    }
    await tick()

    if (buttonClicks !== 3) throw new Error(`expected two pointer activations and one keyboard activation, got ${buttonClicks}`)
    if (parentClicks !== 0) throw new Error(`expected parent click handler to remain 0, got ${parentClicks}`)

    root.unmount()
  } finally {
    restore()
  }
}

export async function testWidgetActionToolbarIconsRemainSelectableAndClickable() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const clicks = { run: 0, duplicate: 0, remove: 0 }
    const readRemoveClicks = () => clicks.remove
    const noop = () => void 0
    const root = createRoot(container)
    root.render(
      <WidgetEditorActionsToolbar
        visible
        ariaLabel="Storyboard card actions"
        iconSizeClass="h-3.5 w-3.5"
        iconStrokeWidth={1.8}
        active
        enableHandlesDisabled
        convertToLoopDisabled={false}
        duplicateDisabled={false}
        actionVisibility={{
          run: true,
          updateKvEntry: false,
          openInSidepane: false,
          enableHandles: false,
          probeTree: false,
          convertToLoop: false,
          duplicate: true,
          clearOutput: false,
          help: false,
          remove: true,
        }}
        onRun={() => { clicks.run += 1 }}
        onDuplicate={() => { clicks.duplicate += 1 }}
        onClearOutput={noop}
        onHelp={noop}
        onRemove={() => { clicks.remove += 1 }}
        onConvertToLoopNode={noop}
      />,
    )

    await tick()

    const toolbar = dom.window.document.querySelector('nav[data-kg-bubble-toolbar="1"][aria-label="Storyboard card actions"]')
    if (!toolbar) throw new Error('expected Widget actions toolbar to expose the bubble-toolbar surface')
    const runButton = dom.window.document.querySelector('button[data-kg-toolbar-action="run"][data-kg-selection-surface="bubble-toolbar-action"]')
    if (!(runButton instanceof dom.window.HTMLButtonElement)) throw new Error('expected Run action button to expose a selectable toolbar action surface')
    const runIcon = runButton.querySelector('[data-kg-toolbar-action-icon="run"][role="img"]')
    if (!(runIcon instanceof dom.window.HTMLElement)) throw new Error('expected Run action to expose a selectable icon wrapper')
    if (runIcon.getAttribute('aria-hidden') === 'true') throw new Error('expected Run icon wrapper not to be aria-hidden decoration')
    const runSvg = runIcon.querySelector('svg')
    if (!runSvg || runSvg.getAttribute('aria-hidden') === 'true') throw new Error('expected Run icon SVG not to be hidden from selection tooling')

    runIcon.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    runIcon.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
    await tick()
    if (clicks.run !== 1) throw new Error(`expected Run action to fire from icon pointer activation, got ${clicks.run}`)

    const duplicateIcon = dom.window.document.querySelector('[data-kg-toolbar-action-icon="duplicate"]')
    if (!(duplicateIcon instanceof dom.window.HTMLElement)) throw new Error('expected Duplicate action to expose a selectable icon wrapper')
    duplicateIcon.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await tick()
    if (clicks.duplicate !== 1) throw new Error(`expected Duplicate action to fire from icon click activation, got ${clicks.duplicate}`)

    const removeIcon = dom.window.document.querySelector('[data-kg-toolbar-action-icon="remove"]')
    if (!(removeIcon instanceof dom.window.HTMLElement)) throw new Error('expected Remove action to expose a selectable icon wrapper')
    removeIcon.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    await tick()
    const removeClicksAfterPointerDown = readRemoveClicks()
    if (removeClicksAfterPointerDown !== 1) throw new Error(`expected Remove action to fire before selection/projection can unmount the toolbar, got ${removeClicksAfterPointerDown}`)
    removeIcon.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
    await tick()
    if (clicks.remove !== 1) throw new Error(`expected Remove action to fire once from pointer activation, got ${clicks.remove}`)

    root.unmount()
  } finally {
    restore()
  }
}
