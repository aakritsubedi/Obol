import AppKit
import SwiftUI

/// Visual constants shared by the popover and the menu bar label.
enum WidgetStyle {
    // MARK: - Metrics

    static let popoverWidth: CGFloat = 340
    static let inset: CGFloat = 18

    // MARK: - Color

    /// Provider hues are tuned per appearance. The dark-mode values are chosen
    /// to glow slightly against a near-black card; the same values over a white
    /// popover fall below a comfortable contrast ratio, so light mode gets
    /// deeper, more saturated variants.
    static let claude = adaptive(
        dark: NSColor(srgbRed: 0.85, green: 0.38, blue: 0.24, alpha: 1),
        light: NSColor(srgbRed: 0.75, green: 0.28, blue: 0.14, alpha: 1)
    )

    static let codex = adaptive(
        dark: NSColor(srgbRed: 0.31, green: 0.75, blue: 0.57, alpha: 1),
        light: NSColor(srgbRed: 0.11, green: 0.52, blue: 0.37, alpha: 1)
    )

    static let warning = adaptive(
        dark: NSColor(srgbRed: 1.0, green: 0.66, blue: 0.18, alpha: 1),
        light: NSColor(srgbRed: 0.72, green: 0.35, blue: 0.03, alpha: 1)
    )

    static let danger = adaptive(
        dark: NSColor(srgbRed: 1.0, green: 0.36, blue: 0.34, alpha: 1),
        light: NSColor(srgbRed: 0.78, green: 0.10, blue: 0.10, alpha: 1)
    )

    static let hairline = Color.primary.opacity(0.09)

    private static func adaptive(dark: NSColor, light: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
        })
    }

    // MARK: - Type

    /// One scale for the whole widget. Hierarchy comes from color and size,
    /// never from weight: only the total is bold, only the status is medium.
    enum TypeScale {
        /// Today's total. Display-size numerals need tightening; SF Pro's
        /// default tracking is set for text, not for 38pt figures.
        static let hero = Font.system(size: 38, weight: .bold)
        static let heroTracking: CGFloat = -1.2

        /// Card title — "Today", "Settings".
        static let title = Font.system(size: 13)
        /// Subsection label — "By provider". Small size plus positive
        /// tracking reads as a quiet overline above the rows it names.
        static let sectionLabel = Font.system(size: 11)
        static let sectionLabelTracking: CGFloat = 0.4
        /// Provider names, amounts, the settings toggle.
        static let row = Font.system(size: 13)
        static let status = Font.system(size: 13, weight: .medium)
        static let icon = Font.system(size: 13, weight: .regular)
        /// Error and status text.
        static let caption = Font.system(size: 11)
    }
}
