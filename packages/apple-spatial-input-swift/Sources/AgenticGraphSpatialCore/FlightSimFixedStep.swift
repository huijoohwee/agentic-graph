import Foundation

public enum FlightSimFixedStepError: Error, Equatable, Sendable {
    case invalidMaximumCatchUpSteps
    case invalidFrameDelta
}

public struct FlightSimFixedStepAccumulator: Codable, Equatable, Sendable {
    public let maximumCatchUpSteps: Int
    public private(set) var remainderSeconds: Double

    public init(
        maximumCatchUpSteps: Int = 5,
        remainderSeconds: Double = 0
    ) throws {
        guard (1...8).contains(maximumCatchUpSteps) else {
            throw FlightSimFixedStepError.invalidMaximumCatchUpSteps
        }
        guard remainderSeconds.isFinite, remainderSeconds >= 0 else {
            throw FlightSimFixedStepError.invalidFrameDelta
        }
        self.maximumCatchUpSteps = maximumCatchUpSteps
        self.remainderSeconds = remainderSeconds
    }

    public static let `default`: FlightSimFixedStepAccumulator = {
        do { return try FlightSimFixedStepAccumulator() }
        catch { preconditionFailure("Invalid canonical fixed-step defaults: \(error)") }
    }()

    public mutating func reset() {
        remainderSeconds = 0
    }

    public mutating func consume(frameDeltaSeconds: Double) throws -> Int {
        guard frameDeltaSeconds.isFinite, frameDeltaSeconds >= 0 else {
            throw FlightSimFixedStepError.invalidFrameDelta
        }
        guard frameDeltaSeconds > 0 else { return 0 }
        let maximumAccumulatedSeconds = flightSimFixedStepSeconds * Double(maximumCatchUpSteps)
        remainderSeconds = min(maximumAccumulatedSeconds, remainderSeconds + frameDeltaSeconds)
        let stepCount = min(
            maximumCatchUpSteps,
            Int(remainderSeconds / flightSimFixedStepSeconds)
        )
        remainderSeconds -= Double(stepCount) * flightSimFixedStepSeconds
        return stepCount
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case maximumCatchUpSteps
        case remainderSeconds
    }

    public init(from decoder: Decoder) throws {
        try rejectUnknownCodingKeys(
            in: decoder,
            allowedKeys: Set(CodingKeys.allCases.map(\.rawValue)),
            typeName: "fixed-step accumulator"
        )
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            maximumCatchUpSteps: try values.decode(Int.self, forKey: .maximumCatchUpSteps),
            remainderSeconds: try values.decode(Double.self, forKey: .remainderSeconds)
        )
    }
}
