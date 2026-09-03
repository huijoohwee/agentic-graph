#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  XR_V2_PINNED_DOCUMENT_BLOB,
  XR_V2_PINNED_DOCUMENT_BYTES,
  XR_V2_PINNED_DOCUMENT_REVISION,
  XR_V2_PINNED_DOCUMENT_SHA256,
} from './readiness-doc-contract.mjs'

export const XR_V2_PIN_CONSISTENCY_SCHEMA = 'agenticgraph-xr-v2-pin-consistency/v1'
export const XR_V2_PINNED_DOCUMENT_PATH =
  'docs/documents/agenticgraph-ar-vr-xr-prd-tad-adr.md'

const SURFACE_PATHS = Object.freeze({
  canvasAuthority: 'canvas/src/features/xr-v2/pinnedSourceAuthority.ts',
  cleanRoom: 'scripts/video-editor/clean-room-source-contract.mjs',
  conformance: 'canvas/src/features/xr-v2/pinnedContractConformance.ts',
  demo: 'docs/workspace-seeds/agenticgraph-ar-vr-xr-runtime-readiness-demo.md',
  evidence: 'docs/documents/agenticgraph-xr-v2-runtime-readiness.md',
  invocation: 'canvas/src/features/xr-v2/xrV2InvocationRegistry.ts',
  readme: 'docs/workspace-seeds/README.md',
  runtimeApi: 'docs/runtime-api.md',
  scriptAuthority: 'scripts/xr-v2/readiness-doc-contract.mjs',
  testing: 'docs/TESTING.md',
})

const DOCUMENTED_PIN_CLAIMS = Object.freeze([
  {
    path: SURFACE_PATHS.evidence,
    member: 'version',
    patterns: [
      /^version:\s*["']([0-9]+\.[0-9]+\.[0-9]+)["']/gmu,
      /\bThe v([0-9]+\.[0-9]+\.[0-9]+) authority adds\b/gu,
    ],
  },
  {
    path: SURFACE_PATHS.evidence,
    member: 'revision',
    patterns: [
      /^pinned_source_revision:\s*["']([0-9a-f]{40})["']/gmu,
      /\bcommit `([0-9a-f]{40})`/gu,
    ],
  },
  {
    path: SURFACE_PATHS.evidence,
    member: 'blob',
    patterns: [/^pinned_source_blob:\s*["']([0-9a-f]{40})["']/gmu],
  },
  {
    path: SURFACE_PATHS.evidence,
    member: 'bytes',
    patterns: [/\bexact\s+([0-9,]+)-byte\s+document\b/gu],
    transform: value => Number(value.replaceAll(',', '')),
  },
  {
    path: SURFACE_PATHS.evidence,
    member: 'sha256',
    patterns: [/^pinned_source_sha256:\s*["']([0-9a-f]{64})["']/gmu],
  },
  {
    path: SURFACE_PATHS.readme,
    member: 'version',
    patterns: [/\b[Ii]mmutable v([0-9]+\.[0-9]+\.[0-9]+) authority\b/gu],
  },
  {
    path: SURFACE_PATHS.readme,
    member: 'revision',
    patterns: [/\bauthority at commit `([0-9a-f]{40})`/gu],
  },
  {
    path: SURFACE_PATHS.readme,
    member: 'blob',
    patterns: [/\bblob `([0-9a-f]{40})`/gu],
  },
  {
    path: SURFACE_PATHS.readme,
    member: 'sha256',
    patterns: [/\bSHA-256 `([0-9a-f]{64})`/gu],
  },
  {
    path: SURFACE_PATHS.demo,
    member: 'version',
    patterns: [
      /^\s*version:\s*["']?([0-9]+\.[0-9]+\.[0-9]+)["']?/gmu,
      /\bv([0-9]+\.[0-9]+\.[0-9]+) AR\/VR\/XR authority\b/gu,
    ],
  },
  {
    path: SURFACE_PATHS.demo,
    member: 'revision',
    patterns: [
      /^\s*commit:\s*["']?([0-9a-f]{40})["']?/gmu,
      /\bsource identity is commit\s*\n`([0-9a-f]{40})`/gu,
    ],
  },
  {
    path: SURFACE_PATHS.demo,
    member: 'blob',
    patterns: [
      /^\s*git_blob_sha1:\s*["']?([0-9a-f]{40})["']?/gmu,
      /\bGit blob\s*\n`([0-9a-f]{40})`/gu,
    ],
  },
  {
    path: SURFACE_PATHS.demo,
    member: 'sha256',
    patterns: [
      /^\s*content_sha256:\s*["']?([0-9a-f]{64})["']?/gmu,
      /\bSHA-256\s*\n`([0-9a-f]{64})`/gu,
    ],
  },
  {
    path: SURFACE_PATHS.demo,
    member: 'immutableUrl',
    patterns: [/^\s*immutable_url:\s*["']?([^"'\s]+)["']?/gmu],
  },
  {
    path: SURFACE_PATHS.testing,
    member: 'version',
    patterns: [/\bXR v2 gates trace the v([0-9]+\.[0-9]+\.[0-9]+) authority\b/gu],
  },
  {
    path: SURFACE_PATHS.testing,
    member: 'revision',
    patterns: [/\bauthority pinned at\s*\n`([0-9a-f]{40})`/gu],
  },
  {
    path: SURFACE_PATHS.runtimeApi,
    member: 'version',
    patterns: [/\bXR v2 pinned conformance adapters \(v([0-9]+\.[0-9]+\.[0-9]+) authority\)/gu],
  },
  {
    path: SURFACE_PATHS.runtimeApi,
    member: 'revision',
    patterns: [/\brequirements authority at\s*\n`([0-9a-f]{40})`/gu],
  },
])

function readSource(repositoryRoot, relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

function readMatch(source, pattern, transform = value => value) {
  const match = source.match(pattern)
  return match ? transform(match[1]) : undefined
}

function analyzeJavaScriptSource(source) {
  const commentFree = source.split('')
  const codeOnly = source.split('')
  let state = 'code'

  const blank = (target, index) => {
    if (target[index] !== '\n' && target[index] !== '\r') target[index] = ' '
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]
    if (state === 'line-comment') {
      if (character === '\n' || character === '\r') state = 'code'
      else {
        blank(commentFree, index)
        blank(codeOnly, index)
      }
      continue
    }
    if (state === 'block-comment') {
      blank(commentFree, index)
      blank(codeOnly, index)
      if (character === '*' && nextCharacter === '/') {
        blank(commentFree, index + 1)
        blank(codeOnly, index + 1)
        index += 1
        state = 'code'
      }
      continue
    }
    if (state !== 'code') {
      blank(codeOnly, index)
      if (character === '\\') {
        blank(codeOnly, index + 1)
        index += 1
      } else if ((state === 'single-quote' && character === "'")
        || (state === 'double-quote' && character === '"')
        || (state === 'template' && character === '`')) {
        state = 'code'
      }
      continue
    }
    if (character === '/' && nextCharacter === '/') {
      blank(commentFree, index)
      blank(commentFree, index + 1)
      blank(codeOnly, index)
      blank(codeOnly, index + 1)
      index += 1
      state = 'line-comment'
    } else if (character === '/' && nextCharacter === '*') {
      blank(commentFree, index)
      blank(commentFree, index + 1)
      blank(codeOnly, index)
      blank(codeOnly, index + 1)
      index += 1
      state = 'block-comment'
    } else if (character === "'") {
      blank(codeOnly, index)
      state = 'single-quote'
    } else if (character === '"') {
      blank(codeOnly, index)
      state = 'double-quote'
    } else if (character === '`') {
      blank(codeOnly, index)
      state = 'template'
    }
  }

  return Object.freeze({
    commentFree: commentFree.join(''),
    codeOnly: codeOnly.join(''),
  })
}

function importsNamedBindings(analysis, moduleSpecifier, requiredBindings) {
  const importPattern = /\bimport\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2/gu
  for (const match of analysis.commentFree.matchAll(importPattern)) {
    if (analysis.codeOnly.slice(match.index, match.index + 6) !== 'import') continue
    if (match[3] !== moduleSpecifier) continue
    const bindings = new Set(match[1].split(',').flatMap(rawBinding => {
      const binding = rawBinding.trim().replace(/^type\s+/u, '')
      if (!binding) return []
      const [imported, local = imported] = binding.split(/\s+as\s+/u)
      return imported === local ? [imported] : []
    }))
    if (requiredBindings.every(binding => bindings.has(binding))) return true
  }
  return false
}

function hasExecutableLine(analysis, pattern) {
  return pattern.test(analysis.codeOnly)
}

function readUniqueExecutableMatch(analysis, pattern, transform = value => value) {
  const values = []
  for (const match of analysis.commentFree.matchAll(pattern)) {
    const executablePrefix = analysis.codeOnly.slice(
      match.index,
      match.index + match[0].length,
    )
    if (!/\bexport\s+const\b/u.test(executablePrefix)) continue
    values.push(transform(match[1]))
  }
  return values.length === 1 ? values[0] : undefined
}

function reading(path, kind, observed, required) {
  return Object.freeze({
    path,
    kind,
    observed: Object.freeze(observed),
    missing: Object.freeze(required.filter(member => observed[member] === undefined)),
  })
}

function readObjectIdentity(repositoryRoot, expression) {
  let output = readObjectIdentityLine(repositoryRoot, expression)
  if (isMissingObjectIdentity(output)) {
    fetchPinnedRevisionObject(repositoryRoot, expression)
    output = readObjectIdentityLine(repositoryRoot, expression)
  }
  const [objectName, objectType] = output.split(' ')
  if (!/^[0-9a-f]{40}$/u.test(objectName) || !objectType || objectType === 'missing') {
    throw new Error(`unable to resolve Git object ${expression}`)
  }
  return Object.freeze({ objectName, objectType })
}

function readObjectIdentityLine(repositoryRoot, expression) {
  return execFileSync(
    'git',
    ['-C', repositoryRoot, 'cat-file', '--batch-check=%(objectname) %(objecttype)'],
    { encoding: 'utf8', input: `${expression}\n` },
  ).trim()
}

function isMissingObjectIdentity(output) {
  const [objectName, objectType] = output.split(' ')
  return !/^[0-9a-f]{40}$/u.test(objectName) || !objectType || objectType === 'missing'
}

function fetchPinnedRevisionObject(repositoryRoot, expression) {
  const revision = expression.match(/^([0-9a-f]{40})(?::|$)/u)?.[1]
  if (!revision) return
  const attempts = [
    ['fetch', '--quiet', '--depth=1', 'origin', revision],
    ['fetch', '--quiet', '--deepen=10000', 'origin', 'main'],
  ]
  if (isShallowRepository(repositoryRoot)) {
    attempts.push(['fetch', '--quiet', '--unshallow', 'origin', 'main'])
  }
  for (const args of attempts) {
    try {
      execFileSync('git', ['-C', repositoryRoot, ...args], { stdio: 'ignore' })
      if (!isMissingObjectIdentity(readObjectIdentityLine(repositoryRoot, expression))) return
    } catch {
      // Try the next progressively broader fetch strategy.
    }
  }
}

function isShallowRepository(repositoryRoot) {
  try {
    return execFileSync(
      'git',
      ['-C', repositoryRoot, 'rev-parse', '--is-shallow-repository'],
      { encoding: 'utf8' },
    ).trim() === 'true'
  } catch {
    return false
  }
}

export function derivePinTriple(repositoryRoot, revision) {
  const commit = readObjectIdentity(repositoryRoot, revision)
  if (commit.objectType !== 'commit') throw new Error(`${revision} is not a commit`)
  const blob = readObjectIdentity(
    repositoryRoot,
    `${commit.objectName}:${XR_V2_PINNED_DOCUMENT_PATH}`,
  )
  if (blob.objectType !== 'blob') throw new Error(`${XR_V2_PINNED_DOCUMENT_PATH} is not a blob`)
  const bytes = execFileSync('git', ['-C', repositoryRoot, 'cat-file', 'blob', blob.objectName])
  const version = readMatch(bytes.toString('utf8'), /^version:\s*["']?([0-9]+\.[0-9]+\.[0-9]+)/mu)
  if (!version) throw new Error(`missing version in ${XR_V2_PINNED_DOCUMENT_PATH}`)
  return Object.freeze({
    revision: commit.objectName,
    blob: blob.objectName,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    version,
  })
}

function readExpected(repositoryRoot) {
  const derived = derivePinTriple(repositoryRoot, XR_V2_PINNED_DOCUMENT_REVISION)
  return Object.freeze({
    revision: XR_V2_PINNED_DOCUMENT_REVISION,
    blob: XR_V2_PINNED_DOCUMENT_BLOB,
    bytes: XR_V2_PINNED_DOCUMENT_BYTES,
    sha256: XR_V2_PINNED_DOCUMENT_SHA256,
    version: derived.version,
    immutableUrl:
      `https://github.com/huijoohwee/agentic-graph/blob/${XR_V2_PINNED_DOCUMENT_REVISION}/${XR_V2_PINNED_DOCUMENT_PATH}`,
  })
}

export function readPinSurfaces(repositoryRoot) {
  const expected = readExpected(repositoryRoot)
  const canvasAuthority = readSource(repositoryRoot, SURFACE_PATHS.canvasAuthority)
  const cleanRoom = readSource(repositoryRoot, SURFACE_PATHS.cleanRoom)
  const conformance = readSource(repositoryRoot, SURFACE_PATHS.conformance)
  const invocation = readSource(repositoryRoot, SURFACE_PATHS.invocation)
  const evidence = readSource(repositoryRoot, SURFACE_PATHS.evidence)
  const readme = readSource(repositoryRoot, SURFACE_PATHS.readme)
  const demo = readSource(repositoryRoot, SURFACE_PATHS.demo)
  const testing = readSource(repositoryRoot, SURFACE_PATHS.testing)
  const runtimeApi = readSource(repositoryRoot, SURFACE_PATHS.runtimeApi)
  const canvasAuthorityAnalysis = analyzeJavaScriptSource(canvasAuthority)
  const cleanRoomAnalysis = analyzeJavaScriptSource(cleanRoom)
  const conformanceAnalysis = analyzeJavaScriptSource(conformance)
  const invocationAnalysis = analyzeJavaScriptSource(invocation)
  const cleanRoomUsesOwner = importsNamedBindings(
    cleanRoomAnalysis,
    '../xr-v2/readiness-doc-contract.mjs',
    ['XR_V2_PINNED_DOCUMENT_BYTES', 'XR_V2_PINNED_DOCUMENT_SHA256'],
  )
    && hasExecutableLine(
      cleanRoomAnalysis,
      /^\s*&&\s*Buffer\.byteLength\([^\n]*\)\s*===\s*XR_V2_PINNED_DOCUMENT_BYTES\s*$/mu,
    )
    && hasExecutableLine(
      cleanRoomAnalysis,
      /^\s*&&\s*createHash\([^\n]*\)\s*===\s*XR_V2_PINNED_DOCUMENT_SHA256\s*$/mu,
    )
  const conformanceUsesOwner = importsNamedBindings(
    conformanceAnalysis,
    './pinnedSourceAuthority',
    ['XR_V2_PINNED_SOURCE_REVISION'],
  )
    && hasExecutableLine(
      conformanceAnalysis,
      /^\s*pinnedSourceRevision\s*:\s*XR_V2_PINNED_SOURCE_REVISION\s*,?\s*$/mu,
    )
    && hasExecutableLine(
      conformanceAnalysis,
      /^\s*\|\|\s*candidate\.pinnedSourceRevision\s*!==\s*XR_V2_PINNED_SOURCE_REVISION\s*$/mu,
    )
  const invocationUsesOwner = importsNamedBindings(
    invocationAnalysis,
    './pinnedSourceAuthority',
    ['XR_V2_PINNED_SOURCE_REVISION'],
  )
    && hasExecutableLine(
      invocationAnalysis,
      /^\s*export\s+const\s+XR_V2_PINNED_INVOCATION_SOURCE_REVISION\s*=\s*XR_V2_PINNED_SOURCE_REVISION\s*$/mu,
    )

  return Object.freeze([
    reading(SURFACE_PATHS.scriptAuthority, 'module-owner', {
      revision: XR_V2_PINNED_DOCUMENT_REVISION,
      blob: XR_V2_PINNED_DOCUMENT_BLOB,
      bytes: XR_V2_PINNED_DOCUMENT_BYTES,
      sha256: XR_V2_PINNED_DOCUMENT_SHA256,
    }, ['revision', 'blob', 'bytes', 'sha256']),
    reading(SURFACE_PATHS.canvasAuthority, 'module-owner', {
      revision: readUniqueExecutableMatch(
        canvasAuthorityAnalysis,
        /^\s*export\s+const\s+XR_V2_PINNED_SOURCE_REVISION\s*=\s*\n?\s*['"]([0-9a-f]{40})['"]\s+as\s+const\s*$/gmu,
      ),
      version: readUniqueExecutableMatch(
        canvasAuthorityAnalysis,
        /^\s*export\s+const\s+XR_V2_PINNED_SOURCE_VERSION\s*=\s*['"]([0-9]+\.[0-9]+\.[0-9]+)['"]\s+as\s+const\s*$/gmu,
      ),
    }, ['revision', 'version']),
    reading(SURFACE_PATHS.cleanRoom, 'module-consumer', cleanRoomUsesOwner ? {
      bytes: expected.bytes,
      sha256: expected.sha256,
    } : {}, ['bytes', 'sha256']),
    reading(SURFACE_PATHS.conformance, 'module-consumer', conformanceUsesOwner ? {
      revision: expected.revision,
    } : {}, ['revision']),
    reading(SURFACE_PATHS.invocation, 'module-consumer', invocationUsesOwner ? {
      revision: expected.revision,
    } : {}, ['revision']),
    reading(SURFACE_PATHS.evidence, 'documentation', {
      revision: readMatch(evidence, /pinned_source_revision:\s*['"]([0-9a-f]{40})['"]/u),
      blob: readMatch(evidence, /pinned_source_blob:\s*['"]([0-9a-f]{40})['"]/u),
      bytes: readMatch(evidence, /exact\s+([0-9,]+)-byte/u, value => Number(value.replaceAll(',', ''))),
      sha256: readMatch(evidence, /pinned_source_sha256:\s*['"]([0-9a-f]{64})['"]/u),
    }, ['revision', 'blob', 'bytes', 'sha256']),
    reading(SURFACE_PATHS.readme, 'documentation', {
      revision: readMatch(readme, /Immutable v[0-9.]+ authority at commit `([0-9a-f]{40})`/u),
      blob: readMatch(readme, /authority at commit `[0-9a-f]{40}`, blob `([0-9a-f]{40})`/u),
      sha256: readMatch(readme, /blob `[0-9a-f]{40}`, SHA-256 `([0-9a-f]{64})`/u),
      version: readMatch(readme, /Immutable v([0-9]+\.[0-9]+\.[0-9]+) authority/u),
    }, ['revision', 'blob', 'sha256', 'version']),
    reading(SURFACE_PATHS.demo, 'documentation', {
      revision: readMatch(demo, /^\s*commit:\s*['"]?([0-9a-f]{40})['"]?/mu),
      blob: readMatch(demo, /^\s*git_blob_sha1:\s*['"]?([0-9a-f]{40})['"]?/mu),
      sha256: readMatch(demo, /^\s*content_sha256:\s*['"]?([0-9a-f]{64})['"]?/mu),
      version: readMatch(demo, /^\s*version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+)['"]?/mu),
      immutableUrl: readMatch(demo, /^\s*immutable_url:\s*['"]?([^'"\s]+)['"]?/mu),
    }, ['revision', 'blob', 'sha256', 'version', 'immutableUrl']),
    reading(SURFACE_PATHS.testing, 'documentation', {
      revision: readMatch(testing, /authority pinned at\s*\n?`([0-9a-f]{40})`/u),
      version: readMatch(testing, /XR v[0-9]+ gates trace the v([0-9]+\.[0-9]+\.[0-9]+) authority/u),
    }, ['revision', 'version']),
    reading(SURFACE_PATHS.runtimeApi, 'documentation', {
      revision: readMatch(runtimeApi, /requirements authority at\s*\n?`([0-9a-f]{40})`/u),
      version: readMatch(runtimeApi, /pinned conformance adapters \(v([0-9]+\.[0-9]+\.[0-9]+) authority\)/u),
    }, ['revision', 'version']),
  ])
}

function compareSurface(expected, surface) {
  const disagreements = surface.missing.map(member => ({
    path: surface.path,
    member,
    expected: expected[member],
    observed: null,
  }))
  for (const [member, observed] of Object.entries(surface.observed)) {
    if (observed === undefined) continue
    if (observed !== expected[member]) {
      disagreements.push({ path: surface.path, member, expected: expected[member], observed })
    }
  }
  return disagreements
}

function documentedPinDisagreements(repositoryRoot, expected) {
  const sources = new Map()
  const disagreements = []
  for (const claim of DOCUMENTED_PIN_CLAIMS) {
    if (!sources.has(claim.path)) sources.set(claim.path, readSource(repositoryRoot, claim.path))
    const source = sources.get(claim.path)
    for (const pattern of claim.patterns) {
      for (const match of source.matchAll(new RegExp(pattern.source, pattern.flags))) {
        const observed = claim.transform ? claim.transform(match[1]) : match[1]
        if (observed !== expected[claim.member]) {
          disagreements.push({
            path: claim.path,
            member: claim.member,
            expected: expected[claim.member],
            observed,
          })
        }
      }
    }
  }
  return disagreements
}

export function checkPinConsistency(repositoryRoot) {
  const expected = readExpected(repositoryRoot)
  const surfaces = readPinSurfaces(repositoryRoot)
  const derived = derivePinTriple(repositoryRoot, expected.revision)
  const disagreements = surfaces.flatMap(surface => compareSurface(expected, surface))
  disagreements.push(...documentedPinDisagreements(repositoryRoot, expected))
  for (const member of ['revision', 'blob', 'bytes', 'sha256', 'version']) {
    if (derived[member] !== expected[member]) {
      disagreements.push({
        path: `${expected.revision}:${XR_V2_PINNED_DOCUMENT_PATH}`,
        member,
        expected: expected[member],
        observed: derived[member],
      })
    }
  }

  const workingBytes = readFileSync(resolve(repositoryRoot, XR_V2_PINNED_DOCUMENT_PATH))
  const workingTree = Object.freeze({
    bytes: workingBytes.byteLength,
    sha256: createHash('sha256').update(workingBytes).digest('hex'),
    matchesExpected:
      workingBytes.byteLength === expected.bytes
      && createHash('sha256').update(workingBytes).digest('hex') === expected.sha256,
  })
  const status = execFileSync(
    'git',
    ['-C', repositoryRoot, 'status', '--porcelain=v1', '--', XR_V2_PINNED_DOCUMENT_PATH],
    { encoding: 'utf8' },
  ).trim()
  const blocked = !workingTree.matchesExpected && status.length > 0
  if (!workingTree.matchesExpected) {
    disagreements.push({
      path: XR_V2_PINNED_DOCUMENT_PATH,
      member: 'bytes',
      expected: expected.bytes,
      observed: workingTree.bytes,
    }, {
      path: XR_V2_PINNED_DOCUMENT_PATH,
      member: 'sha256',
      expected: expected.sha256,
      observed: workingTree.sha256,
    })
  }
  const uniqueDisagreements = [...new Map(
    disagreements.map(disagreement => [JSON.stringify(disagreement), disagreement]),
  ).values()]
  return Object.freeze({
    schema: XR_V2_PIN_CONSISTENCY_SCHEMA,
    status: blocked ? 'blocked-uncommitted' : uniqueDisagreements.length > 0 ? 'disagreed' : 'agreed',
    expected,
    surfaces,
    workingTree,
    disagreements: Object.freeze(
      uniqueDisagreements.map(disagreement => Object.freeze(disagreement)),
    ),
  })
}

export function verifyXrV2PinConsistency(repositoryRoot) {
  const report = checkPinConsistency(repositoryRoot)
  if (report.status !== 'agreed') {
    throw new Error(`XR v2 pin consistency ${report.status}: ${JSON.stringify(report.disagreements)}`)
  }
  return report
}

const scriptPath = fileURLToPath(import.meta.url)
if (resolve(process.argv[1] || '') === scriptPath) {
  const repositoryRoot = resolve(dirname(scriptPath), '..', '..')
  const report = checkPinConsistency(repositoryRoot)
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else console.log(`XR v2 pin consistency: ${report.status}`)
  if (report.status !== 'agreed') process.exitCode = 1
}
