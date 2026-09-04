import AppKit
import ObolCore
import SwiftUI

/// AppKit/SwiftUI presentation helpers for the shared provider identity table.
/// Brand identity and matching live in ObolCore; this layer owns only assets and
/// appearance-specific color conversion.
enum ProviderPresentation {
    static func match(_ agent: String) -> ObolCore.ProviderIdentity? {
        ObolCore.ProviderCatalog.match(agent)
    }

    static func name(for agent: String) -> String {
        ObolCore.ProviderCatalog.name(for: agent)
    }

    static func website(for agent: String) -> URL? {
        match(agent).flatMap { URL(string: $0.website) }
    }

    /// Vendored favicon for the agent, straight from the asset catalog.
    static func icon(for agent: String) -> NSImage? {
        guard let provider = match(agent) else { return nil }
        return NSImage(named: provider.id)
    }

    /// Unknown agents get a neutral gray so they never masquerade as a brand.
    static func color(for agent: String) -> Color {
        guard let provider = match(agent) else {
            return Color(nsColor: .systemGray)
        }
        let dark = NSColor(
            srgbRed: provider.colorDark.red,
            green: provider.colorDark.green,
            blue: provider.colorDark.blue,
            alpha: 1
        )
        let light = NSColor(
            srgbRed: provider.colorLight.red,
            green: provider.colorLight.green,
            blue: provider.colorLight.blue,
            alpha: 1
        )
        return WidgetStyle.adaptive(dark: dark, light: light)
    }
}

/// Rounded tile carrying the provider's real favicon on white so brand art
/// stays readable against both appearances; agents outside the catalog fall
/// back to a monogram badge tinted with their chart color.
struct ProviderBadge: View {
    let agent: String
    var size: CGFloat = 20

    var body: some View {
        if let icon = ProviderPresentation.icon(for: agent) {
            let shape = RoundedRectangle(cornerRadius: max(3, size * 0.3), style: .continuous)
            shape
                .fill(.white)
                .overlay {
                    Image(nsImage: icon)
                        .resizable()
                        .scaledToFill()
                        .frame(width: size, height: size)
                        .clipShape(shape)
                }
                .overlay {
                    shape.strokeBorder(WidgetStyle.hairline, lineWidth: 1)
                }
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        } else {
            RoundedRectangle(cornerRadius: max(3, size * 0.3), style: .continuous)
                .fill(ProviderPresentation.color(for: agent))
                .frame(width: size, height: size)
                .overlay {
                    Text(ProviderPresentation.name(for: agent).prefix(1).uppercased())
                        .font(.system(size: size * 0.48, weight: .bold))
                        .foregroundStyle(.white)
                }
                .accessibilityHidden(true)
        }
    }
}
