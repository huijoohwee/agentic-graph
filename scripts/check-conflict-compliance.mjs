import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const agenticGraphRoot = path.resolve(__dirname, '..')
const githubRoot = path.resolve(agenticGraphRoot, '..')
const syncMapPath = path.resolve(githubRoot, 'huijoohwee.github.io', 'schema', 'AgenticRAG', 'sync_map.py')
const sourceOnly = process.argv.includes('--source-only')

const ignoredDirNames = new Set([
  '.git',
  '.idea',
  '.next',
  '.wrangler',
  '.turbo',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
])

const ignoredRelativeRoots = new Set([
  'canvas/dist',
  'data/outputs',
])

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsonld',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.scss',
  '.sh',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
  '.py',
])

const textBasenames = new Set([
  '.env.example',
  '.eslintrc',
  '.eslintrc.json',
  '.gitignore',
  '.prettierignore',
  'README',
  'README.md',
])

const toPosixRel = absolutePath => path.relative(agenticGraphRoot, absolutePath).split(path.sep).filter(Boolean).join('/')

export const isIgnoredRelativePath = rel => {
  for (const root of ignoredRelativeRoots) {
    if (rel === root || rel.startsWith(`${root}/`)) return true
  }
  return false
}

const isTextFile = absolutePath => {
  const ext = path.extname(absolutePath).toLowerCase()
  const base = path.basename(absolutePath)
  return textExtensions.has(ext) || textBasenames.has(base)
}

const listTextFiles = async (rootDir, { allowIgnoredRelativeRoots = false } = {}) => {
  const out = []
  const walk = async dir => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (ignoredDirNames.has(entry.name)) continue
      const abs = path.resolve(dir, entry.name)
      const rel = toPosixRel(abs)
      if (!allowIgnoredRelativeRoots && isIgnoredRelativePath(rel)) continue
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (!entry.isFile() || !isTextFile(abs)) continue
      out.push(abs)
    }
  }
  await walk(rootDir)
  out.sort((a, b) => a.localeCompare(b))
  return out
}

const isImmutableHistoryPath = rel => (
  rel.startsWith('docs/reports/')
)

const placeholderUserNames = new Set([
  '...',
  'demo',
  'example',
  'test',
  'user',
  'username',
])

const findMachineSpecificPathLabel = line => {
  const unixMatches = line.matchAll(/(^|[^A-Za-z0-9.])(?:file:\/{2})?\/(?:Users|home)\/([^/\s"'`]+)(?:\/|$)/g)
  for (const match of unixMatches) {
    if (!placeholderUserNames.has(String(match[2] || '').toLowerCase())) return 'Unix user home path'
  }

  const windowsMatches = line.matchAll(/[A-Za-z]:\\Users\\([^\\\s"'`]+)(?:\\|$)/g)
  for (const match of windowsMatches) {
    if (!placeholderUserNames.has(String(match[1] || '').toLowerCase())) return 'Windows user home path'
  }
  return null
}

const findMachineSpecificPaths = async (
  rootDir,
  { allowIgnoredRelativeRoots = false, excludeImmutableHistory = false } = {},
) => {
  try {
    await fs.access(rootDir)
  } catch {
    return []
  }

  const files = await listTextFiles(rootDir, { allowIgnoredRelativeRoots })
  const out = []
  for (const filePath of files) {
    const rel = toPosixRel(filePath)
    if (excludeImmutableHistory && isImmutableHistoryPath(rel)) continue
    const lines = (await fs.readFile(filePath, 'utf8')).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const violationLabel = findMachineSpecificPathLabel(lines[index])
      if (violationLabel) out.push(`${rel}:${index + 1} (${violationLabel})`)
    }
  }
  return out
}

const findConflictMarkers = async () => {
  const files = await listTextFiles(agenticGraphRoot)
  const out = []
  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8')
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (
        line.startsWith('<<<<<<<') ||
        line.startsWith('=======') ||
        line.startsWith('>>>>>>>')
      ) {
        out.push(`${toPosixRel(filePath)}:${index + 1}`)
      }
    }
  }
  return out
}

const runCommand = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  child.on('error', reject)
  child.on('close', code => resolve(code ?? 1))
})

const main = async () => {
  const conflictMarkers = await findConflictMarkers()
  if (conflictMarkers.length > 0) {
    console.error('[agentic-graph] unresolved merge markers detected:')
    for (const entry of conflictMarkers.slice(0, 50)) console.error(`  - ${entry}`)
    if (conflictMarkers.length > 50) {
      console.error(`  - ... ${conflictMarkers.length - 50} more`)
    }
    process.exit(1)
  }

  const sourcePathLeaks = await findMachineSpecificPaths(agenticGraphRoot, {
    excludeImmutableHistory: true,
  })
  const buildPathLeaks = await findMachineSpecificPaths(
    path.resolve(agenticGraphRoot, 'canvas', 'dist'),
    { allowIgnoredRelativeRoots: true },
  )
  const machineSpecificPathLeaks = [...sourcePathLeaks, ...buildPathLeaks]
  if (machineSpecificPathLeaks.length > 0) {
    console.error('[agentic-graph] machine-specific filesystem paths detected:')
    for (const entry of machineSpecificPathLeaks.slice(0, 50)) console.error(`  - ${entry}`)
    if (machineSpecificPathLeaks.length > 50) {
      console.error(`  - ... ${machineSpecificPathLeaks.length - 50} more`)
    }
    process.exit(1)
  }

  if (!sourceOnly) {
    const syncExitCode = await runCommand(
      process.execPath,
      [path.resolve(__dirname, 'sync-pages-agentic-graph.mjs'), '--check'],
      agenticGraphRoot,
    )
    if (syncExitCode !== 0) process.exit(syncExitCode)

    try {
      await fs.access(syncMapPath)
      const schemaExitCode = await runCommand(
        'python3',
        [syncMapPath, '--mode', 'check'],
        githubRoot,
      )
      if (schemaExitCode !== 0) process.exit(schemaExitCode)
    } catch {
      console.log('[agentic-graph] schema sync check skipped (sibling AgenticRAG repo not available)')
    }
  }

  console.log(`[agentic-graph] conflict-resolution ${sourceOnly ? 'source' : 'source and mirror'} compliance checks passed`)
}

if (path.resolve(process.argv[1] || '') === __filename) await main()
