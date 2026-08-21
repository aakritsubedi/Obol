@testable import ObolUpdateCore
import XCTest

final class ReleaseFeedTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    func testFullFixtureAndAssetSelection() throws {
        let entry = try JSONDecoder().decode(ReleaseFeedEntry.self, from: fixture("full-release"))
        XCTAssertEqual(entry.tagName, "v0.2.0")
        XCTAssertEqual(entry.updateAsset(expectedName: "Obol-0.2.0.zip")?.name, "Obol-0.2.0.zip")
        XCTAssertEqual(entry.updateAsset(expectedName: "Obol-0.2.0.dmg")?.name, "Obol-0.2.0.zip")
        XCTAssertEqual(
            entry.sha256(
                forFileNamed: "Obol-0.2.0.zip",
                inSums: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  Obol-0.2.0.zip\n"
            ),
            String(repeating: "a", count: 64)
        )
        XCTAssertEqual(
            entry.sha256(
                forFileNamed: "Obol-0.2.0.zip",
                inSums: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa *Obol-0.2.0.zip\n"
            ),
            String(repeating: "a", count: 64)
        )
    }

    func testMissingDigestAndForwardCompatibleFields() throws {
        let digestNull = try JSONDecoder().decode(ReleaseFeedEntry.self, from: fixture("digest-null"))
        XCTAssertNil(digestNull.assets.first?.digest)
        XCTAssertNoThrow(try JSONDecoder().decode(ReleaseFeedEntry.self, from: fixture("unknown-fields")))
    }

    func testMissingOrUnusableArtifactsAreRefusedBySelection() throws {
        let empty = try JSONDecoder().decode(ReleaseFeedEntry.self, from: fixture("empty-assets"))
        XCTAssertNil(empty.updateAsset(expectedName: "Obol-0.2.2.zip"))
        let dmg = try JSONDecoder().decode(ReleaseFeedEntry.self, from: fixture("only-dmg"))
        XCTAssertNil(dmg.updateAsset(expectedName: "Obol-0.2.3.zip"))
        XCTAssertThrowsError(try JSONDecoder().decode(ReleaseFeedEntry.self, from: fixture("missing-tag")))
    }
}
