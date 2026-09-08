@testable import ObolCore
import XCTest

final class ServerSentEventsTests: XCTestCase {
    private func events(_ lines: [String]) -> [ServerSentEvent] {
        var parser = ServerSentEventParser()
        return lines.compactMap { parser.consume(line: $0) }
    }

    func testDispatchesOnTheBlankLineThatEndsAnEvent() {
        let lines = ["event: summary", "data: {\"today\":1}", ""]
        XCTAssertEqual(events(lines), [ServerSentEvent(event: "summary", data: "{\"today\":1}")])
        // Nothing is dispatched before the terminating blank line.
        XCTAssertEqual(events(Array(lines.dropLast())), [])
    }

    func testReadsSeveralEventsFromOneStream() {
        let parsed = events([
            "event: summary", "data: one", "",
            "event: summary", "data: two", "",
        ])
        XCTAssertEqual(parsed.map(\.data), ["one", "two"])
    }

    /// The daemon writes `data: {json}`; the single space after the colon is
    /// framing, not payload, and eating it would corrupt every decode.
    func testStripsOnlyTheOneSpaceAfterTheColon() {
        XCTAssertEqual(events(["data:  padded", ""]).first?.data, " padded")
        XCTAssertEqual(events(["data:tight", ""]).first?.data, "tight")
    }

    func testJoinsMultipleDataLinesWithNewlines() {
        XCTAssertEqual(events(["data: first", "data: second", ""]).first?.data, "first\nsecond")
    }

    func testDefaultsToMessageWhenTheStreamNamesNoEvent() {
        XCTAssertEqual(events(["data: bare", ""]).first?.event, "message")
    }

    func testIgnoresCommentKeepalivesAndUnknownFields() {
        let parsed = events([": keep-alive", "id: 7", "retry: 100", "event: summary", "data: kept", ""])
        XCTAssertEqual(parsed, [ServerSentEvent(event: "summary", data: "kept")])
    }

    func testTreatsACarriageReturnAsPartOfTheFraming() {
        XCTAssertEqual(events(["event: summary\r", "data: crlf\r", "\r"]).first?.data, "crlf")
    }

    /// A blank line with no data is a keep-alive, not an empty summary to decode.
    func testDoesNotDispatchAnEventThatCarriedNoData() {
        XCTAssertEqual(events(["", "", "event: summary", ""]), [])
    }

    func testResetDiscardsAHalfReadEventAfterADrop() {
        var parser = ServerSentEventParser()
        _ = parser.consume(line: "event: summary")
        _ = parser.consume(line: "data: partial")
        parser.reset()
        XCTAssertNil(parser.consume(line: ""))
        _ = parser.consume(line: "data: fresh")
        XCTAssertEqual(parser.consume(line: "")?.data, "fresh")
    }
}
