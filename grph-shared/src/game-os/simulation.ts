import { hashStringToIndex } from '../hash/stringHash.js'
import {
  canonicalGameOsString,
  cloneCanonicalGameOsValue,
  compareGameOsText,
  deepFreezeGameOsValue,
  gameOsDigest,
} from './canonical.js'
import {
  GAME_OS_WORLD_DEFINITION_SCHEMA,
  GAME_OS_WORLD_SCHEMA,
  GAME_OS_ZERO_COST_RECORD,
  GameOsError,
  type GameOsFaction,
  type GameOsOrder,
  type GameOsPersistentStrategyWorldDefinition,
  type GameOsStepResult,
  type GameOsTerritory,
  type GameOsUnit,
  type GameOsWorldState,
} from './types.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'

export const GAME_OS_MAX_FACTION_COUNT = 8

export const GAME_OS_WORLD_DEFINITION_LIMITS = Object.freeze({
  maxTerritoryCount: 64,
  maxFactionCount: GAME_OS_MAX_FACTION_COUNT,
  maxAggregateUnitCount: 128,
  maxObjectiveCount: 16,
  maxEconomicValue: 1_000_000,
  maxUnitStrength: 10_000,
})

const requiredIdentity = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch (error) {
    throw new GameOsError('input-invalid', error instanceof Error ? error.message : String(error), { field })
  }
}

export const normalizeGameOsWorldSeed = (value: unknown): string => {
  if (typeof value === 'string') return requiredIdentity(value, 'seed')
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  throw new GameOsError('input-invalid', 'seed must be a normalized string or safe integer.', { field: 'seed' })
}

const requiredSequence = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new GameOsError('order-sequence-invalid', 'Order sequence must be a positive integer.')
  }
  return value
}

const orderText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch (error) {
    throw new GameOsError('order-invalid', error instanceof Error ? error.message : String(error), { field })
  }
}

const definitionRecord = (value: unknown, keys: string[], field: string): Record<string, unknown> => {
  try { return exactRecord(value, keys, field) } catch (error) {
    throw new GameOsError('input-invalid', error instanceof Error ? error.message : String(error), { field })
  }
}

const definitionText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch (error) {
    throw new GameOsError('input-invalid', error instanceof Error ? error.message : String(error), { field })
  }
}

const definitionInteger = (value: unknown, field: string, minimum: number, maximum: number): number => {
  try { return exactSafeInteger(value, field, minimum, maximum) } catch (error) {
    throw new GameOsError('input-invalid', error instanceof Error ? error.message : String(error), { field })
  }
}

const uniqueDefinitionIdentities = (identities: string[], field: string): void => {
  if (new Set(identities).size !== identities.length) {
    throw new GameOsError('input-invalid', `${field} identities must be unique.`, { field })
  }
}

const uniqueWorldIdentities = (identities: string[], field: string): Set<string> => {
  const unique = new Set(identities)
  if (unique.size !== identities.length) throw new Error(`${field} contains duplicate identities`)
  return unique
}

export const normalizePersistentStrategyWorldDefinition = (
  value: GameOsPersistentStrategyWorldDefinition,
): GameOsPersistentStrategyWorldDefinition => {
  definitionRecord(value, ['schema', 'identity', 'map', 'factions', 'economy', 'objectives'], 'definition')
  if (value.schema !== GAME_OS_WORLD_DEFINITION_SCHEMA) {
    throw new GameOsError('input-invalid', 'Persistent strategy world definition schema is unsupported.')
  }
  definitionRecord(value.map, ['profile', 'topology', 'territoryCount'], 'definition.map')
  const identity = definitionText(value.identity, 'definition.identity')
  const profile = definitionText(value.map?.profile, 'definition.map.profile')
  if (value.map?.topology !== 'ring') {
    throw new GameOsError('input-invalid', 'Persistent strategy map topology must be ring.')
  }
  const territoryCount = definitionInteger(value.map.territoryCount, 'definition.map.territoryCount', 3,
    GAME_OS_WORLD_DEFINITION_LIMITS.maxTerritoryCount)
  if (!Array.isArray(value.factions) || value.factions.length < 2
    || value.factions.length > Math.min(territoryCount, GAME_OS_WORLD_DEFINITION_LIMITS.maxFactionCount)) {
    throw new GameOsError('input-invalid', 'Definition requires two or more factions with distinct home territories.')
  }
  const unitIdentities: string[] = []
  const factions = value.factions.map((faction, factionIndex) => {
    definitionRecord(faction, ['identity', 'startingSupply', 'startingUnits'], `definition.factions[${factionIndex}]`)
    const factionIdentity = definitionText(faction?.identity, `definition.factions[${factionIndex}].identity`)
    const startingSupply = definitionInteger(
      faction?.startingSupply,
      `definition.factions[${factionIndex}].startingSupply`,
      0,
      GAME_OS_WORLD_DEFINITION_LIMITS.maxEconomicValue,
    )
    if (!Array.isArray(faction?.startingUnits) || faction.startingUnits.length === 0) {
      throw new GameOsError('input-invalid', `Faction ${factionIdentity} requires at least one starting unit.`)
    }
    if (faction.startingUnits.length > GAME_OS_WORLD_DEFINITION_LIMITS.maxAggregateUnitCount
      || unitIdentities.length + faction.startingUnits.length
        > GAME_OS_WORLD_DEFINITION_LIMITS.maxAggregateUnitCount) {
      throw new GameOsError('input-invalid', 'Definition exceeds the aggregate starting-unit limit.')
    }
    const startingUnits = faction.startingUnits.map((unit, unitIndex) => {
      definitionRecord(unit, ['identity', 'strength'], `definition.factions[${factionIndex}].startingUnits[${unitIndex}]`)
      const unitIdentity = definitionText(
        unit?.identity,
        `definition.factions[${factionIndex}].startingUnits[${unitIndex}].identity`,
      )
      unitIdentities.push(unitIdentity)
      return {
        identity: unitIdentity,
        strength: definitionInteger(unit?.strength, `definition unit ${unitIdentity} strength`, 1,
          GAME_OS_WORLD_DEFINITION_LIMITS.maxUnitStrength),
      }
    }).sort((left, right) => compareGameOsText(left.identity, right.identity))
    return { identity: factionIdentity, startingSupply, startingUnits }
  }).sort((left, right) => compareGameOsText(left.identity, right.identity))
  uniqueDefinitionIdentities(factions.map(faction => faction.identity), 'definition.factions')
  uniqueDefinitionIdentities(unitIdentities, 'definition.startingUnits')
  definitionRecord(value.economy, ['claimSupplyCost', 'supplyAccrualPerOwnedTerritory'], 'definition.economy')
  const claimSupplyCost = definitionInteger(value.economy?.claimSupplyCost,
    'definition.economy.claimSupplyCost', 0, GAME_OS_WORLD_DEFINITION_LIMITS.maxEconomicValue)
  const supplyAccrualPerOwnedTerritory = definitionInteger(
    value.economy?.supplyAccrualPerOwnedTerritory,
    'definition.economy.supplyAccrualPerOwnedTerritory',
    0,
    GAME_OS_WORLD_DEFINITION_LIMITS.maxEconomicValue,
  )
  if (!Array.isArray(value.objectives) || value.objectives.length === 0
    || value.objectives.length > GAME_OS_WORLD_DEFINITION_LIMITS.maxObjectiveCount) {
    throw new GameOsError('input-invalid', 'Definition requires at least one scenario objective.')
  }
  const objectives = value.objectives.map((objective, index) => {
    definitionRecord(objective, ['identity', 'kind', 'targetTerritoryCount'], `definition.objectives[${index}]`)
    const objectiveIdentity = definitionText(objective?.identity, `definition.objectives[${index}].identity`)
    if (objective?.kind !== 'control-territories') {
      throw new GameOsError('input-invalid', `Objective ${objectiveIdentity} kind is unsupported.`)
    }
    const targetTerritoryCount = definitionInteger(
      objective.targetTerritoryCount,
      `definition objective ${objectiveIdentity} targetTerritoryCount`,
      1,
      territoryCount,
    )
    return { identity: objectiveIdentity, kind: 'control-territories' as const, targetTerritoryCount }
  }).sort((left, right) => compareGameOsText(left.identity, right.identity))
  uniqueDefinitionIdentities(objectives.map(objective => objective.identity), 'definition.objectives')
  return deepFreezeGameOsValue(cloneCanonicalGameOsValue({
    schema: GAME_OS_WORLD_DEFINITION_SCHEMA,
    identity,
    map: { profile, topology: 'ring', territoryCount },
    factions,
    economy: { claimSupplyCost, supplyAccrualPerOwnedTerritory },
    objectives,
  })) as GameOsPersistentStrategyWorldDefinition
}

export const DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION = normalizePersistentStrategyWorldDefinition({
  schema: GAME_OS_WORLD_DEFINITION_SCHEMA,
  identity: 'persistent-strategy-ring-six',
  map: { profile: 'neutral-ring', topology: 'ring', territoryCount: 6 },
  factions: [
    { identity: 'aurora', startingSupply: 3,
      startingUnits: [{ identity: 'unit-aurora-1', strength: 1 }] },
    { identity: 'ember', startingSupply: 3,
      startingUnits: [{ identity: 'unit-ember-1', strength: 1 }] },
  ],
  economy: { claimSupplyCost: 2, supplyAccrualPerOwnedTerritory: 1 },
  objectives: [{ identity: 'control-majority', kind: 'control-territories', targetTerritoryCount: 4 }],
})

export const assertGameOsWorldShape = (value: unknown, expectedWorldId: string): GameOsWorldState => {
  exactRecord(value, ['schema', 'definition', 'worldId', 'seed', 'tick', 'lastOrderSequence',
    'factions', 'territories', 'units'], 'world state')
  const state = cloneCanonicalGameOsValue(value) as unknown as GameOsWorldState
  if (state.schema !== GAME_OS_WORLD_SCHEMA) throw new Error('world schema is unsupported')
  const normalizedDefinition = normalizePersistentStrategyWorldDefinition(state.definition)
  if (canonicalGameOsString(state.definition) !== canonicalGameOsString(normalizedDefinition)) {
    throw new Error('world definition is not in canonical order')
  }
  state.definition = normalizedDefinition
  if (exactText(state.worldId, 'state.worldId') !== exactText(expectedWorldId, 'expectedWorldId')) {
    throw new Error('world identity mismatch')
  }
  exactText(state.seed, 'state.seed')
  exactSafeInteger(state.tick, 'state.tick', 0)
  exactSafeInteger(state.lastOrderSequence, 'state.lastOrderSequence', 0)
  const expectedFactionIds = state.definition.factions.map(faction => faction.identity)
  const expectedUnits = state.definition.factions.flatMap(faction => faction.startingUnits.map(unit => ({
    id: unit.identity,
    factionId: faction.identity,
    strength: unit.strength,
  })))
  if (!Array.isArray(state.factions) || state.factions.length !== expectedFactionIds.length
    || !Array.isArray(state.territories) || state.territories.length !== state.definition.map.territoryCount
    || !Array.isArray(state.units) || state.units.length !== expectedUnits.length) {
    throw new Error('world collections do not match the authoritative definition')
  }
  const factionIds = uniqueWorldIdentities(state.factions.map((faction, index) => {
    exactRecord(faction, ['id', 'supply'], `state.factions[${index}]`)
    exactSafeInteger(faction.supply, `state.factions[${index}].supply`, 0)
    const id = exactText(faction.id, `state.factions[${index}].id`)
    if (id !== expectedFactionIds[index]) throw new Error('state.factions is not in canonical definition order')
    return id
  }), 'state.factions')
  const territoryIds = uniqueWorldIdentities(state.territories.map((territory, index) => {
    exactRecord(territory, ['id', 'neighborIds', 'ownerFactionId'], `state.territories[${index}]`)
    if (!Array.isArray(territory.neighborIds)) throw new Error(`state.territories[${index}].neighborIds is invalid`)
    const id = exactText(territory.id, `state.territories[${index}].id`)
    if (id !== `territory-${index}`) throw new Error('state.territories is not in canonical map order')
    const count = state.definition.map.territoryCount
    const expectedNeighbors = [
      `territory-${(index + count - 1) % count}`,
      `territory-${(index + 1) % count}`,
    ].sort(compareGameOsText)
    const neighbors = territory.neighborIds.map((neighborId, neighborIndex) =>
      exactText(neighborId, `state.territories[${index}].neighborIds[${neighborIndex}]`))
    uniqueWorldIdentities(neighbors, `state.territories[${index}].neighborIds`)
    if (neighbors.length !== expectedNeighbors.length
      || neighbors.some((neighbor, offset) => neighbor !== expectedNeighbors[offset])) {
      throw new Error(`territory ${id} topology is not in canonical definition order`)
    }
    if (territory.ownerFactionId !== null) exactText(territory.ownerFactionId,
      `state.territories[${index}].ownerFactionId`)
    return id
  }), 'state.territories')
  const territoryById = new Map(state.territories.map(territory => [territory.id, territory]))
  for (const territory of state.territories) {
    if (territory.ownerFactionId !== null && !factionIds.has(territory.ownerFactionId)) {
      throw new Error(`territory ${territory.id} references an unknown owner`)
    }
    for (const neighborId of territory.neighborIds) {
      if (!territoryIds.has(neighborId)) throw new Error(`territory ${territory.id} has an unknown neighbor`)
      if (!territoryById.get(neighborId)!.neighborIds.includes(territory.id)) {
        throw new Error(`territory ${territory.id} has an asymmetric neighbor`)
      }
    }
  }
  uniqueWorldIdentities(state.units.map((unit, index) => {
    exactRecord(unit, ['id', 'factionId', 'territoryId', 'strength'], `state.units[${index}]`)
    const id = exactText(unit.id, `state.units[${index}].id`)
    const factionId = exactText(unit.factionId, `state.units[${index}].factionId`)
    const territoryId = exactText(unit.territoryId, `state.units[${index}].territoryId`)
    exactSafeInteger(unit.strength, `state.units[${index}].strength`, 1)
    const expected = expectedUnits[index]
    if (!expected || expected.id !== id || expected.factionId !== factionId || expected.strength !== unit.strength) {
      throw new Error(`unit ${id} is not in canonical definition order`)
    }
    if (!factionIds.has(factionId)) throw new Error(`unit ${id} references an unknown faction`)
    if (!territoryIds.has(territoryId)) throw new Error(`unit ${id} references an unknown territory`)
    return id
  }), 'state.units')
  return deepFreezeGameOsValue(state) as GameOsWorldState
}

const normalizeOrder = (order: unknown): GameOsOrder => {
  if (!order || typeof order !== 'object') {
    throw new GameOsError('order-invalid', 'Order must be an object.')
  }
  const candidate = order as Record<string, unknown>
  const keys = candidate.type === 'move-unit'
    ? ['type', 'sequence', 'factionId', 'unitId', 'targetTerritoryId']
    : ['type', 'sequence', 'factionId', 'unitId', 'territoryId']
  try { exactRecord(candidate, keys, 'order') } catch (error) {
    throw new GameOsError('order-invalid', error instanceof Error ? error.message : String(error))
  }
  const sequence = requiredSequence(candidate.sequence)
  const factionId = orderText(candidate.factionId, 'factionId')
  const unitId = orderText(candidate.unitId, 'unitId')
  if (candidate.type === 'move-unit') {
    return {
      type: 'move-unit',
      sequence,
      factionId,
      unitId,
      targetTerritoryId: orderText(candidate.targetTerritoryId, 'targetTerritoryId'),
    }
  }
  if (candidate.type === 'claim-territory') {
    return {
      type: 'claim-territory',
      sequence,
      factionId,
      unitId,
      territoryId: orderText(candidate.territoryId, 'territoryId'),
    }
  }
  throw new GameOsError('order-invalid', 'Order type is not declared by this world.', {
    type: typeof candidate.type === 'string' ? candidate.type : '',
  })
}

const validateSequence = (lastOrderSequence: number, orders: GameOsOrder[]): void => {
  try { exactSafeInteger(lastOrderSequence, 'lastOrderSequence', 0) } catch {
    throw new GameOsError('order-sequence-invalid', 'Last order sequence must be a non-negative safe integer.')
  }
  if (orders.length > 0 && lastOrderSequence === Number.MAX_SAFE_INTEGER) {
    throw new GameOsError('order-sequence-invalid', 'Order sequence space is exhausted.')
  }
  let expected = lastOrderSequence + 1
  for (const order of orders) {
    if (order.sequence !== expected) {
      throw new GameOsError(
        'order-sequence-invalid',
        `Expected order sequence ${expected}, received ${order.sequence}.`,
        { expected, received: order.sequence },
      )
    }
    if (expected === Number.MAX_SAFE_INTEGER && order !== orders.at(-1)) {
      throw new GameOsError('order-sequence-invalid', 'Order sequence space is exhausted.')
    }
    expected += 1
  }
}

export const normalizePersistentStrategyOrders = (
  inputOrders: readonly GameOsOrder[],
  lastOrderSequence: number,
): GameOsOrder[] => {
  if (!Array.isArray(inputOrders)) throw new GameOsError('order-invalid', 'Orders must be an array.')
  const orders = inputOrders.map(normalizeOrder).sort((left, right) => left.sequence - right.sequence)
  validateSequence(lastOrderSequence, orders)
  return deepFreezeGameOsValue(cloneCanonicalGameOsValue(orders)) as GameOsOrder[]
}

const requireFaction = (state: GameOsWorldState, factionId: string): GameOsFaction => {
  const faction = state.factions.find(candidate => candidate.id === factionId)
  if (!faction) throw new GameOsError('order-invalid', `Faction ${factionId} is not in this world.`)
  return faction
}

const requireUnit = (state: GameOsWorldState, order: GameOsOrder): GameOsUnit => {
  const unit = state.units.find(candidate => candidate.id === order.unitId)
  if (!unit || unit.factionId !== order.factionId) {
    throw new GameOsError('order-invalid', `Unit ${order.unitId} is not controlled by ${order.factionId}.`)
  }
  return unit
}

const requireTerritory = (state: GameOsWorldState, territoryId: string): GameOsTerritory => {
  const territory = state.territories.find(candidate => candidate.id === territoryId)
  if (!territory) {
    throw new GameOsError('order-invalid', `Territory ${territoryId} is not in this world.`)
  }
  return territory
}

const applyMoveOrder = (state: GameOsWorldState, order: Extract<GameOsOrder, { type: 'move-unit' }>): void => {
  requireFaction(state, order.factionId)
  const unit = requireUnit(state, order)
  const current = requireTerritory(state, unit.territoryId)
  requireTerritory(state, order.targetTerritoryId)
  if (!current.neighborIds.includes(order.targetTerritoryId)) {
    throw new GameOsError('order-invalid', 'A unit may move only to a neighboring territory.', {
      unitId: unit.id,
      from: current.id,
      to: order.targetTerritoryId,
    })
  }
  unit.territoryId = order.targetTerritoryId
}

const applyClaimOrder = (
  state: GameOsWorldState,
  order: Extract<GameOsOrder, { type: 'claim-territory' }>,
): void => {
  const faction = requireFaction(state, order.factionId)
  const unit = requireUnit(state, order)
  const territory = requireTerritory(state, order.territoryId)
  if (unit.territoryId !== territory.id) {
    throw new GameOsError('order-invalid', 'A territory may be claimed only by a unit occupying it.', {
      unitId: unit.id,
      territoryId: territory.id,
    })
  }
  if (territory.ownerFactionId === faction.id) {
    throw new GameOsError('order-invalid', `${faction.id} already owns ${territory.id}.`)
  }
  const claimSupplyCost = state.definition.economy.claimSupplyCost
  if (faction.supply < claimSupplyCost) {
    throw new GameOsError('order-invalid', `${faction.id} lacks supply for a territory claim.`)
  }
  faction.supply -= claimSupplyCost
  territory.ownerFactionId = faction.id
}

const checkedWorldArithmetic = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GameOsError('input-invalid', `${field} exceeds deterministic safe-integer bounds.`, { field })
  }
  return value
}

const accrueSupply = (state: GameOsWorldState): void => {
  const accrual = state.definition.economy.supplyAccrualPerOwnedTerritory
  for (const faction of state.factions) {
    const ownedTerritories = state.territories.filter(territory => territory.ownerFactionId === faction.id).length
    const gainedSupply = checkedWorldArithmetic(ownedTerritories * accrual, `${faction.id}.supplyAccrual`)
    faction.supply = checkedWorldArithmetic(faction.supply + gainedSupply, `${faction.id}.supply`)
  }
}

export const createPersistentStrategyWorld = (args: {
  worldId: string
  seed: string | number
  definition?: GameOsPersistentStrategyWorldDefinition
}): GameOsWorldState => {
  const worldId = requiredIdentity(args.worldId, 'worldId')
  const seed = normalizeGameOsWorldSeed(args.seed)
  const definition = normalizePersistentStrategyWorldDefinition(
    args.definition ?? DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
  )
  const territoryCount = definition.map.territoryCount
  const homeOffset = hashStringToIndex(seed, Math.max(1, Math.floor(territoryCount / definition.factions.length)))
  const homes = definition.factions.map((_, index) =>
    (homeOffset + Math.floor(index * territoryCount / definition.factions.length)) % territoryCount)
  const factions: GameOsFaction[] = definition.factions.map(faction => ({
    id: faction.identity,
    supply: faction.startingSupply,
  }))
  const territories: GameOsTerritory[] = Array.from({ length: territoryCount }, (_, index) => ({
    id: `territory-${index}`,
    neighborIds: [
      `territory-${(index + territoryCount - 1) % territoryCount}`,
      `territory-${(index + 1) % territoryCount}`,
    ].sort(compareGameOsText),
    ownerFactionId: factions[homes.indexOf(index)]?.id ?? null,
  }))
  const units: GameOsUnit[] = definition.factions.flatMap((faction, factionIndex) =>
    faction.startingUnits.map(unit => ({
      id: unit.identity,
      factionId: faction.identity,
      territoryId: `territory-${homes[factionIndex]}`,
      strength: unit.strength,
    })))
  const state = cloneCanonicalGameOsValue<GameOsWorldState>({
    schema: GAME_OS_WORLD_SCHEMA,
    definition,
    worldId,
    seed,
    tick: 0,
    lastOrderSequence: 0,
    factions,
    territories,
    units,
  })
  return deepFreezeGameOsValue(state) as GameOsWorldState
}

export const advancePersistentStrategyWorld = (
  current: GameOsWorldState,
  inputOrders: readonly GameOsOrder[],
): GameOsStepResult => {
  let validatedState: GameOsWorldState
  try {
    const worldId = exactText((current as unknown as Record<string, unknown>)?.worldId, 'current.worldId')
    validatedState = assertGameOsWorldShape(current, worldId)
  } catch (error) {
    throw new GameOsError('input-invalid', 'World state is not a canonical authoritative state.', {
      field: 'current',
      reason: error instanceof Error ? error.message : String(error),
    })
  }
  const state = cloneCanonicalGameOsValue<GameOsWorldState>(validatedState)
  const nextTick = checkedWorldArithmetic(state.tick + 1, 'tick')
  const orders = normalizePersistentStrategyOrders(inputOrders, state.lastOrderSequence)
  for (const order of orders) {
    if (order.type === 'move-unit') applyMoveOrder(state, order)
    else applyClaimOrder(state, order)
    state.lastOrderSequence = order.sequence
  }
  accrueSupply(state)
  state.tick = nextTick
  const canonicalState = canonicalGameOsString(state)
  const frozenState = deepFreezeGameOsValue(state) as GameOsWorldState
  return Object.freeze({
    state: frozenState,
    stateDigest: gameOsDigest(frozenState),
    canonicalState,
    acceptedOrders: deepFreezeGameOsValue(cloneCanonicalGameOsValue(orders)) as GameOsOrder[],
    costRecords: [GAME_OS_ZERO_COST_RECORD] as const,
  })
}
