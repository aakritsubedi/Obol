import Foundation

/// The 24-hour activity projection shown by the menu-bar popover.
///
/// This is deliberately Foundation-only: the view owns the color ramp and
/// layout, while this type owns the time bucketing and ISO-8601 parsing.
public struct DayShape: Equatable, Sendable {
    public let activeMinutes: Double
    public let levels: [Int]
    public let startedAt: String?
    public let peakHour: Int?

    public init(
        activeMinutes: Double = 0,
        levels: [Int] = Array(repeating: 0, count: 24),
        startedAt: String? = nil,
        peakHour: Int? = nil
    ) {
        self.activeMinutes = activeMinutes
        self.levels = levels
        self.startedAt = startedAt
        self.peakHour = peakHour
    }

    /// Distributes each session's active minutes across the wall-clock hours
    /// it covered, preserving the popover's original weighting semantics.
    public static func from(_ journal: DayJournal, calendar: Calendar = .current) -> DayShape {
        var minutes = Array(repeating: 0.0, count: 24)
        guard let first = parseDate(journal.firstEventAt),
              let midnight = calendar.date(
                  from: calendar.dateComponents([.year, .month, .day], from: first)
              )
        else {
            return DayShape()
        }

        let bounds = (0 ... 24).compactMap {
            calendar.date(byAdding: .hour, value: $0, to: midnight)
        }
        guard bounds.count == 25 else { return DayShape() }

        for session in journal.sessions {
            guard let start = parseDate(session.startedAt) else { continue }
            let end = parseDate(session.endedAt) ?? start
            let spans = (0 ..< 24).map { hour in
                max(
                    0,
                    min(end.timeIntervalSince1970, bounds[hour + 1].timeIntervalSince1970)
                        - max(start.timeIntervalSince1970, bounds[hour].timeIntervalSince1970)
                )
            }
            let covered = spans.reduce(0, +)
            if covered > 0 {
                for hour in 0 ..< 24 {
                    minutes[hour] += session.activeMinutes * spans[hour] / covered
                }
            }
        }

        let peak = minutes.enumerated().max(by: { $0.element < $1.element })
        return DayShape(
            activeMinutes: journal.activeMinutes,
            levels: minutes.map(level),
            startedAt: journal.firstEventAt,
            peakHour: peak?.offset
        )
    }

    public static func level(_ minutes: Double) -> Int {
        minutes < 1 ? 0 : minutes <= 15 ? 1 : minutes <= 30 ? 2 : minutes <= 45 ? 3 : 4
    }

    public static func duration(_ minutes: Double) -> String {
        "\(Int(minutes) / 60)h \(Int(minutes) % 60)m"
    }

    public static func hourLabel(_ hour: Int) -> String {
        hour == 0 ? "12" : hour > 12 ? "\(hour - 12)" : "\(hour)"
    }

    public static func clock(_ iso: String?) -> String {
        guard let date = parseDate(iso) else { return "—" }
        return date.formatted(.dateTime.hour().minute())
    }

    public static func parseDate(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: iso) ?? {
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: iso)
        }()
    }

    public static func accessibilityLabel(_ shape: DayShape) -> String {
        "Work started at \(clock(shape.startedAt)), \(duration(shape.activeMinutes)) active today"
            + (shape.peakHour.map { ", busiest around \(hourLabel($0))" } ?? "")
    }
}
