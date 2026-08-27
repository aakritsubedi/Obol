import Combine
import Foundation

/// One entry from the Frankfurter currency directory.
///
/// `symbol` is whatever the directory reports and is occasionally empty or
/// ambiguous (several currencies answer to `$`), so views that need to be
/// unmistakable fall back to the ISO code.
struct CurrencyOption: Identifiable, Equatable, Codable {
    let code: String
    let name: String
    let symbol: String

    var id: String {
        code
    }

    /// Everything the daemon reports is priced in dollars, so USD is both the
    /// default selection and the identity conversion.
    static let usd = CurrencyOption(code: "USD", name: "United States Dollar", symbol: "$")

    init(code: String, name: String, symbol: String) {
        self.code = code
        self.name = name
        self.symbol = symbol
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decode(String.self, forKey: .code)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? code
        symbol = try container.decodeIfPresent(String.self, forKey: .symbol) ?? ""
    }

    private enum CodingKeys: String, CodingKey {
        case code = "iso_code"
        case name
        case symbol
    }
}

/// A USD → `code` rate, tagged with the business day the reference bank quoted
/// it for and the moment this app read it.
struct CurrencyRate: Equatable, Codable {
    let code: String
    let rate: Double
    let quotedOn: String
    let fetchedAt: Date
}

enum CurrencyClientError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpStatus(Int)
    case missingRate(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "The exchange rate URL is invalid."
        case .invalidResponse: return "The exchange rate service returned an invalid response."
        case let .httpStatus(status): return "The exchange rate service returned HTTP \(status)."
        case let .missingRate(code): return "No exchange rate is published for \(code)."
        }
    }
}

/// Reads the public Frankfurter API. No key, no account, daily reference rates.
struct CurrencyClient {
    static let defaultHost = "https://api.frankfurter.dev/v2"

    let session: URLSession
    let host: String

    init(session: URLSession = .shared, host: String = CurrencyClient.defaultHost) {
        self.session = session
        self.host = host
    }

    /// The full supported-currency directory, ordered by code so the picker is
    /// predictable and type-ahead lands where you expect.
    func currencies() async throws -> [CurrencyOption] {
        let options: [CurrencyOption] = try await get(path: "currencies", query: [])
        return options.sorted { $0.code < $1.code }
    }

    func rate(for code: String) async throws -> CurrencyRate {
        let rows: [RateRow] = try await get(path: "rates", query: [
            URLQueryItem(name: "base", value: CurrencyOption.usd.code),
            URLQueryItem(name: "quotes", value: code),
        ])
        guard let row = rows.first(where: { $0.quote == code }) else {
            throw CurrencyClientError.missingRate(code)
        }
        return CurrencyRate(code: code, rate: row.rate, quotedOn: row.date, fetchedAt: Date())
    }

    private func get<T: Decodable>(path: String, query: [URLQueryItem]) async throws -> T {
        guard var components = URLComponents(string: "\(host)/\(path)") else {
            throw CurrencyClientError.invalidURL
        }
        components.queryItems = query.isEmpty ? nil : query
        guard let url = components.url else { throw CurrencyClientError.invalidURL }

        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Obol/1.0 (https://github.com/aakritsubedi/obol)", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CurrencyClientError.invalidResponse }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw CurrencyClientError.httpStatus(http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private struct RateRow: Decodable {
        let base: String
        let quote: String
        let rate: Double
        let date: String
    }
}

/// Selection and the rate cache. Rates are kept per currency so switching back
/// to one used earlier converts immediately instead of waiting on the network.
struct CurrencyDefaults {
    let store: UserDefaults

    init(store: UserDefaults = .standard) {
        self.store = store
    }

    var selected: CurrencyOption? {
        get { decode(CurrencyOption.self, forKey: Keys.selected) }
        set { encode(newValue, forKey: Keys.selected) }
    }

    var options: [CurrencyOption] {
        get { decode([CurrencyOption].self, forKey: Keys.options) ?? [] }
        set { encode(newValue, forKey: Keys.options) }
    }

    var optionsFetchedAt: Date? {
        get { store.object(forKey: Keys.optionsFetchedAt) as? Date }
        set { store.set(newValue, forKey: Keys.optionsFetchedAt) }
    }

    var rates: [String: CurrencyRate] {
        get { decode([String: CurrencyRate].self, forKey: Keys.rates) ?? [:] }
        set { encode(newValue, forKey: Keys.rates) }
    }

    private func decode<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = store.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func encode<T: Encodable>(_ value: T?, forKey key: String) {
        guard let value, let data = try? JSONEncoder().encode(value) else {
            store.removeObject(forKey: key)
            return
        }
        store.set(data, forKey: key)
    }

    private enum Keys {
        static let prefix = "com.aakritsubedi.obol.currency."
        static let selected = "\(prefix)selected"
        static let options = "\(prefix)options"
        static let optionsFetchedAt = "\(prefix)optionsFetchedAt"
        static let rates = "\(prefix)rates"
    }
}

/// Owns the display currency for the menu bar label and the popover.
///
/// The daemon's numbers stay in USD end to end — budgets, alerts, and the
/// dashboard are all denominated there. This converts only at the moment of
/// display, so a rate that is missing or stale can never corrupt stored data.
@MainActor
final class CurrencyController: ObservableObject {
    /// DaemonController reaches for this to hand over the currency it read from
    /// config.json, mirroring how UpdateController reaches for the daemon.
    weak static var shared: CurrencyController?

    enum LoadState: Equatable {
        case idle
        case loading
        case failed(String)
    }

    @Published private(set) var selected: CurrencyOption
    /// `nil` until a rate for `selected` is known; see `active`.
    @Published private(set) var rate: CurrencyRate?
    @Published private(set) var options: [CurrencyOption]
    @Published private(set) var optionsState: LoadState = .idle
    @Published private(set) var rateState: LoadState = .idle

    /// Reference rates are published once per business day; anything more
    /// frequent than this is traffic for no new number.
    private static let rateMaxAge: TimeInterval = 6 * 60 * 60
    /// The directory only moves when a currency is minted or retired.
    private static let optionsMaxAge: TimeInterval = 7 * 24 * 60 * 60

    private let client: CurrencyClient
    private var defaults: CurrencyDefaults
    private var rateTask: Task<Void, Never>?
    private var optionsTask: Task<Void, Never>?

    init(client: CurrencyClient = CurrencyClient(), defaults: CurrencyDefaults = CurrencyDefaults()) {
        self.client = client
        self.defaults = defaults
        // The daemon's config.json is the source of truth, but it is a second
        // or so away at launch. Seed from the local cache so the menu bar opens
        // in the right currency instead of flashing dollars first.
        selected = defaults.selected ?? .usd
        options = defaults.options
        rate = Self.rate(for: selected, in: defaults.rates)
        Self.shared = self
    }

    deinit {
        rateTask?.cancel()
        optionsTask?.cancel()
    }

    // MARK: - Formatting

    /// The currency the amounts on screen are actually in: the selection once
    /// its rate has landed, USD until then. Converting is never implied before
    /// there is a rate to convert with.
    var active: CurrencyOption {
        rate == nil ? .usd : selected
    }

    /// Prefer the reported symbol, but keep the code when it is missing so an
    /// amount is never left unlabelled.
    ///
    /// A symbol ending in a letter or an abbreviating period runs straight into
    /// the figure it labels — `Rs.1,017.32` — so those get a thin space. Glyphs
    /// like `$` and `€` stay flush against the digits, as they should.
    var symbol: String {
        guard let last = active.symbol.last else { return active.code + Self.symbolGap }
        return last.isLetter || last == "." ? active.symbol + Self.symbolGap : active.symbol
    }

    func amount(_ usd: Double) -> String {
        UsageClient.amount(usd * (rate?.rate ?? 1))
    }

    func display(_ usd: Double) -> String {
        symbol + amount(usd)
    }

    /// "1 USD = 152.84 NPR · Aug 26, 2026" — the receipt under the picker, so
    /// the converted figures are never mistaken for a live market quote.
    var rateSummary: String? {
        guard let rate else { return nil }
        let quote = UsageClient.amount(rate.rate)
        guard let quotedOn = Self.quotedOnFormatter.date(from: rate.quotedOn) else {
            return "1 \(CurrencyOption.usd.code) = \(quote) \(rate.code)"
        }
        let day = quotedOn.formatted(date: .abbreviated, time: .omitted)
        return "1 \(CurrencyOption.usd.code) = \(quote) \(rate.code) · \(day)"
    }

    // MARK: - Lifecycle

    func popoverOpened() {
        refreshRateIfStale()
    }

    /// The directory is 165 entries of JSON nobody needs until they go looking
    /// for the picker, so it is fetched when Settings opens, not at launch.
    func settingsOpened() {
        refreshRateIfStale()
        loadOptionsIfStale()
    }

    func select(_ option: CurrencyOption) {
        guard option != selected else { return }
        apply(option)
        // Persisting through the daemon is what lets the dashboard render the
        // same currency; the local cache above is only the launch-time seed.
        DaemonController.shared?.setCurrency(option.code)
    }

    /// Adopt a code the daemon reported. Same effect as `select`, minus the
    /// write back that would bounce the value straight to where it came from.
    func adopt(code: String) {
        guard code != selected.code else { return }
        apply(option(for: code))
    }

    private func apply(_ option: CurrencyOption) {
        selected = option
        defaults.selected = option
        rateState = .idle
        // A currency picked before converts on the spot; a first-time pick has
        // nothing to show until the fetch below lands, and `active` keeps the
        // amounts labelled USD in the meantime.
        rate = Self.rate(for: option, in: defaults.rates)
        refreshRateIfStale()
    }

    /// The directory entry for a code, or a bare stand-in when the directory
    /// has not loaded yet — the code alone is enough to label an amount and to
    /// ask for a rate.
    func option(for code: String) -> CurrencyOption {
        if code == CurrencyOption.usd.code {
            return .usd
        }
        return options.first { $0.code == code } ?? CurrencyOption(code: code, name: code, symbol: "")
    }

    /// Case- and diacritic-insensitive match on either half of the picker's
    /// "NPR — Nepalese Rupee" rows, so both "npr" and "nepal" find it.
    func matches(_ option: CurrencyOption, query: String) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return true }
        let comparison: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        return option.code.range(of: needle, options: comparison) != nil
            || option.name.range(of: needle, options: comparison) != nil
    }

    func retryRate() {
        fetchRate(for: selected)
    }

    func retryOptions() {
        fetchOptions()
    }

    // MARK: - Fetching

    private func refreshRateIfStale() {
        guard selected.code != CurrencyOption.usd.code else { return }
        let fresh = rate.map { Date().timeIntervalSince($0.fetchedAt) < Self.rateMaxAge } ?? false
        guard !fresh else { return }
        fetchRate(for: selected)
    }

    private func loadOptionsIfStale() {
        let fresh = defaults.optionsFetchedAt.map { Date().timeIntervalSince($0) < Self.optionsMaxAge } ?? false
        guard options.isEmpty || !fresh else { return }
        fetchOptions()
    }

    private func fetchRate(for option: CurrencyOption) {
        guard option.code != CurrencyOption.usd.code else {
            rate = nil
            rateState = .idle
            return
        }
        guard rateTask == nil else { return }
        rateState = .loading
        rateTask = Task { [weak self] in
            await self?.performRateFetch(for: option)
        }
    }

    private func performRateFetch(for option: CurrencyOption) async {
        defer {
            rateTask = nil
            // The selection moved while this was in flight; fetch what it needs
            // now that the single task slot is free again.
            if option != selected {
                refreshRateIfStale()
            }
        }
        do {
            let next = try await client.rate(for: option.code)
            rateState = .idle
            defaults.rates[next.code] = next
            // A slow answer for a currency the user has already moved on from
            // belongs in the cache, but not on screen.
            guard option == selected else { return }
            rate = next
        } catch {
            rateState = .failed(Self.message(for: error))
        }
    }

    private func fetchOptions() {
        guard optionsTask == nil else { return }
        optionsState = .loading
        optionsTask = Task { [weak self] in
            await self?.performOptionsFetch()
        }
    }

    private func performOptionsFetch() async {
        defer { optionsTask = nil }
        do {
            let next = try await client.currencies()
            optionsState = .idle
            guard !next.isEmpty else { return }
            options = next
            defaults.options = next
            defaults.optionsFetchedAt = Date()
            // The directory carries the authoritative name and symbol; adopt
            // them for a selection restored from an older cache.
            if let refreshed = next.first(where: { $0.code == selected.code }), refreshed != selected {
                selected = refreshed
                defaults.selected = refreshed
            }
        } catch {
            optionsState = .failed(Self.message(for: error))
        }
    }

    // MARK: - Helpers

    /// Thin space (U+2009): narrower than a word space, so a lettered symbol
    /// reads as part of the amount rather than as a word beside it.
    private static let symbolGap = "\u{2009}"

    private static func rate(for option: CurrencyOption, in cache: [String: CurrencyRate]) -> CurrencyRate? {
        option.code == CurrencyOption.usd.code ? nil : cache[option.code]
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "Exchange rates are unavailable."
    }

    private static let quotedOnFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
