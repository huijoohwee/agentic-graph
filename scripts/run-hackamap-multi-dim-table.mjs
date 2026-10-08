#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4177
const DEFAULT_DOC_PATH = '/docs/workspace-seeds/agentic-graph-hackamap.md'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const canvasRoot = path.join(repoRoot, 'canvas')
const viteBinPath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    hackamapRoot: path.resolve(repoRoot, '..', 'hackamap'),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim()
    if (!arg) continue
    if (arg === '--host') {
      options.host = String(argv[index + 1] || '').trim() || DEFAULT_HOST
      index += 1
      continue
    }
    if (arg === '--port') {
      const value = Number(argv[index + 1])
      if (!Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new Error('Expected --port to be an integer from 1024 through 65535.')
      }
      options.port = value
      index += 1
      continue
    }
    if (arg === '--hackamap-root') {
      const value = String(argv[index + 1] || '').trim()
      if (!value) throw new Error('Expected --hackamap-root to provide a sibling repository path.')
      options.hackamapRoot = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node ./scripts/run-hackamap-multi-dim-table.mjs [--host 127.0.0.1] [--port 4177] [--hackamap-root ../hackamap]',
      '',
      'Launches the local agentic-graph canvas with a temporary source-backed',
      'workspace-seed wrapper around hackamap/site/hackamap-ssot.md so the app',
      'opens HackaMap directly in 2D Renderer: Multi-dimensional Table mode.',
      '',
    ].join('\n'),
  )
}

function buildSeedWrapper(sourceText, sourcePath) {
  const normalizedText = String(sourceText || '').replace(/^\uFEFF/, '').trim()
  if (!normalizedText) {
    throw new Error(`HackaMap SSOT is empty: ${sourcePath}`)
  }
  return [
    '---',
    'title: "HackaMap - SSOT"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "multiDimTable"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    `hackamapSourcePath: ${JSON.stringify(sourcePath)}`,
    '---',
    '',
    normalizedText,
    '',
  ].join('\n')
}

async function prepareSourceBackedSeed(options) {
  const sourcePath = path.join(options.hackamapRoot, 'site', 'hackamap-ssot.md')
  const sourceText = await readFile(sourcePath, 'utf8').catch(error => {
    throw new Error(`Unable to read HackaMap SSOT at ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`)
  })
  const overrideRoot = path.join(os.tmpdir(), 'agentic-graph-hackamap-table')
  const overridePath = path.join(overrideRoot, 'agentic-graph-hackamap.md')
  await mkdir(overrideRoot, { recursive: true })
  await writeFile(overridePath, buildSeedWrapper(sourceText, sourcePath), 'utf8')
  return { overrideRoot, overridePath, sourcePath }
}

function buildLoopbackUrl(options) {
  return `http://${options.host}:${options.port}/?kgDoc=${encodeURIComponent(DEFAULT_DOC_PATH)}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const prepared = await prepareSourceBackedSeed(options)
  const loopbackUrl = buildLoopbackUrl(options)

  process.stdout.write(`[hackamap:table] Source: ${prepared.sourcePath}\n`)
  process.stdout.write(`[hackamap:table] Seed override: ${prepared.overridePath}\n`)
  process.stdout.write(`[hackamap:table] Open: ${loopbackUrl}\n`)

  const child = spawn(
    process.execPath,
    [viteBinPath, '--configLoader', 'runner', '--host', options.host, '--port', String(options.port), '--strictPort'],
    {
      cwd: canvasRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: prepared.overrideRoot,
      },
    },
  )

  const forwardSignal = signal => {
    if (!child.killed) child.kill(signal)
  }
  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
  child.once('error', error => {
    process.stderr.write(`[hackamap:table] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  child.once('exit', code => {
    process.exitCode = code ?? 0
  })
}

await main().catch(error => {
  process.stderr.write(`[hackamap:table] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
