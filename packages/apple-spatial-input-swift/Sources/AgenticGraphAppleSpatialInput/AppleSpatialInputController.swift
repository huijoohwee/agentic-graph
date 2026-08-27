import Foundation
import AgenticGraphSpatialCore
import Observation

#if os(iOS) && canImport(UIKit)
import UIKit
#endif

public enum AppleSpatialInputPhase: String, Codable, Equatable, Sendable {
    case off
    case calibrating
    case running
    case unavailable
}

@MainActor
@Observable
public final class AppleSpatialInputController {
    public private(set) var phase: AppleSpatialInputPhase = .off
    public private(set) var axes = AppleSpatialInputAxes()
    public private(set) var sampleCount = 0
    public private(set) var message = "Device motion is off."

    @ObservationIgnored private let source: AppleDeviceMotionSource
    @ObservationIgnored private let usageDescriptionAvailable: () -> Bool
    @ObservationIgnored private let screenAngleDegrees: () -> Double
    @ObservationIgnored private var filter = AppleSpatialInputFilter()
    @ObservationIgnored private var profile: AppleSpatialInputProfile
    @ObservationIgnored private var pollingTask: Task<Void, Never>?
    @ObservationIgnored private var calibrationStartedAt: Date?
    @ObservationIgnored private var timestampGate = AppleMotionTimestampGate()

    public convenience init(profile: AppleSpatialInputProfile = .default) {
        self.init(
            profile: profile,
            source: CoreMotionDeviceMotionSource(),
            usageDescriptionAvailable: { Self.defaultUsageDescriptionAvailable() },
            screenAngleDegrees: { Self.activeScreenAngleDegrees() }
        )
    }

    public init(
        profile: AppleSpatialInputProfile = .default,
        source: AppleDeviceMotionSource,
        usageDescriptionAvailable: @escaping () -> Bool,
        screenAngleDegrees: @escaping () -> Double = { 0 }
    ) {
        self.profile = profile
        self.source = source
        self.usageDescriptionAvailable = usageDescriptionAvailable
        self.screenAngleDegrees = screenAngleDegrees
    }

    isolated deinit {
        pollingTask?.cancel()
        source.stop()
    }

    public func configure(profile: AppleSpatialInputProfile) {
        guard profile != self.profile else { return }
        self.profile = profile
        if phase == .running || phase == .calibrating {
            recenter(message: "Motion profile changed; hold the device comfortably to set neutral.")
        }
    }

    public func start(updateIntervalSeconds: Double = 1 / 60) {
        stopUpdates()
        guard usageDescriptionAvailable() else {
            setUnavailable("The host app must provide NSMotionUsageDescription before enabling motion.")
            return
        }
        guard source.isAvailable else {
            setUnavailable("Processed device motion is unavailable on this device.")
            return
        }
        guard updateIntervalSeconds.isFinite,
              ((1.0 / 240)...(1.0 / 20)).contains(updateIntervalSeconds) else {
            setUnavailable("The device-motion update interval must be from 1/240 through 1/20 seconds.")
            return
        }

        filter.reset()
        timestampGate.reset()
        axes = AppleSpatialInputAxes()
        sampleCount = 0
        phase = .calibrating
        message = "Hold the device comfortably; the first motion sample sets neutral."
        calibrationStartedAt = Date()
        source.updateIntervalSeconds = updateIntervalSeconds
        source.start()
        pollingTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                self?.pollLatestSample()
                do {
                    try await Task.sleep(for: .seconds(updateIntervalSeconds))
                } catch {
                    return
                }
            }
        }
    }

    public func stop(message: String = "Device motion is off.") {
        stopUpdates()
        filter.reset()
        timestampGate.reset()
        axes = AppleSpatialInputAxes()
        sampleCount = 0
        phase = .off
        self.message = message
    }

    public func recenter(
        message: String = "Hold the device comfortably; the next motion sample sets neutral."
    ) {
        guard phase == .running || phase == .calibrating else { return }
        filter.reset()
        timestampGate.reset()
        axes = AppleSpatialInputAxes()
        sampleCount = 0
        phase = .calibrating
        self.message = message
        calibrationStartedAt = Date()
    }

    func pollLatestSample(now: Date = Date()) {
        guard phase == .calibrating || phase == .running else { return }
        guard let sample = source.latestSample(screenAngleDegrees: screenAngleDegrees()),
              sample.isFinite,
              timestampGate.accepts(sample.timestampMilliseconds) else {
            failIfCalibrationTimedOut(now: now)
            return
        }

        let projection = filter.project(sample, profile: profile)
        axes = projection.axes
        sampleCount += 1
        if projection.calibratedNow {
            calibrationStartedAt = nil
            phase = .running
            message = "Device motion is calibrated and controlling spatial input on-device."
        }
    }

    private func stopUpdates() {
        pollingTask?.cancel()
        pollingTask = nil
        calibrationStartedAt = nil
        timestampGate.reset()
        source.stop()
    }

    private func failIfCalibrationTimedOut(now: Date) {
        guard let calibrationStartedAt,
              now.timeIntervalSince(calibrationStartedAt) * 1_000
                >= profile.calibrationTimeoutMilliseconds else {
            return
        }
        stopUpdates()
        setUnavailable("No valid device-motion sample arrived before the calibration timeout.")
    }

    private func setUnavailable(_ message: String) {
        filter.reset()
        timestampGate.reset()
        axes = AppleSpatialInputAxes()
        sampleCount = 0
        phase = .unavailable
        self.message = message
    }

    private static func defaultUsageDescriptionAvailable() -> Bool {
        #if os(iOS) || os(visionOS)
        guard let value = Bundle.main.object(
            forInfoDictionaryKey: "NSMotionUsageDescription"
        ) as? String else {
            return false
        }
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        #else
        return true
        #endif
    }

    private static func activeScreenAngleDegrees() -> Double {
        #if os(iOS) && canImport(UIKit)
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let orientation = scenes.first(where: { $0.activationState == .foregroundActive })?.interfaceOrientation
            ?? scenes.first?.interfaceOrientation
        switch orientation {
        case .landscapeLeft: return 90
        case .portraitUpsideDown: return 180
        case .landscapeRight: return 270
        default: return 0
        }
        #else
        return 0
        #endif
    }
}
