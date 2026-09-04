import Foundation

public struct CurrencyOption: Identifiable, Equatable, Codable, Sendable {
    public let code: String
    public let name: String
    public let symbol: String

    public var id: String {
        code
    }

    public static let usd = CurrencyOption(code: "USD", name: "United States Dollar", symbol: "$")

    public init(code: String, name: String, symbol: String) {
        self.code = code
        self.name = name
        self.symbol = symbol
    }

    public init(from decoder: Decoder) throws {
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

public struct CurrencyRate: Equatable, Codable, Sendable {
    public let code: String
    public let rate: Double
    public let quotedOn: String
    public let fetchedAt: Date

    public init(code: String, rate: Double, quotedOn: String, fetchedAt: Date) {
        self.code = code
        self.rate = rate
        self.quotedOn = quotedOn
        self.fetchedAt = fetchedAt
    }
}
