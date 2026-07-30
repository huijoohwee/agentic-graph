import process from 'node:process'
import { stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import {
  resolveWorkspaceSeedSiblingRootsFromGitCommonDir,
  verifyWorkspaceSeedAuthority,
} from './workspace-seed-authority.mjs'

const root = process.cwd()
const gitCommonDir = execFileSync(
  'git',
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { cwd: root, encoding: 'utf8' },
).trim()
const siblingRoots = resolveWorkspaceSeedSiblingRootsFromGitCommonDir(gitCommonDir)
const explicitAgenticDocsRoot = String(process.env.KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT || '').trim()
const checkedOutAgenticDocsRoot = siblingRoots.agenticDocsRoot
const explicitPublishRoot = String(process.env.KNOWGRPH_PRODUCTION_MIRROR_ROOT || '').trim()
const checkedOutPublishRoot = siblingRoots.publishRoot

const exists = async candidate => {
  try {
    return (await stat(candidate)).isDirectory()
  } catch {
    return false
  }
}

const agenticDocsRoot = explicitAgenticDocsRoot
  || (await exists(checkedOutAgenticDocsRoot) ? checkedOutAgenticDocsRoot : null)
const publishRoot = explicitPublishRoot
  || (await exists(checkedOutPublishRoot) ? checkedOutPublishRoot : null)

const result = await verifyWorkspaceSeedAuthority({
  knowgrphRoot: root,
  agenticDocsRoot,
  publishRoot,
})

const formatInventory = inventory => inventory === null ? 'not-checked' : `[${inventory.join(',')}]`
console.log(
  `[knowgrph] workspace-seed SSOT passed (${result.sourceBytes} bytes; `
  + `authored=${formatInventory(result.knowgrphInventory)}; `
  + `agenticProjection=${formatInventory(result.agenticInventory)}; `
  + `publishEntries=${formatInventory(result.publishInventory)})`,
)
