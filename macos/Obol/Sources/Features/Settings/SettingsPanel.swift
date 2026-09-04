import AppKit
import SwiftUI

/// The settings screen of the menu-bar popover.
///
/// Picker and row state live with their own feature-local views, while this
/// screen owns their order and the separators that make the panel scan.
struct SettingsPanel: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    @ObservedObject var currency: CurrencyController
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text("Settings")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                IconButton(systemName: "xmark", help: "Back to usage") {
                    onClose()
                }
            }

            hairline
                .padding(.top, 14)

            CurrencyPicker(currency: currency)

            hairline

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

            KeepAwakeRow(controller: controller)

            hairline

            LidWakeRow(controller: controller)

            if controller.notificationsDenied {
                hairline

                HStack(spacing: 8) {
                    Text("Budget alerts are disabled in System Settings.")
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Button("Open") { Self.openNotificationSettings() }
                        .buttonStyle(.link)
                }
                .font(WidgetStyle.TypeScale.caption)
                .foregroundStyle(.secondary)
                .padding(.vertical, 14)
                .accessibilityElement(children: .combine)
            }

            hairline

            UpdateRow(updates: updates)

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
        .onAppear { currency.settingsOpened() }
    }

    /// Read from the bundle rather than a constant, so the number in Settings
    /// can never drift from the one the packaging script stamps on the build.
    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        guard let build = info?["CFBundleVersion"] as? String, build != short else { return short }
        return "\(short) (\(build))"
    }

    private static func openNotificationSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.notifications") else { return }
        NSWorkspace.shared.open(url)
    }

    private var hairline: some View {
        Rectangle()
            .fill(WidgetStyle.hairline)
            .frame(height: 1)
    }
}
