#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPagesMirrorAgentReadyPlan } from './pages-mirror-agent-ready.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(scriptDirectory, '..')

const copy = async (source, target) => {
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
}

export const checkXrplX402PagesCandidate = async ({ root = defaultRoot } = {}) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'agentic-graph-xrpl-pages-'))
  const projectRoot = path.join(temporaryRoot, 'candidate')
  const publicRoot = path.join(projectRoot, 'public')
  const outputRoot = path.join(temporaryRoot, 'output')
  const routesPath = path.join(outputRoot, '_routes.json')
  const executable = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  )
  try {
    await Promise.all([
      mkdir(publicRoot, { recursive: true }),
      mkdir(outputRoot, { recursive: true }),
    ])
    await writeFile(path.join(publicRoot, 'index.html'), '<!doctype html><title>candidate</title>\n')
    const plan = await buildPagesMirrorAgentReadyPlan({
      agenticGraphRoot: root,
      mirrorRoot: projectRoot,
    })
    for (const [source, target] of plan.agentReadyRuntimeCopies) await copy(source, target)
    await mkdir(path.dirname(plan.agentReadyCommerceX402RouteTarget), { recursive: true })
    await writeFile(
      plan.agentReadyCommerceX402RouteTarget,
      plan.agentReadyCommerceX402RouteBody,
      'utf8',
    )
    const result = spawnSync(executable, [
      'pages', 'functions', 'build', 'functions',
      '--project-directory', projectRoot,
      '--build-output-directory', 'public',
      '--outdir', outputRoot,
      '--output-routes-path', routesPath,
      '--compatibility-date', '2026-09-05',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: path.join(temporaryRoot, 'wrangler.log'),
      },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    })
    if (result.error || result.status !== 0) {
      const detail = String(
        result.error?.message || result.stderr || result.stdout || `Wrangler exited ${result.status}`,
      ).trim().slice(0, 4_000)
      throw new Error(`XRPL Pages candidate build failed: ${detail}`)
    }
    const worker = (await readdir(outputRoot)).find(name => name.endsWith('.js'))
    if (!worker) throw new Error('XRPL Pages candidate build emitted no Worker bundle')
    const bundle = await readFile(path.join(outputRoot, worker), 'utf8')
    if (bundle.includes('ripple-address-codec')) {
      throw new Error('XRPL Pages candidate retained ripple-address-codec')
    }
    const targets = plan.agentReadyRuntimeCopies.map(([, target]) => (
      path.relative(projectRoot, target).split(path.sep).join('/')
    ))
    return Object.freeze({
      ok: true,
      bundleBytes: Buffer.byteLength(bundle),
      copiedPaidResourceSsot: targets.includes(
        'grph-shared/dist/payments/agenticCommercePaidResourceSsot.js',
      ),
    })
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  try {
    const result = await checkXrplX402PagesCandidate()
    if (!result.copiedPaidResourceSsot) throw new Error('paid-resource SSOT is absent from mirror closure')
    console.log(`XRPL Pages candidate resolved (${result.bundleBytes} bytes).`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
