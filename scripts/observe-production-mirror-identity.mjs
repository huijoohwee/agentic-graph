import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const readJson = async filePath => JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'))
const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true })
  await fs.writeFile(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`)
}
const appendGitHubOutput = async (enabled, values) => {
  if (!enabled) return
  const outputPath = String(process.env.GITHUB_OUTPUT || '')
  if (!outputPath.trim() || /[\r\n]/u.test(outputPath)) throw new Error('GITHUB_OUTPUT path is invalid')
  const lines = Object.entries(values).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /[\r\n]/u.test(String(value))) {
      throw new Error(`GitHub output ${key} is invalid`)
    }
    return `${key}=${value}\n`
  })
  await fs.appendFile(outputPath, lines.join(''))
}

export const observeMirror = async ({ repositoryRoot, repository, releaseEvidencePath, output, githubOutput }) => {
  await appendGitHubOutput(githubOutput, { eligible: false })
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
    assert.match(head, SHA_PATTERN, 'mirror checkout HEAD must be an exact Git SHA')
    const remoteRecords = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
      cwd: repositoryRoot, encoding: 'utf8',
    }).trim().split(/\r?\n/u).filter(Boolean)
    assert.equal(remoteRecords.length, 1, 'mirror remote main identity is ambiguous')
    const [revision, remoteRef] = remoteRecords[0].trim().split(/\s+/u)
    assert.match(revision, SHA_PATTERN, 'mirror remote main must be an exact Git SHA')
    assert.equal(remoteRef, 'refs/heads/main', 'mirror remote main ref drifted')
    assert.equal(head, revision, 'mirror checkout HEAD drifted from remote main')
    const releaseEvidence = releaseEvidencePath ? await readJson(releaseEvidencePath) : null
    if (!releaseEvidence) {
      const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: repositoryRoot, encoding: 'utf8',
      })
      assert.equal(status, '', 'current mirror observation requires a clean exact checkout')
    }
    const readiness = execFileSync('git', ['show', `${head}:.well-known/runtime-readiness.json`], { cwd: repositoryRoot, encoding: 'utf8' })
    const sourceRevision = JSON.parse(readiness).source.revision
    assert.match(sourceRevision, SHA_PATTERN, 'mirror readiness sourceRevision must be an exact Git SHA')
    const expectedRepository = String(releaseEvidence?.rollbackIdentity?.mirror?.repository || '').trim()
    const observedRepository = String(repository || expectedRepository).trim()
    assert.ok(observedRepository, '--repository is required without --release-evidence')
    if (repository && expectedRepository) assert.equal(repository, expectedRepository, 'mirror repository drifted from release evidence')
    const evidence = {
      schema: 'agentic-graph-production-observed-mirror-identity/v1',
      repository: observedRepository, revision, sourceRevision,
      observedAt: new Date().toISOString(),
    }
    await writeJson(output, evidence)
    const eligible = !releaseEvidence || (revision === releaseEvidence.rollbackIdentity.mirror.revision
      && sourceRevision === releaseEvidence.rollbackIdentity.pages.sourceRevision)
    if (eligible) {
      await appendGitHubOutput(githubOutput, { eligible: true, revision, source_revision: sourceRevision })
    }
    return evidence
  } catch (error) {
    process.stderr.write(`Authoritative mirror observation failed closed: ${error.message}\n`)
    if (!releaseEvidencePath) throw error
    return null
  }
}
