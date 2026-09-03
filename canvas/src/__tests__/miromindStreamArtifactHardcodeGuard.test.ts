import fs from 'node:fs'
import path from 'node:path'

const collectTextFiles = (rootDir: string): string[] => {
  const out: string[] = []
  const stack: string[] = [rootDir]
  const ignoredDirnames = new Set<string>(['.git', 'node_modules', 'dist', 'build', '.agentic-graph-workspace', '.trae', 'data'])
  const allowedExt = new Set<string>(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml'])
  while (stack.length > 0) {
    const dir = stack.pop() || ''
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (ignoredDirnames.has(entry.name)) continue
        stack.push(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (!allowedExt.has(extension)) continue
      out.push(fullPath)
    }
  }
  return out
}

export async function testMiroMindStreamArtifactsForbidHardcodedSharedUrls() {
  const protocol = ['https', '://'].join('')
  const host = ['dr', '.', 'miromind', '.', 'ai'].join('')
  const forbidden = [
    [protocol, host, '/share/', 'c753877f-7480-4e76-bf75-89fe18358943'].join(''),
    [protocol, host, '/report/share/', 'aNHNpO7MwdMtsxKg'].join(''),
  ]
  const repoRoot = path.resolve(process.cwd(), '..')
  const selfPath = path.resolve(process.cwd(), 'src', '__tests__', 'miromindStreamArtifactHardcodeGuard.test.ts')
  const files = collectTextFiles(repoRoot)
  const matches: string[] = []
  for (const filePath of files) {
    if (path.resolve(filePath) === selfPath) continue
    let text = ''
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > 2_000_000) continue
      text = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    const matched = forbidden.find(value => text.includes(value))
    if (!matched) continue
    matches.push(`${path.relative(repoRoot, filePath)} (${matched})`)
    if (matches.length >= 20) break
  }
  if (matches.length > 0) {
    throw new Error(`Forbidden MiroMind shared URL literal found in: ${matches.join(', ')}`)
  }
}
