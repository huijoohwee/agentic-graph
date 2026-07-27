import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assembleCatalog,
  assembleCatalogFromFiles,
  calculateCatalogDigest,
} from '../invocation-assemble.mjs'

const hostedEntry = overrides => ({
  token: '/canvas.render',
  prefixRole: 'action',
  label: 'Canvas render',
  intentSummary: 'Render the current canvas through the approved control plane.',
  executionRouteTier: 'gated',
  ingressRoute: 'invocation-forwarder',
  targetExecutionRoute: 'control-plane-mcp',
  spendBearing: true,
  ...overrides,
})

test('catalog assembly is permutation invariant and deduplicates trimmed case-sensitive tokens', () => {
  const first = {
    catalogId: 'first',
    entries: [
      hostedEntry({ token: ' /canvas.render ' }),
      hostedEntry({ token: '/Canvas.render', label: 'Uppercase canvas render' }),
    ],
  }
  const second = { catalogId: 'second', entries: [hostedEntry({})] }
  const forward = assembleCatalog([first, second])
  const reverse = assembleCatalog([
    { ...second, entries: [...second.entries].reverse() },
    { ...first, entries: [...first.entries].reverse() },
  ])

  assert.equal(forward.digest, reverse.digest)
  assert.deepEqual(forward.entries, reverse.entries)
  assert.deepEqual(forward.entries.map(entry => entry.token), ['/Canvas.render', '/canvas.render'])
  assert.deepEqual(
    forward.entries.find(entry => entry.token === '/canvas.render').sourceCatalogs,
    ['first', 'second'],
  )
  assert.equal(forward.digest, calculateCatalogDigest(forward.entries))
  assert.match(forward.digest, /^[0-9a-f]{64}$/u)
})

test('hosted tokens publish only forwarder and control-plane routing metadata', () => {
  const result = assembleCatalog([{ catalogId: 'action', entries: [hostedEntry({})] }])
  assert.deepEqual(result.validationFailures, [])
  assert.deepEqual(result.entries[0], {
    token: '/canvas.render',
    prefixRole: 'action',
    label: 'Canvas render',
    intentSummary: 'Render the current canvas through the approved control plane.',
    executionRouteTier: 'gated',
    ingressRoute: 'invocation-forwarder',
    targetExecutionRoute: 'control-plane-mcp',
    spendBearing: true,
    readOnly: false,
    sourceCatalogs: ['action'],
  })
})

test('invalid routes, direct endpoints, and invalid spend targets are excluded', () => {
  const result = assembleCatalog([{
    catalogId: 'invalid',
    entries: [
      hostedEntry({ token: '/wrong-route', ingressRoute: 'public-read-mcp' }),
      hostedEntry({ token: '/direct', intentSummary: 'Call https://example.test/direct now.' }),
      {
        token: 'paid_tool',
        prefixRole: 'mcp-tool-id',
        label: 'Paid tool',
        intentSummary: 'Run a paid operation.',
        executionRouteTier: 'gated',
        ingressRoute: 'public-read-mcp',
        targetExecutionRoute: 'public-read-mcp',
        spendBearing: true,
      },
    ],
  }])
  assert.deepEqual(result.entries, [])
  assert.deepEqual(
    result.validationFailures.map(failure => failure.token),
    ['/direct', '/wrong-route', 'paid_tool'],
  )
})

test('dev-only tokens contribute neither entries nor digest input and inline approval is rejected', () => {
  const devOnly = {
    catalogId: 'dev',
    publishPolicy: 'dev-only',
    entries: [hostedEntry({})],
  }
  const empty = assembleCatalog([])
  const excluded = assembleCatalog([devOnly])
  assert.deepEqual(excluded.entries, [])
  assert.deepEqual(excluded.validationFailures, [])
  assert.equal(excluded.digest, empty.digest)

  const recordedApproval = assembleCatalog([devOnly], {
    approvedCatalogIds: ['dev'],
  })
  assert.equal(recordedApproval.entries.length, 1)
  assert.notEqual(recordedApproval.digest, empty.digest)

  const inlineClaim = assembleCatalog([{ ...devOnly, approved: true }])
  assert.deepEqual(inlineClaim.entries, [])
  assert.equal(inlineClaim.digest, empty.digest)
  assert.deepEqual(inlineClaim.validationFailures, [{
    code: 'UNTRUSTED_INLINE_APPROVAL',
    sourceCatalog: 'dev',
    token: '/canvas.render',
    fields: ['operatorApprovalRecord'],
  }])
})

test('bounded file loader extracts a dev-only dictionary only with a recorded catalog approval', async () => {
  const markdown = `---
schema: "agentic-os-dictionary-command/v1"
prefix: "/"
publish_policy: "Dev-only until explicit operator approval"
---

## Commands

| Command | Intent | Required bindings |
|---|---|---|
| \`/query\` | Answer from approved source documents without mutation. | \`@source.body\` |
`
  const result = await assembleCatalogFromFiles(
    [{
      catalogId: 'action',
      path: '/not-read-directly/DICTIONARY-COMMAND.md',
      content: markdown,
    }],
    { approvedCatalogIds: ['action'] },
  )
  assert.deepEqual(result.validationFailures, [])
  assert.deepEqual(result.unreachableSources, [])
  assert.equal(result.entries.length, 1)
  assert.deepEqual(result.entries[0], {
    token: '/query',
    prefixRole: 'action',
    label: 'Query',
    intentSummary: 'Answer from approved source documents without mutation.',
    executionRouteTier: 'gated',
    ingressRoute: 'invocation-forwarder',
    targetExecutionRoute: 'control-plane-mcp',
    spendBearing: false,
    readOnly: false,
    sourceCatalogs: ['action'],
  })
  assert.equal(Object.hasOwn(result.entries[0], 'sourcePath'), false)
  assert.equal(Object.hasOwn(result.entries[0], 'promptBody'), false)
})

test('bounded file loader cannot promote a dev-only dictionary through an inline approval claim', async () => {
  const markdown = `---
schema: "agentic-os-dictionary-command/v1"
prefix: "/"
publish_policy: "Dev-only until explicit operator approval"
approved: true
---

| Command | Intent |
|---|---|
| \`/query\` | Answer from approved source documents without mutation. |
`
  const result = await assembleCatalogFromFiles([{
    catalogId: 'action',
    path: '/not-read-directly/DICTIONARY-COMMAND.md',
    content: markdown,
    approved: true,
  }])

  assert.deepEqual(result.entries, [])
  assert.equal(
    result.validationFailures.some(failure => (
      failure.code === 'UNTRUSTED_INLINE_APPROVAL'
      && failure.sourceCatalog === 'action'
    )),
    true,
  )
})

test('unreachable file sources are named while reachable catalog output is preserved', async () => {
  const reachable = JSON.stringify({
    entries: [hostedEntry({ spendBearing: false })],
  })
  const result = await assembleCatalogFromFiles(
    [
      { catalogId: 'reachable', path: '/reachable.json' },
      { catalogId: 'timeout', path: '/timeout.json' },
    ],
    {
      timeoutMs: 5,
      readFile: sourcePath => (
        sourcePath === '/reachable.json'
          ? Promise.resolve(reachable)
          : new Promise(() => {})
      ),
    },
  )
  assert.equal(result.entries.length, 1)
  assert.deepEqual(result.unreachableSources, ['timeout'])
})
