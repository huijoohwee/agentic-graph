import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const FLIGHT_SIM_ASSET_TEXT_BYTE_LIMIT = 1_000_000
export const FLIGHT_SIM_ASSET_SPEC_PATHS = Object.freeze([
  'canvas/src/features/game-flight-sim/assetSpec/flightSimAssetSpec.ts',
  'canvas/src/features/game-flight-sim/assetSpec/vehicle-airplane.scene.json',
])
export const FLIGHT_SIM_OPTIONAL_GLB_PATH =
  'canvas/src/features/game-flight-sim/assetSpec/fallbacks/optional-beacon.glb'
export const FLIGHT_SIM_OPTIONAL_GLB_SOURCE_PATH =
  'canvas/src/features/game-flight-sim/assetSpec/fallbacks/optionalBeaconGlb.generated.ts'
export const FLIGHT_SIM_OPTIONAL_GLB_GENERATOR_PATH =
  'scripts/generate-game-flight-sim-optional-prop-glb.mjs'
const FLIGHT_SIM_FEATURE_ROOT = 'canvas/src/features/game-flight-sim'

const EXPECTED_EXTERNAL_RUNTIME_LICENSES = Object.freeze({
  '@babel/runtime': 'MIT',
  '@react-three/fiber': 'MIT',
  '@types/prop-types': 'MIT',
  '@types/react': 'MIT',
  '@types/react-reconciler': 'MIT',
  '@types/webxr': 'MIT',
  'base64-js': 'MIT',
  buffer: 'MIT',
  csstype: 'MIT',
  ieee754: 'BSD-3-Clause',
  'its-fine': 'MIT',
  'js-tokens': 'MIT',
  'loose-envify': 'MIT',
  'lucide-react': 'ISC',
  react: 'MIT',
  'react-reconciler': 'MIT',
  'react-use-measure': 'MIT',
  scheduler: 'MIT',
  'suspend-react': 'MIT',
  three: 'MIT',
  zustand: 'MIT',
})
const EXPECTED_DIRECT_EXTERNAL_IMPORTS = Object.freeze([
  '@react-three/fiber',
  'lucide-react',
  'react',
  'three',
])
const REPOSITORY_IMPORT_PREFIXES = Object.freeze(['./', '../', '@/'])
const EXPLICIT_DATA_PACKAGE_LICENSES = Object.freeze({
  'caniuse-lite': 'CC-BY-4.0',
})

function isUnderRoot(absolutePath, absoluteRoot) {
  const relativePath = path.relative(absoluteRoot, absolutePath)
  return relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
}

async function readOwnedFile(repositoryRoot, relativePath) {
  const absoluteRoot = await realpath(repositoryRoot)
  const absolutePath = path.resolve(repositoryRoot, relativePath)
  if (!isUnderRoot(absolutePath, absoluteRoot)) {
    throw new Error(`${relativePath} resolves outside the repository`)
  }
  const metadata = await lstat(absolutePath)
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${relativePath} must be a regular non-symlink file`)
  }
  const canonicalPath = await realpath(absolutePath)
  if (!isUnderRoot(canonicalPath, absoluteRoot)) {
    throw new Error(`${relativePath} resolves outside the repository`)
  }
  return readFile(canonicalPath)
}

function decodeStrictUtf8(bytes, relativePath) {
  let source
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${relativePath} must contain valid UTF-8`)
  }
  if (source.includes('\uFFFD')) {
    throw new Error(`${relativePath} must not contain replacement characters`)
  }
  return source
}

export async function assertTrackedFlightSimAsset(repositoryRoot, relativePath) {
  try {
    await execFileAsync(
      'git',
      ['ls-files', '--error-unmatch', '--', relativePath],
      { cwd: repositoryRoot },
    )
  } catch {
    throw new Error(`${relativePath} must be git-tracked`)
  }
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

function collectModuleSpecifiers(source) {
  const specifiers = []
  const pattern =
    /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) specifiers.push(match[1])
  return specifiers
}

function classifyImports(sources, workspaceNames) {
  const external = new Set()
  const repository = new Set()
  const workspace = new Set()
  for (const source of sources) {
    for (const specifier of collectModuleSpecifiers(source)) {
      if (REPOSITORY_IMPORT_PREFIXES.some(prefix => specifier.startsWith(prefix))) {
        repository.add(specifier)
        continue
      }
      const packageName = packageNameFromSpecifier(specifier)
      if (workspaceNames.has(packageName)) workspace.add(packageName)
      else external.add(packageName)
    }
  }
  return {
    external: [...external].sort(),
    repository: [...repository].sort(),
    workspace: [...workspace].sort(),
  }
}

function resolveLockPackageKey(packages, packageName) {
  const rootKey = `node_modules/${packageName}`
  if (packages[rootKey]) return rootKey
  const suffix = `/node_modules/${packageName}`
  const matches = Object.keys(packages).filter(key => key.endsWith(suffix))
  if (matches.length === 1) return matches[0]
  throw new Error(`package-lock cannot resolve exactly one ${packageName} package`)
}

function packageDependencies(packageEntry) {
  return [
    ...Object.keys(packageEntry.dependencies || {}),
    ...Object.keys(packageEntry.optionalDependencies || {}),
  ]
}

function runtimeDependencyClosure(packages, directDependencies) {
  const closure = new Map()
  const pending = [...directDependencies]
  while (pending.length > 0) {
    const packageName = pending.pop()
    if (closure.has(packageName)) continue
    const packageKey = resolveLockPackageKey(packages, packageName)
    const packageEntry = packages[packageKey]
    closure.set(packageName, { packageEntry, packageKey })
    pending.push(...packageDependencies(packageEntry))
  }
  return closure
}

function assertExactValues(actual, expected, label) {
  const actualSorted = [...actual].sort()
  const expectedSorted = [...expected].sort()
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label} changed: expected ${expectedSorted.join(', ')}, received ${actualSorted.join(', ')}`,
    )
  }
}

function assertGlb2(bytes, relativePath) {
  if (
    bytes.byteLength < 20
    || bytes.readUInt32LE(0) !== 0x46546c67
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) {
    throw new Error(`${relativePath} must be an exact GLB 2.0 container`)
  }
  const jsonLength = bytes.readUInt32LE(12)
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > bytes.byteLength) {
    throw new Error(`${relativePath} must begin with a valid GLB JSON chunk`)
  }
  let document
  try {
    document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd())
  } catch {
    throw new Error(`${relativePath} must contain valid GLB JSON`)
  }
  if (document?.asset?.version !== '2.0') {
    throw new Error(`${relativePath} must declare glTF asset version 2.0`)
  }
  const serialized = JSON.stringify(document)
  if (/"uri"\s*:/.test(serialized)) {
    throw new Error(`${relativePath} must be self-contained without external resources`)
  }
  return document
}

function requireMarkers(source, markers, label) {
  const missing = markers.filter(marker => !source.includes(marker))
  if (missing.length > 0) {
    throw new Error(`${label} is missing required markers: ${missing.join(', ')}`)
  }
}

async function listFiles(repositoryRoot, relativeDirectory) {
  const entries = await readdir(path.join(repositoryRoot, relativeDirectory), {
    withFileTypes: true,
  })
  const nested = await Promise.all(entries.map(async entry => {
    const relativePath = path.posix.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) return listFiles(repositoryRoot, relativePath)
    return entry.isFile() ? [relativePath] : []
  }))
  return nested.flat().sort()
}

async function assertAssetSourceContract(repositoryRoot) {
  const assetSpec = JSON.parse(
    await readFile(
      path.join(repositoryRoot, FLIGHT_SIM_ASSET_SPEC_PATHS[1]),
      'utf8',
    ),
  )
  if (
    assetSpec.schema !== 'knowgrph.img2threejs-scene/v1'
    || assetSpec.id !== 'vehicle-airplane'
    || assetSpec.representation !== 'typescript-json'
    || assetSpec.renderer !== 'xr-procedural-vehicle'
    || assetSpec.opaqueBinaryFallback !== null
    || assetSpec.runtimeModelCalls !== 0
    || assetSpec.runtimeNetworkCalls !== 0
  ) {
    throw new Error('Flight Sim aircraft must retain its TypeScript+JSON Asset_Spec primary')
  }
  const [assetSpecLoader, fallbackLoader, featurePaths] = await Promise.all([
    readFile(path.join(repositoryRoot, FLIGHT_SIM_ASSET_SPEC_PATHS[0]), 'utf8'),
    readFile(
      path.join(repositoryRoot, `${FLIGHT_SIM_FEATURE_ROOT}/assetSpec/flightSimAssetLoader.ts`),
      'utf8',
    ),
    listFiles(repositoryRoot, FLIGHT_SIM_FEATURE_ROOT),
  ])
  requireMarkers(assetSpecLoader, [
    "source.representation !== 'typescript-json'",
    'source.opaqueBinaryFallback !== null',
    'source.runtimeModelCalls !== 0 || source.runtimeNetworkCalls !== 0',
    'export const FLIGHT_SIM_REQUIRED_AIRCRAFT_GLB_FALLBACK_COUNT = 0',
  ], 'Flight Sim aircraft Asset_Spec loader')
  requireMarkers(fallbackLoader, [
    'FLIGHT_SIM_OPTIONAL_BEACON_GLB_FALLBACK',
    "source: 'committed-local-file'",
    "FLIGHT_SIM_OPTIONAL_GLB_LICENSE = 'CC0-1.0'",
    'expectedSubjectId !== FLIGHT_SIM_OPTIONAL_BEACON_SUBJECT_ID',
    'sourcePath !== FLIGHT_SIM_OPTIONAL_BEACON_GLB_SOURCE_PATH',
    'license: FLIGHT_SIM_OPTIONAL_GLB_LICENSE',
    "'remote-glb-fallback'",
    "Object.hasOwn(candidate, 'assetSpec')",
    'sha256 !== FLIGHT_SIM_OPTIONAL_BEACON_GLB_SHA256',
    'ownedBytes.some((byte, index) => byte !== admittedBytes[index])',
    'inspectGlbBytes(ownedBytes)',
    'glbFallbackCount',
    'requiredAircraftGlbFallbackCount: 0',
  ], 'Flight Sim fail-closed fallback loader')
  const glbFiles = featurePaths.filter(relativePath => /\.glb$/i.test(relativePath))
  if (JSON.stringify(glbFiles) !== JSON.stringify([FLIGHT_SIM_OPTIONAL_GLB_PATH])) {
    throw new Error(
      `Flight Sim must ship exactly its admitted optional-prop GLB: ${glbFiles.join(', ')}`,
    )
  }
}

async function assertAssetSources(repositoryRoot) {
  const sources = []
  let combinedByteLength = 0
  for (const relativePath of FLIGHT_SIM_ASSET_SPEC_PATHS) {
    const bytes = await readOwnedFile(repositoryRoot, relativePath)
    combinedByteLength += bytes.byteLength
    if (bytes.byteLength > FLIGHT_SIM_ASSET_TEXT_BYTE_LIMIT) {
      throw new Error(`${relativePath} exceeds the ${FLIGHT_SIM_ASSET_TEXT_BYTE_LIMIT}-byte limit`)
    }
    sources.push(decodeStrictUtf8(bytes, relativePath))
    await assertTrackedFlightSimAsset(repositoryRoot, relativePath)
  }
  if (combinedByteLength > FLIGHT_SIM_ASSET_TEXT_BYTE_LIMIT) {
    throw new Error(
      `Flight Sim Asset_Spec pair exceeds the ${FLIGHT_SIM_ASSET_TEXT_BYTE_LIMIT}-byte limit`,
    )
  }
  return sources
}

async function assertGeneratedFallback(repositoryRoot) {
  const trackedPaths = [
    FLIGHT_SIM_OPTIONAL_GLB_PATH,
    FLIGHT_SIM_OPTIONAL_GLB_SOURCE_PATH,
    FLIGHT_SIM_OPTIONAL_GLB_GENERATOR_PATH,
  ]
  const [glbBytes, generatedBytes] = await Promise.all([
    readOwnedFile(repositoryRoot, FLIGHT_SIM_OPTIONAL_GLB_PATH),
    readOwnedFile(repositoryRoot, FLIGHT_SIM_OPTIONAL_GLB_SOURCE_PATH),
  ])
  const generatedSource = decodeStrictUtf8(
    generatedBytes,
    FLIGHT_SIM_OPTIONAL_GLB_SOURCE_PATH,
  )
  const glbDocument = assertGlb2(glbBytes, FLIGHT_SIM_OPTIONAL_GLB_PATH)
  if (
    glbDocument.asset.copyright !== 'Knowgrph contributors; CC0-1.0'
    || glbDocument.asset.generator !== 'knowgrph-offline-flight-sim-fallback/v1'
    || !generatedSource.includes('Source-authored offline geometry; CC0-1.0.')
  ) {
    throw new Error('Flight Sim optional GLB must retain its source-authored CC0-1.0 license')
  }
  const sha256 = createHash('sha256').update(glbBytes).digest('hex')
  const declaredSha = generatedSource.match(
    /FLIGHT_SIM_OPTIONAL_BEACON_GLB_SHA256 = '([0-9a-f]{64})'/,
  )?.[1]
  const declaredHex = generatedSource.match(
    /FLIGHT_SIM_OPTIONAL_BEACON_GLB_HEX = '([0-9a-f]+)'/,
  )?.[1]
  if (
    declaredSha !== sha256
    || !declaredHex
    || !Buffer.from(declaredHex, 'hex').equals(glbBytes)
    || !generatedSource.includes(`'${FLIGHT_SIM_OPTIONAL_GLB_PATH}' as const`)
  ) {
    throw new Error('Flight Sim optional GLB and generated source must match exactly')
  }
  await Promise.all(
    trackedPaths.map(relativePath => assertTrackedFlightSimAsset(repositoryRoot, relativePath)),
  )
  await execFileAsync(
    process.execPath,
    [FLIGHT_SIM_OPTIONAL_GLB_GENERATOR_PATH, '--check'],
    { cwd: repositoryRoot },
  )
  return { byteLength: glbBytes.byteLength, sha256 }
}

async function readFlightFeatureSources(repositoryRoot) {
  const featureRoot = path.join(
    repositoryRoot,
    'canvas/src/features/game-flight-sim',
  )
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const values = await Promise.all(entries.map(async entry => {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) return walk(absolutePath)
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) return []
      return [decodeStrictUtf8(await readFile(absolutePath), path.relative(repositoryRoot, absolutePath))]
    }))
    return values.flat()
  }
  return walk(featureRoot)
}

export async function assertDependencyClosure(repositoryRoot) {
  const [rootPackage, packageLock, sources] = await Promise.all([
    readFile(path.join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8').then(JSON.parse),
    readFlightFeatureSources(repositoryRoot),
  ])
  const workspaceNames = new Set()
  for (const workspacePath of rootPackage.workspaces || []) {
    const workspacePackage = JSON.parse(
      await readFile(path.join(repositoryRoot, workspacePath, 'package.json'), 'utf8'),
    )
    workspaceNames.add(workspacePackage.name)
  }
  const imports = classifyImports(sources, workspaceNames)
  assertExactValues(
    imports.external,
    EXPECTED_DIRECT_EXTERNAL_IMPORTS,
    'Flight Sim direct external dependency set',
  )
  assertExactValues(imports.workspace, [], 'Flight Sim workspace package import set')
  const packages = packageLock.packages || {}
  const closure = runtimeDependencyClosure(packages, imports.external)
  assertExactValues(
    closure.keys(),
    Object.keys(EXPECTED_EXTERNAL_RUNTIME_LICENSES),
    'Flight Sim external runtime dependency closure',
  )
  for (const [packageName, expectedLicense] of Object.entries(
    EXPECTED_EXTERNAL_RUNTIME_LICENSES,
  )) {
    const actualLicense = closure.get(packageName)?.packageEntry?.license
    if (actualLicense !== expectedLicense) {
      throw new Error(
        `Flight Sim dependency ${packageName} license changed: expected ${expectedLicense}, received ${actualLicense || 'missing'}`,
      )
    }
  }
  for (const [packageName, expectedLicense] of Object.entries(
    EXPLICIT_DATA_PACKAGE_LICENSES,
  )) {
    const packageKey = resolveLockPackageKey(packages, packageName)
    const actualLicense = packages[packageKey].license
    if (actualLicense !== expectedLicense || closure.has(packageName)) {
      throw new Error(
        `${packageName} must remain an unrelated ${expectedLicense} data package outside the Flight Sim closure`,
      )
    }
  }
  return {
    directExternalCount: imports.external.length,
    externalClosureCount: closure.size,
    repositoryImportCount: imports.repository.length,
    workspaceImportCount: imports.workspace.length,
    excludedDataPackageCount: Object.keys(EXPLICIT_DATA_PACKAGE_LICENSES).length,
  }
}

export async function assertFlightSimAssetReadiness({ repositoryRoot }) {
  await Promise.all([
    assertAssetSourceContract(repositoryRoot),
    assertAssetSources(repositoryRoot),
  ])
  const [fallback, dependencies] = await Promise.all([
    assertGeneratedFallback(repositoryRoot),
    assertDependencyClosure(repositoryRoot),
  ])
  return Object.freeze({ fallback, dependencies })
}
