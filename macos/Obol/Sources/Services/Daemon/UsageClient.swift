import Foundation
import ObolCore

/// A subset view of the daemon's config: the fields the menu bar reads or
/// writes. A PUT of this struct patches only these keys, so the ones the
/// dashboard owns survive untouched.
struct WidgetConfig: Codable {
    var port: Int
    var refreshIntervalMs: Int
    var dailyBudget: Double?
    var monthlyBudget: Double?
    var warningThreshold: Double
    var launchAtLogin: Bool
    var keepAwake: Bool
    var keepAwakeWithLidClosed: Bool
    var currency: String
    var currencyRate: Double?

    /// Whether the daemon actually sent `keepAwake`, as opposed to defaulting.
    ///
    /// A daemon older than the field omits it entirely, and its silence must not
    /// be read as "off": the config poll would then release the sleep assertion
    /// seconds after the switch was flipped, and the switch would flip itself
    /// back. Not part of the wire format — it describes the response, so it is
    /// absent from CodingKeys and never encoded on a write.
    var reportedKeepAwake = true

    /// The same, for the lid setting: an older daemon's silence must not read
    /// as "off" and undo the switch on the next poll.
    var reportedKeepAwakeWithLidClosed = true

    static let `default` = WidgetConfig(
        port: 4737,
        refreshIntervalMs: 300_000,
        dailyBudget: nil,
        monthlyBudget: nil,
        warningThreshold: 0.8,
        launchAtLogin: false,
        keepAwake: false,
        keepAwakeWithLidClosed: false,
        currency: CurrencyOption.usd.code,
        currencyRate: nil
    )

    /// Decoded field by field so an older daemon — one bundled before a field
    /// existed — degrades to the default instead of failing the whole read and
    /// leaving the popover with no config at all.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let fallback = WidgetConfig.default
        port = try container.decodeIfPresent(Int.self, forKey: .port) ?? fallback.port
        refreshIntervalMs = try container.decodeIfPresent(Int.self, forKey: .refreshIntervalMs)
            ?? fallback.refreshIntervalMs
        dailyBudget = try container.decodeIfPresent(Double.self, forKey: .dailyBudget)
        monthlyBudget = try container.decodeIfPresent(Double.self, forKey: .monthlyBudget)
        warningThreshold = try container.decodeIfPresent(Double.self, forKey: .warningThreshold)
            ?? fallback.warningThreshold
        launchAtLogin = try container.decodeIfPresent(Bool.self, forKey: .launchAtLogin) ?? fallback.launchAtLogin
        // Derived from the decoded value rather than `contains`, which counts an
        // explicit null as an answer. Absent and null both mean "no opinion".
        let reported = try container.decodeIfPresent(Bool.self, forKey: .keepAwake)
        reportedKeepAwake = reported != nil
        keepAwake = reported ?? fallback.keepAwake
        let reportedLid = try container.decodeIfPresent(Bool.self, forKey: .keepAwakeWithLidClosed)
        reportedKeepAwakeWithLidClosed = reportedLid != nil
        keepAwakeWithLidClosed = reportedLid ?? fallback.keepAwakeWithLidClosed
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? fallback.currency
        currencyRate = try container.decodeIfPresent(Double.self, forKey: .currencyRate)
    }

    init(
        port: Int,
        refreshIntervalMs: Int,
        dailyBudget: Double?,
        monthlyBudget: Double?,
        warningThreshold: Double,
        launchAtLogin: Bool,
        keepAwake: Bool,
        keepAwakeWithLidClosed: Bool,
        currency: String,
        currencyRate: Double? = nil
    ) {
        self.port = port
        self.refreshIntervalMs = refreshIntervalMs
        self.dailyBudget = dailyBudget
        self.monthlyBudget = monthlyBudget
        self.warningThreshold = warningThreshold
        self.launchAtLogin = launchAtLogin
        self.keepAwake = keepAwake
        self.keepAwakeWithLidClosed = keepAwakeWithLidClosed
        self.currency = currency
        self.currencyRate = currencyRate
    }

    private enum CodingKeys: String, CodingKey {
        case port, refreshIntervalMs, dailyBudget, monthlyBudget, warningThreshold, launchAtLogin
        case keepAwake, keepAwakeWithLidClosed, currency, currencyRate
    }
}

struct RuntimeState: Decodable {
    let port: Int
    let token: String
    let pid: Int
    let dashboardUrl: String
}

protocol UsageFetching {
    func summary(baseURL: URL, token: String) async throws -> UsageSummary
    func config(baseURL: URL, token: String) async throws -> WidgetConfig
    func activeSessions(baseURL: URL, token: String) async throws -> [ActiveSession]
    func todayJournal(baseURL: URL, token: String) async throws -> TodayJournal
    func refresh(baseURL: URL, token: String) async throws -> UsageSummary
    func update(config: WidgetConfig, baseURL: URL, token: String) async throws -> WidgetConfig
}

struct UsageClient: UsageFetching {
    let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    /// The daemon accepts the token as a header or query parameter; the header
    /// is preferred so the token never appears in a URL.
    private func request(path: String, baseURL: URL, token: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.setValue(token, forHTTPHeaderField: "x-token")
        return request
    }

    func summary(baseURL: URL, token: String) async throws -> UsageSummary {
        try await get(path: "api/summary", baseURL: baseURL, token: token)
    }

    func config(baseURL: URL, token: String) async throws -> WidgetConfig {
        try await get(path: "api/config", baseURL: baseURL, token: token)
    }

    func activeSessions(baseURL: URL, token: String) async throws -> [ActiveSession] {
        try await get(path: "api/sessions/active", baseURL: baseURL, token: token)
    }

    func todayJournal(baseURL: URL, token: String) async throws -> TodayJournal {
        try await get(path: "api/journal", baseURL: baseURL, token: token)
    }

    func refresh(baseURL: URL, token: String) async throws -> UsageSummary {
        var request = self.request(path: "api/refresh", baseURL: baseURL, token: token)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await perform(request)
    }

    func update(config: WidgetConfig, baseURL: URL, token: String) async throws -> WidgetConfig {
        var request = self.request(path: "api/config", baseURL: baseURL, token: token)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(config)
        return try await perform(request)
    }

    private func get<T: Decodable>(path: String, baseURL: URL, token: String) async throws -> T {
        try await perform(request(path: path, baseURL: baseURL, token: token))
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Just the numeric part, e.g. `6.66`.
    ///
    /// The currency style formatter is deliberately not used here: it would
    /// disambiguate a symbol against the machine's locale — rendering `US$`
    /// where the widget means `$` — and it owns the symbol's placement, which
    /// the hero total needs to style apart from the digits. CurrencyController
    /// picks the symbol; this only ever formats the number.
    static func amount(_ value: Double) -> String {
        ObolFormatting.amount(value)
    }

    /// Compact token count, e.g. `1.2M`.
    ///
    /// Tokens are context next to the dollar figure, so they collapse to one
    /// decimal in K/M/B instead of printing full digits.
    static func compactTokens(_ value: Double) -> String {
        ObolFormatting.compactTokens(value)
    }
}
