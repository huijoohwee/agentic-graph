import assert from 'node:assert/strict'
import {
  buildCitySimAgentReadyToolContracts,
  CITY_SIM_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/citySimAgentReadyContract.mjs'
import {
  buildCitySimWebMcpToolBuilders,
} from '@/features/agent-ready/citySimWebMcpTools'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import {
  CITY_SIM_MCP_SCHEMA,
  CITY_SIM_WEB_MCP_TOOL_IDS,
} from '@/features/game-city-sim/citySimMcpContract.mjs'
import {
  controlLocalCitySim,
  inspectLocalCitySim,
} from '@/features/game-city-sim/citySimMcpRuntime'
import { serializeCityGridDocument } from '@/features/game-city-sim/citySimCodec'
import {
  readCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import { resetCitySimRuntimeForTests } from './citySimAuthoritativeSource'

const CITY_TOOL_IDS = [
  'inspect_local_city_sim',
  'control_local_city_sim',
] as const

const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
})

const MUTATION_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: false,
})

function buildCityContracts() {
  return buildCitySimAgentReadyToolContracts({
    buildWebName: (name: string) => `knowgrph.${name}`,
    readOnlyAnnotations: READ_ONLY_ANNOTATIONS,
    mutationAnnotations: MUTATION_ANNOTATIONS,
  })
}

export function testCitySimMcpPublishesExactlyTwoCanonicalTools() {
  assert.equal(CITY_SIM_MCP_SCHEMA, 'knowgrph-city-sim-mcp/v1')
  assert.deepEqual(CITY_SIM_WEB_MCP_TOOL_IDS, {
    inspect: CITY_TOOL_IDS[0],
    control: CITY_TOOL_IDS[1],
  })
  assert.deepEqual(CITY_SIM_AGENT_READY_TOOL_IDS, {
    inspectLocalCitySim: CITY_TOOL_IDS[0],
    controlLocalCitySim: CITY_TOOL_IDS[1],
  })
  assert.equal(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCitySim, CITY_TOOL_IDS[0])
  assert.equal(KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalCitySim, CITY_TOOL_IDS[1])

  const contracts = buildCityContracts()
  assert.equal(contracts.length, 2)
  assert.deepEqual(
    contracts.map(contract => contract.name),
    CITY_TOOL_IDS,
  )
  assert.deepEqual(
    contracts.map(contract => contract.webName),
    CITY_TOOL_IDS.map(name => `knowgrph.${name}`),
  )
  assert.deepEqual(contracts[0].annotations, READ_ONLY_ANNOTATIONS)
  assert.deepEqual(contracts[1].annotations, MUTATION_ANNOTATIONS)

  const catalog = buildKnowgrphAgentReadyToolContracts({
    defaultWorkspaceId: 'kgws:city-test',
    includeBrowserOnlyTools: true,
  })
  const registeredCityContracts = catalog.filter(contract =>
    CITY_TOOL_IDS.includes(contract.name as (typeof CITY_TOOL_IDS)[number]),
  )
  assert.equal(registeredCityContracts.length, 2)
  assert.deepEqual(
    registeredCityContracts.map(contract => contract.name),
    CITY_TOOL_IDS,
  )

  const contractByName = new Map(
    contracts.map(contract => [contract.name, contract]),
  )
  const builders = buildCitySimWebMcpToolBuilders(name => {
    const contract = contractByName.get(name)
    assert.ok(contract, `missing City WebMCP contract ${name}`)
    return contract as never
  })
  assert.deepEqual(Object.keys(builders), CITY_TOOL_IDS)
  assert.deepEqual(
    Object.values(builders).map(build => build().name),
    CITY_TOOL_IDS.map(name => `knowgrph.${name}`),
  )
}

export async function testCitySimMcpInspectIsPureAndReportsZeroCostRuntime() {
  resetCitySimRuntimeForTests({ webglSupported: true })
  const before = JSON.stringify(readCitySimSnapshot())
  const inspected = inspectLocalCitySim()
  assert.equal(JSON.stringify(readCitySimSnapshot()), before)
  assert.equal(inspected.schema, CITY_SIM_MCP_SCHEMA)
  assert.deepEqual(inspected.webMcpTools, {
    inspect: 'knowgrph.inspect_local_city_sim',
    control: 'knowgrph.control_local_city_sim',
  })
  assert.deepEqual(inspected.invocationGrammar.operations, [
    'open',
    'start',
    'stop',
    'restart',
    'zone',
    'advise',
    'save',
    'reset',
    'exit',
  ])
  assert.equal(inspected.snapshot, readCitySimSnapshot())
  assert.deepEqual(inspected.runtime, {
    simulationOwner: 'browser-local-city-runtime',
    modelCalls: 0,
    estimatedCostUsd: 0,
    networkRequired: false,
  })

  const contracts = buildCityContracts()
  const contractByName = new Map(
    contracts.map(contract => [contract.name, contract]),
  )
  const builders = buildCitySimWebMcpToolBuilders(name => {
    const contract = contractByName.get(name)
    assert.ok(contract)
    return contract as never
  })
  const inspectTool = builders[CITY_TOOL_IDS[0]]()
  const revisionBeforeExecute = readCitySimSnapshot().revision
  const toolResult = await inspectTool.execute({})
  assert.deepEqual(toolResult, inspectLocalCitySim())
  assert.equal(readCitySimSnapshot().revision, revisionBeforeExecute)

  const beforeRejectedInput = readCitySimSnapshot()
  const rejectedNative = await controlLocalCitySim({
    invocation: '/game.city @canvas #civic operation=unsupported',
  })
  assert.equal(rejectedNative.ok, false)
  assert.equal(rejectedNative.code, 'unsupported-operation')
  assert.equal(readCitySimSnapshot(), beforeRejectedInput)
  const rejectedStructured = await controlLocalCitySim({
    operation: 'zone',
    parcel: 'invalid',
    type: 'residential',
  })
  assert.equal(rejectedStructured.ok, false)
  assert.equal(rejectedStructured.code, 'invalid-parcel')
  assert.equal(readCitySimSnapshot(), beforeRejectedInput)

  resetCitySimRuntimeForTests({ webglSupported: true })
  const native = await controlLocalCitySim({
    invocation: '/game.city @canvas #civic operation=zone parcel=gardens-by-the-bay type=residential',
  })
  assert.equal(native.ok, true)
  const nativeCity = serializeCityGridDocument(readCitySimSnapshot().city)
  resetCitySimRuntimeForTests({ webglSupported: true })
  const structured = await controlLocalCitySim({
    operation: 'zone',
    parcel: 'gardens-by-the-bay',
    type: 'residential',
  })
  assert.equal(structured.ok, true)
  assert.equal(serializeCityGridDocument(readCitySimSnapshot().city), nativeCity)
}
