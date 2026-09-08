import Foundation

/// How fresh the snapshot on screen is, in the popover's words.
///
/// The daemon stamps `updatedAt` as ISO-8601 and has written it both with and
/// without fractional seconds, so both spellings are accepted. Formatting lives
/// here rather than in the view because the phrasing is the contract the
/// header's live indicator is read against, and it is worth a test.
public enum Recency {
    private static let fractionalISO8601 = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let wholeISO8601 = Date.ISO8601FormatStyle(includingFractionalSeconds: false)

    public static func parse(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        if let date = try? fractionalISO8601.parse(raw) {
            return date
        }
        return try? wholeISO8601.parse(raw)
    }

    /// Whether a summary is old enough to be worth asking the daemon to rebuild.
    ///
    /// Opening the menu bar used to force a full refresh every time, which on a
    /// large history meant re-reading every transcript for a figure the event
    /// stream had already delivered. A summary younger than the daemon's own
    /// refresh floor cannot be improved by asking again.
    /// An unreadable or missing timestamp counts as stale: better one refresh
    /// too many than a popover that will not update.
    public static func isStale(updatedAt raw: String?, now: Date, olderThan: TimeInterval) -> Bool {
        guard let updated = parse(raw) else { return true }
        // A timestamp in the future is a clock that moved, not fresh data.
        return abs(now.timeIntervalSince(updated)) >= olderThan
    }

    /// Deliberately terse — it sits beside the live pill in a row that also
    /// carries a title and a button, so it gets one short word of space.
    /// A timestamp from the future reads as "Just now" rather than counting up.
    public static func label(updatedAt raw: String?, now: Date) -> String {
        guard let updated = parse(raw) else { return "Not synced" }
        let minutes = max(0, Int(now.timeIntervalSince(updated) / 60))
        switch minutes {
        case ..<1:
            return "Just now"
        case ..<60:
            return "\(minutes)m ago"
        case ..<1440:
            return "\(minutes / 60)h ago"
        default:
            return "\(minutes / 1440)d ago"
        }
    }
}
