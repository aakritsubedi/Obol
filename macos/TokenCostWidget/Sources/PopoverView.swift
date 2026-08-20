import SwiftUI

struct PopoverView: View {
    @ObservedObject var controller: DaemonController

    @State private var showingSettings = false

    var body: some View {
        Group {
            if showingSettings {
                settingsPanel
            } else {
                usagePanel
            }
        }
        .padding(.horizontal, WidgetStyle.inset)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(width: WidgetStyle.popoverWidth)
        // The menu bar window is translucent by default, which lets the desktop
        // bleed through and muddies the text. Paint an opaque card instead.
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear { controller.popoverOpened() }
        .onDisappear {
            controller.popoverClosed()
            showingSettings = false
        }
    }

    // MARK: - Usage

    private var usagePanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            usageHeader

            providerBreakdown
                .padding(.top, 26)

            if let statusMessage = controller.statusMessage {
                Text(statusMessage)
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
            }

            hairline
                .padding(.top, 17)

            usageFooter
                .padding(.top, 10)
        }
    }

    private var usageHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("Today")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                statusLabel

                iconButton(systemName: "arrow.triangle.2.circlepath", help: "Refresh usage") {
                    Task { await controller.refresh() }
                }
                iconButton(systemName: "arrow.up.forward.square", help: "Open dashboard") {
                    controller.openDashboard()
                }
            }

            totalAmount
        }
    }

    /// Symbol and value are separate runs so the locale-aware currency
    /// formatter never gets a chance to render `US$`; they are styled
    /// identically so the total still reads as one number.
    private var totalAmount: some View {
        let value = UsageClient.amount(controller.summary.today.totalCost)
        let tracking = WidgetStyle.TypeScale.heroTracking

        return HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(UsageClient.currencySymbol)
                .tracking(tracking)
            Text(value)
                .monospacedDigit()
                .tracking(tracking)
        }
        .font(WidgetStyle.TypeScale.hero)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Spent today")
        .accessibilityValue("\(value) US dollars")
    }

    private var statusLabel: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(controller.liveColor)
                .frame(width: 6, height: 6)
            Text(controller.liveLabel)
                .font(WidgetStyle.TypeScale.status)
        }
        .foregroundStyle(controller.liveColor)
        .padding(.trailing, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(controller.liveLabel)
    }

    private var providerBreakdown: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("By provider")
                .font(WidgetStyle.TypeScale.sectionLabel)
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
                        HStack(spacing: 9) {
                            Circle()
                                .fill(providerColor(for: provider.agent))
                                .frame(width: 7, height: 7)
                            Text(provider.agent.capitalized)
                            Spacer(minLength: 8)
                            Text(UsageClient.currencySymbol + UsageClient.amount(provider.totalCost))
                                .monospacedDigit()
                        }
                        .font(WidgetStyle.TypeScale.row)
                    }
                }
            }
        }
    }

    private var providerBar: some View {
        GeometryReader { geometry in
            let providers = controller.summary.agents.filter { $0.totalCost > 0 }
            let total = providers.reduce(0) { $0 + $1.totalCost }

            HStack(spacing: 0) {
                if total > 0 {
                    ForEach(providers) { provider in
                        Rectangle()
                            .fill(providerColor(for: provider.agent))
                            .frame(width: max(2, geometry.size.width * provider.totalCost / total))
                    }
                } else {
                    Rectangle()
                        .fill(WidgetStyle.hairline)
                        .frame(maxWidth: .infinity)
                }
            }
            .clipShape(Capsule())
        }
        .frame(height: 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Provider cost split")
    }

    private var usageFooter: some View {
        HStack {
            iconButton(systemName: "gearshape", help: "Settings") {
                showingSettings = true
            }
            Spacer()
            iconButton(systemName: "power", help: "Quit Token Cost Widget") {
                controller.quit()
            }
        }
    }

    // MARK: - Settings

    private var settingsPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text("Settings")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                iconButton(systemName: "xmark", help: "Back to usage") {
                    showingSettings = false
                }
            }

            hairline
                .padding(.top, 14)

            Toggle("Launch at login", isOn: Binding(
                get: { controller.launchAtLogin },
                set: { controller.setLaunchAtLogin($0) }
            ))
            .font(WidgetStyle.TypeScale.row)
            .toggleStyle(.switch)
            .controlSize(.mini)
            .padding(.vertical, 14)
        }
    }

    // MARK: - Building blocks

    private var hairline: some View {
        Rectangle()
            .fill(WidgetStyle.hairline)
            .frame(height: 1)
    }

    private func iconButton(
        systemName: String,
        help: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(WidgetStyle.TypeScale.icon)
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .help(help)
        .accessibilityLabel(help)
    }

    private func providerColor(for name: String) -> Color {
        switch name.lowercased() {
        case "claude":
            return WidgetStyle.claude
        case "codex":
            return WidgetStyle.codex
        default:
            return .secondary
        }
    }
}
