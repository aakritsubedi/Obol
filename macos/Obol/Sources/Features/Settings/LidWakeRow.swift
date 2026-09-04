import SwiftUI

struct LidWakeRow: View {
    @ObservedObject var controller: DaemonController

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Keep going with the lid closed")
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.lidWakeEnabled },
                    set: { controller.setKeepAwakeWithLidClosed($0) }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .accessibilityLabel("Keep going with the lid closed")
            }

            Text(lidWakeCaption)
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .disabled(!controller.keepAwakeEnabled)
        .opacity(controller.keepAwakeEnabled ? 1 : 0.5)
        .animation(.easeInOut(duration: 0.15), value: controller.keepAwakeEnabled)
        .animation(.easeInOut(duration: 0.15), value: controller.lidWakeEnabled)
        .animation(.easeInOut(duration: 0.15), value: controller.lidWakeHolding)
    }

    /// The password is the part worth saying before the switch is touched; once
    /// it has been given, the caption goes back to reporting what is happening.
    private var lidWakeCaption: String {
        guard controller.keepAwakeEnabled else {
            return "Turn on Keep awake first."
        }
        guard controller.lidWakeEnabled else {
            return "Will ask for the administrator password once."
        }
        return controller.lidWakeHolding
            ? "Sleep is off, so closing the lid leaves the run going."
            : "Nothing is running, so closing the lid sleeps as usual."
    }
}
