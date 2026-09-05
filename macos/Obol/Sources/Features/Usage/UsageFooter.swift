import SwiftUI

/// The popover's action row. Freshness moved up beside the live indicator in
/// the header, so this is only the three places to go from here: the dashboard,
/// settings, and out.
struct UsageFooter: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    let onOpenSettings: () -> Void
    @State private var dashboardHovered = false

    var body: some View {
        HStack(spacing: 4) {
            Button(action: controller.openDashboard) {
                Label("Dashboard", systemImage: "rectangle.topthird.inset.filled")
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 10)
                    .frame(height: 28)
                    .background(
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Color.primary.opacity(dashboardHovered ? 0.13 : 0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .strokeBorder(WidgetStyle.hairline, lineWidth: 0.5)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            }
            .buttonStyle(.plain)
            .onHover { dashboardHovered = $0 }
            .disabled(!controller.connected)
            .opacity(controller.connected ? 1 : 0.4)
            .help(controller.connected ? "Open dashboard" : "Dashboard starts with the daemon")

            Spacer(minLength: 8)

            IconButton(systemName: "gearshape", help: "Settings", badge: updates.hasPendingUpdate) {
                onOpenSettings()
            }
            IconButton(systemName: "power", help: "Quit Obol") {
                controller.quit()
            }
        }
    }
}
