import Foundation

enum BudgetStatus: String, Codable {
    case ok
    case warn
    case over
}

struct TodayUsage: Decodable {
    let period: String
    let totalCost: Double
    let totalTokens: Double
    let inputTokens: Double
    let outputTokens: Double
    let cacheCreationTokens: Double
    let cacheReadTokens: Double
    let modelsUsed: [String]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        period = try container.decodeIfPresent(String.self, forKey: .period) ?? ""
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
        totalTokens = try container.decodeIfPresent(Double.self, forKey: .totalTokens) ?? 0
        inputTokens = try container.decodeIfPresent(Double.self, forKey: .inputTokens) ?? 0
        outputTokens = try container.decodeIfPresent(Double.self, forKey: .outputTokens) ?? 0
        cacheCreationTokens = try container.decodeIfPresent(Double.self, forKey: .cacheCreationTokens) ?? 0
        cacheReadTokens = try container.decodeIfPresent(Double.self, forKey: .cacheReadTokens) ?? 0
        modelsUsed = try container.decodeIfPresent([String].self, forKey: .modelsUsed) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case period, totalCost, totalTokens, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, modelsUsed
    }
}

struct ProviderSummary: Decodable, Identifiable {
    let agent: String
    let totalCost: Double
    let totalTokens: Double

    var id: String {
        agent
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        agent = try container.decodeIfPresent(String.self, forKey: .agent) ?? "Unknown"
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
        totalTokens = try container.decodeIfPresent(Double.self, forKey: .totalTokens) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case agent, totalCost, totalTokens }
}

/// A session an agent is still driving, as reported by `/api/sessions/active`.
///
/// `outputTokens` and `totalCost` are both nullable: only Claude's transcripts
/// join to per-project spend, and Codex records no usage at all, so either can
/// be absent for a perfectly healthy session. The row leaves the column blank in
/// that case rather than inventing a figure to show.
struct ActiveSession: Decodable, Identifiable {
    let id: String
    let provider: String
    let project: String
    let gitBranch: String?
    let outputTokens: Double?
    let totalCost: Double?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        provider = try container.decodeIfPresent(String.self, forKey: .provider) ?? "unknown"
        project = try container.decodeIfPresent(String.self, forKey: .project) ?? "unknown"
        gitBranch = try container.decodeIfPresent(String.self, forKey: .gitBranch)
        outputTokens = try container.decodeIfPresent(Double.self, forKey: .outputTokens)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost)
    }

    private enum CodingKeys: String, CodingKey {
        case id, provider, project, gitBranch, outputTokens, totalCost
    }
}

/// The small subset of today's journal needed by the popover's activity strip.
struct TodayJournal: Decodable {
    let date: String
    let activeMinutes: Double
    let firstEventAt: String?
    let sessions: [JournalSession]
}

struct JournalSession: Decodable {
    let startedAt: String
    let endedAt: String
    let activeMinutes: Double
}

struct BurnRate: Decodable {
    let costPerHour: Double

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        costPerHour = try container.decodeIfPresent(Double.self, forKey: .costPerHour) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case costPerHour }
}

struct Projection: Decodable {
    let totalCost: Double

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case totalCost }
}

struct BudgetEvaluation: Decodable {
    let dailyRatio: Double?
    let monthlyRatio: Double?
    let reason: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        dailyRatio = try container.decodeIfPresent(Double.self, forKey: .dailyRatio)
        monthlyRatio = try container.decodeIfPresent(Double.self, forKey: .monthlyRatio)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
    }

    private enum CodingKeys: String, CodingKey { case dailyRatio, monthlyRatio, reason }
}

struct UsageSummary: Decodable {
    let today: TodayUsage
    let agents: [ProviderSummary]
    let burnRate: BurnRate
    let projection: Projection
    let budgetStatus: BudgetStatus
    let budget: BudgetEvaluation
    let updatedAt: String?
    let stale: Bool
    let error: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        today = try container.decode(TodayUsage.self, forKey: .today)
        agents = try container.decodeIfPresent([ProviderSummary].self, forKey: .agents) ?? []
        burnRate = try container.decodeIfPresent(BurnRate.self, forKey: .burnRate) ?? BurnRate(costPerHour: 0)
        projection = try container.decodeIfPresent(Projection.self, forKey: .projection) ?? Projection(totalCost: 0)
        budgetStatus = try container.decodeIfPresent(BudgetStatus.self, forKey: .budgetStatus) ?? .ok
        budget = try container.decodeIfPresent(BudgetEvaluation.self, forKey: .budget) ?? BudgetEvaluation(
            dailyRatio: nil,
            monthlyRatio: nil,
            reason: nil
        )
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        stale = try container.decodeIfPresent(Bool.self, forKey: .stale) ?? false
        error = try container.decodeIfPresent(String.self, forKey: .error)
    }

    init() {
        today = TodayUsage(
            period: "",
            totalCost: 0,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            modelsUsed: []
        )
        agents = []
        burnRate = BurnRate(costPerHour: 0)
        projection = Projection(totalCost: 0)
        budgetStatus = .ok
        budget = BudgetEvaluation(dailyRatio: nil, monthlyRatio: nil, reason: nil)
        updatedAt = nil
        stale = true
        error = nil
    }

    private enum CodingKeys: String,
        CodingKey { case today, agents, burnRate, projection, budgetStatus, budget, updatedAt, stale, error }
}

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
    var currency: String

    /// Whether the daemon actually sent `keepAwake`, as opposed to defaulting.
    ///
    /// A daemon older than the field omits it entirely, and its silence must not
    /// be read as "off": the config poll would then release the sleep assertion
    /// seconds after the switch was flipped, and the switch would flip itself
    /// back. Not part of the wire format — it describes the response, so it is
    /// absent from CodingKeys and never encoded on a write.
    var reportedKeepAwake = true

    static let `default` = WidgetConfig(
        port: 4737,
        refreshIntervalMs: 300_000,
        dailyBudget: nil,
        monthlyBudget: nil,
        warningThreshold: 0.8,
        launchAtLogin: false,
        keepAwake: false,
        currency: CurrencyOption.usd.code
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
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? fallback.currency
    }

    init(
        port: Int,
        refreshIntervalMs: Int,
        dailyBudget: Double?,
        monthlyBudget: Double?,
        warningThreshold: Double,
        launchAtLogin: Bool,
        keepAwake: Bool,
        currency: String
    ) {
        self.port = port
        self.refreshIntervalMs = refreshIntervalMs
        self.dailyBudget = dailyBudget
        self.monthlyBudget = monthlyBudget
        self.warningThreshold = warningThreshold
        self.launchAtLogin = launchAtLogin
        self.keepAwake = keepAwake
        self.currency = currency
    }

    private enum CodingKeys: String, CodingKey {
        case port, refreshIntervalMs, dailyBudget, monthlyBudget, warningThreshold, launchAtLogin, keepAwake, currency
    }
}

struct RuntimeState: Decodable {
    let port: Int
    let token: String
    let pid: Int
    let dashboardUrl: String
}

struct UsageClient {
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
        let (data, response) = try await URLSession.shared.data(for: request)
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
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? "0.00"
    }

    /// Compact token count, e.g. `1.2M`.
    ///
    /// Tokens are context next to the dollar figure, so they collapse to one
    /// decimal in K/M/B instead of printing full digits.
    static func compactTokens(_ value: Double) -> String {
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

private extension TodayUsage {
    init(
        period: String,
        totalCost: Double,
        totalTokens: Double,
        inputTokens: Double,
        outputTokens: Double,
        cacheCreationTokens: Double,
        cacheReadTokens: Double,
        modelsUsed: [String]
    ) {
        self.period = period
        self.totalCost = totalCost
        self.totalTokens = totalTokens
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cacheCreationTokens = cacheCreationTokens
        self.cacheReadTokens = cacheReadTokens
        self.modelsUsed = modelsUsed
    }
}

private extension BurnRate {
    init(costPerHour: Double) {
        self.costPerHour = costPerHour
    }
}

private extension Projection {
    init(totalCost: Double) {
        self.totalCost = totalCost
    }
}

private extension BudgetEvaluation {
    init(dailyRatio: Double?, monthlyRatio: Double?, reason: String?) {
        self.dailyRatio = dailyRatio
        self.monthlyRatio = monthlyRatio
        self.reason = reason
    }
}
