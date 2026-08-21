import SwiftUI

struct PopoverView: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController

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
        .onAppear {
            controller.popoverOpened()
            updates.popoverOpened()
        }
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
            iconButton(systemName: "gearshape", help: "Settings", badge: updates.hasPendingUpdate) {
                showingSettings = true
            }
            Spacer()
            iconButton(systemName: "power", help: "Quit Obol") {
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

            // Label and control are separate views rather than a plain Toggle:
            // a Toggle sizes to its content, which parks the switch against the
            // label instead of at the trailing edge the Version row sets.
            HStack(spacing: 8) {
                Text("Launch at login")
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.launchAtLogin },
                    set: { controller.setLaunchAtLogin($0) }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .accessibilityLabel("Launch at login")
            }
            .font(WidgetStyle.TypeScale.row)
            .padding(.vertical, 14)

            hairline

            updateRow

            hairline

            HStack(spacing: 8) {
                Text("Version")
                Spacer(minLength: 8)
                Text(Self.appVersion)
                    .monospacedDigit()
            }
            .font(WidgetStyle.TypeScale.caption)
            .foregroundStyle(.secondary)
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Version")
            .accessibilityValue(Self.appVersion)
        }
    }

    private var updateRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text("Updates")
                Spacer(minLength: 8)
                updateControl
            }

            switch updates.state {
            case .available:
                HStack(spacing: 10) {
                    Button("What's new") { updates.openReleaseNotes() }
                    Button("Skip this version") { updates.skipCurrentVersion() }
                }
                .buttonStyle(.link)
                .font(WidgetStyle.TypeScale.caption)
            case let .failed(message):
                Text(message)
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            default:
                EmptyView()
            }
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .animation(.easeInOut(duration: 0.15), value: updates.state)
    }

    @ViewBuilder
    private var updateControl: some View {
        switch updates.state {
        case .idle:
            Button("Check") { updates.manualCheck() }
                .buttonStyle(.link)
                .frame(height: 20)
        case .checking:
            ProgressView()
                .controlSize(.small)
                .frame(width: 20, height: 20)
        case let .upToDate(checkedAt):
            Text("Up to date")
                .foregroundStyle(.secondary)
                .frame(height: 20)
                .help(updates.checkedAtHelp(checkedAt))
        case let .available(entry):
            Button("Update to \(entry.version?.description ?? entry.tagName)") { updates.beginUpdate() }
                .buttonStyle(.link)
                .foregroundStyle(Color.accentColor)
                .frame(height: 20)
        case let .downloading(progress):
            HStack(spacing: 7) {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                    .frame(width: 110)
                Text("\(Int(progress * 100))%")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .frame(height: 20)
        case .readyToInstall:
            Button("Install and Relaunch") { updates.installReadyUpdate() }
                .buttonStyle(.link)
                .frame(height: 20)
        case .installing:
            ProgressView()
                .controlSize(.small)
                .frame(width: 20, height: 20)
        case .failed:
            Button("Retry") { updates.manualCheck() }
                .buttonStyle(.link)
                .frame(height: 20)
        }
    }

    /// Read from the bundle rather than a constant, so the number in Settings
    /// can never drift from the one the packaging script stamps on the build.
    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        guard let build = info?["CFBundleVersion"] as? String, build != short else { return short }
        return "\(short) (\(build))"
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
        badge: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(WidgetStyle.TypeScale.icon)
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 5, height: 5)
                            .offset(x: 1, y: -1)
                    }
                }
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .help(help)
        .accessibilityLabel(badge ? "\(help), update available" : help)
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
