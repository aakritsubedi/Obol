import SwiftUI

struct RefreshIntervalRow: View {
    @ObservedObject var controller: DaemonController

    @State private var seconds = 300
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Refresh interval")
                Spacer(minLength: 8)
                HStack(spacing: 4) {
                    TextField("Seconds", value: $seconds, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                        .monospacedDigit()
                        .frame(width: 62)
                        .focused($isFocused)
                        .onSubmit { commit() }
                        .accessibilityLabel("Refresh interval in seconds")

                    Stepper("", value: stepperValue, step: DaemonController.refreshIntervalStepSeconds)
                        .labelsHidden()
                        .controlSize(.small)

                    Text("sec")
                        .foregroundStyle(.secondary)
                }
            }

            Text("Minimum 30 seconds; use the stepper or type a value.")
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .onAppear { syncFromController() }
        .onChange(of: isFocused) { focused in
            if !focused {
                commit()
            }
        }
        .onChange(of: controller.config.refreshIntervalMs) { _ in
            if !isFocused {
                syncFromController()
            }
        }
    }

    private func syncFromController() {
        seconds = controller.refreshIntervalSeconds
    }

    private func commit() {
        seconds = normalized(seconds)
        controller.setRefreshInterval(seconds: seconds)
    }

    private var stepperValue: Binding<Int> {
        Binding(
            get: { seconds },
            set: { value in
                seconds = normalized(value)
                controller.setRefreshInterval(seconds: seconds)
            }
        )
    }

    private func normalized(_ value: Int) -> Int {
        let value = max(0, value)
        let step = DaemonController.refreshIntervalStepSeconds
        let remainder = value % step
        let rounded = remainder == 0 ? value : value + step - remainder
        return max(DaemonController.minimumRefreshIntervalSeconds, rounded)
    }
}
