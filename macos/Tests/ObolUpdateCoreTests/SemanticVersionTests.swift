import XCTest
@testable import ObolUpdateCore

final class SemanticVersionTests: XCTestCase {
    func testStrictParsingAndBuildMetadata() {
        XCTAssertEqual(SemanticVersion(parsing: "v0.2.0+ci.1")?.description, "0.2.0")
        XCTAssertNil(SemanticVersion(parsing: "1.2"))
        XCTAssertNil(SemanticVersion(parsing: "1.2.3.4"))
        XCTAssertNil(SemanticVersion(parsing: "01.2.3"))
        XCTAssertNil(SemanticVersion(parsing: "1.2.3-01"))
    }

    func testSemverPrecedence() {
        XCTAssertLessThan(SemanticVersion(parsing: "1.0.0-rc.1")!, SemanticVersion(parsing: "1.0.0")!)
        XCTAssertGreaterThan(SemanticVersion(parsing: "0.10.0")!, SemanticVersion(parsing: "0.9.0")!)
        XCTAssertEqual(SemanticVersion(parsing: "v0.2.0")!, SemanticVersion(parsing: "0.2.0")!)
    }

    func testUpdatePolicy() {
        XCTAssertEqual(
            evaluateUpdate(current: "0.2.0", candidateTag: "v0.2.0", skippedVersion: nil, allowPrerelease: false),
            .upToDate
        )
        XCTAssertEqual(
            evaluateUpdate(current: "0.2.0", candidateTag: "v0.3.0", skippedVersion: "0.3.0", allowPrerelease: false),
            .skipped(SemanticVersion(parsing: "0.3.0")!)
        )
        XCTAssertEqual(
            evaluateUpdate(current: "0.2.0", candidateTag: "v0.3.0", skippedVersion: nil, allowPrerelease: false),
            .update(to: SemanticVersion(parsing: "0.3.0")!)
        )
        XCTAssertEqual(
            evaluateUpdate(current: "not-a-version", candidateTag: "v0.3.0", skippedVersion: nil, allowPrerelease: false),
            .unreadable("The installed version is unreadable")
        )
        XCTAssertEqual(
            evaluateUpdate(current: "0.2.0", candidateTag: "v0.3.0-rc.1", skippedVersion: nil, allowPrerelease: false),
            .upToDate
        )
    }
}
