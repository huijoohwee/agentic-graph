import Foundation
@testable import AgenticGraphSpatialCore
import XCTest

private struct GameOsPersistentStrategyParityFixture: Decodable {
    let schema: String
    let worldId: String
    let seed: String
    let definition: GameOsPersistentStrategyWorldDefinition
    let expectedInitialState: GameOsPersistentStrategyWorldState
    let expectedInitialStateDigest: String
    let expectedCanonicalStates: [String]
    let expectedStepCostRecords: [GameOsPersistentStrategyCostRecord]
    let steps: [Step]

    struct Step: Decodable {
        let orders: [GameOsPersistentStrategyOrder]
        let expectedState: GameOsPersistentStrategyWorldState
        let expectedStateDigest: String
        let expectedAcceptedOrders: [GameOsPersistentStrategyOrder]
    }
}

private enum GameOsJsonPathComponent {
    case key(String)
    case index(Int)
}

private func injectingLegacyKey(_ value: Any, at path: ArraySlice<GameOsJsonPathComponent>) -> Any {
    guard let component = path.first else {
        var object = value as! [String: Any]
        object["legacy"] = true
        return object
    }
    switch component {
    case let .key(key):
        var object = value as! [String: Any]
        object[key] = injectingLegacyKey(object[key]!, at: path.dropFirst())
        return object
    case let .index(index):
        var array = value as! [Any]
        array[index] = injectingLegacyKey(array[index], at: path.dropFirst())
        return array
    }
}

final class GameOsPersistentStrategyGoldenTests: XCTestCase {
    private static let fixture: GameOsPersistentStrategyParityFixture = {
        let sourceFile = URL(fileURLWithPath: #filePath)
        let fixtureURL = sourceFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/game-os-persistent-strategy-parity.v1.json")
        do {
            return try JSONDecoder().decode(
                GameOsPersistentStrategyParityFixture.self,
                from: Data(contentsOf: fixtureURL)
            )
        } catch {
            preconditionFailure("Cannot decode persistent-strategy parity fixture: \(error)")
        }
    }()

    func testTypeScriptGoldenInitialStateAndDigestMatch() throws {
        XCTAssertEqual(
            Self.fixture.schema,
            "agenticgraph.game-os-persistent-strategy-parity/v1"
        )
        let state = try createGameOsPersistentStrategyWorld(
            worldId: Self.fixture.worldId,
            seed: Self.fixture.seed,
            definition: Self.fixture.definition
        )

        XCTAssertEqual(state, Self.fixture.expectedInitialState)
        XCTAssertEqual(
            try canonicalGameOsPersistentStrategyStateString(state),
            Self.fixture.expectedCanonicalStates[0]
        )
        XCTAssertEqual(
            try gameOsPersistentStrategyStateDigest(state),
            Self.fixture.expectedInitialStateDigest
        )
    }

    func testEveryFixedStepMatchesTypeScriptStateOrdersAndDigest() throws {
        var state = try createGameOsPersistentStrategyWorld(
            worldId: Self.fixture.worldId,
            seed: Self.fixture.seed,
            definition: Self.fixture.definition
        )

        for (index, fixtureStep) in Self.fixture.steps.enumerated() {
            let result = try advanceGameOsPersistentStrategyWorld(
                state,
                orders: fixtureStep.orders
            )
            XCTAssertEqual(result.state.tick, index + 1)
            XCTAssertEqual(result.state, fixtureStep.expectedState)
            XCTAssertEqual(result.acceptedOrders, fixtureStep.expectedAcceptedOrders)
            XCTAssertEqual(result.costRecords, Self.fixture.expectedStepCostRecords)
            XCTAssertEqual(result.costRecords.count, 1)
            XCTAssertEqual(result.stateDigest, fixtureStep.expectedStateDigest)
            XCTAssertEqual(result.canonicalState, Self.fixture.expectedCanonicalStates[index + 1])
            XCTAssertEqual(
                result.canonicalState,
                try canonicalGameOsPersistentStrategyStateString(fixtureStep.expectedState)
            )
            state = result.state
        }
    }

    func testFreshNativeRuntimesRemainByteEquivalent() throws {
        var first = try createGameOsPersistentStrategyWorld(
            worldId: Self.fixture.worldId,
            seed: Self.fixture.seed,
            definition: Self.fixture.definition
        )
        var second = first

        for fixtureStep in Self.fixture.steps {
            first = try advanceGameOsPersistentStrategyWorld(
                first,
                orders: fixtureStep.orders
            ).state
            second = try advanceGameOsPersistentStrategyWorld(
                second,
                orders: Array(fixtureStep.orders.reversed())
            ).state
        }

        XCTAssertEqual(
            try canonicalGameOsPersistentStrategyStateString(first),
            try canonicalGameOsPersistentStrategyStateString(second)
        )
        XCTAssertEqual(
            try gameOsPersistentStrategyStateDigest(first),
            try gameOsPersistentStrategyStateDigest(second)
        )
    }

    func testOrderSequenceAndTopologyFailClosed() throws {
        let state = try createGameOsPersistentStrategyWorld(
            worldId: Self.fixture.worldId,
            seed: Self.fixture.seed,
            definition: Self.fixture.definition
        )
        let firstOrder = try XCTUnwrap(Self.fixture.steps.first?.orders.first)
        XCTAssertThrowsError(
            try advanceGameOsPersistentStrategyWorld(
                state,
                orders: [firstOrder, firstOrder]
            )
        ) { error in
            XCTAssertEqual(
                error as? GameOsPersistentStrategyError,
                .invalidOrderSequence(expected: 2, received: 1)
            )
        }

        XCTAssertThrowsError(
            try advanceGameOsPersistentStrategyWorld(
                state,
                orders: [.moveUnit(
                    sequence: 1,
                    factionId: "aurora",
                    unitId: "unit-aurora-1",
                    targetTerritoryId: "territory-3"
                )]
            )
        ) { error in
            XCTAssertEqual(
                error as? GameOsPersistentStrategyError,
                .invalidOrder("Unit movement is not valid for this world.")
            )
        }
    }

    func testOrderDecoderRejectsLegacyKeys() throws {
        let encoded = try JSONEncoder().encode(Self.fixture.steps[0].orders[0])
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object["legacy"] = true
        let invalid = try JSONSerialization.data(withJSONObject: object)

        XCTAssertThrowsError(
            try JSONDecoder().decode(GameOsPersistentStrategyOrder.self, from: invalid)
        )
    }

    func testDefinitionAndStateDecodersRejectUnknownKeysAtEveryNode() throws {
        let encoded = try JSONEncoder().encode(Self.fixture.expectedInitialState)
        let stateObject = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let paths: [[GameOsJsonPathComponent]] = [
            [],
            [.key("definition")],
            [.key("definition"), .key("map")],
            [.key("definition"), .key("factions"), .index(0)],
            [.key("definition"), .key("factions"), .index(0), .key("startingUnits"), .index(0)],
            [.key("definition"), .key("economy")],
            [.key("definition"), .key("objectives"), .index(0)],
            [.key("factions"), .index(0)],
            [.key("territories"), .index(0)],
            [.key("units"), .index(0)],
        ]

        for path in paths {
            let invalidObject = injectingLegacyKey(stateObject, at: path[...])
            let invalid = try JSONSerialization.data(withJSONObject: invalidObject)
            XCTAssertThrowsError(
                try JSONDecoder().decode(GameOsPersistentStrategyWorldState.self, from: invalid),
                "Expected unknown-key rejection at \(path)."
            )
        }
    }

    func testDefinitionBoundsAndUnsortedInputsMatchTypeScriptRules() throws {
        let source = Self.fixture.definition
        let unsorted = GameOsPersistentStrategyWorldDefinition(
            identity: source.identity,
            map: source.map,
            factions: Array(source.factions.reversed()),
            economy: source.economy,
            objectives: source.objectives
        )
        XCTAssertEqual(
            try createGameOsPersistentStrategyWorld(
                worldId: Self.fixture.worldId,
                seed: Self.fixture.seed,
                definition: unsorted
            ),
            Self.fixture.expectedInitialState
        )

        let boundary = GameOsPersistentStrategyWorldDefinition(
            identity: source.identity,
            map: .init(profile: source.map.profile, topology: "ring", territoryCount: 64),
            factions: source.factions,
            economy: .init(claimSupplyCost: 1_000_000, supplyAccrualPerOwnedTerritory: 1_000_000),
            objectives: source.objectives
        )
        XCTAssertNoThrow(try createGameOsPersistentStrategyWorld(
            worldId: "boundary", seed: "1", definition: boundary
        ))
        for invalid in [
            GameOsPersistentStrategyWorldDefinition(
                identity: source.identity,
                map: .init(profile: source.map.profile, topology: "ring", territoryCount: 65),
                factions: source.factions,
                economy: source.economy,
                objectives: source.objectives
            ),
            GameOsPersistentStrategyWorldDefinition(
                identity: source.identity,
                map: source.map,
                factions: source.factions,
                economy: .init(claimSupplyCost: 1_000_001, supplyAccrualPerOwnedTerritory: 1),
                objectives: source.objectives
            ),
        ] {
            XCTAssertThrowsError(try createGameOsPersistentStrategyWorld(
                worldId: "beyond", seed: "1", definition: invalid
            ))
        }

        XCTAssertNoThrow(try createGameOsPersistentStrategyWorld(
            worldId: "trim-parity", seed: "\u{0085}retained", definition: source
        ))
        for invalidSeed in ["\u{FEFF}trimmed", "trimmed\u{2029}"] {
            XCTAssertThrowsError(try createGameOsPersistentStrategyWorld(
                worldId: "trim-parity", seed: invalidSeed, definition: source
            ))
        }
    }

    func testZeroCostEncodingIsLiteralAndRejectsNonzeroRecords() throws {
        XCTAssertEqual(Self.fixture.expectedStepCostRecords, [.zero])
        let encoded = try JSONEncoder().encode(gameOsPersistentStrategyZeroCostRecord)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(Set(object.keys), Set([
            "model", "prompt_tokens", "completion_tokens", "cache_hits", "estimated_cost_usd", "incomplete",
        ]))
        XCTAssertTrue(object["model"] is NSNull)
        for key in ["prompt_tokens", "completion_tokens", "cache_hits", "estimated_cost_usd"] {
            XCTAssertEqual((object[key] as? NSNumber)?.doubleValue, 0)
        }
        XCTAssertEqual(object["incomplete"] as? Bool, false)

        object["prompt_tokens"] = 1
        let invalid = try JSONSerialization.data(withJSONObject: object)
        XCTAssertThrowsError(
            try JSONDecoder().decode(GameOsPersistentStrategyCostRecord.self, from: invalid)
        )
    }
}
