import ObolCore
import SwiftUI

/// Currency selection owns its search state so opening and closing Settings
/// also tears down the transient query and focus state.
struct CurrencyPicker: View {
    @ObservedObject var currency: CurrencyController

    @State private var isOpen = false
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Currency")
                Spacer(minLength: 8)
                trigger
            }

            if isOpen {
                picker
                    .padding(.top, 8)
            }

            HStack(spacing: 10) {
                Text(caption)
                    .fixedSize(horizontal: false, vertical: true)
                retry
            }
            .font(WidgetStyle.TypeScale.footnote)
            .foregroundStyle(.secondary)
            .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .animation(.easeInOut(duration: 0.15), value: currency.rateState)
    }

    /// The trigger shows the code alone: the row it sits in is 340pt wide, and
    /// the names belong in the list it opens.
    private var trigger: some View {
        Button {
            if isOpen {
                close()
            } else {
                isOpen = true
            }
        } label: {
            HStack(spacing: 5) {
                Text(currency.selected.code)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.primary.opacity(0.06))
            )
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Display currency")
        .accessibilityValue(currency.selected.name)
    }

    /// The list keeps a fixed height and scrolls inside it. The directory runs
    /// to 165 entries, and a list that grew with the result count would resize
    /// the whole popover on every keystroke.
    private var picker: some View {
        VStack(spacing: 0) {
            searchField
            hairline
            list
        }
        .background(Color.primary.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(WidgetStyle.hairline)
        )
    }

    private var searchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            TextField("Search currencies", text: $query)
                .textFieldStyle(.plain)
                .focused($searchFocused)
                .onAppear { searchFocused = true }
            if !query.isEmpty {
                Button {
                    query = ""
                    searchFocused = true
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
    }

    private var list: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if results.isEmpty {
                        Text(emptyMessage)
                            .font(WidgetStyle.TypeScale.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 10)
                    } else {
                        ForEach(results) { option in
                            CurrencyRow(option: option, selected: option.code == currency.selected.code) {
                                currency.select(option)
                                close()
                            }
                            .id(option.code)
                        }
                    }
                }
                .padding(4)
            }
            .frame(height: 186)
            // Open onto the current pick rather than the top of the alphabet.
            .onAppear { proxy.scrollTo(currency.selected.code, anchor: .center) }
        }
    }

    /// The directory carries USD along with everything else. Until it loads,
    /// USD and the current pick are the only entries there are to offer.
    private var results: [CurrencyOption] {
        let directory = currency.options.isEmpty ? fallback : currency.options
        return directory.filter { currency.matches($0, query: query) }
    }

    private var fallback: [CurrencyOption] {
        guard currency.selected.code != CurrencyOption.usd.code else { return [.usd] }
        return [.usd, currency.selected].sorted { $0.code < $1.code }
    }

    private var emptyMessage: String {
        if currency.options.isEmpty, case .loading = currency.optionsState {
            return "Loading the currency list…"
        }
        return "No currency matches “\(query.trimmingCharacters(in: .whitespaces))”."
    }

    private var caption: String {
        switch currency.rateState {
        case .loading:
            return "Fetching today's exchange rate…"
        case let .failed(message):
            return message
        case .idle:
            break
        }
        guard currency.options.isEmpty else {
            return currency.rateSummary ?? currency.selected.name
        }
        switch currency.optionsState {
        case .loading: return "Loading the currency list…"
        case let .failed(message): return message
        case .idle: return currency.rateSummary ?? currency.selected.name
        }
    }

    @ViewBuilder
    private var retry: some View {
        if case .failed = currency.rateState {
            Button("Retry") { currency.retryRate() }
                .buttonStyle(.link)
        } else if case .failed = currency.optionsState {
            Button("Retry") { currency.retryOptions() }
                .buttonStyle(.link)
        }
    }

    private var hairline: some View {
        Rectangle()
            .fill(WidgetStyle.hairline)
            .frame(height: 1)
    }

    private func close() {
        isOpen = false
        query = ""
        searchFocused = false
    }
}
