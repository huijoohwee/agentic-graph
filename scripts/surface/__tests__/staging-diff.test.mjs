import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createUnifiedDiff,
  diffFileMaps,
  diffGeneratedAgainstTracked,
  diffStaging,
} from '../staging-diff.mjs'

test('pure differ classifies files and emits a deterministic unified diff', () => {
  const result = diffFileMaps(
    new Map([
      ['robots.txt', Buffer.from('one\ntwo changed\nthree\n')],
      ['sitemap.xml', Buffer.from('same\n')],
      ['REUSE.md', Buffer.from('new declaration\n')],
    ]),
    new Map([
      ['robots.txt', Buffer.from('one\ntwo\nthree\n')],
      ['sitemap.xml', Buffer.from('same\n')],
      ['llms.txt', Buffer.from('removed\n')],
    ]),
  )
  assert.deepEqual(result.added, ['REUSE.md'])
  assert.deepEqual(result.removed, ['llms.txt'])
  assert.deepEqual(result.identical, ['sitemap.xml'])
  assert.equal(result.changed.length, 1)
  assert.equal(result.changed[0].path, 'robots.txt')
  assert.match(result.changed[0].diff, /^--- tracked\/robots\.txt\n\+\+\+ staging\/robots\.txt\n/u)
  assert.match(result.changed[0].diff, /-two\n\+two changed/u)
})

test('binary changes are described without decoding their contents', () => {
  const diff = createUnifiedDiff('openapi.json', Buffer.from([0, 1]), Buffer.from([0, 2]))
  assert.match(diff, /Binary files differ/u)
})

test('filesystem differ is read-only, includes REUSE.md, and ignores unrelated tracked files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowgrph-diff-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const staging = path.join(root, 'staging')
  const tracked = path.join(root, 'tracked')
  await fs.mkdir(path.join(staging, '.well-known'), { recursive: true })
  await fs.mkdir(path.join(tracked, 'src'), { recursive: true })
  await fs.writeFile(path.join(staging, 'robots.txt'), 'new robots\n')
  await fs.writeFile(path.join(staging, 'REUSE.md'), 'new reuse\n')
  await fs.writeFile(path.join(staging, '.well-known', 'api-catalog'), '{"entries":[]}\n')
  await fs.writeFile(path.join(tracked, 'robots.txt'), 'old robots\n')
  await fs.writeFile(path.join(tracked, 'REUSE.md'), 'old reuse\n')
  await fs.writeFile(path.join(tracked, 'src', 'private.mjs'), 'must be ignored\n')
  const before = new Map([
    ['robots.txt', await fs.readFile(path.join(tracked, 'robots.txt'))],
    ['REUSE.md', await fs.readFile(path.join(tracked, 'REUSE.md'))],
    ['private.mjs', await fs.readFile(path.join(tracked, 'src', 'private.mjs'))],
  ])
  const calls = []
  const readOnlyFs = {
    readdir: (...args) => {
      calls.push('readdir')
      return fs.readdir(...args)
    },
    lstat: (...args) => {
      calls.push('lstat')
      return fs.lstat(...args)
    },
    readFile: (...args) => {
      calls.push('readFile')
      return fs.readFile(...args)
    },
  }

  const result = await diffStaging(staging, tracked, { fs: readOnlyFs })
  assert.deepEqual(result.added, ['.well-known/api-catalog'])
  assert.deepEqual(result.changed.map(change => change.path), ['REUSE.md', 'robots.txt'])
  assert.equal(calls.every(call => ['readdir', 'lstat', 'readFile'].includes(call)), true)
  assert.equal((await fs.readFile(path.join(tracked, 'robots.txt'))).equals(before.get('robots.txt')), true)
  assert.equal((await fs.readFile(path.join(tracked, 'REUSE.md'))).equals(before.get('REUSE.md')), true)
  assert.equal(
    (await fs.readFile(path.join(tracked, 'src', 'private.mjs'))).equals(before.get('private.mjs')),
    true,
  )
})

test('unrecognised staging files fail closed', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'knowgrph-diff-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const staging = path.join(root, 'staging')
  const tracked = path.join(root, 'tracked')
  await fs.mkdir(staging)
  await fs.mkdir(tracked)
  await fs.writeFile(path.join(staging, 'application-source.js'), 'private\n')
  await assert.rejects(diffStaging(staging, tracked), /unrecognised staging file/u)
})

test('in-memory generated diff reads tracked surfaces without a staging write', async t => {
  const tracked = await fs.mkdtemp(path.join(os.tmpdir(), 'knowgrph-live-diff-'))
  t.after(() => fs.rm(tracked, { recursive: true, force: true }))
  await fs.writeFile(path.join(tracked, 'robots.txt'), 'tracked\n')

  const result = await diffGeneratedAgainstTracked(
    new Map([
      ['robots.txt', Buffer.from('generated\n')],
      ['REUSE.md', Buffer.from('declaration\n')],
    ]),
    tracked,
  )

  assert.deepEqual(result.added, ['REUSE.md'])
  assert.deepEqual(result.changed.map(change => change.path), ['robots.txt'])
  await assert.rejects(fs.readFile(path.join(tracked, 'REUSE.md')), /ENOENT/u)
})

test('filesystem differ honors an aborted runtime audit signal before reading', async () => {
  const controller = new AbortController()
  controller.abort(new Error('runtime audit deadline'))
  let filesystemCalls = 0
  const forbiddenFs = {
    readdir: () => {
      filesystemCalls += 1
      throw new Error('filesystem must not be reached')
    },
  }

  await assert.rejects(diffGeneratedAgainstTracked(
    new Map(),
    '/unreadable/public',
    { fs: forbiddenFs, signal: controller.signal },
  ), /runtime audit deadline/u)
  assert.equal(filesystemCalls, 0)
})
