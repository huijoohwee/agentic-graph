import Foundation

public enum AppleSpatialInputProfileError: Error, Equatable, Sendable {
    case unsupportedSchema(String)
    case invalidValue(name: String, minimum: Double, maximum: Double)
    case unknownKeys([String])
}

public enum AppleSpatialInputProfileLimits {
    public static let controlRangeDegrees = 5.0...90.0
    public static let jitterThresholdDegrees = 0.0...5.0
    public static let settledAxisThreshold = 0.0...0.1
    public static let smoothingRatePerSecond = 1.0...60.0
    public static let calibrationTimeoutMilliseconds = 250.0...10_000.0
}

public struct AppleSpatialInputProfile: Codable, Equatable, Sendable {
    public static let schemaIdentifier = "airvio.apple-spatial-input/v1"

    public let schema: String
    public let controlRangeDegrees: Double
    public let jitterThresholdDegrees: Double
    public let settledAxisThreshold: Double
    public let smoothingRatePerSecond: Double
    public let calibrationTimeoutMilliseconds: Double

    public init(
        schema: String = Self.schemaIdentifier,
        controlRangeDegrees: Double,
        jitterThresholdDegrees: Double,
        settledAxisThreshold: Double,
        smoothingRatePerSecond: Double,
        calibrationTimeoutMilliseconds: Double
    ) throws {
        guard schema == Self.schemaIdentifier else {
            throw AppleSpatialInputProfileError.unsupportedSchema(schema)
        }
        try Self.validate(
            controlRangeDegrees,
            name: "controlRangeDegrees",
            range: AppleSpatialInputProfileLimits.controlRangeDegrees
        )
        try Self.validate(
            jitterThresholdDegrees,
            name: "jitterThresholdDegrees",
            range: AppleSpatialInputProfileLimits.jitterThresholdDegrees
        )
        try Self.validate(
            settledAxisThreshold,
            name: "settledAxisThreshold",
            range: AppleSpatialInputProfileLimits.settledAxisThreshold
        )
        try Self.validate(
            smoothingRatePerSecond,
            name: "smoothingRatePerSecond",
            range: AppleSpatialInputProfileLimits.smoothingRatePerSecond
        )
        try Self.validate(
            calibrationTimeoutMilliseconds,
            name: "calibrationTimeoutMilliseconds",
            range: AppleSpatialInputProfileLimits.calibrationTimeoutMilliseconds
        )

        self.schema = schema
        self.controlRangeDegrees = controlRangeDegrees
        self.jitterThresholdDegrees = jitterThresholdDegrees
        self.settledAxisThreshold = settledAxisThreshold
        self.smoothingRatePerSecond = smoothingRatePerSecond
        self.calibrationTimeoutMilliseconds = calibrationTimeoutMilliseconds
    }

    public static let `default` = AppleSpatialInputProfile(
        validatedControlRangeDegrees: 35,
        jitterThresholdDegrees: 0.75,
        settledAxisThreshold: 0.002,
        smoothingRatePerSecond: 12,
        calibrationTimeoutMilliseconds: 2_500
    )

    private init(
        validatedControlRangeDegrees controlRangeDegrees: Double,
        jitterThresholdDegrees: Double,
        settledAxisThreshold: Double,
        smoothingRatePerSecond: Double,
        calibrationTimeoutMilliseconds: Double
    ) {
        schema = Self.schemaIdentifier
        self.controlRangeDegrees = controlRangeDegrees
        self.jitterThresholdDegrees = jitterThresholdDegrees
        self.settledAxisThreshold = settledAxisThreshold
        self.smoothingRatePerSecond = smoothingRatePerSecond
        self.calibrationTimeoutMilliseconds = calibrationTimeoutMilliseconds
    }

    private static func validate(
        _ value: Double,
        name: String,
        range: ClosedRange<Double>
    ) throws {
        guard value.isFinite, range.contains(value) else {
            throw AppleSpatialInputProfileError.invalidValue(
                name: name,
                minimum: range.lowerBound,
                maximum: range.upperBound
            )
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schema
        case controlRangeDegrees
        case jitterThresholdDegrees
        case settledAxisThreshold
        case smoothingRatePerSecond
        case calibrationTimeoutMilliseconds
    }

    public init(from decoder: Decoder) throws {
        let allowedKeys = Set(CodingKeys.allCases.map(\.rawValue))
        let unknownKeys = try unknownCodingKeys(in: decoder, allowedKeys: allowedKeys)
        guard unknownKeys.isEmpty else {
            throw AppleSpatialInputProfileError.unknownKeys(unknownKeys)
        }

        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            schema: try values.decode(String.self, forKey: .schema),
            controlRangeDegrees: try values.decode(Double.self, forKey: .controlRangeDegrees),
            jitterThresholdDegrees: try values.decode(Double.self, forKey: .jitterThresholdDegrees),
            settledAxisThreshold: try values.decode(Double.self, forKey: .settledAxisThreshold),
            smoothingRatePerSecond: try values.decode(Double.self, forKey: .smoothingRatePerSecond),
            calibrationTimeoutMilliseconds: try values.decode(
                Double.self,
                forKey: .calibrationTimeoutMilliseconds
            )
        )
    }
}

public struct AppleSpatialInputAxes: Codable, Equatable, Sendable {
    public let pitch: Double
    public let roll: Double

    public init(pitch: Double = 0, roll: Double = 0) {
        self.pitch = pitch
        self.roll = roll
    }
}

public struct AppleSpatialInputBaseline: Codable, Equatable, Sendable {
    public let betaDegrees: Double
    public let gammaDegrees: Double

    public init(betaDegrees: Double, gammaDegrees: Double) {
        self.betaDegrees = betaDegrees
        self.gammaDegrees = gammaDegrees
    }
}

public struct AppleSpatialInputState: Codable, Equatable, Sendable {
    public let baseline: AppleSpatialInputBaseline?
    public let pitch: Double
    public let roll: Double
    public let previousTimestampMilliseconds: Double?

    public init(
        baseline: AppleSpatialInputBaseline? = nil,
        pitch: Double = 0,
        roll: Double = 0,
        previousTimestampMilliseconds: Double? = nil
    ) {
        self.baseline = baseline
        self.pitch = pitch
        self.roll = roll
        self.previousTimestampMilliseconds = previousTimestampMilliseconds
    }

    public static let initial = AppleSpatialInputState()

    public var axes: AppleSpatialInputAxes {
        AppleSpatialInputAxes(pitch: pitch, roll: roll)
    }
}

public struct AppleSpatialInputSample: Codable, Equatable, Sendable {
    public let betaDegrees: Double
    public let gammaDegrees: Double
    public let screenAngleDegrees: Double
    public let timestampMilliseconds: Double

    public init(
        betaDegrees: Double,
        gammaDegrees: Double,
        screenAngleDegrees: Double,
        timestampMilliseconds: Double
    ) {
        self.betaDegrees = betaDegrees
        self.gammaDegrees = gammaDegrees
        self.screenAngleDegrees = screenAngleDegrees
        self.timestampMilliseconds = timestampMilliseconds
    }

    public var isFinite: Bool {
        betaDegrees.isFinite
            && gammaDegrees.isFinite
            && screenAngleDegrees.isFinite
            && timestampMilliseconds.isFinite
    }
}

public struct AppleSpatialInputProjection: Codable, Equatable, Sendable {
    public let state: AppleSpatialInputState
    public let calibratedNow: Bool

    public init(state: AppleSpatialInputState, calibratedNow: Bool) {
        self.state = state
        self.calibratedNow = calibratedNow
    }

    public var axes: AppleSpatialInputAxes { state.axes }
}

public struct ScreenOrientationAxes: Codable, Equatable, Sendable {
    public let pitchDegrees: Double
    public let rollDegrees: Double

    public init(pitchDegrees: Double, rollDegrees: Double) {
        self.pitchDegrees = pitchDegrees
        self.rollDegrees = rollDegrees
    }
}

public struct AppleSpatialInputFilter: Sendable {
    public private(set) var state: AppleSpatialInputState

    public init(state: AppleSpatialInputState = .initial) {
        self.state = state
    }

    public mutating func reset() {
        state = .initial
    }

    @discardableResult
    public mutating func project(
        _ sample: AppleSpatialInputSample,
        profile: AppleSpatialInputProfile
    ) -> AppleSpatialInputProjection {
        guard sample.betaDegrees.isFinite,
              sample.gammaDegrees.isFinite,
              sample.screenAngleDegrees.isFinite,
              sample.timestampMilliseconds.isFinite else {
            return AppleSpatialInputProjection(state: state, calibratedNow: false)
        }

        guard let baseline = state.baseline else {
            state = AppleSpatialInputState(
                baseline: AppleSpatialInputBaseline(
                    betaDegrees: sample.betaDegrees,
                    gammaDegrees: sample.gammaDegrees
                ),
                previousTimestampMilliseconds: sample.timestampMilliseconds
            )
            return AppleSpatialInputProjection(state: state, calibratedNow: true)
        }

        let mapped = Self.mapDeviceOrientationDeltaToScreen(
            betaDeltaDegrees: Self.shortestAngleDeltaDegrees(
                sample.betaDegrees - baseline.betaDegrees
            ),
            gammaDeltaDegrees: sample.gammaDegrees - baseline.gammaDegrees,
            screenAngleDegrees: sample.screenAngleDegrees
        )
        let targetPitch = abs(mapped.pitchDegrees) < profile.jitterThresholdDegrees
            ? 0
            : Self.clampSpatialInputAxis(mapped.pitchDegrees / profile.controlRangeDegrees)
        let targetRoll = abs(mapped.rollDegrees) < profile.jitterThresholdDegrees
            ? 0
            : Self.clampSpatialInputAxis(mapped.rollDegrees / profile.controlRangeDegrees)
        let elapsedSeconds = Self.elapsedSeconds(
            previousTimestampMilliseconds: state.previousTimestampMilliseconds,
            timestampMilliseconds: sample.timestampMilliseconds
        )
        let blend = 1 - exp(-profile.smoothingRatePerSecond * elapsedSeconds)
        var pitch = state.pitch + (targetPitch - state.pitch) * blend
        var roll = state.roll + (targetRoll - state.roll) * blend
        if targetPitch == 0, abs(pitch) < profile.settledAxisThreshold { pitch = 0 }
        if targetRoll == 0, abs(roll) < profile.settledAxisThreshold { roll = 0 }

        state = AppleSpatialInputState(
            baseline: baseline,
            pitch: Self.clampSpatialInputAxis(pitch),
            roll: Self.clampSpatialInputAxis(roll),
            previousTimestampMilliseconds: sample.timestampMilliseconds
        )
        return AppleSpatialInputProjection(state: state, calibratedNow: false)
    }

    public static func clampSpatialInputAxis(_ value: Double) -> Double {
        min(1, max(-1, value.isFinite ? value : 0))
    }

    public static func finiteSpatialInputNumber(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }

    public static func normalizeAngleDegrees(_ value: Double) -> Double {
        let remainder = value.truncatingRemainder(dividingBy: 360)
        return remainder < 0 ? remainder + 360 : remainder
    }

    public static func shortestAngleDeltaDegrees(_ value: Double) -> Double {
        let normalized = normalizeAngleDegrees(value)
        return normalized > 180 ? normalized - 360 : normalized
    }

    public static func mapDeviceOrientationDeltaToScreen(
        betaDeltaDegrees: Double,
        gammaDeltaDegrees: Double,
        screenAngleDegrees: Double
    ) -> ScreenOrientationAxes {
        let angleRadians = normalizeAngleDegrees(screenAngleDegrees) * .pi / 180
        let cosine = cos(angleRadians)
        let sine = sin(angleRadians)
        return ScreenOrientationAxes(
            pitchDegrees: betaDeltaDegrees * cosine + gammaDeltaDegrees * sine,
            rollDegrees: gammaDeltaDegrees * cosine - betaDeltaDegrees * sine
        )
    }

    private static func elapsedSeconds(
        previousTimestampMilliseconds: Double?,
        timestampMilliseconds: Double
    ) -> Double {
        guard let previousTimestampMilliseconds,
              previousTimestampMilliseconds.isFinite,
              timestampMilliseconds > previousTimestampMilliseconds else {
            return 1 / 60
        }
        return min(
            0.1,
            max(1 / 240, (timestampMilliseconds - previousTimestampMilliseconds) / 1_000)
        )
    }
}
