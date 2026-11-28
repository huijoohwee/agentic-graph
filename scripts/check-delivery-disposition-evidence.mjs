import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readChangedPaths } from './ci-evidence-inputs.mjs'
import { validateDeliveryDispositionSet } from '../node_modules/agentic-os/src/completion.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER_PATH = '.agentic-os-delivery-dispositions.json'

export function validateDeliveryEvidenceMetadata(root = repoRoot, { changedPaths } = {}) {
  const rootPath = realpathSync(root)
  const set = JSON.parse(readFileSync(path.join(rootPath, LEDGER_PATH), 'utf8'))
  const rows = set.dispositions
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('delivery disposition ledger has no rows')
  const result = validateDeliveryDispositionSet(set, {
    repository: set.repository,
    ref: 'agent/metadata-check/unselected',
  })
  if (result !== null) throw new Error('delivery metadata sentinel unexpectedly matched a lane')
  const paths = changedPaths ?? readChangedPaths()
  const reports = [...new Set(paths.filter(value => /^docs\/reports\/(?:production-delivery-evidence-|agentic-graph-delivery-evidence-|miaoxyz-production-delivery-evidence-)[^/]+\.json$/u.test(value)))].sort()
  for (const relativePath of reports) {
    const resolved = path.resolve(rootPath, relativePath)
    if (!resolved.startsWith(rootPath + path.sep)) throw new Error('delivery report path escapes the repository')
    JSON.parse(readFileSync(realpathSync(resolved), 'utf8'))
  }
  return { schema: 'agentic-graph/delivery-evidence-metadata-check/v1', rows: rows.length, reports: reports.length, digest: set.receiptDigest }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateDeliveryEvidenceMetadata())}\n`)
}
