import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export const VIDEO_EDITOR_INDEPENDENCE_SCHEMA =
  'knowgrph-video-editor-independence-source-contract/v1'

export const OFFICIAL_REFERENCE_URL = 'https://github.com/opencut-app/opencut'
export const OFFICIAL_REFERENCE_STANZA =
  '[OpenCut](https://github.com/opencut-app/opencut) is an attribution-only product-workflow reference.'

export const ALLOWED_REFERENCE_DOCUMENTS = Object.freeze([
  'docs/documents/knowgrph-ar-vr-xr-prd-tad-adr.md',
])

const ALLOWED_REFERENCE_DOCUMENT_SET = new Set(ALLOWED_REFERENCE_DOCUMENTS)
const POLICY_IMPLEMENTATION_PATHS = new Set([
  'scripts/__tests__/video-editor-source-smoke.test.mjs',
  'scripts/video-editor/clean-room-source-contract.mjs',
])
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.turbo',
  '.vite',
  '.worktrees',
  'node_modules',
])
const DEPENDENCY_FILE_NAMES = new Set([
  '.npmrc',
  '.gitmodules',
  'Cartfile',
  'Cartfile.resolved',
  'Cargo.lock',
  'Cargo.toml',
  'Directory.Packages.props',
  'Gemfile',
  'Gemfile.lock',
  'Package.resolved',
  'Package.swift',
  'Pipfile',
  'Pipfile.lock',
  'Podfile',
  'Podfile.lock',
  'build.gradle',
  'build.gradle.kts',
  'bun.lock',
  'bun.lockb',
  'composer.json',
  'composer.lock',
  'deno.json',
  'deno.jsonc',
  'deno.lock',
  'flake.lock',
  'go.mod',
  'go.sum',
  'go.work',
  'go.work.sum',
  'gradle-wrapper.properties',
  'gradle.lockfile',
  'import-map.json',
  'jsr.json',
  'libs.versions.toml',
  'mix.exs',
  'mix.lock',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'package.json',
  'packages.lock.json',
  'pnpm-lock.yaml',
  'pom.xml',
  'poetry.lock',
  'pyproject.toml',
  'pubspec.lock',
  'pubspec.yaml',
  'rebar.config',
  'requirements.txt',
  'settings.gradle',
  'settings.gradle.kts',
  'setup.cfg',
  'setup.py',
  'uv.lock',
  'vcpkg.json',
  'yarn.lock',
])
const DEPENDENCY_FILE_SUFFIXES = Object.freeze([
  '.csproj',
  '.fsproj',
  '.gradle',
  '.gradle.kts',
  '.vbproj',
])
const DOCUMENT_EXTENSIONS = new Set(['.adoc', '.md', '.mdx', '.rst'])
const SCRIPT_EXTENSIONS = new Set([
  '.astro',
  '.cjs',
  '.cts',
  '.html',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
])
const TEXT_SOURCE_EXTENSIONS = new Set([
  ...SCRIPT_EXTENSIONS,
  '.bash',
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.conf',
  '.css',
  '.csv',
  '.dart',
  '.env',
  '.fs',
  '.fsx',
  '.frag',
  '.glsl',
  '.go',
  '.graphql',
  '.h',
  '.hpp',
  '.ini',
  '.java',
  '.json',
  '.jsonc',
  '.kt',
  '.kts',
  '.lua',
  '.m',
  '.mm',
  '.php',
  '.proto',
  '.properties',
  '.ps1',
  '.py',
  '.r',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sol',
  '.sql',
  '.svg',
  '.swift',
  '.toml',
  '.txt',
  '.vert',
  '.wgsl',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
])
const TEXT_SOURCE_FILE_NAMES = new Set([
  'Dockerfile',
  'Makefile',
  'Procfile',
])

export class VideoEditorSourceContractError extends Error {
  constructor(report) {
    const summary = report.violations
      .map(violation => `${violation.code}:${violation.path}`)
      .join(', ')
    super(`video editor clean-room source contract failed: ${summary}`)
    this.name = 'VideoEditorSourceContractError'
    this.report = report
  }
}

export function normalizeRepositoryPath(candidatePath) {
  const rawPath = String(candidatePath ?? '').replaceAll('\\', '/')
  if (rawPath.length === 0) return ''
  if (path.posix.isAbsolute(rawPath) || /^[A-Za-z]:\//u.test(rawPath)) {
    throw new Error(`repository path must be relative: ${candidatePath}`)
  }
  const normalizedPath = path.posix.normalize(rawPath).replace(/^\.\//u, '')
  if (normalizedPath === '..' || normalizedPath.startsWith('../')) {
    throw new Error(`repository path escapes its root: ${candidatePath}`)
  }
  return normalizedPath === '.' ? '' : normalizedPath
}

function decodeBasicTextEscapes(value) {
  return String(value ?? '')
    .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (match, digits) => {
      const codePoint = Number.parseInt(digits, 16)
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match
    })
    .replace(/\\u([0-9a-f]{4})/giu, (_match, digits) => (
      String.fromCodePoint(Number.parseInt(digits, 16))
    ))
    .replace(/\\x([0-9a-f]{2})/giu, (_match, digits) => (
      String.fromCodePoint(Number.parseInt(digits, 16))
    ))
    .replace(/\\\//gu, '/')
}

function hasOpenCutReference(value) {
  return /(?:opencut|open-cut|opencut-app|opencut\.app)/iu.test(decodeBasicTextEscapes(value))
}

function extractReferenceUrls(source) {
  const urls = decodeBasicTextEscapes(source).match(/https?:\/\/[^\s<>"'`)\]}]+/giu) ?? []
  return [...new Set(urls.map(url => url.replace(/[.,;:]+$/u, '')))].sort()
}

function normalizeReferenceUrl(url) {
  return String(url).toLowerCase().replace(/\/$/u, '')
}

function hasNoncanonicalReferenceEndpoint(source) {
  const withoutOfficialUrl = decodeBasicTextEscapes(source).replace(
    /https:\/\/github\.com\/opencut-app\/opencut\/?/giu,
    '',
  )
  return /(?:opencut\.app|github\.com[/:]opencut-app[/:]opencut)/iu.test(withoutOfficialUrl)
}

function findTheatreDependencyReferences(source) {
  const references = decodeBasicTextEscapes(source).match(
    /@theatre(?:\/[a-z0-9._-]+)?|["']theatre(?:\.js|js)?["']|\btheatre(?:\.js|js)?@/giu,
  ) ?? []
  return [...new Set(references.map(reference => reference.toLowerCase()))].sort()
}

function decodeModuleSpecifier(value) {
  return decodeBasicTextEscapes(value)
    .replace(/\\x2f/giu, '/')
    .replace(/\\u002f/giu, '/')
}

function isTheatreModuleSpecifier(value) {
  const specifier = decodeModuleSpecifier(value).toLowerCase()
  return specifier === '@theatre'
    || specifier.startsWith('@theatre/')
    || specifier === 'theatre'
    || specifier === 'theatre.js'
    || specifier === 'theatrejs'
    || specifier.startsWith('theatre/')
    || /(?:^|[/:])@theatre(?:[/:@]|$)/u.test(specifier)
    || /(?:^|[/:@])theatre(?:\.js|js)?(?:[/:@]|$)/u.test(specifier)
}

function tokenizeJavaScript(source) {
  const tokens = []
  let cursor = 0
  while (cursor < source.length) {
    const character = source[cursor]
    const nextCharacter = source[cursor + 1]
    if (/\s/u.test(character)) {
      cursor += 1
      continue
    }
    if (character === '/' && nextCharacter === '/') {
      cursor = source.indexOf('\n', cursor + 2)
      if (cursor === -1) break
      continue
    }
    if (character === '/' && nextCharacter === '*') {
      const end = source.indexOf('*/', cursor + 2)
      cursor = end === -1 ? source.length : end + 2
      continue
    }
    if (character === '`') {
      let dynamic = false
      let value = ''
      cursor += 1
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          value += source.slice(cursor, cursor + 2)
          cursor += 2
        } else if (source[cursor] === '$' && source[cursor + 1] === '{') {
          dynamic = true
          cursor += 2
        } else if (source[cursor] === '`') {
          cursor += 1
          break
        } else {
          value += source[cursor]
          cursor += 1
        }
      }
      if (!dynamic) tokens.push(Object.freeze({ type: 'string', value }))
      continue
    }
    if (character === "'" || character === '"') {
      const quote = character
      let value = ''
      cursor += 1
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          value += source.slice(cursor, cursor + 2)
          cursor += 2
        } else if (source[cursor] === quote) {
          cursor += 1
          break
        } else {
          value += source[cursor]
          cursor += 1
        }
      }
      tokens.push(Object.freeze({ type: 'string', value }))
      continue
    }
    if (/[A-Za-z_$]/u.test(character)) {
      let end = cursor + 1
      while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end])) end += 1
      tokens.push(Object.freeze({ type: 'identifier', value: source.slice(cursor, end) }))
      cursor = end
      continue
    }
    tokens.push(Object.freeze({ type: 'punctuator', value: character }))
    cursor += 1
  }
  return tokens
}

function findStaticModuleLoads(source) {
  const tokens = tokenizeJavaScript(String(source ?? ''))
  const specifiers = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== 'identifier') continue
    if ((token.value === 'fetch'
      || token.value === 'import'
      || token.value === 'importScripts'
      || token.value === 'require')
      && tokens[index + 1]?.value === '('
      && tokens[index + 2]?.type === 'string') {
      specifiers.push(tokens[index + 2].value)
    } else if (token.value === 'import' && tokens[index + 1]?.type === 'string') {
      specifiers.push(tokens[index + 1].value)
    } else if (token.value === 'from' && tokens[index + 1]?.type === 'string') {
      specifiers.push(tokens[index + 1].value)
    }
  }
  return Object.freeze([...new Set(specifiers)].sort())
}

function findHtmlScriptSources(source) {
  const specifiers = []
  const scriptSourcePattern = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu
  for (const match of String(source ?? '').matchAll(scriptSourcePattern)) {
    const specifier = match[1] ?? match[2] ?? match[3]
    if (specifier) specifiers.push(specifier)
  }
  return Object.freeze([...new Set(specifiers)].sort())
}

export function findTheatreModuleImports(source) {
  return Object.freeze(findStaticModuleLoads(source).filter(isTheatreModuleSpecifier))
}

function isDependencyFile(relPath) {
  const baseName = path.posix.basename(relPath)
  return DEPENDENCY_FILE_NAMES.has(baseName)
    || baseName.endsWith('.lock')
    || DEPENDENCY_FILE_SUFFIXES.some(suffix => baseName.endsWith(suffix))
    || /^requirements(?:[-.][a-z0-9_-]+)?\.txt$/iu.test(baseName)
}

function isDocumentFile(relPath) {
  return DOCUMENT_EXTENSIONS.has(path.posix.extname(relPath).toLowerCase())
}

function isTextSourceFile(relPath) {
  return isDependencyFile(relPath)
    || TEXT_SOURCE_FILE_NAMES.has(path.posix.basename(relPath))
    || TEXT_SOURCE_EXTENSIONS.has(path.posix.extname(relPath).toLowerCase())
}

async function discoverRepositoryFiles(repositoryRoot) {
  const root = path.resolve(repositoryRoot)
  if (!(await stat(root)).isDirectory()) throw new Error(`repository root is not a directory: ${root}`)
  const files = []
  const symlinks = []
  async function visit(absDirectory, relDirectory = '') {
    const entries = await readdir(absDirectory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const relPath = normalizeRepositoryPath(
        relDirectory ? `${relDirectory}/${entry.name}` : entry.name,
      )
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue
      if (entry.isDirectory()) {
        await visit(path.join(absDirectory, entry.name), relPath)
      } else if (entry.isSymbolicLink()) {
        symlinks.push(relPath)
      } else if (entry.isFile()) {
        files.push(relPath)
      }
    }
  }
  await visit(root)
  return Object.freeze({
    files: Object.freeze(files),
    symlinks: Object.freeze(symlinks),
  })
}

function createViolation(code, relPath, detail) {
  return Object.freeze({ code, detail, path: relPath })
}

function createReport({ files, inspected, symlinks, violations }) {
  return Object.freeze({
    schema: VIDEO_EDITOR_INDEPENDENCE_SCHEMA,
    status: violations.length === 0 ? 'pass' : 'fail',
    policy: Object.freeze({
      approvedReferenceDocuments: ALLOWED_REFERENCE_DOCUMENTS,
      binaryContentInspection: 'path-only; provenance requires independent review',
      copiedSource: 'forbidden',
      externalNetworkAccess: 'forbidden',
      externalRuntimeDependency: 'forbidden',
      officialReferenceUrl: OFFICIAL_REFERENCE_URL,
      replacedRuntime: 'in-repository-video-editor',
    }),
    inspected: Object.freeze({
      binaryPaths: inspected.binaryPaths,
      dependencyFiles: inspected.dependencyFiles,
      documentationFiles: inspected.documentationFiles,
      repositoryFiles: files.length + symlinks.length,
      sourceFiles: inspected.sourceFiles,
      symlinks: symlinks.length,
    }),
    violations: Object.freeze(violations),
  })
}

export async function inspectVideoEditorIndependenceSourceContract(repositoryRoot) {
  const root = path.resolve(repositoryRoot)
  const { files, symlinks } = await discoverRepositoryFiles(root)
  const inspected = { binaryPaths: 0, dependencyFiles: 0, documentationFiles: 0, sourceFiles: 0 }
  const violations = []

  for (const relPath of symlinks) {
    violations.push(createViolation(
      'repository-symlink-forbidden',
      relPath,
      'non-cache symlinks are forbidden and are never followed by the clean-room scanner',
    ))
    if (hasOpenCutReference(relPath)) {
      violations.push(createViolation(
        'opencut-identifier-in-path',
        relPath,
        'external reference identifiers are forbidden outside the exact attribution stanza',
      ))
    }
  }

  const fileSet = new Set(files)
  for (const relPath of ALLOWED_REFERENCE_DOCUMENTS) {
    if (!fileSet.has(relPath)) {
      violations.push(createViolation(
        'opencut-attribution-document-missing',
        relPath,
        'the approved attribution document and exact stanza are required',
      ))
    }
  }

  for (const relPath of files) {
    const policyImplementationFile = POLICY_IMPLEMENTATION_PATHS.has(relPath)
    const documentFile = isDocumentFile(relPath)
    const dependencyFile = isDependencyFile(relPath)
    const textSourceFile = isTextSourceFile(relPath)

    if (hasOpenCutReference(relPath)) {
      violations.push(createViolation(
        'opencut-identifier-in-path',
        relPath,
        'external reference identifiers are forbidden outside the exact attribution stanza',
      ))
    }
    if (!documentFile && !textSourceFile) {
      inspected.binaryPaths += 1
      continue
    }

    const source = await readFile(path.join(root, relPath), 'utf8')
    if (documentFile) {
      inspected.documentationFiles += 1
      const approvedReferenceDocument = ALLOWED_REFERENCE_DOCUMENT_SET.has(relPath)
      if (!approvedReferenceDocument) {
        if (!hasOpenCutReference(source)) continue
        violations.push(createViolation(
          'opencut-document-reference-outside-allowlist',
          relPath,
          'the design reference is permitted only as the approved exact attribution stanza',
        ))
        continue
      }

      const lines = source.split(/\r?\n/u)
      const stanzaCount = lines.filter(line => line === OFFICIAL_REFERENCE_STANZA).length
      if (stanzaCount !== 1) {
        violations.push(createViolation(
          'opencut-attribution-stanza-mismatch',
          relPath,
          'approved documentation must contain the exact attribution stanza once',
        ))
      }
      const outsideStanza = lines.filter(line => line !== OFFICIAL_REFERENCE_STANZA).join('\n')
      if (hasOpenCutReference(outsideStanza)) {
        violations.push(createViolation(
          'opencut-reference-outside-attribution-stanza',
          relPath,
          'no other external identifier, URL, prose, or copied material is permitted',
        ))
      }
      const referenceUrls = extractReferenceUrls(source).filter(hasOpenCutReference)
      if (referenceUrls.length !== 1
        || normalizeReferenceUrl(referenceUrls[0]) !== OFFICIAL_REFERENCE_URL) {
        violations.push(createViolation(
          'opencut-noncanonical-reference-url',
          relPath,
          `approved documentation must contain exactly one ${OFFICIAL_REFERENCE_URL}`,
        ))
      }
      if (hasNoncanonicalReferenceEndpoint(source)) {
        violations.push(createViolation(
          'opencut-noncanonical-reference-endpoint',
          relPath,
          `approved documentation must use ${OFFICIAL_REFERENCE_URL}`,
        ))
      }
      continue
    }

    inspected.sourceFiles += 1
    if (!policyImplementationFile && hasOpenCutReference(source)) {
      violations.push(createViolation(
        dependencyFile ? 'opencut-dependency-reference' : 'opencut-source-reference',
        relPath,
        'external identifiers, URLs, domains, copied markers, and runtime references are forbidden',
      ))
    }
    if (dependencyFile) {
      inspected.dependencyFiles += 1
      const references = findTheatreDependencyReferences(source)
      if (references.length > 0) {
        violations.push(createViolation(
          'theatre-dependency-reference',
          relPath,
          `forbidden dependency reference: ${references.join(', ')}`,
        ))
      }
    }
    if (SCRIPT_EXTENSIONS.has(path.posix.extname(relPath).toLowerCase())) {
      const externalLoads = findStaticModuleLoads(source).filter(hasOpenCutReference)
      if (externalLoads.length > 0) {
        violations.push(createViolation(
          'opencut-runtime-reference',
          relPath,
          `forbidden import, require, or fetch runtime specifier: ${externalLoads.join(', ')}`,
        ))
      }
      const imports = [...new Set([
        ...findTheatreModuleImports(source),
        ...findHtmlScriptSources(source).filter(isTheatreModuleSpecifier),
      ])].sort()
      if (imports.length > 0) {
        violations.push(createViolation(
          'theatre-runtime-import',
          relPath,
          `forbidden import, require, or fetch runtime specifier: ${imports.join(', ')}`,
        ))
      }
    }
  }

  violations.sort((left, right) => (
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  ))
  return createReport({ files, inspected, symlinks, violations })
}

export async function verifyVideoEditorIndependenceSourceContract(repositoryRoot) {
  const report = await inspectVideoEditorIndependenceSourceContract(repositoryRoot)
  if (report.status !== 'pass') throw new VideoEditorSourceContractError(report)
  return report
}
