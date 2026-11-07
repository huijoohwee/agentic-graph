import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { readExpectedPromptPresets, verifyHomePromptCatalog } from '../production-prompt-catalog.mjs'

test('production catalog proof exercises the shared semantic menu and rejects incomplete or corrupted choices', async t => {
  // Disposable catalog fixture: this regression runs before the release docs checkout.
  // The production caller supplies the independently byte-verified pinned catalog.
  const source = `---\nschema: agentic-os-prompt-preset-catalog/v1\nprompt_presets:\n${
    Array.from({ length: 12 }, (_, index) => `  - {id: fixture-${index}, label: Fixture preset ${index}}`).join('\n')
  }\n---\n`
  const demoSource = `---\nschema: agentic-graph-prompt-preset-demos/v1\ndemo_only: true\ndemos:\n  - id: fixture-demo\n    title: Fixture demo\n    demo_only_prompt: Example only\n---\n`
  const expected = readExpectedPromptPresets(source, demoSource)
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const bundle = await build({ bundle: true, write: false, minify: true, platform: 'browser',
    tsconfig: root + 'canvas/tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SemanticSelect } from './canvas/src/lib/ui/SemanticSelect';
      const presets = ${JSON.stringify(expected)};
      createRoot(document.querySelector('main')).render(
        <fieldset data-kg-live-canvas-hero-prompt-presets="true">
          <SemanticSelect aria-label="Prompt preset" value={presets[0].id}
            onValueChange={() => { document.body.dataset.unexpectedSelection = 'true' }}>
            {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </SemanticSelect>
        </fieldset>);
    ` } })
  assert.ok(bundle.outputFiles[0].contents.length < 500_000, 'isolated component bundle must stay below 500 kB')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body><main></main></body></html>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await t.test('actual portal menu passes although its trigger has no native options', async () => {
      assert.equal(await page.locator('option').count(), 0, 'reproduce the retired native-select assumption')
      await verifyHomePromptCatalog(page, source, demoSource)
      assert.equal(await page.locator('body').getAttribute('data-unexpected-selection'), null)
      assert.equal(await page.getByRole('button', { name: 'Prompt preset', exact: true }).getAttribute('aria-expanded'), 'false')
    })
    for (const mutation of ['missing', 'duplicate', 'label', 'disabled', 'checked', 'hidden']) {
      await t.test(`rejects ${mutation} choices without changing selection`, async () => {
        // Corrupt only rendered fixture DOM when React mounts the real portal.
        await page.evaluate(kind => {
          const observer = new MutationObserver(() => {
            const menu = document.querySelector('menu[role="menu"]')
            const option = menu?.querySelector('[role="menuitemradio"]')
            if (!option) return
            observer.disconnect()
            if (kind === 'missing') option.remove()
            if (kind === 'duplicate') option.parentElement.append(option.cloneNode(true))
            if (kind === 'label') option.setAttribute('aria-label', 'incorrect fixture label')
            if (kind === 'disabled') option.disabled = true
            if (kind === 'checked') option.setAttribute('aria-checked', 'false')
            if (kind === 'hidden') option.style.display = 'none'
          })
          observer.observe(document.body, { childList: true, subtree: true })
        }, mutation)
        await assert.rejects(verifyHomePromptCatalog(page, source, demoSource),
          /every reviewed prompt preset|preset choices must be visible/)
        assert.equal(await page.locator('body').getAttribute('data-unexpected-selection'), null)
      })
    }
    await t.test('source authority errors remain fail closed', async () => {
      await page.getByRole('group').evaluate(fieldset => {
        const alert = document.createElement('p'); alert.setAttribute('role', 'alert')
        alert.textContent = 'Catalog source unavailable'; fieldset.append(alert)
      })
      await assert.rejects(verifyHomePromptCatalog(page, source, demoSource), /source-authority alert|Home prompt catalog failed/)
    })
  } finally { await browser.close() }
})

test('expected catalog rejects absent and undersized shared identities while keeping shared ownership', () => {
  assert.throws(() => readExpectedPromptPresets('missing'), /frontmatter/)
  assert.throws(() => readExpectedPromptPresets('---\nschema: agentic-os-prompt-preset-catalog/v1\nprompt_presets: []\n---\n'), /complete preset inventory/)
  const duplicate = Array.from({ length: 11 }, () => '  - {id: duplicate, label: Duplicate}').join('\n')
  assert.throws(() => readExpectedPromptPresets(`---\nschema: agentic-os-prompt-preset-catalog/v1\nprompt_presets:\n${duplicate}\n---\n`), /unique/)
  const catalog = `---\nschema: agentic-os-prompt-preset-catalog/v1\nprompt_presets:\n${
    Array.from({ length: 11 }, (_, index) => `  - {id: fixture-${index}, label: Fixture preset ${index}}`).join('\n')
  }\n---\n`
  const duplicateDemo = `---\nschema: agentic-graph-prompt-preset-demos/v1\ndemo_only: true\ndemos:\n  - id: fixture-0\n    title: Conflicting demo\n    demo_only_prompt: Example only\n---\n`
  assert.deepEqual(readExpectedPromptPresets(catalog, duplicateDemo), Array.from({ length: 11 }, (_, index) => ({
    id: `fixture-${index}`, label: `Fixture preset ${index}`,
  })), 'a Graph-local preview must not create a second shared preset choice')
})
