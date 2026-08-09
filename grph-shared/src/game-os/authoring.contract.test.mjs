import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  GameOsError,
  GameOsModeRegistry,
  createGameOsAuthoringCostStatus,
  createGameOsAuthoringAssistHarness,
  readGameOsStatus,
} from '../../dist/game-os/index.js'

const REQUEST = Object.freeze({
  intent: 'Create a persistent strategy world',
  constraints: ['offline-first'],
  seedProfile: 'ring-six',
})

const authoringCost = (model, promptTokens = 1, completionTokens = 1) => ({
  model,
  prompt_tokens: promptTokens,
  completion_tokens: completionTokens,
  cache_hits: 0,
  estimated_cost_usd: 0.001,
  incomplete: false,
})

const assertGameOsError = (error, code) => {
  assert.ok(error instanceof GameOsError)
  assert.equal(error.code, code)
  return true
}

describe('Game OS authoring evidence contract', () => {
  test('passes immutable per-call caps before spend and observes each iteration immediately', async () => {
    const events = []
    const budgets = []
    const observations = []
    const saved = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: {
        modelId: 'local-small',
        async generate({ runId, iteration, tokenBudget }) {
          events.push(`generate:${iteration}`)
          assert.equal(runId, 'run-caps')
          assert.ok(Object.isFrozen(tokenBudget))
          budgets.push(tokenBudget)
          return {
            definition: { iteration, ready: iteration === 2 },
            costRecord: authoringCost('local-small', iteration === 1 ? 10 : 20,
              iteration === 1 ? 5 : 10),
          }
        },
      },
      validateDefinition: definition => definition.ready
        ? { valid: true, issues: [] }
        : { valid: false, issues: ['world is not ready'] },
      worldDefinitionStore: { save: record => { saved.push(record) } },
      costObserver: { observe: observation => {
        events.push(`observe:${observation.iteration}`)
        observations.push(observation)
      } },
      maxIterations: 3,
      maxTotalTokens: 100,
      maxPromptTokensPerCall: 40,
      maxCompletionTokensPerCall: 20,
      runIdFactory: () => 'run-caps',
    })

    const result = await harness.draft(REQUEST)

    assert.deepEqual(events, ['generate:1', 'observe:1', 'generate:2', 'observe:2'])
    assert.deepEqual(budgets, [
      { maxPromptTokens: 40, maxCompletionTokens: 20, remainingTotalTokens: 100 },
      { maxPromptTokens: 40, maxCompletionTokens: 20, remainingTotalTokens: 85 },
    ])
    assert.deepEqual(observations.map(({ runId, iteration, idempotencyKey }) =>
      ({ runId, iteration, idempotencyKey })), [
      { runId: 'run-caps', iteration: 1, idempotencyKey: 'run-caps:1' },
      { runId: 'run-caps', iteration: 2, idempotencyKey: 'run-caps:2' },
    ])
    assert.equal(result.runId, 'run-caps')
    assert.deepEqual(result.delivery, {
      worldDefinition: 'persisted', costEvidence: 'observed', gaps: [],
    })
    assert.deepEqual(saved.map(record => ({ disposition: record.disposition,
      valid: record.valid, requiresOperatorReview: record.requiresOperatorReview })), [
      { disposition: 'candidate-only', valid: true, requiresOperatorReview: true },
    ])
  })

  test('reports observer failures as gaps without hiding the valid candidate', async () => {
    const saved = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'observer-model', async generate() { return {
        definition: { ready: true }, costRecord: authoringCost('observer-model'),
      } } },
      validateDefinition: () => ({ valid: true, issues: [] }),
      worldDefinitionStore: { save: record => { saved.push(record) } },
      costObserver: { observe() { throw new Error('observer-down') } },
      maxTotalTokens: 20,
      runIdFactory: () => 'run-observer',
    })

    const result = await harness.draft(REQUEST)

    assert.equal(result.validationReport.valid, true)
    assert.deepEqual(result.definition, { ready: true })
    assert.deepEqual(result.delivery, {
      worldDefinition: 'persisted',
      costEvidence: 'gap',
      gaps: ['cost-observer-failed:run-observer:1:observer-down'],
    })
    assert.equal(saved.length, 1)
    const status = await readGameOsStatus({ view: 'cost_summary', worldId: 'status-world',
      registry: new GameOsModeRegistry(), store: { get: async () => null },
      authoringCostStatus: harness.readCostStatus })
    assert.deepEqual(status.entries, [{ schema: 'knowgrph.game-os-authoring-cost-status/v1',
      source: 'authoring', runId: 'run-observer', attemptedCostRecordCount: 1,
      observedCostRecordCount: 0, costEvidence: 'gap',
      costRecords: [authoringCost('observer-model')],
      gaps: ['cost-observer-failed:run-observer:1:observer-down'] }])
    assert.deepEqual(status.unavailableSources, ['world:status-world'])
  })

  test('rejects cost status that hides missing observation or incomplete evidence', () => {
    const costRecords = [authoringCost('status-model')]
    assert.throws(() => createGameOsAuthoringCostStatus({ runId: 'zero', attempted: 0,
      observed: 0, costEvidence: 'observed', costRecords: [], gaps: [] }))
    assert.throws(() => createGameOsAuthoringCostStatus({ runId: 'missing', attempted: 1,
      observed: 0, costEvidence: 'observed', costRecords, gaps: [] }))
    assert.throws(() => createGameOsAuthoringCostStatus({ runId: 'incomplete', attempted: 1,
      observed: 1, costEvidence: 'observed',
      costRecords: [{ ...costRecords[0], incomplete: true }], gaps: [] }))
  })

  test('rejects an over-cap report after observing it and quarantines the partial', async () => {
    const observations = []
    const saved = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'capped-model', async generate({ tokenBudget }) {
        assert.deepEqual(tokenBudget, {
          maxPromptTokens: 5, maxCompletionTokens: 5, remainingTotalTokens: 20,
        })
        return { definition: { ready: true }, costRecord: authoringCost('capped-model', 6, 1) }
      } },
      validateDefinition: () => ({ valid: true, issues: [] }),
      worldDefinitionStore: { save: record => { saved.push(record) } },
      costObserver: { observe: observation => { observations.push(observation) } },
      maxTotalTokens: 20,
      maxPromptTokensPerCall: 5,
      maxCompletionTokensPerCall: 5,
      runIdFactory: () => 'run-over-cap',
    })

    await assert.rejects(() => harness.draft(REQUEST), error => {
      assertGameOsError(error, 'authoring-budget-exceeded')
      assert.equal(error.details.fallbackCode, 'budget-exceeded')
      assert.deepEqual(error.details.lastPartialDefinition, { ready: true })
      assert.deepEqual(error.details.delivery, {
        worldDefinition: 'gap', costEvidence: 'observed',
        gaps: ['world-definition-validation-failed'],
      })
      return true
    })
    assert.deepEqual(observations.map(observation => observation.idempotencyKey), ['run-over-cap:1'])
    assert.equal(saved.length, 0)
  })

  test('turns malformed cost evidence into a typed failure and preserves safe billed fields', async () => {
    const observations = []
    const saved = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'evidence-model', async generate() { return {
        definition: { ready: true },
        costRecord: { ...authoringCost('evidence-model', 4, 2), prompt_tokens: '4' },
      } } },
      validateDefinition: () => ({ valid: true, issues: [] }),
      worldDefinitionStore: { save: record => { saved.push(record) } },
      costObserver: { observe: observation => { observations.push(observation) } },
      maxTotalTokens: 20,
      runIdFactory: () => 'run-bad-cost',
    })

    await assert.rejects(() => harness.draft(REQUEST), error => {
      assertGameOsError(error, 'authoring-invalid')
      assert.equal(error.details.fallbackCode, 'cost-evidence-invalid')
      assert.deepEqual(error.details.lastPartialDefinition, { ready: true })
      assert.equal(error.details.costRecords[0].incomplete, true)
      assert.equal(error.details.costRecords[0].completion_tokens, 2)
      assert.deepEqual(error.details.delivery, {
        worldDefinition: 'gap', costEvidence: 'gap',
        gaps: ['world-definition-validation-failed', 'cost-record-incomplete:run-bad-cost:1'],
      })
      return true
    })
    assert.deepEqual(observations.map(observation => ({
      idempotencyKey: observation.idempotencyKey,
      promptTokens: observation.costRecord.prompt_tokens,
      completionTokens: observation.costRecord.completion_tokens,
      incomplete: observation.costRecord.incomplete,
    })), [{ idempotencyKey: 'run-bad-cost:1', promptTokens: 0,
      completionTokens: 2, incomplete: true }])
    assert.equal(saved.length, 0)
  })

  test('preserves both billed iterations and the prior canonical partial on noncanonical output', async () => {
    const observations = []
    const saved = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'definition-model', async generate({ iteration }) { return {
        definition: iteration === 1 ? { iteration, ready: false } : { iteration, invalid: undefined },
        costRecord: authoringCost('definition-model', iteration, iteration),
      } } },
      validateDefinition: () => ({ valid: false, issues: ['world is not ready'] }),
      worldDefinitionStore: { save: record => { saved.push(record) } },
      costObserver: { observe: observation => { observations.push(observation) } },
      maxTotalTokens: 20,
      runIdFactory: () => 'run-bad-definition',
    })

    await assert.rejects(() => harness.draft(REQUEST), error => {
      assertGameOsError(error, 'authoring-invalid')
      assert.equal(error.details.fallbackCode, 'definition-invalid')
      assert.deepEqual(error.details.lastPartialDefinition, { iteration: 1, ready: false })
      assert.equal(error.details.costRecords.length, 2)
      assert.deepEqual(error.details.delivery, {
        worldDefinition: 'gap', costEvidence: 'observed',
        gaps: ['world-definition-validation-failed'],
      })
      return true
    })
    assert.deepEqual(observations.map(observation => observation.idempotencyKey), [
      'run-bad-definition:1', 'run-bad-definition:2',
    ])
    assert.equal(saved.length, 0)
  })

  test('turns throwing or malformed validators into typed quarantined candidates', async () => {
    const validators = [
      () => { throw new Error('validator-boom') },
      () => ({ valid: 'yes', issues: [] }),
    ]
    for (const [index, validateDefinition] of validators.entries()) {
      const observations = []
      const saved = []
      const runId = `run-validator-${index + 1}`
      const harness = createGameOsAuthoringAssistHarness({
        transport: { modelId: 'validator-model', async generate() { return {
          definition: { canonical: true }, costRecord: authoringCost('validator-model'),
        } } },
        validateDefinition,
        worldDefinitionStore: { save: record => { saved.push(record) } },
        costObserver: { observe: observation => { observations.push(observation) } },
        maxTotalTokens: 20,
        runIdFactory: () => runId,
      })

      await assert.rejects(() => harness.draft(REQUEST), error => {
        assertGameOsError(error, 'authoring-invalid')
        assert.equal(error.details.fallbackCode, 'validator-invalid')
        assert.deepEqual(error.details.lastPartialDefinition, { canonical: true })
        assert.deepEqual(error.details.delivery, {
          worldDefinition: 'gap', costEvidence: 'observed',
          gaps: ['world-definition-validation-failed'],
        })
        return true
      })
      assert.deepEqual(observations.map(observation => observation.idempotencyKey), [`${runId}:1`])
      assert.equal(saved.length, 0)
    }
  })

  test('observes an incomplete transport iteration before returning the typed failure', async () => {
    const observations = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'failed-model', async generate() { throw new Error('offline') } },
      validateDefinition: () => ({ valid: true, issues: [] }),
      costObserver: { observe: observation => { observations.push(observation) } },
      maxTotalTokens: 20,
      runIdFactory: () => 'run-transport-failure',
    })

    await assert.rejects(() => harness.draft(REQUEST), error => {
      assertGameOsError(error, 'authoring-invalid')
      assert.equal(error.details.fallbackCode, 'transport-failure')
      assert.deepEqual(error.details.delivery.gaps, [
        'world-definition-candidate-unavailable',
        'cost-record-incomplete:run-transport-failure:1',
      ])
      return true
    })
    assert.deepEqual(observations.map(observation => ({
      idempotencyKey: observation.idempotencyKey,
      incomplete: observation.costRecord.incomplete,
    })), [{ idempotencyKey: 'run-transport-failure:1', incomplete: true }])
  })

  test('rejects non-exact or non-plain requests before any provider spend', async () => {
    let generateCalls = 0
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'request-model', async generate() {
        generateCalls += 1
        return { definition: { ready: true }, costRecord: authoringCost('request-model') }
      } },
      validateDefinition: () => ({ valid: true, issues: [] }),
      maxTotalTokens: 20,
    })
    const invalidRequests = [
      { ...REQUEST, extra: true },
      Object.assign(Object.create({ inherited: true }), REQUEST),
      Object.assign({ ...REQUEST }, { [Symbol('extra')]: true }),
    ]

    for (const request of invalidRequests) {
      await assert.rejects(() => harness.draft(request), error =>
        assertGameOsError(error, 'authoring-invalid'))
    }
    assert.equal(generateCalls, 0)
    assert.equal(harness.inspect().runId, null)
  })

  test('fails after one incomplete cost record because the remaining session budget is unknowable', async () => {
    let generateCalls = 0
    let validationCalls = 0
    const observations = []
    const saved = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'incomplete-model', async generate() {
        generateCalls += 1
        return {
          definition: { iteration: generateCalls, ready: false },
          costRecord: { ...authoringCost('incomplete-model', 0, 0), incomplete: true },
        }
      } },
      validateDefinition: () => {
        validationCalls += 1
        return { valid: false, issues: ['not ready'] }
      },
      worldDefinitionStore: { save: record => { saved.push(record) } },
      costObserver: { observe: observation => { observations.push(observation) } },
      maxIterations: 3,
      maxTotalTokens: 1,
      maxPromptTokensPerCall: 1,
      maxCompletionTokensPerCall: 1,
      runIdFactory: () => 'run-incomplete',
    })

    await assert.rejects(() => harness.draft(REQUEST), error => {
      assertGameOsError(error, 'authoring-invalid')
      assert.equal(error.details.fallbackCode, 'cost-evidence-invalid')
      assert.equal(error.details.iteration, 1)
      assert.deepEqual(error.details.lastPartialDefinition, { iteration: 1, ready: false })
      assert.deepEqual(error.details.delivery, {
        worldDefinition: 'gap',
        costEvidence: 'gap',
        gaps: [
          'world-definition-validation-failed',
          'cost-record-incomplete:run-incomplete:1',
        ],
      })
      return true
    })
    assert.equal(generateCalls, 1)
    assert.equal(validationCalls, 0)
    assert.deepEqual(observations.map(observation => observation.idempotencyKey), ['run-incomplete:1'])
    assert.equal(saved.length, 0)
  })

  test('returns validation exhaustion only as typed circuit failures with quarantined partials', async () => {
    const scenarios = [
      {
        runId: 'run-schema-circuit',
        fallbackCode: 'schema-circuit-breaker',
        validateDefinition: () => ({ valid: false, issues: ['unchanged'] }),
        schemaCircuitTripped: true,
      },
      {
        runId: 'run-iteration-limit',
        fallbackCode: 'iteration-limit',
        validateDefinition: definition => ({ valid: false,
          issues: Array.from({ length: 4 - definition.iteration }, (_, index) => `issue-${index}`) }),
        schemaCircuitTripped: false,
      },
    ]

    for (const scenario of scenarios) {
      let generateCalls = 0
      const saved = []
      const harness = createGameOsAuthoringAssistHarness({
        transport: { modelId: 'circuit-model', async generate({ iteration }) {
          generateCalls += 1
          return { definition: { iteration }, costRecord: authoringCost('circuit-model') }
        } },
        validateDefinition: scenario.validateDefinition,
        worldDefinitionStore: { save: record => { saved.push(record) } },
        costObserver: { observe() {} },
        maxIterations: 3,
        maxTotalTokens: 20,
        runIdFactory: () => scenario.runId,
      })

      await assert.rejects(() => harness.draft(REQUEST), error => {
        assertGameOsError(error, 'authoring-circuit-open')
        assert.equal(error.details.fallbackCode, scenario.fallbackCode)
        assert.equal(error.details.iteration, 3)
        assert.deepEqual(error.details.lastPartialDefinition, { iteration: 3 })
        assert.deepEqual(error.details.delivery, {
          worldDefinition: 'gap', costEvidence: 'observed',
          gaps: ['world-definition-validation-failed'],
        })
        return true
      })
      assert.equal(generateCalls, 3)
      assert.equal(harness.inspect().schemaCircuitTripped, scenario.schemaCircuitTripped)
      assert.equal(saved.length, 0)
    }
  })
})
