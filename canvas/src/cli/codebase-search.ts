import fs from 'node:fs'
import path from 'node:path'

type Match = {
  file: string
  line: number
  text: string
}

const argv = process.argv.slice(2)

const readArgValue = (key: string): string | null => {
  const idx = argv.indexOf(key)
  if (idx < 0) return null
  const v = argv[idx + 1]
  return typeof v === 'string' ? v : null
}

const hasFlag = (key: string): boolean => argv.includes(key)

const rawQuery = (() => {
  const v = readArgValue('--query') || readArgValue('-q')
  if (v && v.trim()) return v.trim()
  const first = argv.find(a => typeof a === 'string' && !a.startsWith('-'))
  return first && first.trim() ? first.trim() : ''
})()

if (!rawQuery) {
  process.stderr.write('Usage: codebase-search <query> [--max N] [--json] [--roots relA,relB]\n')
  process.exit(2)
}

const maxResults = (() => {
  const raw = readArgValue('--max') || readArgValue('-m')
  const n = raw ? Number.parseInt(raw, 10) : 200
  return Number.isFinite(n) && n > 0 ? Math.min(10_000, n) : 200
})()

const jsonOut = hasFlag('--json')
const caseInsensitive = hasFlag('-i') || hasFlag('--ignore-case')

const ignoreDirNames = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.trae',
  '.next',
  '.turbo',
])

const defaultRepoRoot = path.resolve(process.cwd(), '..', '..', '..')
const repoRoot = (() => {
  const raw = readArgValue('--repo-root')
  if (raw && raw.trim()) return path.resolve(process.cwd(), raw.trim())
  return defaultRepoRoot
})()

const roots = (() => {
  const raw = readArgValue('--roots')
  const candidates = (raw && raw.trim())
    ? raw.split(',').map(s => s.trim()).filter(Boolean)
    : [
        'agentic-graph/canvas/src',
        'gympgrph/src',
        'grph-shared/src',
        'agentic-graph/docs/documents',
        'schema/AgenticRAG',
      ]
  const abs = candidates
    .map(rel => path.resolve(repoRoot, rel))
    .filter(p => {
      try {
        return fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    })
  return abs
})()

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.mdx', '.mmd'])

function listFilesRecursively(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (ignoreDirNames.has(e.name)) continue
      listFilesRecursively(p, out)
      continue
    }
    if (!e.isFile()) continue
    const ext = path.extname(e.name).toLowerCase()
    if (!extensions.has(ext)) continue
    out.push(p)
  }
  return out
}

const query = caseInsensitive ? rawQuery.toLowerCase() : rawQuery
const matches: Match[] = []

for (const root of roots) {
  const files = listFilesRecursively(root)
  for (const file of files) {
    if (matches.length >= maxResults) break
    let text = ''
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const haystack = caseInsensitive ? text.toLowerCase() : text
    if (!haystack.includes(query)) continue
    const relFile = path.relative(repoRoot, file).replace(/\\/g, '/')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      if (matches.length >= maxResults) break
      const lineText = lines[i] || ''
      const lineHay = caseInsensitive ? lineText.toLowerCase() : lineText
      if (!lineHay.includes(query)) continue
      matches.push({ file: relFile, line: i + 1, text: lineText.trimEnd() })
    }
  }
}

if (jsonOut) {
  process.stdout.write(JSON.stringify({ query: rawQuery, count: matches.length, matches }, null, 2) + '\n')
} else {
  process.stdout.write(`query: ${rawQuery}\ncount: ${matches.length}\n\n`)
  for (const m of matches) {
    process.stdout.write(`${m.file}:${m.line}: ${m.text}\n`)
  }
}
