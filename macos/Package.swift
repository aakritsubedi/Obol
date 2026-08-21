// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ObolUpdateCore",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "ObolUpdateCore", targets: ["ObolUpdateCore"]),
    ],
    targets: [
        .target(
            name: "ObolUpdateCore",
            path: "Obol/Sources/Update"
        ),
        .testTarget(
            name: "ObolUpdateCoreTests",
            dependencies: ["ObolUpdateCore"],
            path: "Tests/ObolUpdateCoreTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
