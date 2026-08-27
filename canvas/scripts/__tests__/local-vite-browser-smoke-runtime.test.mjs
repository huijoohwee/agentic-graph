import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  resolveCiPlaywrightChromiumInstallCommand,
} from '../lib/run-local-vite-browser-smoke.mjs'
import { findLocalChromiumExecutable } from '../lib/local-chromium-executable.mjs'

test('browser executable resolution honors explicit and preferred candidates before system fallbacks', () => {
  const missing = resolve('/definitely-missing', 'agenticgraph-chromium')
  assert.equal(findLocalChromiumExecutable(process.execPath, missing), process.execPath)
  assert.equal(findLocalChromiumExecutable(missing, process.execPath), process.execPath)
  assert.equal(findLocalChromiumExecutable('   ', process.execPath), process.execPath)
})

test('browser smoke does not provision Chromium outside an exact CI runtime', () => {
  assert.equal(resolveCiPlaywrightChromiumInstallCommand({ ci: '' }), null)
  assert.equal(resolveCiPlaywrightChromiumInstallCommand({ ci: '1' }), null)
  assert.equal(resolveCiPlaywrightChromiumInstallCommand({ ci: 'false' }), null)
})

test('CI browser smoke uses the locked workspace Playwright CLI without a shell', () => {
  const canvasRoot = resolve('/workspace', 'agenticgraph', 'canvas')
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
