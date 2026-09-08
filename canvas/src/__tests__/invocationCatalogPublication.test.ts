import assert from 'node:assert/strict'
import { createAgenticOsInvocationCatalogRuntime } from '@/features/agentic-os/agenticOsInvocationCatalogRuntime'
import {
  registerAgenticOsRemoteGrammarCatalogEntries as register,
  resetAgenticOsRemoteGrammarCatalogForTests as reset,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'

type Options = Parameters<typeof createAgenticOsInvocationCatalogRuntime>[0]
const createRuntime = (build: Options['buildDictionaryInvocation']) => createAgenticOsInvocationCatalogRuntime({
  docs: [], commands: [], semantics: [], bindings: [], dictionaryActionIdPrefix: 'invoke:',
  buildDictionaryInvocation: build,
})
const build: Options['buildDictionaryInvocation'] = args => ({
  ...args, id: `${args.kind}:${args.token}`, sourcePath: args.dictionaryFileName,
})

export function testInvocationCatalogRetriesFailedRefreshAtomically(): void {
  reset()
  try {
    register([
      { token: '/order', kind: 'command', label: 'Old order' },
      { token: '@buyer', kind: 'binding', label: 'Old buyer' },
    ])
    let failBinding = false
    const runtime = createRuntime(args => {
      if (failBinding && args.kind === 'binding') throw new Error('binding build failed')
      return build(args)
    })
    const original = runtime.getDictionary()
    register([
      { token: '/order', kind: 'command', label: 'Updated order' },
      { token: '@buyer', kind: 'binding', label: 'Updated buyer' },
    ])
    failBinding = true
    assert.throws(() => runtime.getDictionary(), /binding build failed/)
    // The same source version must remain retryable after the failed projection.
    failBinding = false
    const updated = runtime.getDictionary()
    assert.deepEqual(updated.map(entry => entry.label), ['Updated order', 'Updated buyer'])
    assert.deepEqual(original.map(entry => entry.label), ['Old order', 'Old buyer'])
    assert.equal(runtime.findByToken('/ORDER')?.label, 'Updated order')
    assert.equal(runtime.findDictionaryByActionId('invoke:binding:@buyer')?.label, 'Updated buyer')
    assert.equal(runtime.getDictionary(), updated)
  } finally { reset() }
}

export function testInvocationCatalogRefreshesAllKindsAndReusesStableProjection(): void {
  reset()
  try {
    let builds = 0
    const runtime = createRuntime(args => { builds += 1; return build(args) })
    assert.deepEqual(runtime.getDictionary(), [])
    register([
      { token: '@buyer', kind: 'binding', label: 'Buyer', sourceUrl: 'https://catalog.example/buyer' },
      { token: '#paid', kind: 'semantic', label: 'Paid' },
      { token: '/order', kind: 'command', label: 'Order' },
    ])
    const dictionary = runtime.getDictionary()
    assert.deepEqual(dictionary.map(entry => entry.token), ['/order', '#paid', '@buyer'])
    assert.equal(runtime.findByToken('@BUYER')?.sourcePath, 'https://catalog.example/buyer')
    assert.equal(runtime.getCommands()[0], dictionary[0])
    assert.equal(runtime.getSemantics()[0], dictionary[1])
    assert.equal(runtime.getBindings()[0], dictionary[2])
    assert.equal(builds, 3)
    reset()
    assert.deepEqual(runtime.getDictionary(), [])
    assert.equal(runtime.findByToken('/order'), null)
    assert.equal(runtime.findDictionaryByActionId('invoke:binding:@buyer'), null)
  } finally { reset() }
}
