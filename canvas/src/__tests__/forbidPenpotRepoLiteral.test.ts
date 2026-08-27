import fs from 'node:fs'
import path from 'node:path'

const collectTextFiles = (rootDir: string): string[] => {
  const out: string[] = []
  const stack: string[] = [rootDir]
  const ignoredDirnames = new Set<string>(['.git', 'node_modules', 'dist', 'build', '.agenticgraph-workspace', '.trae', 'data'])
  const allowedExt = new Set<string>([
    '.ts',
    '.tsx',
    '.js',
    '.mjs',
    '.cjs',
    '.json',
    '.md',
    '.yml',
    '.yaml',
    '.css',
    '.html',
  ])

  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (ignoredDirnames.has(entry.name)) continue
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!allowedExt.has(ext)) continue
      out.push(full)
    }
  }

  return out
}

export async function testForbidPenpotRepoLiteral() {
  const owner = 'penpot'
  const repo = 'penpot'
  const forbidden = [
    `https://github.com/${owner}/${repo}.git`,
    `https://github.com/${owner}/${repo}`,
    `git@github.com:${owner}/${repo}.git`,
    `github.com/${owner}/${repo}.git`,
    `github.com/${owner}/${repo}`,
    `${owner}/${repo}`,
  ]

  const repoRoot = path.resolve(process.cwd(), '..')
  const files = collectTextFiles(repoRoot)
  const matches: string[] = []

  for (const filePath of files) {
    if (filePath.endsWith(path.join('src', '__tests__', 'forbidPenpotRepoLiteral.test.ts'))) continue
    let text = ''
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > 2_000_000) continue
      text = fs.readFileSync(filePath, { encoding: 'utf8' })
    } catch {
      continue
    }
    const lower = text.toLowerCase()
    for (const f of forbidden) {
      if (!lower.includes(f.toLowerCase())) continue
      matches.push(`${path.relative(repoRoot, filePath)} (${f})`)
      break
    }
    if (matches.length >= 20) break
  }

  if (matches.length > 0) {
    throw new Error(`Forbidden Penpot repo literal found in: ${matches.join(', ')}`)
  }
}
