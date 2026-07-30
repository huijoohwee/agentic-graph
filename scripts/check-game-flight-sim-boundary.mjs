import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertFlightSimBoundary } from './lib/game-flight-sim-boundary.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const { stdout } = await execFileAsync(
  'git',
  ['ls-files', '-z'],
  { cwd: repositoryRoot, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
)
const relativePaths = stdout.toString('utf8').split('\0').filter(Boolean)
const entries = []
for (const relativePath of relativePaths) {
  let bytes
  try {
    bytes = await readFile(path.join(repositoryRoot, relativePath))
  } catch (error) {
    if (error?.code === 'ENOENT') continue
    throw error
  }
  entries.push({
    relativePath,
    bytes,
  })
}
assertFlightSimBoundary(entries)
console.log(`OK Flight Sim tracked clean-room provenance boundary (${entries.length} files)`)
