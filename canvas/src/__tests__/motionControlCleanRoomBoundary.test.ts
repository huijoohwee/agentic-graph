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
  '.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules', 'playwright-report', 'test-results',
])
const SCANNED_TEXT_EXTENSIONS = /\.(?:cjs|css|csv|html|js|jsx|json|md|mjs|scss|sh|svg|toml|ts|tsx|txt|yaml|yml)$/u
const REFERENCE_ALLOWLIST = new Set([
  'canvas/scripts/__tests__/motion-control-assets-and-docs.test.mjs',
  'canvas/src/__tests__/motionControlCleanRoomBoundary.test.ts',
  'docs/documents/knowgrph-motion-capture-platform-api.md',
  'docs/documents/knowgrph-motion-control-prd-tad.md',
])

function repositoryFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) return GENERATED_OR_EXTERNAL_DIRECTORIES.has(entry.name) ? [] : repositoryFiles(path)
    return entry.isFile() && SCANNED_TEXT_EXTENSIONS.test(entry.name) ? [path] : []
  })
}

export function testMotionControlProductionRemainsCleanRoomAndDependencyFree(): void {
  const canvasRoot = process.cwd()
  const repositoryRoot = resolve(canvasRoot, '..')
  const scannedFiles = repositoryFiles(repositoryRoot).filter((path) => {
    const repositoryPath = relative(repositoryRoot, path).split(sep).join('/')
    return !REFERENCE_ALLOWLIST.has(repositoryPath)
  })
  const repositoryText = scannedFiles
    .map(path => `${relative(repositoryRoot, path)}\n${readFileSync(path, 'utf8')}`)
    .join('\n')
    .toLowerCase()
  const dependencies = [
    resolve(repositoryRoot, 'package.json'),
    resolve(repositoryRoot, 'package-lock.json'),
    resolve(canvasRoot, 'package.json'),
  ].map(path => readFileSync(path, 'utf8')).join('\n').toLowerCase()

  for (const token of FORBIDDEN_REFERENCE_TOKENS) {
    if (repositoryText.includes(token) || dependencies.includes(token)) {
      throw new Error(`expected repository-wide clean-room marker and dependency scan to exclude ${token}`)
    }
  }
}
