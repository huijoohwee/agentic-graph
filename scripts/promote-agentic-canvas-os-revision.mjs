import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from './collaboration-contract.mjs'
import {
  readRuntimeReadinessContract,
  resolveRuntimeDocsDependency,
  runtimeReadinessContractPath,
} from './runtime-readiness-contract.mjs'

export const REQUIRED_CHECKS = Object.freeze([
  'build',
  'collaboration-integration',
  'docs-contract',
  'test',
])

const run = (command, args) => execFileSync(command, args, {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

export const replaceRuntimeDocsRevision = (source, currentRevision, nextRevision) => {
  const currentLine = `  ref: "${currentRevision}"`
  const nextLine = `  ref: "${nextRevision}"`
  if (!source.includes(currentLine)) throw new Error('runtime docs dependency ref is not uniquely addressable')
  if (source.indexOf(currentLine) !== source.lastIndexOf(currentLine)) {
    throw new Error('runtime docs dependency ref appears more than once')
  }
  return source.replace(currentLine, nextLine)
}

const resolveProtectedMainRevision = repository => {
  const output = run('git', ['ls-remote', `https://github.com/${repository}.git`, 'refs/heads/main'])
  const [revision, ref] = output.split(/\s+/)
  if (!/^[0-9a-f]{40}$/.test(revision) || ref !== 'refs/heads/main') {
    throw new Error(`could not resolve exact ${repository} main revision`)
  }
  return revision
}

const requireSuccessfulChecks = (repository, revision) => {
  const response = JSON.parse(run('gh', [
    'api',
    `repos/${repository}/commits/${revision}/check-runs?per_page=100`,
  ]))
  for (const name of REQUIRED_CHECKS) {
    const matches = response.check_runs.filter(check => check.name === name)
    if (!matches.some(check => check.status === 'completed' && check.conclusion === 'success')) {
      throw new Error(`${repository}@${revision} has no successful ${name} check`)
    }
  }
}

const appendGitHubOutput = async values => {
  const outputPath = String(process.env.GITHUB_OUTPUT || '').trim()
  if (!outputPath) return
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('')
  await fs.appendFile(outputPath, body, 'utf8')
}

export const promoteAgenticCanvasOsRevision = async () => {
  const contract = await readRuntimeReadinessContract()
  const dependency = resolveRuntimeDocsDependency(contract)
  const nextRevision = resolveProtectedMainRevision(dependency.repository)
  requireSuccessfulChecks(dependency.repository, nextRevision)
  if (dependency.ref === nextRevision) {
    await appendGitHubOutput({ changed: 'false', revision: nextRevision })
    return { changed: false, revision: nextRevision }
  }
  const source = await fs.readFile(runtimeReadinessContractPath, 'utf8')
  const nextSource = replaceRuntimeDocsRevision(source, dependency.ref, nextRevision)
  await fs.writeFile(runtimeReadinessContractPath, nextSource, 'utf8')
  await appendGitHubOutput({ changed: 'true', revision: nextRevision })
  return { changed: true, revision: nextRevision }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await promoteAgenticCanvasOsRevision()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
