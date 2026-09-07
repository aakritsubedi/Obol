import SwiftUI

struct ProviderBreakdown: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var currency: CurrencyController

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("By provider")
                .font(WidgetStyle.TypeScale.sectionLabel)
                .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                .foregroundStyle(.secondary)

            if controller.summary.agents.isEmpty {
                Text("No provider activity today.")
                    .font(WidgetStyle.TypeScale.row)
                    .foregroundStyle(.secondary)
            } else {
                providerBar
                    .padding(.bottom, 2)
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(controller.summary.agents) { provider in
                        HStack(spacing: 10) {
                            ProviderBadge(agent: provider.agent, size: 20)
                            HStack(spacing: 1) {
                                Text(ProviderPresentation.name(for: provider.agent))
                                if provider.billing == "subscription" {
                                    Text("*")
                                        .font(.caption2)
                                        .baselineOffset(4)
                                }
                            }
                            Spacer(minLength: 8)
                            // Tokens are secondary context beside the money:
                            // smaller, muted, and pinned to a fixed-width
                            // column so the price stays the aligned anchor.
                            Text(UsageClient.compactTokens(provider.totalTokens))
                                .monospacedDigit()
                                .font(WidgetStyle.TypeScale.caption)
                                .foregroundStyle(.secondary)
                                .frame(minWidth: 36, alignment: .trailing)
                            Text(currency.display(provider.totalCost))
                                .monospacedDigit()
                        }
                        .font(WidgetStyle.TypeScale.row)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(
                            "\(ProviderPresentation.name(for: provider.agent)) "
                                + "\(UsageClient.compactTokens(provider.totalTokens)) tokens, "
                                + "\(currency.amount(provider.totalCost)) \(currency.active.name)"
                        )
                    }
                }
                if controller.summary.agents.contains(where: { $0.billing == "subscription" }) {
                    Text("* Subscription-provider costs are token-priced estimates, not invoices.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var providerBar: some View {
        GeometryReader { geometry in
            let providers = controller.summary.agents.filter { $0.totalCost > 0 }
            let total = providers.reduce(0) { $0 + $1.totalCost }
            let weights = providers.map(\.totalCost)
            let gap: CGFloat = 3
            let availableWidth = max(0, geometry.size.width - gap * CGFloat(max(0, providers.count - 1)))
            let minimumWidth = min(3, availableWidth / CGFloat(max(1, providers.count)))
            let proportionalWidth = max(0, availableWidth - minimumWidth * CGFloat(providers.count))

            HStack(spacing: gap) {
                if total > 0 {
                    ForEach(providers) { provider in
                        Capsule()
                            .fill(ProviderPresentation.color(for: provider.agent))
                            .frame(width: minimumWidth + proportionalWidth * provider.totalCost / total)
                    }
                } else {
                    Rectangle()
                        .fill(WidgetStyle.hairline)
                        .frame(maxWidth: .infinity)
                }
            }
            .clipShape(Capsule())
            .animation(.easeOut(duration: 0.35), value: weights)
        }
        .frame(height: 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Provider cost split")
    }
}
