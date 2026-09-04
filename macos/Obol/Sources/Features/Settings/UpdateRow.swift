import SwiftUI

struct UpdateRow: View {
    @ObservedObject var updates: UpdateController

    var body: some View {
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
}
