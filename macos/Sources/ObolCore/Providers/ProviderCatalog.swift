import Foundation

public struct ProviderColor: Sendable, Equatable {
    public let red: Double
    public let green: Double
    public let blue: Double

    public init(red: Double, green: Double, blue: Double) {
        self.red = red
        self.green = green
        self.blue = blue
    }
}

public struct ProviderIdentity: Sendable, Equatable {
    public let id: String
    public let name: String
    public let website: String
    public let colorDark: ProviderColor
    public let colorLight: ProviderColor

    public init(
        id: String,
        name: String,
        website: String,
        colorDark: ProviderColor,
        colorLight: ProviderColor
    ) {
        self.id = id
        self.name = name
        self.website = website
        self.colorDark = colorDark
        self.colorLight = colorLight
    }
}

public enum ProviderCatalog {
    public static let providers: [ProviderIdentity] = [
        ProviderIdentity(
            id: "claude",
            name: "Claude Code",
            website: "https://claude.ai",
            colorDark: ProviderColor(red: 0.85, green: 0.38, blue: 0.24),
            colorLight: ProviderColor(red: 0.75, green: 0.28, blue: 0.14)
        ),
        ProviderIdentity(
            id: "codex",
            name: "OpenAI Codex",
            website: "https://openai.com",
            colorDark: ProviderColor(red: 0.31, green: 0.75, blue: 0.57),
            colorLight: ProviderColor(red: 0.11, green: 0.52, blue: 0.37)
        ),
        ProviderIdentity(
            id: "cursor",
            name: "Cursor",
            website: "https://cursor.com",
            colorDark: ProviderColor(red: 0.55, green: 0.42, blue: 0.76),
            colorLight: ProviderColor(red: 0.42, green: 0.31, blue: 0.66)
        ),
        ProviderIdentity(
            id: "gemini",
            name: "Gemini CLI",
            website: "https://gemini.google.com",
            colorDark: ProviderColor(red: 0.36, green: 0.56, blue: 0.94),
            colorLight: ProviderColor(red: 0.18, green: 0.44, blue: 0.82)
        ),
        ProviderIdentity(
            id: "copilot",
            name: "GitHub Copilot",
            website: "https://github.com/features/copilot",
            colorDark: ProviderColor(red: 0.62, green: 0.49, blue: 0.30),
            colorLight: ProviderColor(red: 0.54, green: 0.43, blue: 0.23)
        ),
        ProviderIdentity(
            id: "opencode",
            name: "OpenCode",
            website: "https://opencode.ai",
            colorDark: ProviderColor(red: 0.15, green: 0.60, blue: 0.72),
            colorLight: ProviderColor(red: 0.05, green: 0.45, blue: 0.56)
        ),
        ProviderIdentity(
            id: "continue",
            name: "Continue",
            website: "https://continue.dev",
            colorDark: ProviderColor(red: 0.87, green: 0.25, blue: 0.50),
            colorLight: ProviderColor(red: 0.75, green: 0.10, blue: 0.40)
        ),
        ProviderIdentity(
            id: "openai",
            name: "OpenAI",
            website: "https://openai.com",
            colorDark: ProviderColor(red: 0.60, green: 0.63, blue: 0.67),
            colorLight: ProviderColor(red: 0.55, green: 0.56, blue: 0.60)
        ),
    ]

    public static func normalize(_ value: String) -> String {
        String(value.lowercased().filter { $0.isLetter || $0.isNumber })
    }

    public static func match(_ agent: String) -> ProviderIdentity? {
        let normalized = normalize(agent)
        return providers.sorted { $0.id.count > $1.id.count }.first { normalized.contains($0.id) }
    }

    public static func name(for agent: String) -> String {
        match(agent)?
            .name ?? (agent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Unknown" : agent.capitalized)
    }
}
