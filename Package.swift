// swift-tools-version: 6.3

import PackageDescription

let package = Package(
    name: "KnowgrphAppleSpatialInput",
    platforms: [
        .iOS(.v18),
        .visionOS(.v2),
        .macOS(.v15)
    ],
    products: [
        .library(
            name: "KnowgrphSpatialCore",
            targets: ["KnowgrphSpatialCore"]
        ),
        .library(
            name: "KnowgrphAppleSpatialInput",
            targets: ["KnowgrphAppleSpatialInput"]
        ),
        .library(
            name: "KnowgrphRealityKitFlight",
            targets: ["KnowgrphRealityKitFlight"]
        )
    ],
    targets: [
        .target(
            name: "KnowgrphSpatialCore",
            path: "packages/apple-spatial-input-swift/Sources/KnowgrphSpatialCore"
        ),
        .target(
            name: "KnowgrphAppleSpatialInput",
            dependencies: ["KnowgrphSpatialCore"],
            path: "packages/apple-spatial-input-swift/Sources/KnowgrphAppleSpatialInput"
        ),
        .target(
            name: "KnowgrphRealityKitFlight",
            dependencies: ["KnowgrphSpatialCore"],
            path: "packages/apple-spatial-input-swift/Sources/KnowgrphRealityKitFlight"
        ),
        .testTarget(
            name: "KnowgrphSpatialCoreTests",
            dependencies: ["KnowgrphSpatialCore"],
            path: "packages/apple-spatial-input-swift/Tests/KnowgrphSpatialCoreTests"
        ),
        .testTarget(
            name: "KnowgrphAppleSpatialInputTests",
            dependencies: ["KnowgrphAppleSpatialInput"],
            path: "packages/apple-spatial-input-swift/Tests/KnowgrphAppleSpatialInputTests"
        ),
        .testTarget(
            name: "KnowgrphRealityKitFlightTests",
            dependencies: ["KnowgrphRealityKitFlight"],
            path: "packages/apple-spatial-input-swift/Tests/KnowgrphRealityKitFlightTests"
        )
    ],
    swiftLanguageModes: [.v6]
)
