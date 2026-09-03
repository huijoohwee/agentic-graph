import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

const FORBIDDEN_REFERENCE_TOKENS = Object.freeze([
  'andrisgauracs',
  'litert.js-mocap',
  'github.com/andrisgauracs',
  'freemocap',
  'github.com/freemocap',
] as const)

const GENERATED_OR_EXTERNAL_DIRECTORIES = new Set([
  '.dbg', '.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules', 'playwright-report', 'test-results',
])
const GENERATED_OR_EXTERNAL_PATH_PREFIXES = ['data/outputs'] as const
const SCANNED_TEXT_EXTENSIONS = /\.(?:cjs|css|csv|html|js|jsx|json|md|mjs|scss|sh|svg|toml|ts|tsx|txt|yaml|yml)$/u
const REFERENCE_ALLOWLIST = new Set([
  'canvas/scripts/__tests__/motion-control-assets-and-docs.test.mjs',
  'canvas/src/__tests__/motionControlCleanRoomBoundary.test.ts',
  'docs/documents/agentic-graph-motion-capture-platform-api.md',
  'docs/documents/agentic-graph-motion-control-prd-tad.md',
])

function repositoryFiles(root: string, repositoryRoot = root): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(root, entry.name)
    const repositoryPath = relative(repositoryRoot, path).split(sep).join('/')
    if (entry.isDirectory()) {
      return GENERATED_OR_EXTERNAL_DIRECTORIES.has(entry.name)
        || GENERATED_OR_EXTERNAL_PATH_PREFIXES.some(prefix => repositoryPath === prefix || repositoryPath.startsWith(`${prefix}/`))
        ? []
        : repositoryFiles(path, repositoryRoot)
    }
    return entry.isFile() && SCANNED_TEXT_EXTENSIONS.test(entry.name) ? [path] : []
  })
}

export function testMotionControlProductionRemainsCleanRoomAndDependencyFree(): void {
  const canvasRoot = process.cwd()
  const repositoryRoot = resolve(canvasRoot, '..')
  const scannedFiles = repositoryFiles(repositoryRoot).filter((path) => {
    const repositoryPath = relative(repositoryRoot, path).split(sep).join('/')
    return !REFERENCE_ALLOWLIST.has(repositoryPath) && !/^debug-[^/]+\.md$/u.test(repositoryPath)
  })
  const dependencies = [
    resolve(repositoryRoot, 'package.json'),
    resolve(repositoryRoot, 'package-lock.json'),
    resolve(canvasRoot, 'package.json'),
  ].map(path => readFileSync(path, 'utf8')).join('\n').toLowerCase()

  for (const token of FORBIDDEN_REFERENCE_TOKENS) {
    if (dependencies.includes(token)) {
      throw new Error(`expected repository-wide clean-room marker and dependency scan to exclude ${token}`)
    }
    for (const path of scannedFiles) {
      const repositoryPath = relative(repositoryRoot, path).split(sep).join('/')
      const repositoryPathLower = repositoryPath.toLowerCase()
      const fileTextLower = readFileSync(path, 'utf8').toLowerCase()
      if (repositoryPathLower.includes(token) || fileTextLower.includes(token)) {
        throw new Error(`expected repository-wide clean-room marker and dependency scan to exclude ${token} in ${repositoryPath}`)
      }
    }
  }
}
