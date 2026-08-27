import Foundation

struct SpatialAnyCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    init?(intValue: Int) {
        stringValue = String(intValue)
        self.intValue = intValue
    }
}

func unknownCodingKeys(
    in decoder: Decoder,
    allowedKeys: Set<String>
) throws -> [String] {
    let values = try decoder.container(keyedBy: SpatialAnyCodingKey.self)
    return values.allKeys
        .map(\.stringValue)
        .filter { !allowedKeys.contains($0) }
        .sorted()
}

func rejectUnknownCodingKeys(
    in decoder: Decoder,
    allowedKeys: Set<String>,
    typeName: String
) throws {
    let unknownKeys = try unknownCodingKeys(in: decoder, allowedKeys: allowedKeys)
    guard unknownKeys.isEmpty else {
        throw DecodingError.dataCorrupted(
            .init(
                codingPath: decoder.codingPath,
                debugDescription: "Unknown \(typeName) keys: \(unknownKeys.joined(separator: ", "))."
            )
        )
    }
}
