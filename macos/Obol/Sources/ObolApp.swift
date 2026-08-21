import SwiftUI

@main
struct ObolApp: App {
    @StateObject private var controller = DaemonController()
    @StateObject private var updates = UpdateController()

    var body: some Scene {
        MenuBarExtra {
            PopoverView(controller: controller, updates: updates)
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(controller.liveColor)
                    .frame(width: 6, height: 6)
                Text(controller.menuTitle)
                    .font(WidgetStyle.TypeScale.row)
                    .monospacedDigit()
            }
            // Padding is constant so the item keeps its width when the popover
            // opens; only the highlight behind it appears.
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background {
                if controller.isPopoverPresented {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(.primary.opacity(0.12))
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Today's spend")
            .accessibilityValue(controller.menuTitle)
        }
        .menuBarExtraStyle(.window)
    }
}
