import assert from 'node:assert/strict'
import test from 'node:test'

import { parseHostedDevReleaseArgs } from '../miaoxyz-hosted-dev-release.mjs'

test('hosted Dev CLI accepts whitespace-delimited workflow arguments', () => {
  const args = parseHostedDevReleaseArgs([
    '--repo-root', '.',
    '--candidate', '/tmp/candidate.json',
    '--expected-candidate-digest', 'a'.repeat(64),
    '--receipt', '/tmp/receipt.json',
  ])
  assert.equal(args['repo-root'], '.')
  assert.equal(args.candidate, '/tmp/candidate.json')
  assert.equal(args['expected-candidate-digest'], 'a'.repeat(64))
  assert.equal(args.receipt, '/tmp/receipt.json')
})

test('hosted Dev CLI also accepts equals-delimited arguments', () => {
  const args = parseHostedDevReleaseArgs([
    '--repo-root=.',
    '--candidate=/tmp/candidate.json',
    '--expected-candidate-digest=' + 'b'.repeat(64),
    '--dev-receipt=/tmp/dev-receipt.json',
  ])
  assert.equal(args['repo-root'], '.')
  assert.equal(args.candidate, '/tmp/candidate.json')
  assert.equal(args['expected-candidate-digest'], 'b'.repeat(64))
  assert.equal(args['dev-receipt'], '/tmp/dev-receipt.json')
})

test('hosted Dev CLI rejects a missing option value', () => {
  assert.throws(() => parseHostedDevReleaseArgs(['--candidate']), /argument missing/)
})
