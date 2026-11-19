import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { ToolbarToolMenuRendererView } from '@/features/toolbar/ToolbarToolMenuRendererView'
import { FloatingPanelBlockLibraryView } from '@/features/toolbar/FloatingPanelBlockLibraryView'

export async function testFloatingPanelSectionHeadingsAndBulkToggle() {
  const { restore } = initJsdomHarness()
  const host = document.createElement('main')
  document.body.append(host)
  const root = createRoot(host)
  async function clickBulk(name: string) {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
    assert.ok(button, name)
    await act(async () => button.click())
  }
  function assertSections(expanded: boolean) {
    const toggles = Array.from(host.querySelectorAll<HTMLButtonElement>('button.agentic-panel-section-toggle'))
    assert.ok(toggles.length >= 5)
    for (const toggle of toggles) {
      assert.match(toggle.parentElement!.tagName, /^H[34]$/)
      const body = document.getElementById(toggle.getAttribute('aria-controls')!)
      assert.ok(body, toggle.textContent || 'controlled body')
      assert.equal(toggle.getAttribute('aria-expanded'), String(expanded), toggle.textContent || '')
      assert.equal(body.hidden, !expanded)
      const section = toggle.closest('.agentic-panel-section')
      const duplicateInsets = [...body.querySelectorAll('.agentic-panel-section-body')]
        .filter(inner => inner.closest('.agentic-panel-section') === section)
      assert.equal(duplicateInsets.length, 0, `One shared body inset for ${toggle.textContent}`)
    }
  }
  try {
    for (const [title, panel] of [
      ['Renderer', <ToolbarToolMenuRendererView />],
      ['Block library', <FloatingPanelBlockLibraryView />],
    ] as const) {
      await act(async () => root.render(panel))
      assert.equal(host.querySelector('h2')?.textContent, title)
      await clickBulk('Collapse All')
      assertSections(false)
      // A parent's row gap stacks with the separator supplied by each disclosure.
      const groups = Array.from(host.querySelectorAll('.agentic-panel-section'))
      let stack = groups[0]!.parentElement!
      while (!stack.contains(groups[1]!)) stack = stack.parentElement!
      assert.doesNotMatch(stack.className, /(?:^|\s)(?:gap-(?!x-)|space-y-)\S+/, title)
      await clickBulk('Expand All')
      assertSections(true)
      const sw = host.querySelector<HTMLButtonElement>('h3 button[aria-controls]')!
      await act(async () => sw.click())
      assert.equal(sw.getAttribute('aria-expanded'), 'false')
      assert.ok(host.querySelector('button[aria-label="Collapse All"]'), 'mixed state can collapse the other sections')
      await clickBulk('Collapse All')
      assertSections(false)
    }
    const { ImmersiveMediaPanelProjection } = await import('@/features/immersive-media/ImmersiveMediaPanelProjection')
    const { CitySimPanelProjection } = await import('@/features/game-city-sim/CitySimPanelProjection')
    await act(async () => root.render(<>
      <ImmersiveMediaPanelProjection surface="camera" />
      <CitySimPanelProjection surface="camera" />
    </>))
    const [source, city] = host.querySelectorAll<HTMLButtonElement>('h3 > .agentic-panel-section-toggle')
    assert.equal(source?.textContent, 'Immersive Camera')
    assert.equal(city?.textContent, 'City framing')
    const mediaBody = document.getElementById(source!.getAttribute('aria-controls')!)!
    const zoomButton = mediaBody.querySelector('button[aria-label="Zoom in immersive Camera"]')!
    assert.ok(zoomButton)
    await act(async () => source!.click())
    assert.ok(mediaBody.hidden)
    assert.equal(city!.getAttribute('aria-expanded'), 'true')
    await act(async () => source!.click())
    assert.equal(mediaBody.hidden, false)
    assert.equal(mediaBody.querySelector('button[aria-label="Zoom in immersive Camera"]'), zoomButton, 'folding preserves the mounted controls')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    restore()
  }
}
