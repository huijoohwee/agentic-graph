import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const baseUrl = String(process.env.KG_XR_V2_SMOKE_BASE_URL || 'http://localhost:4193').replace(/\/+$/u, '')
const smokePath = '/__smoke__/xr-v2-runtime'
const smokeUrl = `${baseUrl}/knowgrph/?kgPath=${encodeURIComponent(smokePath)}`
const outputDirectory = resolve(process.cwd(), '../data/outputs')
const evidencePath = resolve(outputDirectory, 'xr-v2-browser-smoke.json')

function readSourceEvidence() {
  return {
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceBranch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim() || null,
    mainRevision: execFileSync('git', ['rev-parse', 'refs/remotes/origin/main'], { encoding: 'utf8' }).trim(),
  }
}

async function main() {
  const executablePath = findLocalChromiumExecutable(process.env.KG_XR_V2_CHROMIUM_EXECUTABLE)
  const browser = await chromium.launch({
    headless: process.env.KG_XR_V2_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : {}),
  })
  const context = await browser.newContext()
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded' })
    const surface = page.locator('[data-kg-xr-v2-runtime-smoke="1"]').first()
    await surface.waitFor({ state: 'visible', timeout: 30_000 })
    const evidence = await surface.evaluate(node => ({
      schema: node.getAttribute('data-kg-xr-v2-runtime-schema'),
      status: node.getAttribute('data-kg-xr-v2-runtime-status'),
      entryMode: node.getAttribute('data-kg-xr-v2-entry-mode'),
      capabilityStatus: node.getAttribute('data-kg-xr-v2-capability-status'),
      captureStatus: node.getAttribute('data-kg-xr-v2-capture-status'),
      authoringStatus: node.getAttribute('data-kg-xr-v2-authoring-status'),
      modelAssetStatus: node.getAttribute('data-kg-xr-v2-model-asset-status'),
      browserStatus: node.getAttribute('data-kg-xr-v2-browser-status'),
      physicalDeviceStatus: node.getAttribute('data-kg-xr-v2-physical-device-status'),
      blockedReasons: node.getAttribute('data-kg-xr-v2-blocked-reasons'),
    }))

    assert.equal(evidence.schema, 'knowgrph-xr-v2-readiness/v1')
    assert.equal(evidence.status, 'source-ready')
    assert.equal(evidence.entryMode, 'monocular-capture')
    assert.equal(evidence.capabilityStatus, 'source-backed')
    assert.equal(evidence.captureStatus, 'source-backed')
    assert.equal(evidence.authoringStatus, 'source-backed')
    assert.equal(evidence.modelAssetStatus, 'blocked')
    assert.equal(evidence.browserStatus, 'blocked')
    assert.equal(evidence.physicalDeviceStatus, 'blocked')
    assert.match(String(evidence.blockedReasons), /depth model assets are not admitted/u)
    assert.match(String(evidence.blockedReasons), /browser playback smoke is absent/u)
    assert.match(String(evidence.blockedReasons), /physical XR device proof is absent/u)
    assert.deepEqual(pageErrors, [])

    const { schema: runtimeSchema, ...runtimeEvidence } = evidence
    const fullEvidence = {
      schema: 'knowgrph-xr-v2-browser-smoke/v1',
      runtimeSchema,
      route: smokeUrl,
      ...readSourceEvidence(),
      ...runtimeEvidence,
      surfaceRendered: true,
      pageErrors,
    }
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify(fullEvidence, null, 2)}\n`, 'utf8')
    console.log(`[xr-v2-browser-smoke] PASS ${evidencePath}`)
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
