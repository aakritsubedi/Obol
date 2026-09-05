import ObolCore
import SwiftUI

struct UsageHeader: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var currency: CurrencyController

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text("Today")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                freshnessControls
            }

            totalAmount
        }
    }

    /// Refresh, the last-sync time and the live indicator answer one question —
    /// how current is the number below them — so they travel as a single
    /// trailing cluster instead of being split between the header and the
    /// footer. The pill anchors the right edge; the quieter two lead into it.
    private var freshnessControls: some View {
        HStack(spacing: 4) {
            IconButton(systemName: "arrow.clockwise", help: "Refresh usage") {
                Task { await controller.refresh() }
            }
            .disabled(!controller.connected || controller.isRefreshing)
            .opacity(controller.isRefreshing ? 0.4 : 1)

            TimelineView(.periodic(from: .now, by: 30)) { context in
                Text(controller.isRefreshing
                    ? "Updating…"
                    : Recency.label(updatedAt: controller.summary.updatedAt, now: context.date))
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
                    .lineLimit(1)
            }

            statusLabel
                .padding(.leading, 2)
        }
        .fixedSize(horizontal: true, vertical: false)
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
        HStack(spacing: 5) {
            Circle()
                .fill(liveStatusColor)
                .frame(width: 5, height: 5)
                .modifier(PulsingDot(active: !controller.summary.stale))
            Text(controller.liveLabel)
                .font(WidgetStyle.TypeScale.status)
        }
        .foregroundStyle(liveStatusColor)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Capsule().fill(liveStatusColor.opacity(0.12)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(controller.liveLabel)
    }

    private var liveStatusColor: Color {
        controller.summary.stale ? WidgetStyle.warning : WidgetStyle.success
    }
}
