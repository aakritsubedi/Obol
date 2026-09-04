import SwiftUI

/// Toolbar-style glyph button. Hierarchical rendering softens the symbol;
/// hovering lifts it to primary color over a faint rounded fill so the hit
/// target is discoverable without adding chrome at rest.
struct IconButton: View {
    let systemName: String
    let help: String
    var badge = false
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(WidgetStyle.TypeScale.icon)
                .symbolRenderingMode(.hierarchical)
                .frame(width: 24, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.primary.opacity(hovering ? 0.07 : 0))
                )
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 5, height: 5)
                            .offset(x: 1, y: -1)
                    }
                }
                .foregroundStyle(hovering ? Color.primary : Color.secondary)
                .animation(.easeOut(duration: 0.12), value: hovering)
                .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(help)
        .accessibilityLabel(badge ? "\(help), update available" : help)
    }
}
