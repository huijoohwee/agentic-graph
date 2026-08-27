import Foundation
public let gameOsPersistentStrategyWorldSchema = "knowgrph.game-os-world/v1"
public let gameOsPersistentStrategyWorldDefinitionSchema = "knowgrph.game-os-world-definition/v1"
private let gameOsMaximumSafeInteger = 9_007_199_254_740_991

public enum GameOsPersistentStrategyError: Error, Equatable, Sendable {
    case invalidInput(String)
    case invalidOrder(String)
    case invalidOrderSequence(expected: Int, received: Int)
}
public struct GameOsPersistentStrategyCostRecord: Codable, Equatable, Sendable {
    public let model: String?
    public let promptTokens, completionTokens, cacheHits: Int
    public let estimatedCostUsd: Double
    public let incomplete: Bool
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case model, incomplete
        case promptTokens = "prompt_tokens"
        case completionTokens = "completion_tokens"
        case cacheHits = "cache_hits"
        case estimatedCostUsd = "estimated_cost_usd"
    }
    public static let zero = Self(canonical: ())
    private init(canonical: Void) {
        model = nil; promptTokens = 0; completionTokens = 0; cacheHits = 0
        estimatedCostUsd = 0; incomplete = false
    }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: CodingKeys.self, from: decoder, typeName: "cost record")
        guard values.contains(.model), try values.decodeIfPresent(String.self, forKey: .model) == nil,
              try values.decode(Int.self, forKey: .promptTokens) == 0,
              try values.decode(Int.self, forKey: .completionTokens) == 0,
              try values.decode(Int.self, forKey: .cacheHits) == 0,
              try values.decode(Double.self, forKey: .estimatedCostUsd) == 0,
              try values.decode(Bool.self, forKey: .incomplete) == false else {
            throw GameOsPersistentStrategyError.invalidInput("Cost record must be canonical zero cost.")
        }
        self.init(canonical: ())
    }
    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeNil(forKey: .model); try values.encode(0, forKey: .promptTokens)
        try values.encode(0, forKey: .completionTokens); try values.encode(0, forKey: .cacheHits)
        try values.encode(0, forKey: .estimatedCostUsd); try values.encode(false, forKey: .incomplete)
    }
}
public let gameOsPersistentStrategyZeroCostRecord = GameOsPersistentStrategyCostRecord.zero
private func gameOsStrictContainer<Key>(keyedBy type: Key.Type, from decoder: Decoder, typeName: String)
throws -> KeyedDecodingContainer<Key> where Key: CodingKey & CaseIterable {
    try rejectUnknownCodingKeys(in: decoder, allowedKeys: Set(Key.allCases.map { $0.stringValue }),
                                typeName: typeName)
    return try decoder.container(keyedBy: type)
}
private func requireGameOsText(_ value: String, field: String) throws -> String {
    let trim = { (unit: UInt16) -> Bool in
        switch unit {
        case 0x0009...0x000D, 0x0020, 0x00A0, 0x1680, 0x2000...0x200A,
             0x2028...0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }
    guard let first = value.utf16.first, let last = value.utf16.last, !trim(first), !trim(last) else {
        throw GameOsPersistentStrategyError.invalidInput("\(field) must be a non-empty normalized string.")
    }
    return value
}
private func requireGameOsInteger(_ value: Int, field: String, range: ClosedRange<Int>) throws -> Int {
    guard range.contains(value), value <= gameOsMaximumSafeInteger else {
        throw GameOsPersistentStrategyError.invalidInput("\(field) is outside deterministic safe-integer bounds.")
    }
    return value
}
private func gameOsTextPrecedes(_ left: String, _ right: String) -> Bool {
    left.utf16.lexicographicallyPrecedes(right.utf16)
}

public struct GameOsPersistentStrategyMapDefinition: Codable, Equatable, Sendable {
    public let profile: String
    public let topology: String
    public let territoryCount: Int
    public init(profile: String, topology: String, territoryCount: Int) {
        self.profile = profile; self.topology = topology; self.territoryCount = territoryCount
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable { case profile, topology, territoryCount }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "map")
        self.init(profile: try values.decode(String.self, forKey: .profile), topology: try values.decode(String.self,
            forKey: .topology), territoryCount: try values.decode(Int.self, forKey: .territoryCount))
    }
}

public struct GameOsPersistentStrategyStartingUnit: Codable, Equatable, Sendable {
    public let identity: String
    public let strength: Int
    public init(identity: String, strength: Int) {
        self.identity = identity; self.strength = strength
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable { case identity, strength }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "starting unit")
        self.init(identity: try values.decode(String.self, forKey: .identity), strength: try values.decode(Int.self,
            forKey: .strength))
    }
}

public struct GameOsPersistentStrategyFactionDefinition: Codable, Equatable, Sendable {
    public let identity: String
    public let startingSupply: Int
    public let startingUnits: [GameOsPersistentStrategyStartingUnit]
    public init(identity: String, startingSupply: Int, startingUnits: [GameOsPersistentStrategyStartingUnit]) {
        self.identity = identity; self.startingSupply = startingSupply; self.startingUnits = startingUnits
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable { case identity, startingSupply, startingUnits }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "faction definition")
        self.init(identity: try values.decode(String.self, forKey: .identity), startingSupply: try values.decode(Int.self,
            forKey: .startingSupply), startingUnits: try values.decode([GameOsPersistentStrategyStartingUnit].self,
            forKey: .startingUnits))
    }
}

public struct GameOsPersistentStrategyEconomyDefinition: Codable, Equatable, Sendable {
    public let claimSupplyCost: Int
    public let supplyAccrualPerOwnedTerritory: Int
    public init(claimSupplyCost: Int, supplyAccrualPerOwnedTerritory: Int) {
        self.claimSupplyCost = claimSupplyCost; self.supplyAccrualPerOwnedTerritory = supplyAccrualPerOwnedTerritory
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable {
        case claimSupplyCost, supplyAccrualPerOwnedTerritory
    }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "economy definition")
        self.init(claimSupplyCost: try values.decode(Int.self, forKey: .claimSupplyCost),
            supplyAccrualPerOwnedTerritory: try values.decode(Int.self, forKey: .supplyAccrualPerOwnedTerritory))
    }
}

public struct GameOsPersistentStrategyObjectiveDefinition: Codable, Equatable, Sendable {
    public let identity: String
    public let kind: String
    public let targetTerritoryCount: Int
    public init(identity: String, kind: String, targetTerritoryCount: Int) {
        self.identity = identity; self.kind = kind; self.targetTerritoryCount = targetTerritoryCount
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable { case identity, kind, targetTerritoryCount }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "objective definition")
        self.init(identity: try values.decode(String.self, forKey: .identity), kind: try values.decode(String.self,
            forKey: .kind), targetTerritoryCount: try values.decode(Int.self, forKey: .targetTerritoryCount))
    }
}

public struct GameOsPersistentStrategyWorldDefinition: Codable, Equatable, Sendable {
    public let schema: String
    public let identity: String
    public let map: GameOsPersistentStrategyMapDefinition
    public let factions: [GameOsPersistentStrategyFactionDefinition]
    public let economy: GameOsPersistentStrategyEconomyDefinition
    public let objectives: [GameOsPersistentStrategyObjectiveDefinition]
    public init(schema: String = gameOsPersistentStrategyWorldDefinitionSchema, identity: String,
                map: GameOsPersistentStrategyMapDefinition, factions: [GameOsPersistentStrategyFactionDefinition],
                economy: GameOsPersistentStrategyEconomyDefinition,
                objectives: [GameOsPersistentStrategyObjectiveDefinition]) {
        self.schema = schema; self.identity = identity; self.map = map; self.factions = factions
        self.economy = economy; self.objectives = objectives
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable {
        case schema, identity, map, factions, economy, objectives
    }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "world definition")
        self.init(schema: try values.decode(String.self, forKey: .schema), identity: try values.decode(String.self,
            forKey: .identity), map: try values.decode(GameOsPersistentStrategyMapDefinition.self, forKey: .map),
            factions: try values.decode([GameOsPersistentStrategyFactionDefinition].self, forKey: .factions),
            economy: try values.decode(GameOsPersistentStrategyEconomyDefinition.self, forKey: .economy),
            objectives: try values.decode([GameOsPersistentStrategyObjectiveDefinition].self, forKey: .objectives))
    }
}

public struct GameOsPersistentStrategyFaction: Codable, Equatable, Sendable {
    public let id: String
    public var supply: Int
    public init(id: String, supply: Int) { self.id = id; self.supply = supply }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable { case id, supply }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "faction")
        id = try values.decode(String.self, forKey: .id)
        supply = try values.decode(Int.self, forKey: .supply)
    }
}

public struct GameOsPersistentStrategyTerritory: Codable, Equatable, Sendable {
    public let id: String
    public let neighborIds: [String]
    public var ownerFactionId: String?
    private enum CodingKeys: String, CodingKey, CaseIterable { case id, neighborIds, ownerFactionId }
    public init(id: String, neighborIds: [String], ownerFactionId: String?) {
        self.id = id; self.neighborIds = neighborIds; self.ownerFactionId = ownerFactionId
    }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: CodingKeys.self, from: decoder, typeName: "territory")
        guard values.contains(.ownerFactionId) else {
            throw DecodingError.keyNotFound(CodingKeys.ownerFactionId,
                .init(codingPath: decoder.codingPath, debugDescription: "ownerFactionId is required."))
        }
        self.init(id: try values.decode(String.self, forKey: .id), neighborIds: try values.decode([String].self,
            forKey: .neighborIds), ownerFactionId: try values.decodeIfPresent(String.self, forKey: .ownerFactionId))
    }
    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id); try values.encode(neighborIds, forKey: .neighborIds)
        if let ownerFactionId {
            try values.encode(ownerFactionId, forKey: .ownerFactionId)
        } else {
            try values.encodeNil(forKey: .ownerFactionId)
        }
    }
}

public struct GameOsPersistentStrategyUnit: Codable, Equatable, Sendable {
    public let id: String
    public let factionId: String
    public var territoryId: String
    public let strength: Int
    public init(id: String, factionId: String, territoryId: String, strength: Int) {
        self.id = id; self.factionId = factionId; self.territoryId = territoryId; self.strength = strength
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable { case id, factionId, territoryId, strength }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "unit")
        id = try values.decode(String.self, forKey: .id)
        factionId = try values.decode(String.self, forKey: .factionId)
        territoryId = try values.decode(String.self, forKey: .territoryId)
        strength = try values.decode(Int.self, forKey: .strength)
    }
}

public struct GameOsPersistentStrategyWorldState: Codable, Equatable, Sendable {
    public let schema: String
    public let definition: GameOsPersistentStrategyWorldDefinition
    public let worldId: String
    public let seed: String
    public var tick: Int
    public var lastOrderSequence: Int
    public var factions: [GameOsPersistentStrategyFaction]
    public var territories: [GameOsPersistentStrategyTerritory]
    public var units: [GameOsPersistentStrategyUnit]
    public init(schema: String, definition: GameOsPersistentStrategyWorldDefinition, worldId: String,
                seed: String, tick: Int, lastOrderSequence: Int,
                factions: [GameOsPersistentStrategyFaction], territories: [GameOsPersistentStrategyTerritory],
                units: [GameOsPersistentStrategyUnit]) {
        self.schema = schema; self.definition = definition; self.worldId = worldId; self.seed = seed
        self.tick = tick; self.lastOrderSequence = lastOrderSequence; self.factions = factions
        self.territories = territories; self.units = units
    }
    private enum StrictCodingKeys: String, CodingKey, CaseIterable {
        case schema, definition, worldId, seed, tick, lastOrderSequence, factions, territories, units
    }
    public init(from decoder: Decoder) throws {
        let values = try gameOsStrictContainer(keyedBy: StrictCodingKeys.self, from: decoder, typeName: "world state")
        schema = try values.decode(String.self, forKey: .schema)
        definition = try values.decode(GameOsPersistentStrategyWorldDefinition.self, forKey: .definition)
        worldId = try values.decode(String.self, forKey: .worldId)
        seed = try values.decode(String.self, forKey: .seed)
        tick = try values.decode(Int.self, forKey: .tick)
        lastOrderSequence = try values.decode(Int.self, forKey: .lastOrderSequence)
        factions = try values.decode([GameOsPersistentStrategyFaction].self, forKey: .factions)
        territories = try values.decode([GameOsPersistentStrategyTerritory].self, forKey: .territories)
        units = try values.decode([GameOsPersistentStrategyUnit].self, forKey: .units)
    }
}

public enum GameOsPersistentStrategyOrder: Codable, Equatable, Sendable {
    case moveUnit(sequence: Int, factionId: String, unitId: String, targetTerritoryId: String)
    case claimTerritory(sequence: Int, factionId: String, unitId: String, territoryId: String)
    public var sequence: Int {
        switch self {
        case let .moveUnit(sequence, _, _, _), let .claimTerritory(sequence, _, _, _): sequence
        }
    }
    private enum CodingKeys: String, CodingKey {
        case type, sequence, factionId, unitId, targetTerritoryId, territoryId
    }
    public init(from decoder: Decoder) throws {
        let dynamic = try decoder.container(keyedBy: SpatialAnyCodingKey.self)
        let orderType = try dynamic.decode(String.self, forKey: SpatialAnyCodingKey(stringValue: "type")!)
        let allowed = orderType == "move-unit"
            ? ["type", "sequence", "factionId", "unitId", "targetTerritoryId"]
            : ["type", "sequence", "factionId", "unitId", "territoryId"]
        try rejectUnknownCodingKeys(in: decoder, allowedKeys: Set(allowed), typeName: "strategy order")
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let sequence = try values.decode(Int.self, forKey: .sequence)
        let factionId = try values.decode(String.self, forKey: .factionId)
        let unitId = try values.decode(String.self, forKey: .unitId)
        switch orderType {
        case "move-unit":
            self = .moveUnit(sequence: sequence, factionId: factionId, unitId: unitId,
                targetTerritoryId: try values.decode(String.self, forKey: .targetTerritoryId))
        case "claim-territory":
            self = .claimTerritory(sequence: sequence, factionId: factionId, unitId: unitId,
                territoryId: try values.decode(String.self, forKey: .territoryId))
        default:
            throw GameOsPersistentStrategyError.invalidOrder("Order type is not declared by this world.")
        }
    }
    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .moveUnit(sequence, factionId, unitId, targetTerritoryId):
            try values.encode("move-unit", forKey: .type); try values.encode(sequence, forKey: .sequence)
            try values.encode(factionId, forKey: .factionId); try values.encode(unitId, forKey: .unitId)
            try values.encode(targetTerritoryId, forKey: .targetTerritoryId)
        case let .claimTerritory(sequence, factionId, unitId, territoryId):
            try values.encode("claim-territory", forKey: .type); try values.encode(sequence, forKey: .sequence)
            try values.encode(factionId, forKey: .factionId); try values.encode(unitId, forKey: .unitId)
            try values.encode(territoryId, forKey: .territoryId)
        }
    }
}

public struct GameOsPersistentStrategyStepResult: Equatable, Sendable {
    public let state: GameOsPersistentStrategyWorldState
    public let stateDigest: String
    public let canonicalState: String
    public let acceptedOrders: [GameOsPersistentStrategyOrder]
    public let costRecords: [GameOsPersistentStrategyCostRecord]
}

private func normalizeGameOsDefinition(_ source: GameOsPersistentStrategyWorldDefinition)
throws -> GameOsPersistentStrategyWorldDefinition {
    guard source.schema == gameOsPersistentStrategyWorldDefinitionSchema else {
        throw GameOsPersistentStrategyError.invalidInput("World definition schema is unsupported.")
    }
    let identity = try requireGameOsText(source.identity, field: "definition.identity")
    let profile = try requireGameOsText(source.map.profile, field: "definition.map.profile")
    guard source.map.topology == "ring" else {
        throw GameOsPersistentStrategyError.invalidInput("Persistent strategy topology must be ring.")
    }
    let territoryCount = try requireGameOsInteger(source.map.territoryCount,
        field: "definition.map.territoryCount", range: 3...64)
    guard (2...min(territoryCount, 8)).contains(source.factions.count) else {
        throw GameOsPersistentStrategyError.invalidInput("Definition requires two to eight factions.")
    }

    var unitIdentities = Set<String>()
    var aggregateUnitCount = 0
    let factions = try source.factions.map { faction in
        let factionIdentity = try requireGameOsText(faction.identity, field: "definition.faction.identity")
        let supply = try requireGameOsInteger(faction.startingSupply,
            field: "definition.faction.startingSupply", range: 0...1_000_000)
        guard !faction.startingUnits.isEmpty else {
            throw GameOsPersistentStrategyError.invalidInput("Every faction requires a starting unit.")
        }
        aggregateUnitCount += faction.startingUnits.count
        guard aggregateUnitCount <= 128 else {
            throw GameOsPersistentStrategyError.invalidInput("Definition exceeds the starting-unit limit.")
        }
        let units = try faction.startingUnits.map { unit in
            let unitIdentity = try requireGameOsText(unit.identity, field: "definition.unit.identity")
            guard unitIdentities.insert(unitIdentity).inserted else {
                throw GameOsPersistentStrategyError.invalidInput("Starting-unit identities must be unique.")
            }
            return GameOsPersistentStrategyStartingUnit(identity: unitIdentity,
                strength: try requireGameOsInteger(unit.strength, field: "definition.unit.strength",
                    range: 1...10_000))
        }.sorted { gameOsTextPrecedes($0.identity, $1.identity) }
        return GameOsPersistentStrategyFactionDefinition(identity: factionIdentity,
            startingSupply: supply, startingUnits: units)
    }.sorted { gameOsTextPrecedes($0.identity, $1.identity) }
    guard Set(factions.map(\.identity)).count == factions.count else {
        throw GameOsPersistentStrategyError.invalidInput("Faction identities must be unique.")
    }
    guard (1...16).contains(source.objectives.count) else {
        throw GameOsPersistentStrategyError.invalidInput("Definition requires one to sixteen objectives.")
    }
    let objectives = try source.objectives.map { objective in
        guard objective.kind == "control-territories" else {
            throw GameOsPersistentStrategyError.invalidInput("Objective kind is unsupported.")
        }
        return GameOsPersistentStrategyObjectiveDefinition(
            identity: try requireGameOsText(objective.identity, field: "definition.objective.identity"),
            kind: objective.kind, targetTerritoryCount: try requireGameOsInteger(objective.targetTerritoryCount,
                field: "definition.objective.targetTerritoryCount", range: 1...territoryCount))
    }.sorted { gameOsTextPrecedes($0.identity, $1.identity) }
    guard Set(objectives.map(\.identity)).count == objectives.count else {
        throw GameOsPersistentStrategyError.invalidInput("Objective identities must be unique.")
    }
    return GameOsPersistentStrategyWorldDefinition(
        identity: identity,
        map: .init(profile: profile, topology: "ring", territoryCount: territoryCount),
        factions: factions,
        economy: .init(
            claimSupplyCost: try requireGameOsInteger(source.economy.claimSupplyCost,
                field: "definition.economy.claimSupplyCost", range: 0...1_000_000),
            supplyAccrualPerOwnedTerritory: try requireGameOsInteger(
                source.economy.supplyAccrualPerOwnedTerritory,
                field: "definition.economy.supplyAccrualPerOwnedTerritory", range: 0...1_000_000)
        ),
        objectives: objectives
    )
}

private func gameOsFNV1a32(_ input: String) -> UInt32 {
    input.utf16.reduce(UInt32(0x811c9dc5)) { hash, codeUnit in
        (hash ^ UInt32(codeUnit)) &* 0x01000193
    }
}

public func canonicalGameOsPersistentStrategyStateString(
    _ state: GameOsPersistentStrategyWorldState
) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let data = try encoder.encode(state)
    guard let value = String(data: data, encoding: .utf8) else {
        throw GameOsPersistentStrategyError.invalidInput("Canonical state is not UTF-8.")
    }
    return value
}

public func gameOsPersistentStrategyStateDigest(
    _ state: GameOsPersistentStrategyWorldState
) throws -> String {
    let hash = gameOsFNV1a32(try canonicalGameOsPersistentStrategyStateString(state))
    return "fnv1a32:" + String(format: "%08x", hash)
}

public func createGameOsPersistentStrategyWorld(
    worldId: String,
    seed: String,
    definition sourceDefinition: GameOsPersistentStrategyWorldDefinition
) throws -> GameOsPersistentStrategyWorldState {
    let worldId = try requireGameOsText(worldId, field: "worldId")
    let seed = try requireGameOsText(seed, field: "seed")
    let definition = try normalizeGameOsDefinition(sourceDefinition)
    let territoryCount = definition.map.territoryCount
    let homeModulo = max(1, territoryCount / definition.factions.count)
    let homeOffset = Int(gameOsFNV1a32(seed) % UInt32(homeModulo))
    let homes = definition.factions.indices.map {
        (homeOffset + ($0 * territoryCount / definition.factions.count)) % territoryCount
    }
    let factions = definition.factions.map {
        GameOsPersistentStrategyFaction(id: $0.identity, supply: $0.startingSupply)
    }
    let territories = (0..<territoryCount).map { index in
        let neighbors = [
            "territory-\((index + territoryCount - 1) % territoryCount)",
            "territory-\((index + 1) % territoryCount)"
        ].sorted(by: gameOsTextPrecedes)
        let ownerIndex = homes.firstIndex(of: index)
        return GameOsPersistentStrategyTerritory(
            id: "territory-\(index)",
            neighborIds: neighbors,
            ownerFactionId: ownerIndex.map { factions[$0].id }
        )
    }
    let units = definition.factions.indices.flatMap { factionIndex in
        definition.factions[factionIndex].startingUnits.map {
            GameOsPersistentStrategyUnit(
                id: $0.identity,
                factionId: definition.factions[factionIndex].identity,
                territoryId: "territory-\(homes[factionIndex])",
                strength: $0.strength
            )
        }
    }
    return GameOsPersistentStrategyWorldState(
        schema: gameOsPersistentStrategyWorldSchema,
        definition: definition,
        worldId: worldId,
        seed: seed,
        tick: 0,
        lastOrderSequence: 0,
        factions: factions,
        territories: territories,
        units: units
    )
}

private func validateGameOsState(_ state: GameOsPersistentStrategyWorldState) throws {
    guard state.schema == gameOsPersistentStrategyWorldSchema,
          try normalizeGameOsDefinition(state.definition) == state.definition,
          state.factions.map(\.id) == state.definition.factions.map(\.identity),
          state.territories.count == state.definition.map.territoryCount,
          state.units.count == state.definition.factions.flatMap(\.startingUnits).count else {
        throw GameOsPersistentStrategyError.invalidInput("World state is not canonical.")
    }
    _ = try requireGameOsText(state.worldId, field: "state.worldId")
    _ = try requireGameOsText(state.seed, field: "state.seed")
    _ = try requireGameOsInteger(state.tick, field: "state.tick", range: 0...gameOsMaximumSafeInteger)
    _ = try requireGameOsInteger(
        state.lastOrderSequence,
        field: "state.lastOrderSequence",
        range: 0...gameOsMaximumSafeInteger
    )
    let factionIds = Set(state.factions.map(\.id))
    guard factionIds.count == state.factions.count,
          state.factions.allSatisfy({ (0...gameOsMaximumSafeInteger).contains($0.supply) }) else {
        throw GameOsPersistentStrategyError.invalidInput("World factions are invalid.")
    }
    for index in state.territories.indices {
        let territory = state.territories[index]
        let expectedNeighbors = [
            "territory-\((index + state.territories.count - 1) % state.territories.count)",
            "territory-\((index + 1) % state.territories.count)"
        ].sorted(by: gameOsTextPrecedes)
        guard territory.id == "territory-\(index)",
              territory.neighborIds == expectedNeighbors,
              territory.ownerFactionId.map(factionIds.contains) ?? true else {
            throw GameOsPersistentStrategyError.invalidInput("World territory topology is invalid.")
        }
    }
    let expectedUnits = state.definition.factions.flatMap { faction in
        faction.startingUnits.map { ($0.identity, faction.identity, $0.strength) }
    }
    guard state.units.indices.allSatisfy({ index in
        let unit = state.units[index]
        let expected = expectedUnits[index]
        return unit.id == expected.0
            && unit.factionId == expected.1
            && unit.strength == expected.2
            && state.territories.contains(where: { $0.id == unit.territoryId })
    }) else {
        throw GameOsPersistentStrategyError.invalidInput("World units are invalid.")
    }
}

private func checkedGameOsArithmetic(_ left: Int, _ right: Int, multiply: Bool = false) throws -> Int {
    let result = multiply ? left.multipliedReportingOverflow(by: right) : left.addingReportingOverflow(right)
    guard !result.overflow, (0...gameOsMaximumSafeInteger).contains(result.partialValue) else {
        throw GameOsPersistentStrategyError.invalidInput("World arithmetic exceeds safe-integer bounds.")
    }
    return result.partialValue
}

public func advanceGameOsPersistentStrategyWorld(
    _ current: GameOsPersistentStrategyWorldState,
    orders inputOrders: [GameOsPersistentStrategyOrder]
) throws -> GameOsPersistentStrategyStepResult {
    try validateGameOsState(current)
    var state = current
    let orders = inputOrders.sorted { $0.sequence < $1.sequence }
    var expectedSequence = state.lastOrderSequence
    for order in orders {
        expectedSequence = try checkedGameOsArithmetic(expectedSequence, 1)
        guard order.sequence == expectedSequence else {
            throw GameOsPersistentStrategyError.invalidOrderSequence(
                expected: expectedSequence,
                received: order.sequence
            )
        }
        switch order {
        case let .moveUnit(_, factionId, unitId, targetTerritoryId):
            guard state.factions.contains(where: { $0.id == factionId }),
                  let unitIndex = state.units.firstIndex(where: { $0.id == unitId && $0.factionId == factionId }),
                  let currentIndex = state.territories.firstIndex(where: {
                      $0.id == state.units[unitIndex].territoryId
                  }),
                  state.territories.contains(where: { $0.id == targetTerritoryId }),
                  state.territories[currentIndex].neighborIds.contains(targetTerritoryId) else {
                throw GameOsPersistentStrategyError.invalidOrder("Unit movement is not valid for this world.")
            }
            state.units[unitIndex].territoryId = targetTerritoryId
        case let .claimTerritory(_, factionId, unitId, territoryId):
            guard let factionIndex = state.factions.firstIndex(where: { $0.id == factionId }),
                  let unit = state.units.first(where: { $0.id == unitId && $0.factionId == factionId }),
                  let territoryIndex = state.territories.firstIndex(where: { $0.id == territoryId }),
                  unit.territoryId == territoryId,
                  state.territories[territoryIndex].ownerFactionId != factionId,
                  state.factions[factionIndex].supply >= state.definition.economy.claimSupplyCost else {
                throw GameOsPersistentStrategyError.invalidOrder("Territory claim is not valid for this world.")
            }
            state.factions[factionIndex].supply -= state.definition.economy.claimSupplyCost
            state.territories[territoryIndex].ownerFactionId = factionId
        }
        state.lastOrderSequence = order.sequence
    }
    for index in state.factions.indices {
        let ownedCount = state.territories.filter {
            $0.ownerFactionId == state.factions[index].id
        }.count
        let gained = try checkedGameOsArithmetic(
            ownedCount,
            state.definition.economy.supplyAccrualPerOwnedTerritory,
            multiply: true
        )
        state.factions[index].supply = try checkedGameOsArithmetic(state.factions[index].supply, gained)
    }
    state.tick = try checkedGameOsArithmetic(state.tick, 1)
    let canonicalState = try canonicalGameOsPersistentStrategyStateString(state)
    return GameOsPersistentStrategyStepResult(
        state: state,
        stateDigest: "fnv1a32:" + String(format: "%08x", gameOsFNV1a32(canonicalState)),
        canonicalState: canonicalState,
        acceptedOrders: orders,
        costRecords: [gameOsPersistentStrategyZeroCostRecord]
    )
}
