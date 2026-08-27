import Foundation

public enum SpatialInputAxis: String, Codable, CaseIterable, Sendable {
    case pitch
    case roll
    case yaw
    case throttleDelta
}

public enum SpatialInputFailureReason: String, Codable, Equatable, Sendable {
    case nan
    case infinite
}

public enum SpatialInputError: Error, Equatable, Sendable {
    case nonFinite(axis: SpatialInputAxis, sourceIndex: Int?)
}

public struct SpatialInputPatch: Codable, Equatable, Sendable {
    public let pitch: Double?
    public let roll: Double?
    public let yaw: Double?
    public let throttleDelta: Double?

    public init(
        pitch: Double? = nil,
        roll: Double? = nil,
        yaw: Double? = nil,
        throttleDelta: Double? = nil
    ) {
        self.pitch = pitch
        self.roll = roll
        self.yaw = yaw
        self.throttleDelta = throttleDelta
    }

    public subscript(axis: SpatialInputAxis) -> Double? {
        switch axis {
        case .pitch: pitch
        case .roll: roll
        case .yaw: yaw
        case .throttleDelta: throttleDelta
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case pitch
        case roll
        case yaw
        case throttleDelta
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "spatial-input patch"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        pitch = try values.decodeIfPresent(Double.self, forKey: .pitch)
        roll = try values.decodeIfPresent(Double.self, forKey: .roll)
        yaw = try values.decodeIfPresent(Double.self, forKey: .yaw)
        throttleDelta = try values.decodeIfPresent(Double.self, forKey: .throttleDelta)
    }
}

public struct FlightSimTickInput: Codable, Equatable, Sendable {
    public let pitch: Double
    public let roll: Double
    public let yaw: Double
    public let throttleDelta: Double

    public init(
        pitch: Double = 0,
        roll: Double = 0,
        yaw: Double = 0,
        throttleDelta: Double = 0
    ) {
        self.pitch = pitch
        self.roll = roll
        self.yaw = yaw
        self.throttleDelta = throttleDelta
    }

    public static let neutral = FlightSimTickInput()

    public var isFinite: Bool {
        pitch.isFinite && roll.isFinite && yaw.isFinite && throttleDelta.isFinite
    }

    public subscript(axis: SpatialInputAxis) -> Double {
        switch axis {
        case .pitch: pitch
        case .roll: roll
        case .yaw: yaw
        case .throttleDelta: throttleDelta
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case pitch
        case roll
        case yaw
        case throttleDelta
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "flight input"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        pitch = try values.decode(Double.self, forKey: .pitch)
        roll = try values.decode(Double.self, forKey: .roll)
        yaw = try values.decode(Double.self, forKey: .yaw)
        throttleDelta = try values.decode(Double.self, forKey: .throttleDelta)
    }
}

public struct FlightSimInputNormalizationFailure: Equatable, Sendable {
    public let axis: SpatialInputAxis
    public let reason: SpatialInputFailureReason

    public init(axis: SpatialInputAxis, reason: SpatialInputFailureReason) {
        self.axis = axis
        self.reason = reason
    }
}

public struct FlightSimInputNormalizationResult: Equatable, Sendable {
    public let input: FlightSimTickInput
    public let outOfRange: Bool
    public let retainedLastValid: Bool
    public let failures: [FlightSimInputNormalizationFailure]
}

public func stageFlightSimInputPatch(
    previous: FlightSimTickInput,
    patch: SpatialInputPatch
) -> FlightSimTickInput {
    FlightSimTickInput(
        pitch: patch.pitch ?? previous.pitch,
        roll: patch.roll ?? previous.roll,
        yaw: patch.yaw ?? previous.yaw,
        throttleDelta: patch.throttleDelta ?? previous.throttleDelta
    )
}

public func clampFlightSimUnit(
    _ value: Double,
    axis: SpatialInputAxis
) throws -> Double {
    guard value.isFinite else { throw SpatialInputError.nonFinite(axis: axis, sourceIndex: nil) }
    return min(1, max(-1, value))
}

public func normalizeFlightSimInput(
    _ value: SpatialInputPatch? = nil
) throws -> FlightSimTickInput {
    try FlightSimTickInput(
        pitch: clampFlightSimUnit(value?.pitch ?? 0, axis: .pitch),
        roll: clampFlightSimUnit(value?.roll ?? 0, axis: .roll),
        yaw: clampFlightSimUnit(value?.yaw ?? 0, axis: .yaw),
        throttleDelta: clampFlightSimUnit(value?.throttleDelta ?? 0, axis: .throttleDelta)
    )
}

public func normalizeFlightSimInput(
    _ value: FlightSimTickInput
) throws -> FlightSimTickInput {
    try normalizeFlightSimInput(SpatialInputPatch(
        pitch: value.pitch,
        roll: value.roll,
        yaw: value.yaw,
        throttleDelta: value.throttleDelta
    ))
}

public func normalizeFlightSimInputFrame(
    _ value: SpatialInputPatch? = nil,
    lastValid: FlightSimTickInput = .neutral
) throws -> FlightSimInputNormalizationResult {
    let retained = try normalizeFlightSimInput(lastValid)
    var outOfRange = false
    var retainedLastValid = false
    var failures: [FlightSimInputNormalizationFailure] = []

    func normalizedAxis(_ axis: SpatialInputAxis) -> Double {
        let candidate = value?[axis] ?? 0
        if candidate.isNaN {
            outOfRange = true
            retainedLastValid = true
            failures.append(.init(axis: axis, reason: .nan))
            return retained[axis]
        }
        if !candidate.isFinite {
            outOfRange = true
            failures.append(.init(axis: axis, reason: .infinite))
            return candidate.sign == .minus ? -1 : 1
        }
        if candidate < -1 || candidate > 1 { outOfRange = true }
        return min(1, max(-1, candidate))
    }

    return FlightSimInputNormalizationResult(
        input: FlightSimTickInput(
            pitch: normalizedAxis(.pitch),
            roll: normalizedAxis(.roll),
            yaw: normalizedAxis(.yaw),
            throttleDelta: normalizedAxis(.throttleDelta)
        ),
        outOfRange: outOfRange,
        retainedLastValid: retainedLastValid,
        failures: failures
    )
}

public func isFlightSimInputNeutral(_ input: FlightSimTickInput) -> Bool {
    input == .neutral
}

public func arbitrateSpatialInputAxis(
    _ values: [Double?],
    axis: SpatialInputAxis
) throws -> Double {
    var selected = 0.0
    for (sourceIndex, value) in values.enumerated() {
        guard let value else { continue }
        guard value.isFinite else {
            throw SpatialInputError.nonFinite(axis: axis, sourceIndex: sourceIndex)
        }
        let candidate = min(1, max(-1, value))
        if abs(candidate) > abs(selected) { selected = candidate }
    }
    return selected
}

public func arbitrateSpatialInput(
    _ inputs: [SpatialInputPatch?]
) throws -> FlightSimTickInput {
    try FlightSimTickInput(
        pitch: arbitrateSpatialInputAxis(inputs.map { $0?.pitch }, axis: .pitch),
        roll: arbitrateSpatialInputAxis(inputs.map { $0?.roll }, axis: .roll),
        yaw: arbitrateSpatialInputAxis(inputs.map { $0?.yaw }, axis: .yaw),
        throttleDelta: arbitrateSpatialInputAxis(inputs.map { $0?.throttleDelta }, axis: .throttleDelta)
    )
}

public func mergeFlightSimInputs(
    _ inputs: [SpatialInputPatch]
) -> FlightSimTickInput {
    func selectedAxis(_ axis: SpatialInputAxis) -> Double {
        var selected = 0.0
        for input in inputs {
            let candidate = input[axis] ?? 0
            if candidate.isNaN { return candidate }
            if abs(candidate) > abs(selected) { selected = candidate }
        }
        return selected
    }
    return FlightSimTickInput(
        pitch: selectedAxis(.pitch),
        roll: selectedAxis(.roll),
        yaw: selectedAxis(.yaw),
        throttleDelta: selectedAxis(.throttleDelta)
    )
}
