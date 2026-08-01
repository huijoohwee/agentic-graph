import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { resolveBuiltChunkBudget } from './hygiene-built-chunk-budget.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const lineLimit = 600
const byteLimit = 500 * 1024
const reportLimit = 80

const args = new Set(process.argv.slice(2))
const checkAll = args.has('--all')
const chunkOnly = args.has('--chunks')
const semanticOnly = args.has('--semantic-only')
const budgetOnly = args.has('--budget-only')
const layoutOnly = args.has('--layout-only')

const disallowedRepoEntries = [
  { rel: '.trae', reason: 'editor workspace notes belong outside tracked knowgrph source' },
  { rel: 'canvas/.trae', reason: 'editor workspace notes belong outside tracked knowgrph source' },
  { rel: 'configs', reason: 'config roots are consolidated under data/config' },
  { rel: 'llm-chat-config', reason: 'config roots are consolidated under data/config/llm-chat' },
  { rel: 'orchestrator-config', reason: 'config roots are consolidated under data/config/orchestrator' },
  { rel: 'schema-config', reason: 'config roots are consolidated under data/config/schema' },
  { rel: 'trash_rm_scripts', reason: 'ad-hoc removal scripts are not tracked source' },
  { rel: 'canvas/trash_rm_scripts', reason: 'ad-hoc removal scripts are not tracked source' },
  { rel: 'canvas/sandbox', reason: 'test and export tools live under canvas/src/cli, canvas/src/tests/tools, or data/test-data' },
  { rel: 'canvas/=', reason: 'accidental shell scratch output is not tracked source' },
  { rel: 'canvas/B,', reason: 'accidental shell scratch output is not tracked source' },
  { rel: 'canvas/{', reason: 'accidental shell scratch output is not tracked source' },
  { rel: 'canvas/tmp-snap-live.txt', reason: 'local smoke scratch output is not tracked source' },
  { rel: 'canvas/tmp_probe_initial_workspace_open.ts', reason: 'local smoke scratch output is not tracked source' },
  { rel: 'organize_todo.py', reason: 'repo scripts live under scripts/' },
  { rel: '{target}', reason: 'accidental shell scratch output is not tracked source' },
  { rel: 'data/knowgrph-workflow-preview', reason: 'workflow previews are generated under ignored data/outputs' },
  { rel: 'data/knowgrph-schema-document_202601300527', reason: 'dated parser scratch output is stale generated source' },
  { rel: 'docs/documents/api-reference', reason: 'API references live under docs/documents/knowgrph-api-reference' },
  { rel: 'docs/documents/deprecated', reason: 'deprecated documents are not active knowgrph source' },
  { rel: 'docs/documents/knowgrph-api-reference/_archive', reason: 'archived API reference snapshots are stale source copies' },
  { rel: 'docs/reports/prd-codebase-gap-report_202601052150.md', reason: 'dated gap reports are stale generated reports' },
  { rel: 'docs/reports/prd-codebase-gap-report_202601052215.md', reason: 'dated gap reports are stale generated reports' },
  { rel: 'test-report', reason: 'dated test reports are stale generated reports' },
  { rel: 'todo-log_202602.md', reason: 'cross-repository planning lives only in agentic-canvas-os/docs/TODO.md and agentic-canvas-os/todo/YYYY-MM.md' },
  { rel: 'todo-log_202603.md', reason: 'cross-repository planning lives only in agentic-canvas-os/docs/TODO.md and agentic-canvas-os/todo/YYYY-MM.md' },
  { rel: 'todo-log_202604.md', reason: 'cross-repository planning lives only in agentic-canvas-os/docs/TODO.md and agentic-canvas-os/todo/YYYY-MM.md' },
]

const ignoredDirNames = new Set([
  '.git',
  '.idea',
  '.next',
  '.turbo',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
])

const ignoredRelativeRoots = [
  '.knowgrph-workspace',
  'canvas/data/outputs',
  'canvas/dist',
  'data/knowgrph-workflow-preview',
  'data/outputs',
  'docs/documents/knowgrph-api-reference',
]

const ignoredRelativePaths = new Set([
  'canvas/public/settings-flow.json',
  'canvas/src/features/settings/settings-flow.schema.json',
])

const ignoredBasenames = new Set([
  'package-lock.json',
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
  '.py',
  '.scss',
  '.sh',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
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

const semanticSourceRoots = [
  'canvas/src',
  'grph-shared/src',
  'gympgrph/src',
]

const builtChunkRoots = [
  'canvas/dist/assets',
]

const builtChunkExtensions = new Set([
  '.css',
  '.js',
])

const toPosixRel = absolutePath => path.relative(repoRoot, absolutePath).split(path.sep).filter(Boolean).join('/')

const isIgnoredRelativePath = rel => {
  if (ignoredRelativePaths.has(rel)) return true
  if (ignoredBasenames.has(path.basename(rel))) return true
  return ignoredRelativeRoots.some(root => rel === root || rel.startsWith(`${root}/`))
}

const isTextFile = absolutePath => {
  const ext = path.extname(absolutePath).toLowerCase()
  const base = path.basename(absolutePath)
  return textExtensions.has(ext) || textBasenames.has(base)
}

const runGit = args => {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  }
}

const measureText = text => ({
  byteCount: Buffer.byteLength(text, 'utf8'),
  lineCount: text.length === 0 ? 0 : text.split('\n').length,
})

const readHeadBudget = rel => {
  const result = spawnSync('git', ['show', `HEAD:${rel}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.status !== 0) return null
  return measureText(String(result.stdout || ''))
}

const addOutputLines = (out, text) => {
  for (const line of String(text || '').split('\n')) {
    const rel = line.trim()
    if (rel) out.add(rel)
  }
}

const readChangedRelativePaths = () => {
  const out = new Set()
  const githubBaseRef = String(process.env.GITHUB_BASE_REF || '').trim()
  if (githubBaseRef) {
    const baseDiff = runGit(['diff', '--name-only', '--diff-filter=ACMR', `origin/${githubBaseRef}...HEAD`])
    if (baseDiff.ok) addOutputLines(out, baseDiff.stdout)
  }

  if (out.size === 0) {
    const headDiff = runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'])
    if (headDiff.ok) addOutputLines(out, headDiff.stdout)
  }

  const untracked = runGit(['ls-files', '--others', '--exclude-standard'])
  if (untracked.ok) addOutputLines(out, untracked.stdout)

  return Array.from(out).sort((a, b) => a.localeCompare(b))
}

const listTextFiles = async rootDir => {
  const out = []
  const walk = async dir => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (ignoredDirNames.has(entry.name)) continue
      const abs = path.resolve(dir, entry.name)
      const rel = toPosixRel(abs)
      if (isIgnoredRelativePath(rel)) continue
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (!entry.isFile() || !isTextFile(abs)) continue
      out.push(abs)
    }
  }
  await walk(rootDir)
  out.sort((a, b) => toPosixRel(a).localeCompare(toPosixRel(b)))
  return out
}

const listChangedTextFiles = async () => {
  const out = []
  for (const rel of readChangedRelativePaths()) {
    if (isIgnoredRelativePath(rel)) continue
    const abs = path.resolve(repoRoot, rel)
    if (!abs.startsWith(repoRoot + path.sep)) continue
    try {
      const stat = await fs.stat(abs)
      if (!stat.isFile() || !isTextFile(abs)) continue
      out.push(abs)
    } catch {
      // Deleted files are irrelevant to source budget checks.
    }
  }
  return out
}

const findLayoutViolations = async () => {
  const out = []
  for (const entry of disallowedRepoEntries) {
    const abs = path.resolve(repoRoot, entry.rel)
    try {
      const stat = await fs.lstat(abs)
      out.push({
        rel: entry.rel,
        kind: stat.isDirectory() ? 'directory' : 'file',
        reason: entry.reason,
      })
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return out
}

const findBudgetViolations = async (files, options = {}) => {
  const out = []
  for (const filePath of files) {
    const stat = await fs.stat(filePath)
    const text = await fs.readFile(filePath, 'utf8')
    const { lineCount } = measureText(text)
    const reasons = []
    const rel = toPosixRel(filePath)
    const headBudget = options.regressionOnly ? readHeadBudget(rel) : null
    const baselineLines = headBudget?.lineCount ?? 0
    const baselineBytes = headBudget?.byteCount ?? 0
    const lineOverLimit = lineCount > lineLimit
    const byteOverLimit = stat.size > byteLimit
    const baselineWasOverLimit = baselineLines > lineLimit || baselineBytes > byteLimit
    const lineRegressed = lineOverLimit && (!baselineWasOverLimit || lineCount > baselineLines)
    const byteRegressed = byteOverLimit && (!baselineWasOverLimit || stat.size > baselineBytes)
    const lineViolation = options.regressionOnly ? lineRegressed : lineOverLimit
    const byteViolation = options.regressionOnly ? byteRegressed : byteOverLimit
    if (lineViolation) reasons.push(`${lineCount} lines > ${lineLimit}${baselineLines > lineLimit ? `, baseline ${baselineLines}` : ''}`)
    if (byteViolation) reasons.push(`${Math.ceil(stat.size / 1024)} KiB > 500 KiB${baselineBytes > byteLimit ? `, baseline ${Math.ceil(baselineBytes / 1024)} KiB` : ''}`)
    if (reasons.length > 0) out.push({ rel, reasons })
  }
  return out
}

const listSemanticSourceFiles = async () => {
  const out = []
  for (const relRoot of semanticSourceRoots) {
    const absRoot = path.resolve(repoRoot, relRoot)
    try {
      const stat = await fs.stat(absRoot)
      if (stat.isDirectory()) out.push(...await listTextFiles(absRoot))
    } catch {
      // Optional workspace packages may be absent in partial checkouts.
    }
  }
  return out
}

const findSemanticKeyViolations = async () => {
  const out = []
  const pattern = /graphSemanticKey\s*:\s*(hashScopedStringArraySignature|hashSignatureParts)\s*\(/g
  for (const filePath of await listSemanticSourceFiles()) {
    const rel = toPosixRel(filePath)
    if (rel.endsWith('/semanticKey.ts')) continue
    const text = await fs.readFile(filePath, 'utf8')
    const lines = text.split('\n')
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      pattern.lastIndex = 0
      if (pattern.test(lines[lineIndex])) out.push(`${rel}:${lineIndex + 1}`)
    }
  }
  return out
}

const listBuiltChunks = async () => {
  const out = []
  const walk = async dir => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.resolve(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      if (builtChunkExtensions.has(path.extname(abs).toLowerCase())) out.push(abs)
    }
  }

  for (const relRoot of builtChunkRoots) {
    const absRoot = path.resolve(repoRoot, relRoot)
    try {
      const stat = await fs.stat(absRoot)
      if (stat.isDirectory()) await walk(absRoot)
    } catch {
      // Build output is absent before the first local production build.
    }
  }
  return out.sort((a, b) => toPosixRel(a).localeCompare(toPosixRel(b)))
}

const findChunkViolations = async () => {
  const out = []
  for (const filePath of await listBuiltChunks()) {
    const rel = toPosixRel(filePath)
    const budget = resolveBuiltChunkBudget(rel)
    const stat = await fs.stat(filePath)
    if (stat.size <= budget.limit) continue
    out.push({
      rel,
      sizeKiB: Math.ceil(stat.size / 1024),
      limitKiB: Math.ceil(budget.limit / 1024),
      reason: budget.reason,
    })
  }
  return out
}

const reportBudgetViolations = violations => {
  if (violations.length === 0) return
  console.error(`[knowgrph] source budget violations (${lineLimit} lines/file, 500 KiB/file):`)
  for (const entry of violations.slice(0, reportLimit)) {
    console.error(`  - ${entry.rel}: ${entry.reasons.join(', ')}`)
  }
  if (violations.length > reportLimit) {
    console.error(`  - ... ${violations.length - reportLimit} more`)
  }
}

const reportSemanticViolations = violations => {
  if (violations.length === 0) return
  console.error('[knowgrph] graph semantic-key cache keys must use canvas/src/lib/graph/semanticKey.ts:')
  for (const entry of violations.slice(0, reportLimit)) console.error(`  - ${entry}`)
  if (violations.length > reportLimit) {
    console.error(`  - ... ${violations.length - reportLimit} more`)
  }
}

const reportChunkViolations = violations => {
  if (violations.length === 0) return
  console.error('[knowgrph] built chunk violations:')
  for (const entry of violations.slice(0, reportLimit)) {
    console.error(`  - ${entry.rel}: ${entry.sizeKiB} KiB > ${entry.limitKiB} KiB (${entry.reason})`)
  }
  if (violations.length > reportLimit) {
    console.error(`  - ... ${violations.length - reportLimit} more`)
  }
}

const reportLayoutViolations = violations => {
  if (violations.length === 0) return
  console.error('[knowgrph] stale repo layout entries are present:')
  for (const entry of violations.slice(0, reportLimit)) {
    console.error(`  - ${entry.rel} (${entry.kind}): ${entry.reason}`)
  }
  if (violations.length > reportLimit) {
    console.error(`  - ... ${violations.length - reportLimit} more`)
  }
}

const main = async () => {
  let failed = false

  if (chunkOnly) {
    const chunkViolations = await findChunkViolations()
    reportChunkViolations(chunkViolations)
    if (chunkViolations.length > 0) process.exit(1)
    console.log('[knowgrph] built chunk compliance checks passed')
    return
  }

  const layoutViolations = await findLayoutViolations()
  reportLayoutViolations(layoutViolations)
  failed = failed || layoutViolations.length > 0

  if (layoutOnly) {
    if (failed) process.exit(1)
    console.log('[knowgrph] repo layout hygiene checks passed')
    return
  }

  if (!semanticOnly) {
    const files = checkAll ? await listTextFiles(repoRoot) : await listChangedTextFiles()
    const budgetViolations = await findBudgetViolations(files, { regressionOnly: !checkAll })
    reportBudgetViolations(budgetViolations)
    failed = failed || budgetViolations.length > 0
  }

  if (!budgetOnly) {
    const semanticViolations = await findSemanticKeyViolations()
    reportSemanticViolations(semanticViolations)
    failed = failed || semanticViolations.length > 0
  }

  if (failed) process.exit(1)
  console.log(`[knowgrph] hygiene compliance checks passed (${checkAll ? 'all files' : 'changed files'})`)
}

await main()
