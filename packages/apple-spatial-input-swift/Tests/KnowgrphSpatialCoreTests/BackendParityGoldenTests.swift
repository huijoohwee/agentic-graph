import Foundation
@testable import KnowgrphSpatialCore
import XCTest

private struct BackendParityFixture: Decodable {
    let schema: String
    let flight: Flight
    let arbitration: Arbitration
    let camera: Camera

    struct Flight: Decodable {
        let fixedStepSeconds: Double
        let defaultProfile: FlightSimModelProfile
        let previous: FlightSimAircraftState
        let input: FlightSimTickInput
        let expectedNext: FlightSimAircraftState
    }

    struct Arbitration: Decodable {
        let tieInputs: [SpatialInputPatch]
        let expectedTie: FlightSimTickInput
        let strictNonFiniteFailure: Failure
        let mergeNanNormalization: MergeFailure
    }

    struct Failure: Decodable {
        let axis: SpatialInputAxis
        let sourceIndex: Int
        let error: String
    }

    struct MergeFailure: Decodable {
        let axis: SpatialInputAxis
        let sourceIndex: Int
        let reason: SpatialInputFailureReason
        let retainedLastValid: Bool
    }

    struct Camera: Decodable {
        let defaultProfile: FlightSimCameraProfile
        let snapshot: FlightSimCameraSnapshot
        let coordinateScale: Double
        let expectedByView: [String: FlightSimFollowTarget]
    }
}

final class BackendParityGoldenTests: XCTestCase {
    private static let fixture: BackendParityFixture = {
        let sourceFile = URL(fileURLWithPath: #filePath)
        let fixtureURL = sourceFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/backend-parity.v1.json")
        do {
            return try JSONDecoder().decode(
                BackendParityFixture.self,
                from: Data(contentsOf: fixtureURL)
            )
        } catch {
            preconditionFailure("Cannot decode shared backend parity fixture: \(error)")
        }
    }()

    func testCanonicalDefaultsMatchSharedFixture() {
        XCTAssertEqual(Self.fixture.schema, "knowgrph.apple-spatial-input-backend-parity/v1")
        XCTAssertEqual(flightSimFixedStepSeconds, Self.fixture.flight.fixedStepSeconds)
        XCTAssertEqual(FlightSimModelProfile.default, Self.fixture.flight.defaultProfile)
        XCTAssertEqual(FlightSimCameraProfile.default, Self.fixture.camera.defaultProfile)
    }

    func testOneFlightStepMatchesTypeScriptGoldenValues() throws {
        let actual = try integrateFlightModel(
            previous: Self.fixture.flight.previous,
            inputValue: Self.fixture.flight.input,
            stepSeconds: Self.fixture.flight.fixedStepSeconds,
            profile: Self.fixture.flight.defaultProfile
        )

        assertState(actual, equals: Self.fixture.flight.expectedNext, accuracy: 1e-12)
    }

    func testArbitrationTieAndNaNFailureMatchCanonicalContract() throws {
        let tied = try arbitrateSpatialInput(Self.fixture.arbitration.tieInputs.map(Optional.some))
        XCTAssertEqual(tied, Self.fixture.arbitration.expectedTie)
        XCTAssertEqual(
            mergeFlightSimInputs(Self.fixture.arbitration.tieInputs),
            Self.fixture.arbitration.expectedTie
        )

        let invalidInputs = [
            SpatialInputPatch(pitch: 0.4),
            SpatialInputPatch(pitch: .nan),
        ]
        XCTAssertThrowsError(try arbitrateSpatialInput(invalidInputs.map(Optional.some))) { error in
            XCTAssertEqual(
                error as? SpatialInputError,
                .nonFinite(
                    axis: Self.fixture.arbitration.strictNonFiniteFailure.axis,
                    sourceIndex: Self.fixture.arbitration.strictNonFiniteFailure.sourceIndex
                )
            )
            XCTAssertEqual(Self.fixture.arbitration.strictNonFiniteFailure.error, "nonFiniteControl")
        }

        let merged = mergeFlightSimInputs(invalidInputs)
        XCTAssertTrue(merged.pitch.isNaN)
        let normalized = try normalizeFlightSimInputFrame(
            SpatialInputPatch(pitch: merged.pitch),
            lastValid: .neutral
        )
        XCTAssertTrue(normalized.outOfRange)
        XCTAssertEqual(
            normalized.retainedLastValid,
            Self.fixture.arbitration.mergeNanNormalization.retainedLastValid
        )
        XCTAssertEqual(normalized.input.pitch, 0)
        XCTAssertEqual(
            normalized.failures,
            [.init(
                axis: Self.fixture.arbitration.mergeNanNormalization.axis,
                reason: Self.fixture.arbitration.mergeNanNormalization.reason
            )]
        )
        XCTAssertEqual(Self.fixture.arbitration.mergeNanNormalization.sourceIndex, 1)

        let infinite = mergeFlightSimInputs([SpatialInputPatch(roll: .infinity)])
        let normalizedInfinite = try normalizeFlightSimInputFrame(
            SpatialInputPatch(roll: infinite.roll)
        )
        XCTAssertEqual(normalizedInfinite.input.roll, 1)
        XCTAssertFalse(normalizedInfinite.retainedLastValid)
        XCTAssertEqual(
            normalizedInfinite.failures,
            [.init(axis: .roll, reason: .infinite)]
        )
        XCTAssertThrowsError(try integrateFlightModel(
            previous: Self.fixture.flight.previous,
            inputValue: FlightSimTickInput(pitch: .nan)
        )) { error in
            XCTAssertEqual(
                error as? SpatialInputError,
                .nonFinite(axis: .pitch, sourceIndex: nil)
            )
        }
    }

    func testAllCameraModesMatchTypeScriptGoldenValues() throws {
        for view in FlightSimCameraView.allCases {
            let actual = try resolveFlightSimFollowTarget(
                snapshot: Self.fixture.camera.snapshot,
                coordinateScale: Self.fixture.camera.coordinateScale,
                view: view,
                profile: Self.fixture.camera.defaultProfile
            )
            let expected = try XCTUnwrap(Self.fixture.camera.expectedByView[view.rawValue])
            assertVector(actual.position, equals: expected.position, accuracy: 1e-12)
            assertVector(actual.target, equals: expected.target, accuracy: 1e-12)
            XCTAssertEqual(actual.fovDegrees, expected.fovDegrees, accuracy: 1e-12)
            XCTAssertEqual(actual.resetKey, expected.resetKey)
            XCTAssertEqual(actual.sequence, expected.sequence)
        }
    }

    func testStrictCodableProfilesAndInputRejectUnknownKeys() throws {
        try assertUnknownKeyRejected(FlightSimModelProfile.default, as: FlightSimModelProfile.self)
        try assertUnknownKeyRejected(FlightSimCameraProfile.default, as: FlightSimCameraProfile.self)
        try assertUnknownKeyRejected(FlightSimTickInput.neutral, as: FlightSimTickInput.self)
    }

    func testFixedStepAccumulatorIsBoundedAndExact() throws {
        var accumulator = FlightSimFixedStepAccumulator.default
        XCTAssertEqual(try accumulator.consume(frameDeltaSeconds: 1.0 / 30), 2)
        XCTAssertEqual(accumulator.remainderSeconds, 0, accuracy: 1e-12)
        XCTAssertEqual(
            try accumulator.consume(frameDeltaSeconds: 10),
            accumulator.maximumCatchUpSteps
        )
        XCTAssertEqual(accumulator.remainderSeconds, 0, accuracy: 1e-12)
    }

    private func assertUnknownKeyRejected<Value: Codable>(
        _ value: Value,
        as type: Value.Type
    ) throws {
        let encoded = try JSONEncoder().encode(value)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object["legacy"] = true
        let invalid = try JSONSerialization.data(withJSONObject: object)
        XCTAssertThrowsError(try JSONDecoder().decode(type, from: invalid))
    }

    private func assertState(
        _ actual: FlightSimAircraftState,
        equals expected: FlightSimAircraftState,
        accuracy: Double
    ) {
        assertVector(actual.position, equals: expected.position, accuracy: accuracy)
        assertVector(actual.velocity, equals: expected.velocity, accuracy: accuracy)
        XCTAssertEqual(actual.pitch, expected.pitch, accuracy: accuracy)
        XCTAssertEqual(actual.roll, expected.roll, accuracy: accuracy)
        XCTAssertEqual(actual.yaw, expected.yaw, accuracy: accuracy)
        XCTAssertEqual(actual.throttle, expected.throttle, accuracy: accuracy)
    }

    private func assertVector(
        _ actual: SpatialVector3,
        equals expected: SpatialVector3,
        accuracy: Double
    ) {
        XCTAssertEqual(actual.x, expected.x, accuracy: accuracy)
        XCTAssertEqual(actual.y, expected.y, accuracy: accuracy)
        XCTAssertEqual(actual.z, expected.z, accuracy: accuracy)
    }
}
