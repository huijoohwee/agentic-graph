import Foundation

public enum FlightSimCameraView: String, Codable, CaseIterable, Sendable {
    case chase
    case cockpit
    case survey
}

public enum FlightSimCameraError: Error, Equatable, Sendable {
    case unsupportedSchema(String)
    case invalidPositiveValue(String)
    case invalidFieldOfView(String)
    case nonFiniteSnapshot
}

public struct FlightSimCameraProfile: Codable, Equatable, Sendable {
    public static let schemaIdentifier = "agentic-graph.flight-camera/v1"
    public static let aircraftCollisionHalfSizeMeters = SpatialVector3(x: 6, y: 1.7, z: 5.5)

    public let schema: String
    public let aircraftCollisionHalfSizeMeters: SpatialVector3
    public let cockpitForwardClearanceMeters: Double
    public let cockpitVerticalClearanceMeters: Double
    public let cockpitLookAheadMeters: Double
    public let cockpitFovDegrees: Double
    public let chaseMinimumDistanceMeters: Double
    public let chaseTargetMinimumHeightMeters: Double
    public let chaseHeightMeters: Double
    public let chaseFovDegrees: Double
    public let chaseWingHalfSpanClearance: Double
    public let surveyBackDistanceMeters: Double
    public let surveyHeightMeters: Double
    public let surveyLookAheadMeters: Double
    public let surveyTargetHeightMeters: Double
    public let surveyFovDegrees: Double

    public init(
        schema: String = Self.schemaIdentifier,
        aircraftCollisionHalfSizeMeters: SpatialVector3 = Self.aircraftCollisionHalfSizeMeters,
        cockpitForwardClearanceMeters: Double = 0.55,
        cockpitVerticalClearanceMeters: Double = 0.45,
        cockpitLookAheadMeters: Double = 18,
        cockpitFovDegrees: Double = 68,
        chaseMinimumDistanceMeters: Double = 8,
        chaseTargetMinimumHeightMeters: Double = 0.8,
        chaseHeightMeters: Double = 3.2,
        chaseFovDegrees: Double = 58,
        chaseWingHalfSpanClearance: Double = 2,
        surveyBackDistanceMeters: Double = 4,
        surveyHeightMeters: Double = 18,
        surveyLookAheadMeters: Double = 5,
        surveyTargetHeightMeters: Double = 0.8,
        surveyFovDegrees: Double = 64
    ) throws {
        guard schema == Self.schemaIdentifier else {
            throw FlightSimCameraError.unsupportedSchema(schema)
        }
        for (name, value) in [
            ("aircraftCollisionHalfSizeMeters.x", aircraftCollisionHalfSizeMeters.x),
            ("aircraftCollisionHalfSizeMeters.y", aircraftCollisionHalfSizeMeters.y),
            ("aircraftCollisionHalfSizeMeters.z", aircraftCollisionHalfSizeMeters.z),
            ("cockpitForwardClearanceMeters", cockpitForwardClearanceMeters),
            ("cockpitVerticalClearanceMeters", cockpitVerticalClearanceMeters),
            ("cockpitLookAheadMeters", cockpitLookAheadMeters),
            ("chaseMinimumDistanceMeters", chaseMinimumDistanceMeters),
            ("chaseTargetMinimumHeightMeters", chaseTargetMinimumHeightMeters),
            ("chaseHeightMeters", chaseHeightMeters),
            ("chaseWingHalfSpanClearance", chaseWingHalfSpanClearance),
            ("surveyBackDistanceMeters", surveyBackDistanceMeters),
            ("surveyHeightMeters", surveyHeightMeters),
            ("surveyLookAheadMeters", surveyLookAheadMeters),
            ("surveyTargetHeightMeters", surveyTargetHeightMeters),
        ] {
            guard value.isFinite, value > 0 else {
                throw FlightSimCameraError.invalidPositiveValue(name)
            }
        }
        for (name, value) in [
            ("cockpitFovDegrees", cockpitFovDegrees),
            ("chaseFovDegrees", chaseFovDegrees),
            ("surveyFovDegrees", surveyFovDegrees),
        ] {
            guard value.isFinite, value > 1, value < 179 else {
                throw FlightSimCameraError.invalidFieldOfView(name)
            }
        }

        self.schema = schema
        self.aircraftCollisionHalfSizeMeters = aircraftCollisionHalfSizeMeters
        self.cockpitForwardClearanceMeters = cockpitForwardClearanceMeters
        self.cockpitVerticalClearanceMeters = cockpitVerticalClearanceMeters
        self.cockpitLookAheadMeters = cockpitLookAheadMeters
        self.cockpitFovDegrees = cockpitFovDegrees
        self.chaseMinimumDistanceMeters = chaseMinimumDistanceMeters
        self.chaseTargetMinimumHeightMeters = chaseTargetMinimumHeightMeters
        self.chaseHeightMeters = chaseHeightMeters
        self.chaseFovDegrees = chaseFovDegrees
        self.chaseWingHalfSpanClearance = chaseWingHalfSpanClearance
        self.surveyBackDistanceMeters = surveyBackDistanceMeters
        self.surveyHeightMeters = surveyHeightMeters
        self.surveyLookAheadMeters = surveyLookAheadMeters
        self.surveyTargetHeightMeters = surveyTargetHeightMeters
        self.surveyFovDegrees = surveyFovDegrees
    }

    public static let `default`: FlightSimCameraProfile = {
        do { return try FlightSimCameraProfile() }
        catch { preconditionFailure("Invalid canonical flight-camera defaults: \(error)") }
    }()

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schema
        case aircraftCollisionHalfSizeMeters
        case cockpitForwardClearanceMeters
        case cockpitVerticalClearanceMeters
        case cockpitLookAheadMeters
        case cockpitFovDegrees
        case chaseMinimumDistanceMeters
        case chaseTargetMinimumHeightMeters
        case chaseHeightMeters
        case chaseFovDegrees
        case chaseWingHalfSpanClearance
        case surveyBackDistanceMeters
        case surveyHeightMeters
        case surveyLookAheadMeters
        case surveyTargetHeightMeters
        case surveyFovDegrees
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "flight-camera profile"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            schema: try values.decode(String.self, forKey: .schema),
            aircraftCollisionHalfSizeMeters: try values.decode(
                SpatialVector3.self,
                forKey: .aircraftCollisionHalfSizeMeters
            ),
            cockpitForwardClearanceMeters: try values.decode(
                Double.self,
                forKey: .cockpitForwardClearanceMeters
            ),
            cockpitVerticalClearanceMeters: try values.decode(
                Double.self,
                forKey: .cockpitVerticalClearanceMeters
            ),
            cockpitLookAheadMeters: try values.decode(Double.self, forKey: .cockpitLookAheadMeters),
            cockpitFovDegrees: try values.decode(Double.self, forKey: .cockpitFovDegrees),
            chaseMinimumDistanceMeters: try values.decode(
                Double.self,
                forKey: .chaseMinimumDistanceMeters
            ),
            chaseTargetMinimumHeightMeters: try values.decode(
                Double.self,
                forKey: .chaseTargetMinimumHeightMeters
            ),
            chaseHeightMeters: try values.decode(Double.self, forKey: .chaseHeightMeters),
            chaseFovDegrees: try values.decode(Double.self, forKey: .chaseFovDegrees),
            chaseWingHalfSpanClearance: try values.decode(
                Double.self,
                forKey: .chaseWingHalfSpanClearance
            ),
            surveyBackDistanceMeters: try values.decode(
                Double.self,
                forKey: .surveyBackDistanceMeters
            ),
            surveyHeightMeters: try values.decode(Double.self, forKey: .surveyHeightMeters),
            surveyLookAheadMeters: try values.decode(Double.self, forKey: .surveyLookAheadMeters),
            surveyTargetHeightMeters: try values.decode(
                Double.self,
                forKey: .surveyTargetHeightMeters
            ),
            surveyFovDegrees: try values.decode(Double.self, forKey: .surveyFovDegrees)
        )
    }
}

public struct FlightSimCameraSnapshot: Codable, Equatable, Sendable {
    public let aircraft: FlightSimAircraftState
    public let runId: Int
    public let tick: Int

    public init(aircraft: FlightSimAircraftState, runId: Int, tick: Int) {
        self.aircraft = aircraft
        self.runId = runId
        self.tick = tick
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case aircraft, runId, tick }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "flight-camera snapshot"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        aircraft = try values.decode(FlightSimAircraftState.self, forKey: .aircraft)
        runId = try values.decode(Int.self, forKey: .runId)
        tick = try values.decode(Int.self, forKey: .tick)
    }
}

public struct FlightSimFollowTarget: Codable, Equatable, Sendable {
    public let position: SpatialVector3
    public let target: SpatialVector3
    public let fovDegrees: Double
    public let resetKey: Int
    public let sequence: Int

    public init(
        position: SpatialVector3,
        target: SpatialVector3,
        fovDegrees: Double,
        resetKey: Int,
        sequence: Int
    ) {
        self.position = position
        self.target = target
        self.fovDegrees = fovDegrees
        self.resetKey = resetKey
        self.sequence = sequence
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case position, target, fovDegrees, resetKey, sequence
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "flight-camera target"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        position = try values.decode(SpatialVector3.self, forKey: .position)
        target = try values.decode(SpatialVector3.self, forKey: .target)
        fovDegrees = try values.decode(Double.self, forKey: .fovDegrees)
        resetKey = try values.decode(Int.self, forKey: .resetKey)
        sequence = try values.decode(Int.self, forKey: .sequence)
    }
}

public func resolveFlightSimFollowTarget(
    snapshot: FlightSimCameraSnapshot,
    coordinateScale: Double,
    view: FlightSimCameraView = .chase,
    profile: FlightSimCameraProfile = .default
) throws -> FlightSimFollowTarget {
    guard snapshot.aircraft.isFinite else { throw FlightSimCameraError.nonFiniteSnapshot }
    let scale = coordinateScale.isFinite && coordinateScale > 0 ? coordinateScale : 1
    let forward = flightSimForwardVector(
        pitch: snapshot.aircraft.pitch,
        yaw: snapshot.aircraft.yaw
    )
    let aircraft = snapshot.aircraft.position * scale
    let halfSize = profile.aircraftCollisionHalfSizeMeters

    func vector(forwardDistance: Double, height: Double) -> SpatialVector3 {
        SpatialVector3(
            x: aircraft.x + forward.x * forwardDistance * scale,
            y: aircraft.y + forward.y * forwardDistance * scale + height * scale,
            z: aircraft.z + forward.z * forwardDistance * scale
        )
    }

    let chaseTargetHeight = max(profile.chaseTargetMinimumHeightMeters, halfSize.y)
    let chaseDistance = max(
        profile.chaseMinimumDistanceMeters,
        halfSize.z + halfSize.x * profile.chaseWingHalfSpanClearance
    )
    let chaseTarget = vector(forwardDistance: 0, height: chaseTargetHeight)
    let chasePosition = SpatialVector3(
        x: chaseTarget.x - forward.x * chaseDistance * scale,
        y: chaseTarget.y - forward.y * 2 * scale + profile.chaseHeightMeters * scale,
        z: chaseTarget.z - forward.z * chaseDistance * scale
    )
    let cockpitForwardDistance = halfSize.z + profile.cockpitForwardClearanceMeters
    let cockpitHeight = halfSize.y + profile.cockpitVerticalClearanceMeters
    let horizontalForwardLength = max(0.000001, hypot(forward.x, forward.z))
    let horizontalForward = SpatialVector3(
        x: forward.x / horizontalForwardLength,
        y: 0,
        z: forward.z / horizontalForwardLength
    )
    let cockpitPosition = SpatialVector3(
        x: aircraft.x + horizontalForward.x * cockpitForwardDistance * scale,
        y: aircraft.y + cockpitHeight * scale,
        z: aircraft.z + horizontalForward.z * cockpitForwardDistance * scale
    )
    let cockpitTarget = cockpitPosition + forward * (profile.cockpitLookAheadMeters * scale)

    let framing: (SpatialVector3, SpatialVector3, Double)
    switch view {
    case .cockpit:
        framing = (cockpitPosition, cockpitTarget, profile.cockpitFovDegrees)
    case .survey:
        framing = (
            vector(forwardDistance: -profile.surveyBackDistanceMeters, height: profile.surveyHeightMeters),
            vector(forwardDistance: profile.surveyLookAheadMeters, height: profile.surveyTargetHeightMeters),
            profile.surveyFovDegrees
        )
    case .chase:
        framing = (chasePosition, chaseTarget, profile.chaseFovDegrees)
    }
    return FlightSimFollowTarget(
        position: framing.0,
        target: framing.1,
        fovDegrees: framing.2,
        resetKey: snapshot.runId,
        sequence: snapshot.tick
    )
}
