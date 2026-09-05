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

    /// One rhythm for the whole screen: every section is the same distance from
    /// what precedes it, and a rule sits centred in that gap rather than being
    /// nudged section by section. Only the hero total gets extra air beneath it,
    /// because 38pt figures need more room than the type they sit above.
    private enum Gap {
        static let section: CGFloat = 16
        static let afterHero: CGFloat = 22
        static let beforeFooter: CGFloat = 12
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            UsageHeader(controller: controller, currency: currency)

            ProviderBreakdown(controller: controller, currency: currency)
                .padding(.top, Gap.afterHero)

            hairline
                .padding(.top, Gap.section)

            TodayShapeSection(
                journal: controller.todayJournal,
                isLoading: controller.showsTodayJournalSkeleton,
                isUnavailable: controller.todayJournalUnavailable && controller.todayJournal == nil,
                isPresented: controller.isPopoverPresented
            )
            .padding(.top, Gap.section)

            hairline
                .padding(.top, Gap.section)

            ActiveSessionsSection(controller: controller, currency: currency)
                .padding(.top, Gap.section)

            if let statusMessage = controller.statusMessage {
                Text(statusMessage)
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Gap.beforeFooter)
            }

            hairline
                .padding(.top, Gap.section)

            UsageFooter(controller: controller, updates: updates, onOpenSettings: onOpenSettings)
                .padding(.top, Gap.beforeFooter)
        }
    }

    private var hairline: some View {
        Rectangle()
            .fill(WidgetStyle.hairline)
            .frame(height: 1)
            .padding(.horizontal, -WidgetStyle.inset)
    }
}
