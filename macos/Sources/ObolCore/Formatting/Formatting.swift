import Foundation

public enum ObolFormatting {
    private static let amountStyle = FloatingPointFormatStyle<Double>.number
        .precision(.fractionLength(2))
    private static let compactStyle = FloatingPointFormatStyle<Double>.number
        .precision(.fractionLength(0 ... 1))

    public static func amount(_ value: Double) -> String {
        value.formatted(amountStyle)
    }

    public static func compactTokens(_ value: Double) -> String {
        switch value {
        case 1_000_000_000...:
            return (value / 1_000_000_000).formatted(compactStyle) + "B"
        case 1_000_000...:
            return (value / 1_000_000).formatted(compactStyle) + "M"
        case 1000...:
            return (value / 1000).formatted(compactStyle) + "K"
        default:
            return value.rounded().formatted(compactStyle)
        }
    }
}
