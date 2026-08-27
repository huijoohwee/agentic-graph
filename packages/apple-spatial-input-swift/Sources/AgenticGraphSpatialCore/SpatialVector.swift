import Foundation

public enum SpatialVectorError: Error, Equatable, Sendable {
    case expectedThreeComponents
    case nonFinite
}

public struct SpatialVector3: Codable, Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let z: Double

    public init(x: Double = 0, y: Double = 0, z: Double = 0) {
        self.x = x
        self.y = y
        self.z = z
    }

    public static let zero = SpatialVector3()
    public static let up = SpatialVector3(x: 0, y: 1, z: 0)

    public var isFinite: Bool { x.isFinite && y.isFinite && z.isFinite }
    public var length: Double { (x * x + y * y + z * z).squareRoot() }

    public func dot(_ other: Self) -> Double {
        x * other.x + y * other.y + z * other.z
    }

    public static func + (left: Self, right: Self) -> Self {
        Self(x: left.x + right.x, y: left.y + right.y, z: left.z + right.z)
    }

    public static func - (left: Self, right: Self) -> Self {
        Self(x: left.x - right.x, y: left.y - right.y, z: left.z - right.z)
    }

    public static func * (left: Self, right: Double) -> Self {
        Self(x: left.x * right, y: left.y * right, z: left.z * right)
    }

    public func normalized(or fallback: Self = .zero) -> Self {
        let length = length
        guard length.isFinite, length > .ulpOfOne else { return fallback }
        return self * (1 / length)
    }

    public init(from decoder: Decoder) throws {
        var values = try decoder.unkeyedContainer()
        guard values.count == 3 else { throw SpatialVectorError.expectedThreeComponents }
        x = try values.decode(Double.self)
        y = try values.decode(Double.self)
        z = try values.decode(Double.self)
        guard values.isAtEnd else { throw SpatialVectorError.expectedThreeComponents }
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(x)
        try values.encode(y)
        try values.encode(z)
    }
}
