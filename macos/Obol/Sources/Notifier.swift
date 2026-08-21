import Foundation
import UserNotifications

/// Presents budget-threshold notifications for status transitions observed by `DaemonController`.
///
/// Detection stays client-side for now; docs/enhancement-plan.md §2.2 tracks the daemon-side alert
/// engine that will replace this with per-alert ids, acks, and configurable cooldowns.
final class Notifier {
    /// Minimum delay between two notifications, so a ratio flapping around a threshold cannot spam
    /// the user even after a recovery clears the deduplication record.
    fileprivate static let cooldown: TimeInterval = 30 * 60

    private var previousKey: String?
    private let fired = FiredRecord()

    /// True when macOS denied notification authorization; surfaced in the settings panel.
    private(set) var authorizationDenied = false
    var onAuthorizationChange: ((Bool) -> Void)?

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            DispatchQueue.main.async {
                self?.setAuthorizationDenied(!granted)
            }
        }
    }

    func observe(_ summary: UsageSummary) {
        defer { previousKey = key(for: summary) }
        guard summary.budgetStatus != .ok else {
            fired.clear()
            return
        }

        let key = key(for: summary)
        // Only a status+period pair not seen in the previous observation notifies. Comparing keys
        // rather than requiring a previous non-nil status means an app launched already over budget
        // alerts once instead of silently seeding state, and a day that rolls over while still over
        // budget gets a fresh alert for the new period.
        guard key != previousKey else { return }
        guard !fired.matches(key), !fired.withinCooldown() else { return }

        let content = UNMutableNotificationContent()
        content.title = summary.budgetStatus == .over ? "Token budget exceeded" : "Token budget warning"
        content.body = summary.budget.reason ?? "Your configured token budget threshold was crossed."
        content.sound = .default
        // Unique per status+period so simultaneous daily and monthly alerts both persist in
        // Notification Center instead of replacing each other.
        let request = UNNotificationRequest(identifier: "obol-budget.\(key)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
        fired.record(key)
    }

    private func key(for summary: UsageSummary) -> String {
        "\(summary.budgetStatus.rawValue):\(summary.today.period)"
    }

    private func setAuthorizationDenied(_ denied: Bool) {
        guard denied != authorizationDenied else { return }
        authorizationDenied = denied
        onAuthorizationChange?(denied)
    }
}

/// Persists the last fired alert so a quit/relaunch cycle does not re-notify for the same crossing.
private struct FiredRecord {
    private let defaults = UserDefaults.standard
    private let keyStorageKey = "obol.budgetAlert.key"
    private let timeStorageKey = "obol.budgetAlert.firedAt"

    func matches(_ key: String) -> Bool {
        defaults.string(forKey: keyStorageKey) == key
    }

    func withinCooldown(now: Date = Date()) -> Bool {
        guard let firedAt = defaults.object(forKey: timeStorageKey) as? Date else { return false }
        return now.timeIntervalSince(firedAt) < Notifier.cooldown
    }

    func record(_ key: String, at date: Date = Date()) {
        defaults.set(key, forKey: keyStorageKey)
        defaults.set(date, forKey: timeStorageKey)
    }

    func clear() {
        defaults.removeObject(forKey: keyStorageKey)
        defaults.removeObject(forKey: timeStorageKey)
    }
}
