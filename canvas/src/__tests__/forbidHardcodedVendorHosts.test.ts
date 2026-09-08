import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const build = (codes: number[]): string => String.fromCharCode(...codes)

const HOST = build([102, 105, 103, 109, 97, 46, 99, 111, 109])
const WWW_HOST = `${build([119, 119, 119, 46])}${HOST}`
const HTTPS_WWW = `${build([104, 116, 116, 112, 115, 58, 47, 47])}${WWW_HOST}${build([47])}`
const SOURCE_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.json', '.md', '.mdx', '.mjs', '.ts', '.tsx'])
const SKIP_DIRS = new Set(['.git', '.next', '.turbo', '__pycache__', 'artifacts', 'coverage', 'dist', 'node_modules', 'outputs', 'test-report', 'tmp'])

function walkFiles(rootDir: string): string[] {
  const out: string[] = []
  const stack: string[] = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()!
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i]!
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(p)
        continue
      }
      if (!e.isFile()) continue
      if (!SOURCE_EXTENSIONS.has(path.extname(e.name))) continue
      out.push(p)
    }
  }
  return out
}

function listTrackedSourceFiles(repoRoot: string): string[] {
  try {
    const list = (...args: string[]): string[] => execFileSync('git', ['ls-files', '-z', ...args], { cwd: repoRoot, encoding: 'utf8' }).split('\0').filter(Boolean)
    const files = list('--cached', '--others', '--exclude-standard')
    const deleted = new Set(list('--deleted'))
    return [...new Set(files)]
      .filter(file => !deleted.has(file))
      .filter(file => SOURCE_EXTENSIONS.has(path.extname(file)))
      .map(file => path.join(repoRoot, file))
  } catch {
    return walkFiles(repoRoot)
  }
}

export function testForbidHardcodedDesignVendorHosts(): void {
  const self = fileURLToPath(import.meta.url)
  const root = path.resolve(path.dirname(self), '../../..')
  const files = listTrackedSourceFiles(root)
  for (let i = 0; i < files.length; i += 1) {
    const text = fs.readFileSync(files[i]!, 'utf-8')
    if (text.includes(HTTPS_WWW) || text.includes(WWW_HOST) || text.includes(HOST)) {
      throw new Error(`forbidden vendor host literal detected in: ${path.relative(root, files[i]!)}`)
    }
  }
}
