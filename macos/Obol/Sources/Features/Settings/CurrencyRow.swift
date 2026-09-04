import ObolCore
import SwiftUI

/// One line of the currency list. The code sits in a fixed column so the names
/// beside it start on a common left edge, the way the provider rows align.
struct CurrencyRow: View {
    let option: CurrencyOption
    let selected: Bool
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(option.code)
                    .monospacedDigit()
                    .frame(width: 34, alignment: .leading)
                Text(option.name)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 6)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                }
            }
            .font(WidgetStyle.TypeScale.row)
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(Color.primary.opacity(hovering ? 0.07 : 0))
            )
            .contentShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option.code), \(option.name)")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}
