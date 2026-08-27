// swift-tools-version: 6.3

import PackageDescription

let package = Package(
    name: "AgenticGraphAppleSpatialInput",
    platforms: [
        .iOS(.v18),
        .visionOS(.v2),
        .macOS(.v15)
    ],
    products: [
        .library(
            name: "AgenticGraphSpatialCore",
            targets: ["AgenticGraphSpatialCore"]
        ),
        .library(
            name: "AgenticGraphAppleSpatialInput",
            targets: ["AgenticGraphAppleSpatialInput"]
        ),
        .library(
            name: "AgenticGraphRealityKitFlight",
            targets: ["AgenticGraphRealityKitFlight"]
        )
    ],
    targets: [
        .target(
            name: "AgenticGraphSpatialCore",
            path: "packages/apple-spatial-input-swift/Sources/AgenticGraphSpatialCore"
        ),
        .target(
            name: "AgenticGraphAppleSpatialInput",
            dependencies: ["AgenticGraphSpatialCore"],
            path: "packages/apple-spatial-input-swift/Sources/AgenticGraphAppleSpatialInput"
        ),
        .target(
            name: "AgenticGraphRealityKitFlight",
            dependencies: ["AgenticGraphSpatialCore"],
            path: "packages/apple-spatial-input-swift/Sources/AgenticGraphRealityKitFlight"
        ),
        .testTarget(
            name: "AgenticGraphSpatialCoreTests",
            dependencies: ["AgenticGraphSpatialCore"],
            path: "packages/apple-spatial-input-swift/Tests/AgenticGraphSpatialCoreTests"
        ),
        .testTarget(
            name: "AgenticGraphAppleSpatialInputTests",
            dependencies: ["AgenticGraphAppleSpatialInput"],
            path: "packages/apple-spatial-input-swift/Tests/AgenticGraphAppleSpatialInputTests"
        ),
        .testTarget(
            name: "AgenticGraphRealityKitFlightTests",
            dependencies: ["AgenticGraphRealityKitFlight"],
            path: "packages/apple-spatial-input-swift/Tests/AgenticGraphRealityKitFlightTests"
        )
    ],
    swiftLanguageModes: [.v6]
)
