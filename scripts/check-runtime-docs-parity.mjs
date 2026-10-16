import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(root, 'docs/runtime-readiness-contract.md')
const sha = /^[0-9a-f]{40}$/

export const readPinnedDocsIdentity = source => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1]
  if (!frontmatter) throw new Error('runtime readiness contract frontmatter is missing')
  const lines = frontmatter.split(/\r?\n/)
  const start = lines.indexOf('docs_dependency:')
  if (start < 0) throw new Error('docs_dependency mapping is missing')
  const block = []
  for (const line of lines.slice(start + 1)) {
    if (line && !/^[ \t]/.test(line)) break
    block.push(line.trim())
  }
  const repositoryLines = block.filter(line => line.startsWith('repository:'))
  const revisionLines = block.filter(line => line.startsWith('ref:'))
  const repository = /^repository: "(https:\/\/github\.com\/([^"\s]+)\.git)"$/.exec(repositoryLines[0] || '')
  const revision = /^ref: "([0-9a-f]{40})"$/.exec(revisionLines[0] || '')
  if (repositoryLines.length !== 1 || revisionLines.length !== 1 || !repository || !revision) {
    throw new Error('docs_dependency must contain one exact GitHub repository and one immutable revision')
  }
  const identity = { url: repository[1], repository: repository[2], revision: revision[1] }
  if (identity.repository !== 'huijoohwee/agentic-os' || !sha.test(identity.revision)) {
    throw new Error('docs_dependency must pin the canonical Agentic OS repository to an exact commit')
  }
  return identity
}

export const verifyDocsRevisionParity = (identity, remoteOutput) => {
  const rows = String(remoteOutput).trim().split(/\r?\n/).filter(Boolean)
  if (rows.length !== 1) throw new Error('canonical Agentic OS main did not resolve to one exact ref')
  const [revision, ref, extra] = rows[0].split(/\s+/)
  if (extra || ref !== 'refs/heads/main' || !sha.test(revision)) {
    throw new Error('canonical Agentic OS main returned a malformed revision')
  }
  if (identity.revision !== revision) {
    throw new Error(`Agentic OS Dev/Prod docs pin drift: pinned=${identity.revision} canonical-main=${revision}; promote the exact pin before release`)
  }
  return { schema: 'agentic-graph/runtime-docs-parity/v1', status: 'passed', repository: identity.repository,
    revision, ref: 'refs/heads/main' }
}

export const verifyPackagePinParity = (identity, packageSource, lockSource) => {
  const expected = `https://codeload.github.com/${identity.repository}/tar.gz/${identity.revision}`
  const manifest = JSON.parse(packageSource)
  const lock = JSON.parse(lockSource)
  const pins = [
    manifest.dependencies?.['agentic-os'],
    lock.packages?.['']?.dependencies?.['agentic-os'],
    lock.packages?.['node_modules/agentic-os']?.resolved,
  ]
  if (pins.some(pin => pin !== expected)) {
    throw new Error('Agentic OS runtime contract, package manifest, and lockfile pins must match one exact revision')
  }
}

export const checkRuntimeDocsParity = ({ source, packageSource, lockSource, remoteOutput }) => {
  const identity = readPinnedDocsIdentity(source)
  verifyPackagePinParity(identity, packageSource, lockSource)
  return verifyDocsRevisionParity(identity, remoteOutput)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = fs.readFileSync(contractPath, 'utf8')
  const identity = readPinnedDocsIdentity(source)
  verifyPackagePinParity(identity, fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
  const remoteOutput = execFileSync('git', ['ls-remote', '--heads', identity.url, 'refs/heads/main'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
  })
  process.stdout.write(`${JSON.stringify(verifyDocsRevisionParity(identity, remoteOutput))}\n`)
}
