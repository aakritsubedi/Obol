// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ObolCore",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "ObolCore", targets: ["ObolCore"]),
        .library(name: "ObolUpdateCore", targets: ["ObolUpdateCore"]),
    ],
    targets: [
        .target(name: "ObolCore"),
        .target(
            name: "ObolUpdateCore"
        ),
        .testTarget(
            name: "ObolCoreTests",
            dependencies: ["ObolCore"],
            path: "Tests/ObolCoreTests",
            resources: [.copy("Fixtures")]
        ),
        .testTarget(
            name: "ObolUpdateCoreTests",
            dependencies: ["ObolUpdateCore"],
            path: "Tests/ObolUpdateCoreTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
