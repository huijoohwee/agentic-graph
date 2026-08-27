import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface InspirationReference {
  readonly canonicalUrl: string
  readonly label: string
  readonly repositoryName: string
  readonly slug: string
}

const ALLOWED_PROVENANCE_DOCUMENTS = new Set([
  'docs/documents/agenticgraph-image-to-glb-api.md',
  'docs/documents/agenticgraph-image-to-threejs-api.md',
])
const GITHUB_ORIGIN = ['https:', '', 'github.com'].join('/')
const INSPIRATION_REFERENCES: readonly InspirationReference[] = Object.freeze([
  {
    canonicalUrl: [GITHUB_ORIGIN, 'hoainho', 'img2threejs'].join('/'),
    label: 'image-to-Three.js reference',
    repositoryName: 'img2threejs',
    slug: ['hoainho', 'img2threejs'].join('/'),
  },
  {
    canonicalUrl: [GITHUB_ORIGIN, 'microsoft', 'TRELLIS.2'].join('/'),
    label: 'high-fidelity image-to-3D reference',
    repositoryName: 'TRELLIS.2',
    slug: ['microsoft', 'TRELLIS.2'].join('/'),
  },
])
const STALE_REFERENCE_SLUG = ['microsoft', 'TRELLIS'].join('/')
const TEXT_EXTENSIONS = new Set([
  '.bash',
  '.cjs',
  '.conf',
  '.css',
  '.gltf',
  '.html',
  '.ini',
  '.js',
  '.jsx',
  '.json',
  '.jsonc',
  '.lock',
  '.md',
  '.mdx',
  '.mjs',
  '.py',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
  '.zsh',
])
const TEXT_FILE_NAMES = new Set([
  '.gitmodules',
  'dockerfile',
  'makefile',
  'procfile',
])
const DEPENDENCY_FILE_PATTERN = /(?:^|\/)(?:\.gitmodules|deno\.jsonc?|environment\.ya?ml|package(?:-lock)?\.json|pipfile(?:\.lock)?|pnpm-lock\.yaml|poetry\.lock|pyproject\.toml|requirements[^/]*\.txt|uv\.lock|yarn\.lock)$/i

function normalizePath(value: string): string {
  return value.replaceAll(path.sep, '/')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const REFERENCE_NAME_SOURCE = [
  ...INSPIRATION_REFERENCES.map(reference => escapeRegExp(reference.repositoryName)),
  'TRELLIS[-_.]?2',
  escapeRegExp('TRELLIS'),
].join('|')
const REFERENCE_TOKEN_PATTERN = new RegExp(`\\b(?:${REFERENCE_NAME_SOURCE})\\b`, 'i')
const IMPORT_PATTERN = new RegExp(`(?:\\bfrom\\s+|\\bimport\\s*(?:\\(\\s*)?|\\brequire\\s*\\(\\s*)["'][^"'\\n]*(?:${REFERENCE_NAME_SOURCE})[^"'\\n]*["']`, 'i')
const ACQUISITION_PATTERN = new RegExp(`\\b(?:git\\s+(?:clone|submodule\\s+add)|pip(?:3)?\\s+install|uv\\s+add|npm\\s+(?:i|install)|pnpm\\s+add|yarn\\s+add|bun\\s+add|hf\\s+download|huggingface-cli\\s+download|curl\\b[^\\n]*\\s-o|wget\\b)\\b[^\\n]{0,240}\\b(?:${REFERENCE_NAME_SOURCE})\\b`, 'i')
const EXTERNAL_PATH_PATTERN = new RegExp(`(?:^|[/\\\\])(?:__tests__|assets?|checkpoints?|examples?|external|fixtures?|models?|prompts?|schemas?|tests?|third[-_]?party|vendor(?:ed)?|weights?)[/\\\\][^\\n"'\\x60]*\\b(?:${REFERENCE_NAME_SOURCE})\\b`, 'i')
const COPY_ATTRIBUTION_PATTERNS = [
  new RegExp(`\\b(?:copied|adapted|ported|vendored|derived)\\b[^\\n]{0,64}\\bfrom\\b[^\\n]{0,160}\\b(?:${REFERENCE_NAME_SOURCE})\\b`, 'i'),
  new RegExp(`\\b(?:${REFERENCE_NAME_SOURCE})\\b[^\\n]{0,160}\\b(?:copied|adapted|ported|vendored|derived)\\b[^\\n]{0,64}\\b(?:prompt|schema|example|test|fixture|asset)s?\\b`, 'i'),
] as const

function listRepositoryFiles(repositoryRoot: string): readonly string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
    .split('\0')
    .map(file => normalizePath(file.trim()))
    .filter(Boolean)
    .sort()
}

function isTextFile(relativePath: string): boolean {
  const basename = path.basename(relativePath).toLowerCase()
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())
    || TEXT_FILE_NAMES.has(basename)
    || DEPENDENCY_FILE_PATTERN.test(relativePath)
}

function lineNumberForIndex(text: string, index: number): number {
  return text.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function recordMatch(
  violations: string[],
  relativePath: string,
  text: string,
  pattern: RegExp,
  message: string,
): void {
  const match = pattern.exec(text)
  if (!match || match.index < 0) return
  violations.push(`${relativePath}:${lineNumberForIndex(text, match.index)} ${message}`)
}

export function testImageToGlbExternalInspirationRemainsProvenanceOnly(): void {
  const selfPath = fileURLToPath(import.meta.url)
  const repositoryRoot = path.resolve(path.dirname(selfPath), '../../..')
  const selfRelativePath = normalizePath(path.relative(repositoryRoot, selfPath))
  const violations: string[] = []

  for (const relativePath of listRepositoryFiles(repositoryRoot)) {
    if (relativePath === selfRelativePath) continue
    if (!existsSync(path.join(repositoryRoot, relativePath))) continue
    const allowedProvenanceDocument = ALLOWED_PROVENANCE_DOCUMENTS.has(relativePath)
    const normalizedLowerPath = relativePath.toLowerCase()

    for (const reference of INSPIRATION_REFERENCES) {
      if (!allowedProvenanceDocument && normalizedLowerPath.includes(reference.slug.toLowerCase())) {
        violations.push(`${relativePath}: ${reference.label} path is forbidden outside API provenance docs`)
      }
    }
    if (EXTERNAL_PATH_PATTERN.test(relativePath)) {
      violations.push(`${relativePath}: external prompt, schema, example, test, fixture, asset, model, or vendor path is forbidden`)
    }

    if (!isTextFile(relativePath)) continue
    const text = readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

    const stalePattern = new RegExp(`${escapeRegExp(STALE_REFERENCE_SLUG)}(?!\\.2(?:\\b|[/#?]))`, 'i')
    recordMatch(violations, relativePath, text, stalePattern, 'stale reference is forbidden; provenance must use the current repository')

    for (const reference of INSPIRATION_REFERENCES) {
      const slugPattern = new RegExp(escapeRegExp(reference.slug), 'gi')
      for (const match of text.matchAll(slugPattern)) {
        if (allowedProvenanceDocument) continue
        violations.push(`${relativePath}:${lineNumberForIndex(text, match.index ?? 0)} ${reference.label} name or URL is allowed only in API provenance docs`)
      }

      const urlPattern = new RegExp(`${escapeRegExp(reference.canonicalUrl)}[^\\s"'\\x60<>\\])]*`, 'gi')
      for (const match of text.matchAll(urlPattern)) {
        if (allowedProvenanceDocument && match[0].toLowerCase() === reference.canonicalUrl.toLowerCase()) continue
        violations.push(`${relativePath}:${lineNumberForIndex(text, match.index ?? 0)} ${reference.label} URL must be the exact canonical provenance URL`)
      }
    }

    if (DEPENDENCY_FILE_PATTERN.test(relativePath) && REFERENCE_TOKEN_PATTERN.test(text)) {
      violations.push(`${relativePath}: external dependency, submodule, or model declaration is forbidden`)
    }
    recordMatch(violations, relativePath, text, IMPORT_PATTERN, 'external runtime or build import is forbidden')
    recordMatch(violations, relativePath, text, ACQUISITION_PATTERN, 'external install, clone, download, or submodule command is forbidden')
    recordMatch(violations, relativePath, text, EXTERNAL_PATH_PATTERN, 'external prompt, schema, example, test, fixture, asset, model, or vendor path is forbidden')
    for (const pattern of COPY_ATTRIBUTION_PATTERNS) {
      recordMatch(violations, relativePath, text, pattern, 'copied or adapted external implementation material is forbidden')
    }
  }

  if (violations.length > 0) {
    throw new Error(`Image-to-GLB external-inspiration boundary violations:\n${[...new Set(violations)].sort().join('\n')}`)
  }
}
