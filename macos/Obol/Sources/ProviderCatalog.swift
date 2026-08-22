import AppKit
import SwiftUI

/// One entry per coding agent reported by ccusage. Mirrors
/// dashboard/src/providers.tsx — update both when adding or retuning a
/// provider so the popover and dashboard stay visually in sync. Logos are
/// favicons vendored from each provider's site, stored as Providers/<id>
/// image sets in Assets.xcassets and public/providers/<id>.png on the web.
struct ProviderIdentity {
    /// Lowercase token matched inside the normalized agent string.
    let id: String
    /// Human-readable label shown instead of the raw agent string.
    let name: String
    /// Accent hue shared with the dashboard config (bars, fallback badges).
    let colorDark: NSColor
    let colorLight: NSColor
    /// Provider website; presence also signals a vendored favicon exists.
    let website: String
}

enum ProviderCatalog {
    static let providers: [ProviderIdentity] = [
        ProviderIdentity(
            id: "claude",
            name: "Claude Code",
            colorDark: NSColor(srgbRed: 0.85, green: 0.38, blue: 0.24, alpha: 1),
            colorLight: NSColor(srgbRed: 0.75, green: 0.28, blue: 0.14, alpha: 1),
            website: "https://claude.ai"
        ),
        ProviderIdentity(
            id: "codex",
            name: "OpenAI Codex",
            colorDark: NSColor(srgbRed: 0.31, green: 0.75, blue: 0.57, alpha: 1),
            colorLight: NSColor(srgbRed: 0.11, green: 0.52, blue: 0.37, alpha: 1),
            website: "https://openai.com"
        ),
        ProviderIdentity(
            id: "cursor",
            name: "Cursor",
            colorDark: NSColor(srgbRed: 0.55, green: 0.42, blue: 0.76, alpha: 1),
            colorLight: NSColor(srgbRed: 0.42, green: 0.31, blue: 0.66, alpha: 1),
            website: "https://cursor.com"
        ),
        ProviderIdentity(
            id: "gemini",
            name: "Gemini CLI",
            colorDark: NSColor(srgbRed: 0.36, green: 0.56, blue: 0.94, alpha: 1),
            colorLight: NSColor(srgbRed: 0.18, green: 0.44, blue: 0.82, alpha: 1),
            website: "https://gemini.google.com"
        ),
        ProviderIdentity(
            id: "copilot",
            name: "GitHub Copilot",
            colorDark: NSColor(srgbRed: 0.62, green: 0.49, blue: 0.30, alpha: 1),
            colorLight: NSColor(srgbRed: 0.54, green: 0.43, blue: 0.23, alpha: 1),
            website: "https://github.com/features/copilot"
        ),
        ProviderIdentity(
            id: "opencode",
            name: "OpenCode",
            colorDark: NSColor(srgbRed: 0.15, green: 0.60, blue: 0.72, alpha: 1),
            colorLight: NSColor(srgbRed: 0.05, green: 0.45, blue: 0.56, alpha: 1),
            website: "https://opencode.ai"
        ),
        ProviderIdentity(
            id: "continue",
            name: "Continue",
            colorDark: NSColor(srgbRed: 0.87, green: 0.25, blue: 0.50, alpha: 1),
            colorLight: NSColor(srgbRed: 0.75, green: 0.10, blue: 0.40, alpha: 1),
            website: "https://continue.dev"
        ),
        ProviderIdentity(
            id: "openai",
            name: "OpenAI",
            colorDark: NSColor(srgbRed: 0.60, green: 0.63, blue: 0.67, alpha: 1),
            colorLight: NSColor(srgbRed: 0.55, green: 0.56, blue: 0.60, alpha: 1),
            website: "https://openai.com"
        ),
    ]

    /// Longest ids first so specific matches win over shorter prefixes.
    private static let matchOrder = providers.sorted { $0.id.count > $1.id.count }

    static func normalize(_ value: String) -> String {
        String(value.lowercased().filter { $0.isLetter || $0.isNumber })
    }

    static func match(_ agent: String) -> ProviderIdentity? {
        let normalized = normalize(agent)
        guard !normalized.isEmpty else { return nil }
        return matchOrder.first { normalized.contains($0.id) }
    }

    static func name(for agent: String) -> String {
        match(agent)?.name ?? fallbackName(agent)
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
        return WidgetStyle.adaptive(dark: provider.colorDark, light: provider.colorLight)
    }

    private static func fallbackName(_ agent: String) -> String {
        let trimmed = agent.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Unknown" : trimmed.capitalized
    }
}

/// Rounded tile carrying the provider's real favicon on white so brand art
/// stays readable against both appearances; agents outside the catalog fall
/// back to a monogram badge tinted with their chart color.
struct ProviderBadge: View {
    let agent: String
    var size: CGFloat = 20

    var body: some View {
        if let icon = ProviderCatalog.icon(for: agent) {
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
                .fill(ProviderCatalog.color(for: agent))
                .frame(width: size, height: size)
                .overlay {
                    Text(ProviderCatalog.name(for: agent).prefix(1).uppercased())
                        .font(.system(size: size * 0.48, weight: .bold))
                        .foregroundStyle(.white)
                }
                .accessibilityHidden(true)
        }
    }
}
