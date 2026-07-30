import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  rename,
  rm,
} from 'node:fs/promises'
import path from 'node:path'

async function readRegularFileState(absolutePath, label) {
  try {
    const metadata = await lstat(absolutePath)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must be a regular non-symlink file`)
    }
    return 'present'
  } catch (error) {
    if (error?.code === 'ENOENT') return 'absent'
    throw error
  }
}

function assertEvidenceNames(names) {
  if (
    names.length === 0
    || new Set(names).size !== names.length
    || names.some(name => path.basename(name) !== name || !name)
  ) {
    throw new Error('Browser evidence publication requires unique basenames')
  }
}

async function restorePriorEvidence({
  destinationRoot,
  names,
  priorStates,
  transactionRoot,
}) {
  for (const name of names) {
    const destinationPath = path.join(destinationRoot, name)
    if (priorStates.get(name) === 'absent') {
      await rm(destinationPath, { force: true })
      continue
    }
    const restorePath = path.join(transactionRoot, `restore-${name}`)
    await copyFile(path.join(transactionRoot, `prior-${name}`), restorePath)
    await rename(restorePath, destinationPath)
  }
}

export async function prepareFlightSimBrowserEvidencePublication({
  destinationRoot,
  names,
  sourceRoot,
}) {
  assertEvidenceNames(names)
  await mkdir(destinationRoot, { recursive: true })
  const transactionRoot = await mkdtemp(
    path.join(destinationRoot, '.game-flight-sim-evidence-transaction-'),
  )
  const priorStates = new Map()
  try {
    for (const name of names) {
      const sourcePath = path.join(sourceRoot, name)
      if (await readRegularFileState(
        sourcePath,
        `isolated browser evidence ${name}`,
      ) !== 'present') {
        throw new Error(`isolated browser evidence ${name} is missing`)
      }
      await copyFile(sourcePath, path.join(transactionRoot, `next-${name}`))
      const destinationPath = path.join(destinationRoot, name)
      const priorState = await readRegularFileState(
        destinationPath,
        `prior browser evidence ${name}`,
      )
      priorStates.set(name, priorState)
      if (priorState === 'present') {
        await copyFile(
          destinationPath,
          path.join(transactionRoot, `prior-${name}`),
        )
      }
    }
  } catch (error) {
    await rm(transactionRoot, { recursive: true, force: true })
    throw error
  }
  let settled = false
  return Object.freeze({
    async commit({ onPublishStep } = {}) {
      if (settled) {
        throw new Error('Browser evidence publication transaction is settled')
      }
      try {
        try {
          for (const [index, name] of names.entries()) {
            await rename(
              path.join(transactionRoot, `next-${name}`),
              path.join(destinationRoot, name),
            )
            await onPublishStep?.({ index, name })
          }
        } catch (publicationError) {
          try {
            await restorePriorEvidence({
              destinationRoot,
              names,
              priorStates,
              transactionRoot,
            })
          } catch (rollbackError) {
            throw new Error(
              `Browser evidence publication failed: ${
                publicationError instanceof Error
                  ? publicationError.message
                  : String(publicationError)
              }; rollback failed: ${
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError)
              }`,
            )
          }
          throw publicationError
        }
      } finally {
        settled = true
        await rm(transactionRoot, { recursive: true, force: true })
      }
    },
    async discard() {
      if (settled) return
      settled = true
      await rm(transactionRoot, { recursive: true, force: true })
    },
  })
}

export async function publishFlightSimBrowserEvidence(options) {
  const publication = await prepareFlightSimBrowserEvidencePublication(options)
  await publication.commit({ onPublishStep: options.onPublishStep })
}
