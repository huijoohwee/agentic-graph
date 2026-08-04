import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  resolveCiPlaywrightChromiumInstallCommand,
} from '../lib/run-local-vite-browser-smoke.mjs'

test('browser smoke does not provision Chromium outside an exact CI runtime', () => {
  assert.equal(resolveCiPlaywrightChromiumInstallCommand({ ci: '' }), null)
  assert.equal(resolveCiPlaywrightChromiumInstallCommand({ ci: '1' }), null)
  assert.equal(resolveCiPlaywrightChromiumInstallCommand({ ci: 'false' }), null)
})

test('CI browser smoke uses the locked workspace Playwright CLI without a shell', () => {
  const canvasRoot = resolve('/workspace', 'knowgrph', 'canvas')
  const command = resolveCiPlaywrightChromiumInstallCommand({
    ci: 'true',
    canvasRoot,
    nodeExecutable: '/runtime/node',
  })

  assert.deepEqual(command, {
    command: '/runtime/node',
    args: [
      resolve(canvasRoot, '../node_modules/playwright/cli.js'),
      'install',
      'chromium',
    ],
  })
  assert.equal(Object.isFrozen(command), true)
  assert.equal(Object.isFrozen(command.args), true)
})
