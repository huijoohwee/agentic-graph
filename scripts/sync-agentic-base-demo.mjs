import fs from 'node:fs/promises'
import path from 'node:path'
import { assertSafeRoot, resolveWithin } from './production-mirror-artifact-paths.mjs'
import { createAgenticBaseDemoArtifact, resolveAgenticBaseDemoSourceRoot } from './build-agentic-base-demo.mjs'

const routeManifestName = 'agentic-base-route.json'

const isSafeRelativePath = value => typeof value === 'string'
  && value.length > 0
  && !value.startsWith('/')
  && !value.includes('\\')
  && !value.includes('\0')
  && !value.split('/').some(part => part === '' || part === '.' || part === '..')

async function listFiles(directory, prefix = '') {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? prefix + '/' + entry.name : entry.name
    const absolutePath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Base demo mirror cannot contain symlinks: ' + relativePath)
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, relativePath))
    else if (entry.isFile()) files.push(relativePath)
    else throw new Error('Unsupported Base demo mirror entry: ' + relativePath)
  }
  return files
}

async function writeAtomically(target, body) {
  const temporary = target + '.tmp-' + process.pid
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(temporary, body, { flag: 'wx' })
  try {
    await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

export async function planAgenticBaseDemoSync({ graphRoot, sourceRoot, sourcePin, mirrorRoot }) {
  const mirror = assertSafeRoot(mirrorRoot, 'Pages mirror root')
  const resolvedSourceRoot = sourceRoot || resolveAgenticBaseDemoSourceRoot(graphRoot)
  const artifact = await createAgenticBaseDemoArtifact({
    graphRoot,
    sourceRoot: resolvedSourceRoot,
    sourcePin,
  })
  const targetRoot = resolveWithin(mirror, 'content/agentic-base')
  let existingPaths = []
  try {
    const targetStat = await fs.lstat(targetRoot)
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error('Base demo mirror target must be a real directory')
    }
    existingPaths = await listFiles(targetRoot)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const nextPaths = new Set(artifact.files.keys())
  let previousPaths = []
  if (existingPaths.includes(routeManifestName)) {
    const previous = JSON.parse(await fs.readFile(resolveWithin(targetRoot, routeManifestName), 'utf8'))
    if (previous.schema !== 'agentic-graph/base-demo-artifact/v1' || !Array.isArray(previous.files)) {
      throw new Error('Existing Base demo route manifest is not recognized')
    }
    previousPaths = previous.files.map(entry => entry.path)
    if (previousPaths.some(relativePath => !isSafeRelativePath(relativePath))) {
      throw new Error('Existing Base demo route manifest contains an unsafe path')
    }
    previousPaths.push(routeManifestName)
  } else if (existingPaths.length > 0) {
    throw new Error('Existing Base demo route has files without its ownership manifest')
  }

  const previouslyOwned = new Set(previousPaths)
  const unknown = existingPaths.filter(relativePath => !previouslyOwned.has(relativePath))
  if (unknown.length > 0) throw new Error('Unowned files exist in Base demo route: ' + unknown.join(', '))

  const toCopy = []
  for (const [relativePath, body] of artifact.files) {
    const target = resolveWithin(targetRoot, relativePath)
    let current = null
    try {
      current = await fs.readFile(target)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    if (!current || !current.equals(body)) toCopy.push({ relativePath, body })
  }
  const toRemove = existingPaths.filter(relativePath => !nextPaths.has(relativePath))
  return {
    targetRoot,
    artifact,
    toCopy,
    toRemove,
    hasDrift: toCopy.length > 0 || toRemove.length > 0,
  }
}

export async function applyAgenticBaseDemoSync(plan) {
  const ordinaryFiles = plan.toCopy.filter(entry => entry.relativePath !== routeManifestName)
  const manifest = plan.toCopy.filter(entry => entry.relativePath === routeManifestName)
  for (const entry of ordinaryFiles) {
    await writeAtomically(resolveWithin(plan.targetRoot, entry.relativePath), entry.body)
  }
  for (const relativePath of plan.toRemove) {
    await fs.rm(resolveWithin(plan.targetRoot, relativePath), { force: true })
  }
  for (const entry of manifest) {
    await writeAtomically(resolveWithin(plan.targetRoot, entry.relativePath), entry.body)
  }
  return { copied: plan.toCopy.length, removed: plan.toRemove.length }
}
