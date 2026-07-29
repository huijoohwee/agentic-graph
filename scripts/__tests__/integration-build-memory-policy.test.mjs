import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const REQUIRED_NODE_OPTIONS = 'NODE_OPTIONS: --max-old-space-size=4096'

for (const workflow of ['integration.yml', 'release.yml']) {
  test(`${workflow} gives production builds an explicit Node heap`, () => {
    const source = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), 'utf8')

    assert.match(
      source,
      new RegExp(`^      ${REQUIRED_NODE_OPTIONS}$`, 'm'),
      `${workflow} must retain the protected build heap policy`,
    )
  })
}
