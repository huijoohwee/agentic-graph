import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseWorkspaceRevealSnapshot, saveWorkspaceRevealSnapshot, parseWorkspaceRevealFolderSnapshot, saveWorkspaceRevealFolderSnapshot } from '../../viteWorkspaceRevealSnapshot'

async function fixture(run: (repo: string, root: string) => Promise<void>) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reveal-copy-')))
  try { await run(path.join(root, 'docs_'), root) } finally { await fs.rm(root, { recursive: true, force: true }) }
}
test('named copies preserve Unicode paths, empty documents, revisions and concurrent repeat identity', async () => fixture(async repo => {
  const snapshot = { workspacePath: '/notes/研究.md', text: '# Uncommitted revision\nOriginal text' }
  const copies = await Promise.all(Array.from({ length: 4 }, () => saveWorkspaceRevealSnapshot(repo, snapshot)))
  assert.equal(new Set(copies).size, 1)
  assert.ok(copies[0]!.endsWith(snapshot.workspacePath))
  assert.equal(await fs.readFile(copies[0]!, 'utf8'), snapshot.text)
  const sameInode = (await fs.stat(copies[0]!)).ino
  await saveWorkspaceRevealSnapshot(repo, snapshot)
  assert.equal((await fs.stat(copies[0]!)).ino, sameInode, 'unchanged copies avoid replacement writes')
  const edited = await saveWorkspaceRevealSnapshot(repo, { ...snapshot, text: 'New revision' })
  assert.equal(edited, copies[0]); assert.equal(await fs.readFile(edited, 'utf8'), 'New revision')
  const revisions = (await fs.readdir(path.join(repo, 'revealed'))).filter(name => /^[a-f0-9]{64}$/.test(name))
  assert.equal(revisions.length, 2, 'previous content-addressed revisions stay intact')
  assert.ok((await Promise.all(revisions.map(name => fs.readFile(path.join(repo, 'revealed', name, snapshot.workspacePath), 'utf8')))).includes(snapshot.text))
  const other = await saveWorkspaceRevealSnapshot(repo, { ...snapshot, workspacePath: '/another/研究.md' })
  assert.notEqual(other, copies[0])
  const empty = await saveWorkspaceRevealSnapshot(repo, { workspacePath: '/notes/empty.txt', text: '' })
  assert.equal(await fs.readFile(empty, 'utf8'), '')
}))
test('edited and moved local copies are preserved rather than silently overwritten', async () => fixture(async repo => {
  const snapshot = { workspacePath: '/notes/draft.md', text: 'Original' }
  const saved = await saveWorkspaceRevealSnapshot(repo, snapshot)
  await fs.writeFile(saved, 'Local edit')
  await assert.rejects(saveWorkspaceRevealSnapshot(repo, snapshot), /edited.*preserved/)
  assert.equal(await fs.readFile(saved, 'utf8'), 'Local edit')
  await fs.rename(saved, saved + '.moved')
  await assert.rejects(saveWorkspaceRevealSnapshot(repo, snapshot), /moved.*preserved/)
  assert.equal(await fs.readFile(saved + '.moved', 'utf8'), 'Local edit')
}))
test('snapshot paths reject traversal, reserved names and excess UTF-8 bytes before creating copies', () => {
  for (const workspacePath of ['/../escape.md', '/a/../../b.md', 'relative.md', '/a\\b.md', '/a//b.md', '/a/', '/CON.txt', '/a /b.md', '/a\u0000b.md']) {
    assert.throws(() => parseWorkspaceRevealSnapshot({ workspacePath, text: '' }))
  }
  assert.throws(() => parseWorkspaceRevealSnapshot({ workspacePath: '/safe.txt', text: '界'.repeat(166667) }), /500 KB/)
})
test('symlinked output roots and replaced files cannot redirect snapshot writes', async () => fixture(async (repo, root) => {
  const snapshot = { workspacePath: '/notes/draft.md', text: 'Original' }
  const saved = await saveWorkspaceRevealSnapshot(repo, snapshot)
  const other = path.join(root, 'other.md'); await fs.writeFile(other, snapshot.text)
  await fs.unlink(saved); await fs.symlink(other, saved)
  await assert.rejects(saveWorkspaceRevealSnapshot(repo, snapshot), /replaced.*preserved/)
  const outputRoot = path.join(root, 'docs_/revealed')
  await fs.rename(outputRoot, outputRoot + '-preserved'); await fs.symlink(root, outputRoot)
  await assert.rejects(saveWorkspaceRevealSnapshot(repo, { ...snapshot, text: 'New' }), /must not be a symlink/)
  assert.equal(await fs.readFile(other, 'utf8'), snapshot.text)
}))


test('folder copies retain nested files, Unicode and empty folders as one atomic repeatable revision', async () => fixture(async repo => {
  const snapshot = { workspacePath: '/notes', entries: [
    { workspacePath: '/notes/empty', kind: 'folder' as const },
    { workspacePath: '/notes/nested/研究.md', kind: 'file' as const, text: 'Current editor revision' },
    { workspacePath: '/notes/draft.md', kind: 'file' as const, text: '' },
  ] }
  const copies = await Promise.all([snapshot, { ...snapshot, entries: [...snapshot.entries].reverse() }].map(item => saveWorkspaceRevealFolderSnapshot(repo, item)))
  assert.equal(copies[0], copies[1])
  assert.ok(copies[0].endsWith('/notes'))
  assert.deepEqual((await fs.readdir(copies[0])).sort(), ['draft.md', 'empty', 'nested'])
  assert.equal(await fs.readFile(path.join(copies[0], 'nested/研究.md'), 'utf8'), 'Current editor revision')
  assert.deepEqual(await fs.readdir(path.join(copies[0], 'empty')), [])
  const empty = await saveWorkspaceRevealFolderSnapshot(repo, { workspacePath: '/blank', entries: [] })
  assert.deepEqual(await fs.readdir(empty), [])
  await fs.writeFile(path.join(copies[0], 'new-local.md'), 'Local addition')
  assert.equal(await saveWorkspaceRevealFolderSnapshot(repo, snapshot), copies[0], 'unrequested local additions stay in the shared folder')
  assert.equal(await fs.readFile(path.join(copies[0], 'new-local.md'), 'utf8'), 'Local addition')
}))

test('folder copy rejects traversal, unrelated paths, collisions and total-byte overflow', () => {
  const file = (workspacePath: string, text = '') => ({ workspacePath, kind: 'file', text })
  for (const entries of [[file('/elsewhere/a.md')], [file('/notes/../a.md')], [file('/notes/a.md'), file('/notes/a.md')],
    [file('/notes/a'), file('/notes/a/b.md')], [file('/notes/A/x.md'), file('/notes/a/y.md')],
    [{ workspacePath: '/notes/a.md', kind: 'file' }], Array.from({ length: 1001 }, (_, i) => file(`/notes/${i}.md`))]) {
    assert.throws(() => parseWorkspaceRevealFolderSnapshot({ workspacePath: '/notes', entries }))
  }
  assert.throws(() => parseWorkspaceRevealFolderSnapshot({ workspacePath: '/notes', entries: [file('/notes/a.md', 'x'.repeat(260000)), file('/notes/b.md', 'x'.repeat(260000))] }), /500 KB/)
})

test('replaced folder descendants cannot redirect a repeated reveal', async () => fixture(async (repo, root) => {
  const snapshot = { workspacePath: '/notes', entries: [{ workspacePath: '/notes/child/a.md', kind: 'file' as const, text: 'Saved' }] }
  const saved = await saveWorkspaceRevealFolderSnapshot(repo, snapshot)
  const child = path.join(saved, 'child'), outside = path.join(root, 'retained-child')
  await fs.rename(child, outside); await fs.symlink(outside, child)
  await assert.rejects(saveWorkspaceRevealFolderSnapshot(repo, snapshot), /replaced.*preserved/)
  assert.equal(await fs.readFile(path.join(outside, 'a.md'), 'utf8'), 'Saved')
}))


test('independently revealed files and their folder share one stable local tree across revisions', async () => fixture(async repo => {
  const parent = '/websites/example.invalid/collection/library'
  const first = { workspacePath: parent + '/first.md', text: 'First article' }
  const second = { workspacePath: parent + '/second.md', text: 'Second article' }
  const a = await saveWorkspaceRevealSnapshot(repo, first)
  const b = await saveWorkspaceRevealSnapshot(repo, second)
  assert.equal(path.dirname(a), path.dirname(b))
  assert.equal(a, path.join(repo, first.workspacePath))
  assert.deepEqual((await fs.readdir(path.dirname(a))).sort(), ['first.md', 'second.md'])
  const folder = await saveWorkspaceRevealFolderSnapshot(repo, { workspacePath: parent,
    entries: [{ ...first, text: 'New first article', kind: 'file' }, { ...second, kind: 'file' }] })
  assert.equal(folder, path.dirname(a))
  assert.equal(await fs.readFile(a, 'utf8'), 'New first article')
  await fs.writeFile(b, 'User edit')
  await assert.rejects(saveWorkspaceRevealFolderSnapshot(repo, { workspacePath: parent,
    entries: [{ ...first, text: 'Unpublished revision', kind: 'file' }, { ...second, kind: 'file' }] }), /edited.*preserved/)
  assert.equal(await fs.readFile(a, 'utf8'), 'New first article', 'preflight checks all files before publishing changes')
  assert.equal(await fs.readFile(b, 'utf8'), 'User edit')
}))
