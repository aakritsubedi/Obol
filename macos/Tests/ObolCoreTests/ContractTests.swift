@testable import ObolCore
import XCTest

final class ContractTests: XCTestCase {
    private func data(named name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    func testSummaryFixtureDecodes() throws {
        let summary = try JSONDecoder().decode(UsageSummary.self, from: data(named: "summary"))
        XCTAssertEqual(summary.today.period, "2026-09-04")
        XCTAssertEqual(summary.agents.first?.agent, "codex")
        XCTAssertEqual(summary.today.modelsUsed, ["gpt-5"])
        XCTAssertEqual(summary.budget.status, .ok)
    }

    func testReportFixtureDecodesEnvelope() throws {
        let report = try JSONDecoder().decode(UsageReport.self, from: data(named: "report"))
        XCTAssertEqual(report.daily.count, 1)
        XCTAssertEqual(report.daily.first?.totalCost, 12.5)
        XCTAssertEqual(report.projects.count, 0)
    }

    func testJournalFixtureDecodesContractFields() throws {
        let journal = try JSONDecoder().decode(DayJournal.self, from: data(named: "journal"))
        XCTAssertEqual(journal.providers, ["codex"])
        XCTAssertEqual(journal.idleMinutes, 15)
        XCTAssertEqual(journal.sessions.first?.outputTokens, nil)
        XCTAssertEqual(journal.projects.first?.providers, ["codex"])
    }
}
