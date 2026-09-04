import Foundation

public enum ObolFormatting {
    public static func amount(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? "0.00"
    }

    public static func compactTokens(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        switch value {
        case 1_000_000_000...:
            return (formatter.string(from: NSNumber(value: value / 1_000_000_000)) ?? "0") + "B"
        case 1_000_000...:
            return (formatter.string(from: NSNumber(value: value / 1_000_000)) ?? "0") + "M"
        case 1000...:
            return (formatter.string(from: NSNumber(value: value / 1000)) ?? "0") + "K"
        default:
            return formatter.string(from: NSNumber(value: value.rounded())) ?? "0"
        }
    }
}
