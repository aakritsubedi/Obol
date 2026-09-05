import SwiftUI

struct UsageFooter: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    let onOpenSettings: () -> Void
    @State private var dashboardHovered = false

    var body: some View {
        HStack(spacing: 8) {
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

            HStack(spacing: 4) {
                IconButton(systemName: "arrow.clockwise", help: "Refresh usage") {
                    Task { await controller.refresh() }
                }
                .disabled(!controller.connected || controller.isRefreshing)
                .opacity(controller.isRefreshing ? 0.4 : 1)

                TimelineView(.periodic(from: .now, by: 30)) { context in
                    Text(controller.isRefreshing ? "Updating…" : recency(at: context.date))
                        .font(WidgetStyle.TypeScale.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .monospacedDigit()
                }
            }
            Spacer(minLength: 0)
            IconButton(systemName: "gearshape", help: "Settings", badge: updates.hasPendingUpdate) {
                onOpenSettings()
            }
            IconButton(systemName: "power", help: "Quit Obol") {
                controller.quit()
            }
        }
    }

    private func recency(at now: Date) -> String {
        guard let raw = controller.summary.updatedAt else { return "Not synced" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var updated = formatter.date(from: raw)
        if updated == nil {
            formatter.formatOptions = [.withInternetDateTime]
            updated = formatter.date(from: raw)
        }
        guard let updated else { return "Not synced" }
        let minutes = max(0, Int(now.timeIntervalSince(updated) / 60))
        if minutes < 1 {
            return "Just now"
        }
        if minutes < 60 {
            return "\(minutes)m ago"
        }
        if minutes < 1440 {
            return "\(minutes / 60)h ago"
        }
        return "\(minutes / 1440)d ago"
    }
}
