import SwiftUI

/// The accumulated usage and live-session screen of the menu-bar popover.
///
/// The root popover owns only which screen is showing; this view owns the
/// usage screen's section order and spacing.
struct UsagePanel: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    @ObservedObject var currency: CurrencyController
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            UsageHeader(controller: controller, currency: currency)

            ProviderBreakdown(controller: controller, currency: currency)
                .padding(.top, 26)

            hairline
                .padding(.top, 18)

            TodayShapeSection(journal: controller.todayJournal)
                .padding(.top, 14)

            if TodayShapeSection.activeMinutes(in: controller.todayJournal) > 0 {
                hairline
                    .padding(.top, 14)
            }

            ActiveSessionsSection(controller: controller, currency: currency)
                .padding(.top, 14)

            if let statusMessage = controller.statusMessage {
                Text(statusMessage)
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
            }

            hairline
                .padding(.top, 17)

            UsageFooter(controller: controller, updates: updates, onOpenSettings: onOpenSettings)
                .padding(.top, 10)
        }
    }

    private var hairline: some View {
        Rectangle()
            .fill(WidgetStyle.hairline)
            .frame(height: 1)
    }
}
