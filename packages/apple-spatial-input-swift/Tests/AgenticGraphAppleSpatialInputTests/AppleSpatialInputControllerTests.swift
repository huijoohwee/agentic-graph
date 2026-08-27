@testable import AgenticGraphAppleSpatialInput
import AgenticGraphSpatialCore
import XCTest

@MainActor
private final class FakeMotionSource: AppleDeviceMotionSource {
    var isAvailable = true
    var isActive = false
    var updateIntervalSeconds = 0.0
    var sample: AppleSpatialInputSample?
    private(set) var startCount = 0
    private(set) var stopCount = 0

    func start() {
        isActive = true
        startCount += 1
    }

    func stop() {
        isActive = false
        stopCount += 1
    }

    func latestSample(screenAngleDegrees: Double) -> AppleSpatialInputSample? {
        guard let sample else { return nil }
        return AppleSpatialInputSample(
            betaDegrees: sample.betaDegrees,
            gammaDegrees: sample.gammaDegrees,
            screenAngleDegrees: screenAngleDegrees,
            timestampMilliseconds: sample.timestampMilliseconds
        )
    }
}

@MainActor
final class AppleSpatialInputControllerTests: XCTestCase {
    func testControllerOwnsSourceStartStopAndCalibration() {
        let source = FakeMotionSource()
        source.sample = AppleSpatialInputSample(
            betaDegrees: 4,
            gammaDegrees: 2,
            screenAngleDegrees: 0,
            timestampMilliseconds: 1_000
        )
        let controller = AppleSpatialInputController(
            source: source,
            usageDescriptionAvailable: { true },
            screenAngleDegrees: { 90 }
        )

        controller.start()
        controller.pollLatestSample()

        XCTAssertEqual(source.startCount, 1)
        XCTAssertTrue(source.isActive)
        XCTAssertEqual(controller.phase, .running)
        XCTAssertEqual(controller.sampleCount, 1)
        controller.stop()
        XCTAssertFalse(source.isActive)
        XCTAssertGreaterThanOrEqual(source.stopCount, 2)
        XCTAssertEqual(controller.phase, .off)
    }

    func testControllerFailsClosedWithoutUsageDescription() {
        let source = FakeMotionSource()
        let controller = AppleSpatialInputController(
            source: source,
            usageDescriptionAvailable: { false }
        )

        controller.start()

        XCTAssertEqual(controller.phase, .unavailable)
        XCTAssertEqual(source.startCount, 0)
        XCTAssertFalse(source.isActive)
    }

    func testPollingTaskDoesNotRetainControllerAcrossSuspensionAndDeinitStopsSource() async {
        let source = FakeMotionSource()
        weak var weakController: AppleSpatialInputController?
        var controller: AppleSpatialInputController? = AppleSpatialInputController(
            source: source,
            usageDescriptionAvailable: { true }
        )
        weakController = controller
        controller?.start(updateIntervalSeconds: 1.0 / 20)
        await Task.yield()
        controller = nil
        await Task.yield()

        XCTAssertNil(weakController)
        XCTAssertFalse(source.isActive)
        XCTAssertGreaterThanOrEqual(source.stopCount, 2)
    }

    func testNonFiniteSamplesCannotCalibrateOrHideTimeout() {
        let source = FakeMotionSource()
        source.sample = AppleSpatialInputSample(
            betaDegrees: .nan,
            gammaDegrees: 2,
            screenAngleDegrees: 0,
            timestampMilliseconds: 1_000
        )
        let controller = AppleSpatialInputController(
            source: source,
            usageDescriptionAvailable: { true }
        )

        controller.start()
        controller.pollLatestSample(now: .distantFuture)

        XCTAssertEqual(controller.phase, .unavailable)
        XCTAssertEqual(controller.sampleCount, 0)
        XCTAssertFalse(source.isActive)
    }

    func testDuplicateTimestampDoesNotResmoothOrIncrement() {
        let source = FakeMotionSource()
        source.sample = AppleSpatialInputSample(
            betaDegrees: 4,
            gammaDegrees: 2,
            screenAngleDegrees: 0,
            timestampMilliseconds: 1_000
        )
        let controller = AppleSpatialInputController(
            source: source,
            usageDescriptionAvailable: { true }
        )

        controller.start()
        controller.pollLatestSample()
        controller.pollLatestSample()

        XCTAssertEqual(controller.phase, .running)
        XCTAssertEqual(controller.sampleCount, 1)
        XCTAssertEqual(controller.axes, AppleSpatialInputAxes())
    }

    func testMotionTimestampGateRejectsCachedAndOutOfOrderSamples() {
        var gate = AppleMotionTimestampGate()

        XCTAssertTrue(gate.accepts(1_000))
        XCTAssertFalse(gate.accepts(1_000))
        XCTAssertFalse(gate.accepts(999))
        XCTAssertTrue(gate.accepts(1_001))
        gate.reset()
        XCTAssertTrue(gate.accepts(1_000))
    }
}
