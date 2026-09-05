import Foundation

/// How fresh the snapshot on screen is, in the popover's words.
///
/// The daemon stamps `updatedAt` as ISO-8601 and has written it both with and
/// without fractional seconds, so both spellings are accepted. Formatting lives
/// here rather than in the view because the phrasing is the contract the
/// header's live indicator is read against, and it is worth a test.
public enum Recency {
    public static func parse(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
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
