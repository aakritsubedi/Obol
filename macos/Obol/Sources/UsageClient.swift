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

    var id: String { agent }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        agent = try container.decodeIfPresent(String.self, forKey: .agent) ?? "Unknown"
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
        totalTokens = try container.decodeIfPresent(Double.self, forKey: .totalTokens) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case agent, totalCost, totalTokens }
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
        budget = try container.decodeIfPresent(BudgetEvaluation.self, forKey: .budget) ?? BudgetEvaluation(dailyRatio: nil, monthlyRatio: nil, reason: nil)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        stale = try container.decodeIfPresent(Bool.self, forKey: .stale) ?? false
        error = try container.decodeIfPresent(String.self, forKey: .error)
    }

    init() {
        today = TodayUsage(period: "", totalCost: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, modelsUsed: [])
        agents = []
        burnRate = BurnRate(costPerHour: 0)
        projection = Projection(totalCost: 0)
        budgetStatus = .ok
        budget = BudgetEvaluation(dailyRatio: nil, monthlyRatio: nil, reason: nil)
        updatedAt = nil
        stale = true
        error = nil
    }

    private enum CodingKeys: String, CodingKey { case today, agents, burnRate, projection, budgetStatus, budget, updatedAt, stale, error }
}

struct WidgetConfig: Codable {
    var port: Int
    var refreshIntervalMs: Int
    var dailyBudget: Double?
    var monthlyBudget: Double?
    var warningThreshold: Double
    var launchAtLogin: Bool

    static let `default` = WidgetConfig(port: 4737, refreshIntervalMs: 300_000, dailyBudget: nil, monthlyBudget: nil, warningThreshold: 0.8, launchAtLogin: false)
}

struct RuntimeState: Decodable {
    let port: Int
    let token: String
    let pid: Int
    let dashboardUrl: String
}

struct UsageClient {
    private func url(path: String, baseURL: URL, token: String) -> URL {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "t", value: token)]
        return components.url!
    }

    func summary(baseURL: URL, token: String) async throws -> UsageSummary {
        try await get(path: "api/summary", baseURL: baseURL, token: token)
    }

    func config(baseURL: URL, token: String) async throws -> WidgetConfig {
        try await get(path: "api/config", baseURL: baseURL, token: token)
    }

    func refresh(baseURL: URL, token: String) async throws -> UsageSummary {
        var request = URLRequest(url: url(path: "api/refresh", baseURL: baseURL, token: token))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await perform(request)
    }

    func update(config: WidgetConfig, baseURL: URL, token: String) async throws -> WidgetConfig {
        var request = URLRequest(url: url(path: "api/config", baseURL: baseURL, token: token))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(config)
        return try await perform(request)
    }

    private func get<T: Decodable>(path: String, baseURL: URL, token: String) async throws -> T {
        try await perform(URLRequest(url: url(path: path, baseURL: baseURL, token: token)))
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static let currencyCode = "USD"
    static let currencySymbol = "$"

    /// Just the numeric part, e.g. `6.66`.
    ///
    /// The currency style formatter is deliberately not used here: on a locale
    /// whose currency is not USD it disambiguates the symbol to `US$`, which is
    /// noise in a widget that only ever reports dollars. Views compose the code
    /// or symbol themselves so the two can be styled apart.
    static func amount(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? "0.00"
    }
}

private extension TodayUsage {
    init(period: String, totalCost: Double, totalTokens: Double, inputTokens: Double, outputTokens: Double, cacheCreationTokens: Double, cacheReadTokens: Double, modelsUsed: [String]) {
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
    init(costPerHour: Double) { self.costPerHour = costPerHour }
}

private extension Projection {
    init(totalCost: Double) { self.totalCost = totalCost }
}

private extension BudgetEvaluation {
    init(dailyRatio: Double?, monthlyRatio: Double?, reason: String?) {
        self.dailyRatio = dailyRatio
        self.monthlyRatio = monthlyRatio
        self.reason = reason
    }
}
