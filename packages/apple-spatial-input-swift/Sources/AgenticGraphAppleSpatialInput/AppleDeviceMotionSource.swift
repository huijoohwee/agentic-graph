import Foundation
import AgenticGraphSpatialCore

#if os(iOS) || os(visionOS)
import CoreMotion
#endif

@MainActor
public protocol AppleDeviceMotionSource: AnyObject {
    var isAvailable: Bool { get }
    var isActive: Bool { get }
    var updateIntervalSeconds: Double { get set }

    func start()
    func stop()
    func latestSample(screenAngleDegrees: Double) -> AppleSpatialInputSample?
}

struct AppleMotionTimestampGate {
    private(set) var lastAcceptedTimestampMilliseconds: Double?

    mutating func reset() {
        lastAcceptedTimestampMilliseconds = nil
    }

    mutating func accepts(_ timestampMilliseconds: Double) -> Bool {
        guard timestampMilliseconds.isFinite else { return false }
        if let lastAcceptedTimestampMilliseconds,
           timestampMilliseconds <= lastAcceptedTimestampMilliseconds {
            return false
        }
        lastAcceptedTimestampMilliseconds = timestampMilliseconds
        return true
    }
}

#if os(iOS) || os(visionOS)
@MainActor
public final class CoreMotionDeviceMotionSource: AppleDeviceMotionSource {
    private let manager: CMMotionManager
    private var timestampGate = AppleMotionTimestampGate()

    public init(manager: CMMotionManager = CMMotionManager()) {
        self.manager = manager
    }

    public var isAvailable: Bool { manager.isDeviceMotionAvailable }
    public var isActive: Bool { manager.isDeviceMotionActive }

    public var updateIntervalSeconds: Double {
        get { manager.deviceMotionUpdateInterval }
        set { manager.deviceMotionUpdateInterval = newValue }
    }

    public func start() {
        timestampGate.reset()
        manager.startDeviceMotionUpdates(using: .xArbitraryZVertical)
    }

    public func stop() {
        manager.stopDeviceMotionUpdates()
        timestampGate.reset()
    }

    public func latestSample(screenAngleDegrees: Double) -> AppleSpatialInputSample? {
        guard let motion = manager.deviceMotion else { return nil }
        let timestampMilliseconds = motion.timestamp * 1_000
        guard timestampGate.accepts(timestampMilliseconds) else { return nil }
        return AppleSpatialInputSample(
            betaDegrees: motion.attitude.pitch * 180 / .pi,
            gammaDegrees: motion.attitude.roll * 180 / .pi,
            screenAngleDegrees: screenAngleDegrees,
            timestampMilliseconds: timestampMilliseconds
        )
    }
}
#else
@MainActor
public final class CoreMotionDeviceMotionSource: AppleDeviceMotionSource {
    public init() {}

    public var isAvailable: Bool { false }
    public var isActive: Bool { false }
    public var updateIntervalSeconds = 1.0 / 60

    public func start() {}
    public func stop() {}

    public func latestSample(screenAngleDegrees: Double) -> AppleSpatialInputSample? {
        nil
    }
}
#endif
