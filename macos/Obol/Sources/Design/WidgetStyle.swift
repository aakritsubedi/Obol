import AppKit
import SwiftUI

/// Visual constants shared by the popover and the menu bar label.
enum WidgetStyle {
    // MARK: - Metrics

    static let popoverWidth: CGFloat = 340
    static let inset: CGFloat = 18

    /// The panel the popover is drawn in: the card, and the arrow that points
    /// it at the menu bar item. Shared by the shape that draws the chrome and
    /// by the geometry that places the window under the status item.
    enum Chrome {
        static let cornerRadius: CGFloat = 12
        static let arrowWidth: CGFloat = 30
        static let arrowHeight: CGFloat = 12
        static let arrowTipRadius: CGFloat = 3
        /// How far the flanks flare out into the card's top edge.
        static let arrowJoinRadius: CGFloat = 6
        /// Space between the bottom of the menu bar and the arrow's tip.
        static let menuBarGap: CGFloat = 1
        /// The closest the card comes to a screen edge before it stops
        /// following the status item.
        static let screenInset: CGFloat = 8
    }

    // MARK: - Color

    /// Status hues, tuned per appearance. The dark-mode values are chosen to
    /// glow slightly against a near-black card; the same values over a white
    /// popover fall below a comfortable contrast ratio, so light mode gets
    /// deeper, more saturated variants. Provider hues are a separate set and
    /// live in ProviderCatalog, which mirrors the dashboard's provider config.
    static let success = adaptive(
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

    static func adaptive(dark: NSColor, light: NSColor) -> Color {
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
        /// The live/cached pill. It shares its row with the refresh button and
        /// the last-sync time, so it sits at caption size and earns its weight
        /// from the medium face and its hue, not from being larger.
        static let status = Font.system(size: 11, weight: .medium)
        static let icon = Font.system(size: 13, weight: .regular)
        /// Error and status text.
        static let caption = Font.system(size: 11)
        /// A note attached to the row above it — the exchange-rate receipt, the
        /// keep-awake explainer. One step under `caption` so it reads as part of
        /// that row rather than as a line competing with it.
        static let footnote = Font.system(size: 10)
    }
}
