import { createHash } from 'node:crypto'
import {
  lstat as defaultLstat,
  readFile as defaultReadFile,
} from 'node:fs/promises'
import path from 'node:path'
import { stableJson } from './constants.mjs'
import {
  instructionRecordPath,
  readInstruction,
} from './ledger.mjs'

export const TRACKED_PATHS_DIGEST_LABEL = 'public-origin:@tracked-paths'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export const digestRecord = (label, bytes, extra = {}) => ({
  path: label,
  digest: digest(Buffer.from(bytes)),
  ...extra,
})

export const missingDigestRecord = label => ({
  path: label,
  digest: null,
  missing: true,
})

export const trackedPathsDigestRecord = trackedPaths => digestRecord(
  TRACKED_PATHS_DIGEST_LABEL,
  stableJson([...trackedPaths].sort()),
)

export function registerStaticAuthorityPaths(
  recorder,
  paths,
  { includePublicRoutes = true } = {},
) {
  for (const [filePath, label] of [
    [paths.registryPath, 'dev:surface-registry'],
    [paths.licenseRegistryPath, 'dev:license-registry'],
    [paths.schemaPath, 'dev:surface-schema'],
    ...(includePublicRoutes
      ? [[path.join(paths.publicOriginRoot, '_routes.json'), 'public-origin:_routes.json']]
      : []),
  ]) recorder.register(filePath, label)
}

const securityRecord = status => ({
  changeTimeMs: status.ctimeMs,
  device: Number(status.dev),
  inode: Number(status.ino),
  kind: status.isSymbolicLink()
    ? 'symbolic-link'
    : status.isFile()
      ? 'file'
      : 'other',
  linkCount: status.nlink,
  mode: status.mode & 0o777,
})

const invalidApprovalRecord = (label, security) => ({
  path: label,
  digest: null,
  security,
})

export async function snapshotApprovalRecord(
  ledgerRoot,
  instructionId,
  catalogId,
  {
    lstat = defaultLstat,
    readFile = defaultReadFile,
    signal,
  } = {},
) {
  const label = `dev:catalog-approval:${catalogId}`
  const filePath = instructionRecordPath(ledgerRoot, instructionId)
  let status
  try {
    status = await lstat(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return missingDigestRecord(label)
    throw error
  }
  const security = securityRecord(status)
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || (status.mode & 0o077) !== 0
  ) {
    return invalidApprovalRecord(label, security)
  }
  try {
    const bytes = await readFile(filePath, { signal })
    return digestRecord(label, bytes, { security })
  } catch (error) {
    if (error?.code === 'ENOENT') return missingDigestRecord(label)
    throw error
  }
}

export function createAuthorityReadRecorder({ signal } = {}) {
  const labelsByPath = new Map()
  const records = new Map()

  const register = (filePath, label) => {
    const resolvedPath = path.resolve(filePath)
    const labels = labelsByPath.get(resolvedPath) ?? new Set()
    labels.add(label)
    labelsByPath.set(resolvedPath, labels)
  }

  const remember = record => records.set(record.path, record)

  const readFile = async (filePath, options) => {
    const labels = labelsByPath.get(path.resolve(filePath)) ?? new Set()
    try {
      const bytes = await defaultReadFile(filePath, options)
      for (const label of labels) remember(digestRecord(label, bytes))
      return bytes
    } catch (error) {
      if (error?.code === 'ENOENT') {
        for (const label of labels) remember(missingDigestRecord(label))
      }
      throw error
    }
  }

  const readCatalogSource = async (filePath, descriptor) => {
    register(filePath, `worker:${descriptor.catalogId}`)
    return readFile(filePath, { signal })
  }

  const readCatalogApproval = async (ledgerRoot, instructionId, source) => {
    const label = `dev:catalog-approval:${source.catalogId}`
    const filePath = instructionRecordPath(ledgerRoot, instructionId)
    let observed = false
    let security
    const instruction = await readInstruction(ledgerRoot, instructionId, {
      lstat: async targetPath => {
        try {
          const status = await defaultLstat(targetPath)
          security = securityRecord(status)
          return status
        } catch (error) {
          if (error?.code === 'ENOENT') {
            remember(missingDigestRecord(label))
            observed = true
          }
          throw error
        }
      },
      readFile: async (_targetPath, encoding) => {
        try {
          const bytes = await defaultReadFile(filePath, { encoding, signal })
          remember(digestRecord(label, bytes, { security }))
          observed = true
          return bytes
        } catch (error) {
          if (error?.code === 'ENOENT') remember(missingDigestRecord(label))
          observed = true
          throw error
        }
      },
    })
    if (!observed && security) remember(invalidApprovalRecord(label, security))
    return instruction
  }

  return {
    register,
    readFile,
    readCatalogSource,
    readCatalogApproval,
    recordTrackedPaths: paths => remember(trackedPathsDigestRecord(paths)),
    snapshot: () => [...records.values()]
      .sort((left, right) => left.path.localeCompare(right.path)),
  }
}
