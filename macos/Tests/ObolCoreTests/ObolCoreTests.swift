@testable import ObolCore
import XCTest

final class ObolCoreTests: XCTestCase {
    func testFormattingMatchesPopoverDisplay() {
        XCTAssertEqual(ObolFormatting.amount(6.66), "6.66")
        XCTAssertEqual(ObolFormatting.compactTokens(1_200_000), "1.2M")
    }

    func testRefreshScheduleUsesThreeDailySlots() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(secondsFromGMT: 0))
        let date = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 4, hour: 13)))
        XCTAssertEqual(
            calendar.component(.hour, from: RefreshSchedule.lastRefreshSlot(onOrBefore: date, calendar: calendar)),
            9
        )
        XCTAssertEqual(
            calendar.component(.hour, from: RefreshSchedule.nextRefreshSlot(after: date, calendar: calendar)),
            15
        )
    }

    func testVersionComparisonPadsMissingComponents() {
        XCTAssertEqual(VersionCompare.compare("1.2", "1.2.0"), .orderedSame)
        XCTAssertEqual(VersionCompare.compare("1.3", "1.2.9"), .orderedDescending)
    }

    func testDayShapeDistributesSessionAcrossCoveredHours() throws {
        let data = Data(
            #"{"activeMinutes":40,"firstEventAt":"2026-09-04T01:30:00Z","sessions":[{"startedAt":"2026-09-04T01:30:00Z","endedAt":"2026-09-04T02:30:00Z","activeMinutes":40}]}"#
                .utf8
        )
        let journal = try JSONDecoder().decode(DayJournal.self, from: data)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(secondsFromGMT: 0))

        let shape = DayShape.from(journal, calendar: calendar)

        XCTAssertEqual(shape.activeMinutes, 40)
        XCTAssertEqual(shape.levels[1], 2)
        XCTAssertEqual(shape.levels[2], 2)
        XCTAssertEqual(shape.peakHour, 1)
        XCTAssertEqual(DayShape.duration(shape.activeMinutes), "0h 40m")
    }
}
