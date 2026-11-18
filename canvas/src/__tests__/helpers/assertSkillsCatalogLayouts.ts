import assert from 'node:assert/strict'
import { act } from 'react'
import { collectionLayouts } from 'agentic-design-system/collection-layout'

export async function assertSkillsCatalogLayouts(panel: Element, body: HTMLElement) {
  const picker = panel.querySelector('[role="group"][aria-label="Skills & Commands layout"]')
  assert.ok(picker, 'The shared layout selector must be in the catalog header')
  for (const layout of [...collectionLayouts.map(choice => choice.layout), 'list']) {
    const choice = picker.querySelector<HTMLButtonElement>(`[data-agentic-layout-choice="${layout}"]`)
    assert.ok(choice)
    await act(async () => choice.click())
    assert.equal(choice.getAttribute('aria-pressed'), 'true')
    assert.equal(picker.querySelectorAll('[aria-pressed="true"]').length, 1)
    const items = body.querySelectorAll('.agentic-collection-item')
    assert.ok(items.length > 2)
    assert.equal(body.querySelector(`[data-layout]:not([data-layout="${layout}"])`), null, 'Mixed catalog layouts')
    for (const item of items) {
      assert.equal(item.getAttribute('data-layout'), layout)
      assert.ok(item.querySelector(layout === 'card' ? ':scope > .agentic-collection-preview' : ':scope > .agentic-collection-leading'))
    }
    for (const selector of ['[data-kg-exa-search-skills-projection]', '[data-kg-motion-capture-projection="skills"]']) {
      const reference = body.querySelector(selector)
      assert.ok(reference)
      if (layout === 'list') {
        const summary = reference.querySelector<HTMLElement>('summary.agentic-collection-item')
        assert.ok(summary)
        summary.click()
        assert.ok(reference.hasAttribute('open'))
        summary.click()
        assert.ok(!reference.hasAttribute('open'))
      } else {
        assert.ok(reference.matches('.agentic-collection-item'))
        assert.ok(reference.querySelector('code'))
      }
    }
  }
}
