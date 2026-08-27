import Foundation
@testable import KnowgrphSpatialCore
import XCTest

final class AppleSpatialInputTests: XCTestCase {
    func testDefaultProfileMatchesCanonicalTypeScriptContract() {
        let profile = AppleSpatialInputProfile.default

        XCTAssertEqual(profile.schema, "airvio.apple-spatial-input/v1")
        XCTAssertEqual(profile.controlRangeDegrees, 35)
        XCTAssertEqual(profile.jitterThresholdDegrees, 0.75)
        XCTAssertEqual(profile.settledAxisThreshold, 0.002)
        XCTAssertEqual(profile.smoothingRatePerSecond, 12)
        XCTAssertEqual(profile.calibrationTimeoutMilliseconds, 2_500)
    }

    func testRejectsNonFiniteTimestampBeforeCalibration() {
        var filter = AppleSpatialInputFilter()
        let projection = filter.project(
            AppleSpatialInputSample(
                betaDegrees: 10,
                gammaDegrees: 5,
                screenAngleDegrees: 0,
                timestampMilliseconds: .infinity
            ),
            profile: .default
        )

        XCTAssertFalse(projection.calibratedNow)
        XCTAssertEqual(projection.state, .initial)
        XCTAssertEqual(filter.state, .initial)
    }

    func testCalibratesAndAppliesCanonicalExponentialSmoothing() {
        var filter = AppleSpatialInputFilter()
        let calibration = filter.project(
            AppleSpatialInputSample(
                betaDegrees: 10,
                gammaDegrees: 5,
                screenAngleDegrees: 0,
                timestampMilliseconds: 1_000
            ),
            profile: .default
        )
        let projection = filter.project(
            AppleSpatialInputSample(
                betaDegrees: 45,
                gammaDegrees: 5,
                screenAngleDegrees: 0,
                timestampMilliseconds: 1_000 + (1_000 / 60)
            ),
            profile: .default
        )

        XCTAssertTrue(calibration.calibratedNow)
        XCTAssertEqual(calibration.axes, AppleSpatialInputAxes())
        XCTAssertFalse(projection.calibratedNow)
        XCTAssertEqual(projection.axes.pitch, 1 - exp(-12.0 / 60), accuracy: 1e-12)
        XCTAssertEqual(projection.axes.roll, 0, accuracy: 1e-12)
    }

    func testMapsOrientationAxesAndWrapsAnglesLikeTypeScript() {
        let axes = AppleSpatialInputFilter.mapDeviceOrientationDeltaToScreen(
            betaDeltaDegrees: 10,
            gammaDeltaDegrees: 2,
            screenAngleDegrees: 90
        )

        XCTAssertEqual(axes.pitchDegrees, 2, accuracy: 1e-12)
        XCTAssertEqual(axes.rollDegrees, -10, accuracy: 1e-12)
        XCTAssertEqual(AppleSpatialInputFilter.shortestAngleDeltaDegrees(359), -1)
        XCTAssertEqual(AppleSpatialInputFilter.shortestAngleDeltaDegrees(-359), 1)
    }

    func testStrictProfileDecoderRejectsUnknownKeys() throws {
        let json = """
        {
          "schema": "airvio.apple-spatial-input/v1",
          "controlRangeDegrees": 35,
          "jitterThresholdDegrees": 0.75,
          "settledAxisThreshold": 0.002,
          "smoothingRatePerSecond": 12,
          "calibrationTimeoutMilliseconds": 2500,
          "legacySensitivity": 1
        }
        """

        XCTAssertThrowsError(try JSONDecoder().decode(
            AppleSpatialInputProfile.self,
            from: Data(json.utf8)
        )) { error in
            XCTAssertEqual(
                error as? AppleSpatialInputProfileError,
                .unknownKeys(["legacySensitivity"])
            )
        }
    }
}
