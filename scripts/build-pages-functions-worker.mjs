import { lstat, mkdir, mkdtemp, open, copyFile, readdir, realpath, rm, rmdir, symlink, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const agenticGraphRoot = path.resolve(scriptDir, '..')
const publishRoot = path.resolve(
  process.env.AGENTIC_OS_PUBLISH_REPOSITORY_ROOT || path.resolve(agenticGraphRoot, '..', 'huijoohwee'),
)
const functionsNodeModules = path.join(publishRoot, 'functions', 'node_modules')
const publishedAgenticOs = path.join(functionsNodeModules, 'agentic-os')
const buildLockPath = path.join(functionsNodeModules, '.agentic-graph-pages-functions-build.lock')
const graphAgenticOsEntry = fileURLToPath(import.meta.resolve('agentic-os/content-security-policy'))
const graphAgenticOsPackage = path.resolve(path.dirname(graphAgenticOsEntry), '..')
let outDir = null
let createdFunctionsNodeModules = false
let createdAgenticOsLink = false
let buildLockIdentity = null

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: publishRoot,
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? result.signal ?? 'unknown status'}`)
  }
}

try {
  let functionsNodeModulesStat = null
  try {
    functionsNodeModulesStat = await lstat(functionsNodeModules)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (!functionsNodeModulesStat) {
    await mkdir(functionsNodeModules)
    createdFunctionsNodeModules = true
    functionsNodeModulesStat = await lstat(functionsNodeModules)
  }
  if (!functionsNodeModulesStat.isDirectory() || functionsNodeModulesStat.isSymbolicLink()) {
    throw new Error(`Refusing to use non-directory Pages Functions dependency path at ${functionsNodeModules}`)
  }

  const buildLock = await open(buildLockPath, 'wx', 0o600)
  buildLockIdentity = await buildLock.stat()
  try {
    await buildLock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
  } finally {
    await buildLock.close()
  }
  outDir = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-pages-functions-'))

  let publishedAgenticOsPath = null
  try {
    publishedAgenticOsPath = await realpath(publishedAgenticOs)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const graphAgenticOsPath = await realpath(graphAgenticOsPackage)
  if (publishedAgenticOsPath && publishedAgenticOsPath !== graphAgenticOsPath) {
    throw new Error(`Refusing to replace pre-existing Pages Functions dependency at ${publishedAgenticOs}`)
  }
  if (!publishedAgenticOsPath) {
    await symlink(graphAgenticOsPath, publishedAgenticOs, process.platform === 'win32' ? 'junction' : 'dir')
    createdAgenticOsLink = true
  }

  await rm(path.join(publishRoot, '_worker.js'), { force: true })
  await rm(path.join(publishRoot, '_routes.json'), { force: true })

  run('npx', [
    '--yes',
    'wrangler',
    'pages',
    'functions',
    'build',
    'functions',
    '--project-directory',
    '.',
    '--build-output-directory',
    '.',
    '--outdir',
    outDir,
    '--output-routes-path',
    path.join(outDir, '_routes.json'),
    '--minify',
  ])

  const outputFiles = await readdir(outDir)
  const workerFile = outputFiles.find(fileName => fileName === 'index.js')
    || outputFiles.find(fileName => fileName.endsWith('.js'))
  if (!workerFile) {
    throw new Error('Wrangler did not emit a Pages Functions worker script')
  }

  await copyFile(path.join(outDir, workerFile), path.join(publishRoot, '_worker.js'))
  await copyFile(path.join(outDir, '_routes.json'), path.join(publishRoot, '_routes.json'))
  console.log('[agentic-graph] generated Cloudflare Pages Functions bundle in huijoohwee/_worker.js')
} finally {
  const cleanupErrors = []
  const clean = async operation => {
    try {
      await operation()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (createdAgenticOsLink) {
    await clean(async () => {
      const linkedPath = await realpath(publishedAgenticOs)
      if (linkedPath !== await realpath(graphAgenticOsPackage)) {
        throw new Error(`Pages Functions package link changed during build at ${publishedAgenticOs}`)
      }
      await unlink(publishedAgenticOs)
    })
  }
  if (buildLockIdentity) {
    await clean(async () => {
      const current = await lstat(buildLockPath)
      if (current.dev !== buildLockIdentity.dev || current.ino !== buildLockIdentity.ino || !current.isFile()) {
        throw new Error(`Pages Functions build lock changed during build at ${buildLockPath}`)
      }
      await unlink(buildLockPath)
    })
  }
  if (createdFunctionsNodeModules) {
    await clean(async () => {
      await rmdir(functionsNodeModules)
    })
  }
  if (outDir) {
    await clean(() => rm(outDir, { recursive: true, force: true }))
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'Failed to restore temporary Pages Functions build state')
  }
}
