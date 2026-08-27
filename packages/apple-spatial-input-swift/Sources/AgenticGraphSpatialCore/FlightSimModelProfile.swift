import Foundation

public let flightSimFixedStepSeconds = 1.0 / 60
public let flightSimStallSpeedMetersPerSecond = 7.0
public let flightSimFullControlSpeedMetersPerSecond = 12.0
public let flightSimMinimumControlAuthority = 0.3
public let flightSimStallNoseDropRadiansPerSecond = 0.42
public let flightSimStablePitchRadians = 0.28
public let flightSimStableRollRadians = 0.35

public enum FlightSimModelProfileError: Error, Equatable, Sendable {
    case unsupportedSchema(String)
    case invalidValue(name: String, minimum: Double, maximum: Double?)
    case invalidSpeedOrder
    case stableAttitudeExceedsMaximum
}

public struct FlightSimModelProfile: Codable, Equatable, Sendable {
    public static let schemaIdentifier = "agenticgraph.flight-model/v1"

    public let schema: String
    public let maximumStepSeconds: Double
    public let maximumPitchRadians: Double
    public let maximumRollRadians: Double
    public let pitchRateRadiansPerSecond: Double
    public let rollRateRadiansPerSecond: Double
    public let yawRateRadiansPerSecond: Double
    public let bankTurnRate: Double
    public let throttleRatePerSecond: Double
    public let thrustAcceleration: Double
    public let liftCoefficient: Double
    public let baseDrag: Double
    public let speedDrag: Double
    public let gravity: Double
    public let velocityAlignmentRate: Double
    public let maximumAirspeedMetersPerSecond: Double
    public let stallSpeedMetersPerSecond: Double
    public let fullControlSpeedMetersPerSecond: Double
    public let minimumControlAuthority: Double
    public let stallNoseDropRadiansPerSecond: Double
    public let stablePitchRadians: Double
    public let stableRollRadians: Double

    public init(
        schema: String = Self.schemaIdentifier,
        maximumStepSeconds: Double = 0.25,
        maximumPitchRadians: Double = .pi * 0.28,
        maximumRollRadians: Double = .pi * 0.38,
        pitchRateRadiansPerSecond: Double = 0.72,
        rollRateRadiansPerSecond: Double = 1.08,
        yawRateRadiansPerSecond: Double = 0.58,
        bankTurnRate: Double = 0.42,
        throttleRatePerSecond: Double = 0.48,
        thrustAcceleration: Double = 10.5,
        liftCoefficient: Double = 0.07,
        baseDrag: Double = 0.018,
        speedDrag: Double = 0.0018,
        gravity: Double = 9.81,
        velocityAlignmentRate: Double = 0.42,
        maximumAirspeedMetersPerSecond: Double = 48,
        stallSpeedMetersPerSecond: Double = flightSimStallSpeedMetersPerSecond,
        fullControlSpeedMetersPerSecond: Double = flightSimFullControlSpeedMetersPerSecond,
        minimumControlAuthority: Double = flightSimMinimumControlAuthority,
        stallNoseDropRadiansPerSecond: Double = flightSimStallNoseDropRadiansPerSecond,
        stablePitchRadians: Double = flightSimStablePitchRadians,
        stableRollRadians: Double = flightSimStableRollRadians
    ) throws {
        guard schema == Self.schemaIdentifier else {
            throw FlightSimModelProfileError.unsupportedSchema(schema)
        }
        try Self.requireRange(maximumStepSeconds, "maximumStepSeconds", 1.0 / 1_000, 1)
        try Self.requireRange(maximumPitchRadians, "maximumPitchRadians", 0.01, .pi / 2)
        try Self.requireRange(maximumRollRadians, "maximumRollRadians", 0.01, .pi / 2)
        for (name, value) in [
            ("pitchRateRadiansPerSecond", pitchRateRadiansPerSecond),
            ("rollRateRadiansPerSecond", rollRateRadiansPerSecond),
            ("yawRateRadiansPerSecond", yawRateRadiansPerSecond),
            ("bankTurnRate", bankTurnRate),
            ("throttleRatePerSecond", throttleRatePerSecond),
            ("thrustAcceleration", thrustAcceleration),
            ("liftCoefficient", liftCoefficient),
            ("baseDrag", baseDrag),
            ("speedDrag", speedDrag),
            ("gravity", gravity),
            ("maximumAirspeedMetersPerSecond", maximumAirspeedMetersPerSecond),
            ("fullControlSpeedMetersPerSecond", fullControlSpeedMetersPerSecond),
            ("stallNoseDropRadiansPerSecond", stallNoseDropRadiansPerSecond),
            ("stablePitchRadians", stablePitchRadians),
            ("stableRollRadians", stableRollRadians),
        ] {
            try Self.requireRange(value, name, 0, nil)
        }
        try Self.requireRange(
            stallSpeedMetersPerSecond,
            "stallSpeedMetersPerSecond",
            .leastNonzeroMagnitude,
            nil
        )
        try Self.requireRange(velocityAlignmentRate, "velocityAlignmentRate", 0, 1)
        try Self.requireRange(minimumControlAuthority, "minimumControlAuthority", 0, 1)
        guard stallSpeedMetersPerSecond < fullControlSpeedMetersPerSecond,
              fullControlSpeedMetersPerSecond <= maximumAirspeedMetersPerSecond else {
            throw FlightSimModelProfileError.invalidSpeedOrder
        }
        guard stablePitchRadians <= maximumPitchRadians,
              stableRollRadians <= maximumRollRadians else {
            throw FlightSimModelProfileError.stableAttitudeExceedsMaximum
        }

        self.schema = schema
        self.maximumStepSeconds = maximumStepSeconds
        self.maximumPitchRadians = maximumPitchRadians
        self.maximumRollRadians = maximumRollRadians
        self.pitchRateRadiansPerSecond = pitchRateRadiansPerSecond
        self.rollRateRadiansPerSecond = rollRateRadiansPerSecond
        self.yawRateRadiansPerSecond = yawRateRadiansPerSecond
        self.bankTurnRate = bankTurnRate
        self.throttleRatePerSecond = throttleRatePerSecond
        self.thrustAcceleration = thrustAcceleration
        self.liftCoefficient = liftCoefficient
        self.baseDrag = baseDrag
        self.speedDrag = speedDrag
        self.gravity = gravity
        self.velocityAlignmentRate = velocityAlignmentRate
        self.maximumAirspeedMetersPerSecond = maximumAirspeedMetersPerSecond
        self.stallSpeedMetersPerSecond = stallSpeedMetersPerSecond
        self.fullControlSpeedMetersPerSecond = fullControlSpeedMetersPerSecond
        self.minimumControlAuthority = minimumControlAuthority
        self.stallNoseDropRadiansPerSecond = stallNoseDropRadiansPerSecond
        self.stablePitchRadians = stablePitchRadians
        self.stableRollRadians = stableRollRadians
    }

    public static let `default`: FlightSimModelProfile = {
        do { return try FlightSimModelProfile() }
        catch { preconditionFailure("Invalid canonical flight-model defaults: \(error)") }
    }()

    private static func requireRange(
        _ value: Double,
        _ name: String,
        _ minimum: Double,
        _ maximum: Double?
    ) throws {
        guard value.isFinite,
              value >= minimum,
              maximum.map({ value <= $0 }) ?? true else {
            throw FlightSimModelProfileError.invalidValue(
                name: name,
                minimum: minimum,
                maximum: maximum
            )
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schema
        case maximumStepSeconds
        case maximumPitchRadians
        case maximumRollRadians
        case pitchRateRadiansPerSecond
        case rollRateRadiansPerSecond
        case yawRateRadiansPerSecond
        case bankTurnRate
        case throttleRatePerSecond
        case thrustAcceleration
        case liftCoefficient
        case baseDrag
        case speedDrag
        case gravity
        case velocityAlignmentRate
        case maximumAirspeedMetersPerSecond
        case stallSpeedMetersPerSecond
        case fullControlSpeedMetersPerSecond
        case minimumControlAuthority
        case stallNoseDropRadiansPerSecond
        case stablePitchRadians
        case stableRollRadians
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "flight-model profile"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            schema: try values.decode(String.self, forKey: .schema),
            maximumStepSeconds: try values.decode(Double.self, forKey: .maximumStepSeconds),
            maximumPitchRadians: try values.decode(Double.self, forKey: .maximumPitchRadians),
            maximumRollRadians: try values.decode(Double.self, forKey: .maximumRollRadians),
            pitchRateRadiansPerSecond: try values.decode(Double.self, forKey: .pitchRateRadiansPerSecond),
            rollRateRadiansPerSecond: try values.decode(Double.self, forKey: .rollRateRadiansPerSecond),
            yawRateRadiansPerSecond: try values.decode(Double.self, forKey: .yawRateRadiansPerSecond),
            bankTurnRate: try values.decode(Double.self, forKey: .bankTurnRate),
            throttleRatePerSecond: try values.decode(Double.self, forKey: .throttleRatePerSecond),
            thrustAcceleration: try values.decode(Double.self, forKey: .thrustAcceleration),
            liftCoefficient: try values.decode(Double.self, forKey: .liftCoefficient),
            baseDrag: try values.decode(Double.self, forKey: .baseDrag),
            speedDrag: try values.decode(Double.self, forKey: .speedDrag),
            gravity: try values.decode(Double.self, forKey: .gravity),
            velocityAlignmentRate: try values.decode(Double.self, forKey: .velocityAlignmentRate),
            maximumAirspeedMetersPerSecond: try values.decode(
                Double.self,
                forKey: .maximumAirspeedMetersPerSecond
            ),
            stallSpeedMetersPerSecond: try values.decode(
                Double.self,
                forKey: .stallSpeedMetersPerSecond
            ),
            fullControlSpeedMetersPerSecond: try values.decode(
                Double.self,
                forKey: .fullControlSpeedMetersPerSecond
            ),
            minimumControlAuthority: try values.decode(Double.self, forKey: .minimumControlAuthority),
            stallNoseDropRadiansPerSecond: try values.decode(
                Double.self,
                forKey: .stallNoseDropRadiansPerSecond
            ),
            stablePitchRadians: try values.decode(Double.self, forKey: .stablePitchRadians),
            stableRollRadians: try values.decode(Double.self, forKey: .stableRollRadians)
        )
    }
}
