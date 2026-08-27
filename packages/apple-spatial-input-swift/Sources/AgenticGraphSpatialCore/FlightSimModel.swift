import Foundation

public enum FlightSimModelError: Error, Equatable, Sendable {
    case invalidStep(maximumSeconds: Double)
    case invalidAirspeed
    case nonFiniteState
    case nonFiniteResult
}

public struct FlightSimAircraftState: Codable, Equatable, Sendable {
    public let position: SpatialVector3
    public let velocity: SpatialVector3
    public let pitch: Double
    public let roll: Double
    public let yaw: Double
    public let throttle: Double

    public init(
        position: SpatialVector3 = .zero,
        velocity: SpatialVector3 = .zero,
        pitch: Double = 0,
        roll: Double = 0,
        yaw: Double = 0,
        throttle: Double = 0
    ) {
        self.position = position
        self.velocity = velocity
        self.pitch = pitch
        self.roll = roll
        self.yaw = yaw
        self.throttle = throttle
    }

    public static let stationary = FlightSimAircraftState()

    public var isFinite: Bool {
        position.isFinite
            && velocity.isFinite
            && pitch.isFinite
            && roll.isFinite
            && yaw.isFinite
            && throttle.isFinite
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case position
        case velocity
        case pitch
        case roll
        case yaw
        case throttle
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "flight state"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        position = try values.decode(SpatialVector3.self, forKey: .position)
        velocity = try values.decode(SpatialVector3.self, forKey: .velocity)
        pitch = try values.decode(Double.self, forKey: .pitch)
        roll = try values.decode(Double.self, forKey: .roll)
        yaw = try values.decode(Double.self, forKey: .yaw)
        throttle = try values.decode(Double.self, forKey: .throttle)
    }
}

public func normalizeFlightSimAngle(_ value: Double) -> Double {
    let turn = Double.pi * 2
    var normalized = (value + Double.pi).truncatingRemainder(dividingBy: turn)
    if normalized < 0 { normalized += turn }
    return normalized - Double.pi
}

public func flightSimForwardVector(pitch: Double, yaw: Double) -> SpatialVector3 {
    let horizontal = cos(pitch)
    return SpatialVector3(
        x: -sin(yaw) * horizontal,
        y: sin(pitch),
        z: -cos(yaw) * horizontal
    )
}

public func flightSimAirspeed(_ state: FlightSimAircraftState) -> Double {
    state.velocity.length
}

public func flightSimHeadingDegrees(yaw: Double) -> Double {
    let heading = (-yaw * 180 / .pi).truncatingRemainder(dividingBy: 360)
    return heading < 0 ? heading + 360 : heading
}

public func flightSimControlAuthority(
    airspeed: Double,
    profile: FlightSimModelProfile = .default
) throws -> Double {
    guard airspeed.isFinite, airspeed >= 0 else { throw FlightSimModelError.invalidAirspeed }
    let normalized = min(1, max(0, airspeed / profile.fullControlSpeedMetersPerSecond))
    return profile.minimumControlAuthority + (1 - profile.minimumControlAuthority) * normalized
}

public func flightSimStallSeverity(
    airspeed: Double,
    profile: FlightSimModelProfile = .default
) throws -> Double {
    guard airspeed.isFinite, airspeed >= 0 else { throw FlightSimModelError.invalidAirspeed }
    return min(
        1,
        max(0, (profile.stallSpeedMetersPerSecond - airspeed) / profile.stallSpeedMetersPerSecond)
    )
}

public func integrateFlightModel(
    previous: FlightSimAircraftState,
    inputValue: FlightSimTickInput,
    stepSeconds: Double = flightSimFixedStepSeconds,
    profile: FlightSimModelProfile = .default
) throws -> FlightSimAircraftState {
    guard stepSeconds.isFinite,
          stepSeconds > 0,
          stepSeconds <= profile.maximumStepSeconds else {
        throw FlightSimModelError.invalidStep(maximumSeconds: profile.maximumStepSeconds)
    }
    guard previous.isFinite else { throw FlightSimModelError.nonFiniteState }
    let input = try normalizeFlightSimInput(inputValue)
    let speed = flightSimAirspeed(previous)
    let controlAuthority = try flightSimControlAuthority(airspeed: speed, profile: profile)
    let stallSeverity = try flightSimStallSeverity(airspeed: speed, profile: profile)
    let pitchTarget = previous.pitch + (
        input.pitch * profile.pitchRateRadiansPerSecond * controlAuthority
            - stallSeverity * profile.stallNoseDropRadiansPerSecond
    ) * stepSeconds
    let rollTarget = previous.roll
        + input.roll * profile.rollRateRadiansPerSecond * controlAuthority * stepSeconds
    let pitchCandidate = input.pitch == 0
        ? pitchTarget * exp(-0.28 * stepSeconds)
        : pitchTarget
    let rollCandidate = input.roll == 0
        ? rollTarget * exp(-0.5 * stepSeconds)
        : rollTarget
    let pitch = min(profile.maximumPitchRadians, max(-profile.maximumPitchRadians, pitchCandidate))
    let roll = min(profile.maximumRollRadians, max(-profile.maximumRollRadians, rollCandidate))
    let yaw = normalizeFlightSimAngle(previous.yaw + (
        input.yaw * profile.yawRateRadiansPerSecond - sin(roll) * profile.bankTurnRate
    ) * controlAuthority * stepSeconds)
    let throttle = min(
        1,
        max(0, previous.throttle + input.throttleDelta * profile.throttleRatePerSecond * stepSeconds)
    )
    let forward = flightSimForwardVector(pitch: pitch, yaw: yaw)
    let forwardSpeed = max(0, previous.velocity.dot(forward))
    let lift = min(
        profile.gravity * 1.8,
        forwardSpeed * forwardSpeed * profile.liftCoefficient * cos(roll)
    )
    let dragCoefficient = profile.baseDrag + speed * profile.speedDrag
    let alignedVelocity = speed > 1e-8
        ? previous.velocity + (forward * speed - previous.velocity)
            * (profile.velocityAlignmentRate * stepSeconds)
        : previous.velocity
    let acceleration = SpatialVector3(
        x: forward.x * profile.thrustAcceleration * throttle
            - alignedVelocity.x * dragCoefficient,
        y: forward.y * profile.thrustAcceleration * throttle
            + lift - profile.gravity - alignedVelocity.y * dragCoefficient,
        z: forward.z * profile.thrustAcceleration * throttle
            - alignedVelocity.z * dragCoefficient
    )
    var velocity = alignedVelocity + acceleration * stepSeconds
    let nextSpeed = velocity.length
    if nextSpeed > profile.maximumAirspeedMetersPerSecond {
        velocity = velocity * (profile.maximumAirspeedMetersPerSecond / nextSpeed)
    }
    let result = FlightSimAircraftState(
        position: previous.position + velocity * stepSeconds,
        velocity: velocity,
        pitch: pitch,
        roll: roll,
        yaw: yaw,
        throttle: throttle
    )
    guard result.isFinite else { throw FlightSimModelError.nonFiniteResult }
    return result
}
