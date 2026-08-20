import Foundation
import UserNotifications

final class Notifier {
    private var previousStatus: BudgetStatus?

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func observe(_ summary: UsageSummary) {
        defer { previousStatus = summary.budgetStatus }
        guard let previousStatus, previousStatus != summary.budgetStatus else { return }
        guard summary.budgetStatus == .warn || summary.budgetStatus == .over else { return }

        let content = UNMutableNotificationContent()
        content.title = summary.budgetStatus == .over ? "Token budget exceeded" : "Token budget warning"
        content.body = summary.budget.reason ?? "Your configured token budget threshold was crossed."
        content.sound = .default
        let request = UNNotificationRequest(identifier: "obol-budget", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
