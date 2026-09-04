// Foundation-only wire models. Keep this target free of SwiftUI, AppKit, and Bundle.main.
import Foundation

public enum BudgetStatus: String, Codable, Sendable {
    case ok
    case warn
    case over
}

public struct TodayUsage: Decodable, Sendable {
    public let period: String
    public let totalCost: Double
    public let totalTokens: Double
    public let inputTokens: Double
    public let outputTokens: Double
    public let cacheCreationTokens: Double
    public let cacheReadTokens: Double
    public let modelsUsed: [String]

    public init(
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

    public init(from decoder: Decoder) throws {
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

public struct ProviderSummary: Decodable, Identifiable, Sendable {
    public let agent: String
    public let totalCost: Double
    public let totalTokens: Double

    public var id: String {
        agent
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        agent = try container.decodeIfPresent(String.self, forKey: .agent) ?? "Unknown"
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
        totalTokens = try container.decodeIfPresent(Double.self, forKey: .totalTokens) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case agent, totalCost, totalTokens }
}

public struct UsageRow: Decodable, Sendable {
    public let period: String
    public let totalCost: Double
    public let totalTokens: Double

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        period = try container.decodeIfPresent(String.self, forKey: .period) ?? ""
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
        totalTokens = try container.decodeIfPresent(Double.self, forKey: .totalTokens) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case period, totalCost, totalTokens }
}

public struct UsageReport: Decodable, Sendable {
    public let daily: [UsageRow]
    public let weekly: [UsageRow]
    public let monthly: [UsageRow]
    public let session: [UsageRow]
    public let projects: [UsageRow]

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        daily = try container.decodeIfPresent([UsageRow].self, forKey: .daily) ?? []
        weekly = try container.decodeIfPresent([UsageRow].self, forKey: .weekly) ?? []
        monthly = try container.decodeIfPresent([UsageRow].self, forKey: .monthly) ?? []
        session = try container.decodeIfPresent([UsageRow].self, forKey: .session) ?? []
        projects = try container.decodeIfPresent([UsageRow].self, forKey: .projects) ?? []
    }

    private enum CodingKeys: String, CodingKey { case daily, weekly, monthly, session, projects }
}

public struct ActiveSession: Decodable, Identifiable, Sendable {
    public let id: String
    public let provider: String
    public let project: String
    public let gitBranch: String?
    public let startedAt: String?
    public let lastEventAt: String?
    public let activeMinutes: Double?
    public let outputTokens: Double?
    public let totalCost: Double?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        provider = try container.decodeIfPresent(String.self, forKey: .provider) ?? "unknown"
        project = try container.decodeIfPresent(String.self, forKey: .project) ?? "unknown"
        gitBranch = try container.decodeIfPresent(String.self, forKey: .gitBranch)
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt)
        lastEventAt = try container.decodeIfPresent(String.self, forKey: .lastEventAt)
        activeMinutes = try container.decodeIfPresent(Double.self, forKey: .activeMinutes)
        outputTokens = try container.decodeIfPresent(Double.self, forKey: .outputTokens)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost)
    }

    private enum CodingKeys: String, CodingKey {
        case id, provider, project, gitBranch, startedAt, lastEventAt, activeMinutes, outputTokens, totalCost
    }
}

public struct BurnRate: Decodable, Sendable {
    public let costPerHour: Double

    public init(costPerHour: Double) {
        self.costPerHour = costPerHour
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        costPerHour = try container.decodeIfPresent(Double.self, forKey: .costPerHour) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case costPerHour }
}

public struct Projection: Decodable, Sendable {
    public let totalCost: Double

    public init(totalCost: Double) {
        self.totalCost = totalCost
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case totalCost }
}

public struct BudgetEvaluation: Decodable, Sendable {
    public let status: BudgetStatus
    public let dailyRatio: Double?
    public let monthlyRatio: Double?
    public let reason: String?

    public init(dailyRatio: Double?, monthlyRatio: Double?, reason: String?) {
        status = .ok
        self.dailyRatio = dailyRatio
        self.monthlyRatio = monthlyRatio
        self.reason = reason
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(BudgetStatus.self, forKey: .status) ?? .ok
        dailyRatio = try container.decodeIfPresent(Double.self, forKey: .dailyRatio)
        monthlyRatio = try container.decodeIfPresent(Double.self, forKey: .monthlyRatio)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
    }

    private enum CodingKeys: String, CodingKey { case status, dailyRatio, monthlyRatio, reason }
}

public struct UsageSummary: Decodable, Sendable {
    public let today: TodayUsage
    public let agents: [ProviderSummary]
    public let burnRate: BurnRate
    public let projection: Projection
    public let budgetStatus: BudgetStatus
    public let budget: BudgetEvaluation
    public let updatedAt: String?
    public let stale: Bool
    public let error: String?

    public init() {
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

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        today = try container.decode(TodayUsage.self, forKey: .today)
        agents = try container.decodeIfPresent([ProviderSummary].self, forKey: .agents) ?? []
        burnRate = try container.decodeIfPresent(BurnRate.self, forKey: .burnRate) ?? BurnRate(costPerHour: 0)
        projection = try container.decodeIfPresent(Projection.self, forKey: .projection) ?? Projection(totalCost: 0)
        budgetStatus = try container.decodeIfPresent(BudgetStatus.self, forKey: .budgetStatus) ?? .ok
        budget = try container.decodeIfPresent(BudgetEvaluation.self, forKey: .budget)
            ?? BudgetEvaluation(dailyRatio: nil, monthlyRatio: nil, reason: nil)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        stale = try container.decodeIfPresent(Bool.self, forKey: .stale) ?? false
        error = try container.decodeIfPresent(String.self, forKey: .error)
    }

    private enum CodingKeys: String,
        CodingKey { case today, agents, burnRate, projection, budgetStatus, budget, updatedAt, stale, error }
}

public struct JournalSession: Decodable, Sendable {
    public let id: String
    public let provider: String
    public let title: String?
    public let project: String
    public let projectPath: String
    public let gitBranch: String?
    public let startedAt: String
    public let endedAt: String
    public let activeMinutes: Double
    public let humanPrompts: Int
    public let assistantTurns: Int
    public let toolCalls: Int
    public let filesEdited: [String]
    public let models: [String]
    public let prompts: [String]
    public let toolMix: [String: Int]
    public let outputTokens: Double?
    public let totalCost: Double?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
        provider = try container.decodeIfPresent(String.self, forKey: .provider) ?? "unknown"
        title = try container.decodeIfPresent(String.self, forKey: .title)
        project = try container.decodeIfPresent(String.self, forKey: .project) ?? "unknown"
        projectPath = try container.decodeIfPresent(String.self, forKey: .projectPath) ?? ""
        gitBranch = try container.decodeIfPresent(String.self, forKey: .gitBranch)
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt) ?? ""
        endedAt = try container.decodeIfPresent(String.self, forKey: .endedAt) ?? ""
        activeMinutes = try container.decodeIfPresent(Double.self, forKey: .activeMinutes) ?? 0
        humanPrompts = try container.decodeIfPresent(Int.self, forKey: .humanPrompts) ?? 0
        assistantTurns = try container.decodeIfPresent(Int.self, forKey: .assistantTurns) ?? 0
        toolCalls = try container.decodeIfPresent(Int.self, forKey: .toolCalls) ?? 0
        filesEdited = try container.decodeIfPresent([String].self, forKey: .filesEdited) ?? []
        models = try container.decodeIfPresent([String].self, forKey: .models) ?? []
        prompts = try container.decodeIfPresent([String].self, forKey: .prompts) ?? []
        toolMix = try container.decodeIfPresent([String: Int].self, forKey: .toolMix) ?? [:]
        outputTokens = try container.decodeIfPresent(Double.self, forKey: .outputTokens)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost)
    }

    private enum CodingKeys: String, CodingKey {
        case id, provider, title, project, projectPath, gitBranch, startedAt, endedAt, activeMinutes
        case humanPrompts, assistantTurns, toolCalls, filesEdited, models, prompts, toolMix, outputTokens, totalCost
    }
}

public struct JournalProject: Decodable, Sendable {
    public let name: String
    public let path: String
    public let activeMinutes: Double
    public let sessions: Int
    public let filesEdited: Int
    public let toolCalls: Int
    public let providers: [String]
    public let totalCost: Double?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "unknown"
        path = try container.decodeIfPresent(String.self, forKey: .path) ?? ""
        activeMinutes = try container.decodeIfPresent(Double.self, forKey: .activeMinutes) ?? 0
        sessions = try container.decodeIfPresent(Int.self, forKey: .sessions) ?? 0
        filesEdited = try container.decodeIfPresent(Int.self, forKey: .filesEdited) ?? 0
        toolCalls = try container.decodeIfPresent(Int.self, forKey: .toolCalls) ?? 0
        providers = try container.decodeIfPresent([String].self, forKey: .providers) ?? []
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost)
    }

    private enum CodingKeys: String,
        CodingKey { case name, path, activeMinutes, sessions, filesEdited, toolCalls, providers, totalCost }
}

public struct DayJournal: Decodable, Sendable {
    public let date: String
    public let timezone: String
    public let idleMinutes: Double
    public let activeMinutes: Double
    public let blocks: Int
    public let spanMinutes: Double
    public let firstEventAt: String?
    public let lastEventAt: String?
    public let humanPrompts: Int
    public let assistantTurns: Int
    public let toolCalls: Int
    public let toolMix: [String: Int]
    public let filesEdited: Int
    public let testRuns: Int
    public let providers: [String]
    public let sessions: [JournalSession]
    public let projects: [JournalProject]
    public let totalCost: Double
    public let totalTokens: Double
    public let computedAt: String

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = try container.decodeIfPresent(String.self, forKey: .date) ?? ""
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone) ?? "UTC"
        idleMinutes = try container.decodeIfPresent(Double.self, forKey: .idleMinutes) ?? 15
        activeMinutes = try container.decodeIfPresent(Double.self, forKey: .activeMinutes) ?? 0
        blocks = try container.decodeIfPresent(Int.self, forKey: .blocks) ?? 0
        spanMinutes = try container.decodeIfPresent(Double.self, forKey: .spanMinutes) ?? 0
        firstEventAt = try container.decodeIfPresent(String.self, forKey: .firstEventAt)
        lastEventAt = try container.decodeIfPresent(String.self, forKey: .lastEventAt)
        humanPrompts = try container.decodeIfPresent(Int.self, forKey: .humanPrompts) ?? 0
        assistantTurns = try container.decodeIfPresent(Int.self, forKey: .assistantTurns) ?? 0
        toolCalls = try container.decodeIfPresent(Int.self, forKey: .toolCalls) ?? 0
        toolMix = try container.decodeIfPresent([String: Int].self, forKey: .toolMix) ?? [:]
        filesEdited = try container.decodeIfPresent(Int.self, forKey: .filesEdited) ?? 0
        testRuns = try container.decodeIfPresent(Int.self, forKey: .testRuns) ?? 0
        providers = try container.decodeIfPresent([String].self, forKey: .providers) ?? []
        sessions = try container.decodeIfPresent([JournalSession].self, forKey: .sessions) ?? []
        projects = try container.decodeIfPresent([JournalProject].self, forKey: .projects) ?? []
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost) ?? 0
        totalTokens = try container.decodeIfPresent(Double.self, forKey: .totalTokens) ?? 0
        computedAt = try container.decodeIfPresent(String.self, forKey: .computedAt) ?? ""
    }

    private enum CodingKeys: String, CodingKey {
        case date, timezone, idleMinutes, activeMinutes, blocks, spanMinutes, firstEventAt, lastEventAt
        case humanPrompts, assistantTurns, toolCalls, toolMix, filesEdited, testRuns, providers, sessions, projects
        case totalCost, totalTokens, computedAt
    }
}

public typealias TodayJournal = DayJournal
