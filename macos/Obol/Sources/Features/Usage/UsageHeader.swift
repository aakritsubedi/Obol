import SwiftUI

struct UsageHeader: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var currency: CurrencyController

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("Today")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                statusLabel

                IconButton(systemName: "arrow.triangle.2.circlepath", help: "Refresh usage") {
                    Task { await controller.refresh() }
                }
                IconButton(
                    systemName: "arrow.up.forward.square",
                    help: controller.connected ? "Open dashboard" : "Dashboard starts with the daemon"
                ) {
                    controller.openDashboard()
                }
                .disabled(!controller.connected)
                .opacity(controller.connected ? 1 : 0.35)
                .animation(.easeOut(duration: 0.15), value: controller.connected)
            }

            totalAmount
        }
    }

    /// Symbol and value are separate runs so the locale-aware currency
    /// formatter never gets a chance to render `US$`; they are styled
    /// identically so the total still reads as one number.
    private var totalAmount: some View {
        let value = currency.amount(controller.summary.today.totalCost)
        let tracking = WidgetStyle.TypeScale.heroTracking

        return HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(currency.symbol)
                .tracking(tracking)
            Text(value)
                .monospacedDigit()
                .tracking(tracking)
        }
        .font(WidgetStyle.TypeScale.hero)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        // Roll the digits when a refresh lands rather than snapping to the
        // new total; the bar below eases with the same curve.
        .contentTransition(.numericText())
        .animation(.easeOut(duration: 0.35), value: value)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Spent today")
        .accessibilityValue("\(value) \(currency.active.name)")
    }

    private var statusLabel: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(liveStatusColor)
                .frame(width: 6, height: 6)
                .modifier(PulsingDot(active: !controller.summary.stale))
            Text(controller.liveLabel)
                .font(WidgetStyle.TypeScale.status)
        }
        .foregroundStyle(liveStatusColor)
        .padding(.trailing, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(controller.liveLabel)
    }

    private var liveStatusColor: Color {
        controller.summary.stale ? WidgetStyle.warning : WidgetStyle.success
    }
}
