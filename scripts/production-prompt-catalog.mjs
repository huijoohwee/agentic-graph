import assert from 'node:assert/strict'
import YAML from 'yaml'

const frontmatterSource = (source, label) => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(String(source))
  assert.ok(frontmatter, `${label} must have frontmatter`)
  return YAML.parse(frontmatter[1])
}

const text = (value, label) => {
  assert.ok(typeof value === 'string' && value.trim(), `${label} must be non-empty text`)
  return value.trim()
}

// Read expected identities from the reviewed sources, never from the UI.
export function readExpectedPromptPresets(catalogSource, demoSource = null) {
  const catalog = frontmatterSource(catalogSource, 'reviewed prompt catalog')
  assert.equal(catalog?.schema, 'agentic-os-prompt-preset-catalog/v1')
  assert.ok(Array.isArray(catalog.prompt_presets) && catalog.prompt_presets.length >= 11,
    'reviewed prompt catalog must retain the complete preset inventory')
  const presets = catalog.prompt_presets.map(({ id, label }) => {
    return { id: text(id, 'reviewed prompt preset identity'), label: text(label, 'reviewed prompt preset label') }
  })
  const identities = new Set(presets.map(preset => preset.id))
  assert.equal(identities.size, presets.length,
    'reviewed prompt preset identities must be unique')
  if (demoSource === null || demoSource === undefined) return presets

  const demos = frontmatterSource(demoSource, 'reviewed Graph demo catalog')
  assert.equal(demos?.schema, 'agentic-graph-prompt-preset-demos/v1')
  assert.equal(demos?.demo_only, true, 'reviewed Graph demo catalog must be demo-only')
  assert.ok(Array.isArray(demos.demos) && demos.demos.length <= 30,
    'reviewed Graph demo catalog must contain a bounded demo inventory')
  for (const demo of demos.demos) {
    if (demo?.demo_only_prompt === undefined) continue
    const id = text(demo?.id, 'reviewed Graph demo identity')
    const title = text(demo?.title, 'reviewed Graph demo title')
    text(demo.demo_only_prompt, 'reviewed Graph demo prompt')
    assert.match(id, /^[a-z0-9-]+$/, 'reviewed Graph demo identity must be portable')
    assert.ok(!identities.has(id), `reviewed prompt sources must not duplicate ${id}`)
    identities.add(id)
    presets.push({ id, label: `${title} · Demo only` })
  }
  return presets
}

export async function verifyHomePromptCatalog(page, catalogSource, demoSource = null) {
  const expected = readExpectedPromptPresets(catalogSource, demoSource)
  const fieldset = page.locator('[data-kg-live-canvas-hero-prompt-presets="true"]')
  const trigger = fieldset.getByRole('button', { name: 'Prompt preset', exact: true })
  await Promise.race([
    trigger.waitFor({ state: 'visible', timeout: 30_000 }),
    fieldset.getByRole('alert').waitFor({ state: 'visible', timeout: 30_000 })
      .then(async () => { throw new Error(`Home prompt catalog failed: ${await fieldset.getByRole('alert').innerText()}`) }),
  ])
  assert.equal(await fieldset.getByRole('alert').count(), 0,
    'Home prompt catalog must load without a source-authority alert')
  const selected = await trigger.getAttribute('data-value')
  assert.ok(expected.some(preset => preset.id === selected), 'selected preset must belong to the reviewed catalog')
  await trigger.click()
  const menu = page.getByRole('menu', { name: 'Prompt preset', exact: true })
  await menu.waitFor({ state: 'visible', timeout: 10_000 })
  try {
    assert.equal(await trigger.getAttribute('aria-controls'), await menu.getAttribute('id'),
      'the visible catalog must be owned by its trigger')
    const choices = menu.getByRole('menuitemradio')
    const observed = await choices.evaluateAll(buttons => buttons.map(button => ({
      id: button.getAttribute('value'), label: button.getAttribute('aria-label'),
      disabled: button.disabled, checked: button.getAttribute('aria-checked'),
    })))
    assert.deepEqual(observed, expected.map(preset => ({ ...preset, disabled: false,
      checked: String(preset.id === selected) })),
    'Home must expose every reviewed prompt preset exactly once with its label and selection state')
    for (const choice of await choices.all()) assert.ok(await choice.isVisible(), 'preset choices must be visible')
  } finally {
    // Inspecting the catalog must not select a preset or launch a different scene.
    await menu.press('Escape')
    await menu.waitFor({ state: 'hidden', timeout: 10_000 })
  }
  assert.equal(await trigger.getAttribute('data-value'), selected, 'catalog inspection must preserve selection')
}
