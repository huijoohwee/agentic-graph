import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { matchesPagesBuild, recordPagesBuild } from '../pages-build-receipt.mjs'

test('only this clean CI checkout, run attempt and complete output can reuse its build', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'graph-pages-reuse-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = join(temporary, 'source'), output = join(root, 'canvas/dist')
  await mkdir(output, { recursive: true })
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q')
  await writeFile(join(root, '.gitignore'), 'canvas/dist/\n')
  git('add', '.gitignore')
  git('-c', 'user.name=Graph', '-c', 'user.email=graph@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  const env = { GITHUB_ACTIONS: 'true', GITHUB_SHA: git('rev-parse', 'HEAD'), GITHUB_JOB: 'integration', GITHUB_RUN_ID: '1',
    GITHUB_RUN_ATTEMPT: '1', AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR: temporary, RUNNER_TEMP: temporary }
  const file = join(output, 'index.html')
  await writeFile(file, 'first')
  assert.equal(await matchesPagesBuild(root, env), false)
  await recordPagesBuild(root, env)
  assert.equal(await matchesPagesBuild(root, env), true)
  for (const overrides of [{ GITHUB_SHA: '0'.repeat(40) }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_ACTIONS: 'false' }]) {
    assert.equal(await matchesPagesBuild(root, { ...env, ...overrides }), false)
  }
  await writeFile(file, 'other')
  assert.equal(await matchesPagesBuild(root, env), false)
  await writeFile(file, 'first')
  const extra = join(output, 'extra.js')
  await writeFile(extra, '')
  assert.equal(await matchesPagesBuild(root, env), false)
  await rm(extra)
  await writeFile(join(root, '.gitignore'), 'canvas/dist/\n# draft\n')
  assert.equal(await matchesPagesBuild(root, env), false)
})
