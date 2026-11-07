import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('explicit local seeding confines bounded complete SQL and parity reads to local D1', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-doc-seed-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const docs = path.join(root, 'docs'), bin = path.join(root, 'bin'), log = path.join(root, 'calls.jsonl')
  fs.mkdirSync(docs); fs.mkdirSync(bin)
  fs.writeFileSync(path.join(docs, 'demo.md'), '# Local XR document\n')
  fs.writeFileSync(path.join(docs, 'large.md'), "# Quoted content;\nIt's one document.\n".repeat(4_000))
  // Execute generated SQL against the real storage schema; a canned readback would
  // miss truncated statements and falsely pass the content-parity check.
  fs.writeFileSync(path.join(bin, 'npx'), String.raw`#!${process.execPath}
const fs = require('node:fs'); const { DatabaseSync } = require('node:sqlite');
const args = process.argv.slice(2);
const sql = args.includes('--file') ? fs.readFileSync(args[args.indexOf('--file') + 1], 'utf8') : args[args.indexOf('--command') + 1];
fs.appendFileSync(process.env.SEED_TEST_LOG, JSON.stringify({ args, bytes: Buffer.byteLength(sql) }) + '\n');
if (process.env.SEED_TEST_FAIL) { process.stderr.write('local fixture failed'); process.exit(1); }
const db = new DatabaseSync(process.env.SEED_TEST_DB);
db.exec(fs.readFileSync('cloudflare/d1/migrations/0001_agentic-graph_storage.sql', 'utf8'));
const results = args.includes('--file') ? (db.exec(sql), []) : db.prepare(sql).all();
db.close(); process.stdout.write(JSON.stringify([{ success: true, results }]));
`, { mode: 0o755 })
  const script = path.resolve(import.meta.dirname, '../seed-storage-docs-to-cloudflare.mjs')
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SEED_TEST_LOG: log, SEED_TEST_DB: path.join(root, 'db.sqlite') }
  const run = (args, extra = {}) => spawnSync(process.execPath, [script, '--docs-root', docs, ...args],
    { env: { ...env, ...extra }, encoding: 'utf8' })
  const readCalls = () => fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  for (let attempt = 0; attempt < 2; attempt += 1) {
    fs.writeFileSync(log, '')
    const result = run(['--local'])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /documents=2; chunks=4; snapshots=0;.*content-parity=passed/)
    const calls = readCalls(), writes = calls.filter(({ args }) => args.includes('--file'))
    assert.ok(writes.length > 1, 'large corpus needs multiple local writes')
    assert.ok(writes.every(({ bytes }) => bytes <= 90_000), 'bound local SQLite execution size')
    assert.equal(calls.length, writes.length + 3, 'three actual parity reads')
    for (const { args } of calls) {
      assert.ok(args.includes('--local'))
      assert.ok(!args.includes('--remote'))
      assert.deepEqual(args.slice(0, 5), ['--no-install', 'wrangler', 'd1', 'execute', 'agentic-storage'])
    }
  }
  const beforeInvalid = readCalls().length
  for (const args of [
    ['--local', '--base-url', 'https://airvio.co'],
    ['--local', '--base-url', 'http://example.com'],
    ['--local', '--capture-state'],
    ['--local', '--evidence-output', path.join(root, 'evidence.json')],
    ['--local', '--publication-plan-output', path.join(root, 'publication.json')],
  ]) assert.equal(run(args).status, 1, JSON.stringify(args))
  assert.equal(readCalls().length, beforeInvalid, 'invalid targets stop before effects')
  const failed = run(['--local'], { SEED_TEST_FAIL: '1' })
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /local fixture failed/)
  assert.doesNotMatch(failed.stdout, /seed complete/)
  // The shim remains local: verify remote routing keeps one corpus import.
  fs.writeFileSync(log, '')
  const remote = run(['--base-url', 'https://airvio.co'])
  assert.equal(remote.status, 0, remote.stdout + remote.stderr)
  const remoteCalls = readCalls()
  assert.equal(remoteCalls.filter(({ args }) => args.includes('--file')).length, 1)
  assert.ok(remoteCalls.every(({ args }) => args.includes('--remote') && !args.includes('--local')))
})
