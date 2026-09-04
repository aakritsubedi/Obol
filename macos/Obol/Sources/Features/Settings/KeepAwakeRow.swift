import SwiftUI

struct KeepAwakeRow: View {
    @ObservedObject var controller: DaemonController

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Keep awake")
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.keepAwakeEnabled },
                    set: { controller.setKeepAwake($0) }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .accessibilityLabel("Keep awake")
            }

            Text(keepAwakeCaption)
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .animation(.easeInOut(duration: 0.15), value: controller.keepAwakeEnabled)
        .animation(.easeInOut(duration: 0.15), value: controller.keepAwakeHolding)
    }

    private var keepAwakeCaption: String {
        guard controller.keepAwakeEnabled else {
            return "Your Mac sleeps on its usual schedule."
        }
        let count = controller.activeSessions.count
        guard count > 0 else {
            return "Nothing is running, so your Mac sleeps as usual."
        }
        return count == 1
            ? "Holding sleep off while 1 session runs."
            : "Holding sleep off while \(count) sessions run."
    }
}
