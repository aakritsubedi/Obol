// Foundation-only updater core. Keep this file free of SwiftUI, AppKit, and Bundle.main
// so it can be compiled and tested by the ObolUpdateCore SwiftPM target.
import Foundation

public struct ReleaseAsset: Codable, Equatable, Sendable {
    public let name: String
    public let browserDownloadURL: URL
    public let size: Int64?
    public let digest: String?
    public let contentType: String?

    private enum CodingKeys: String, CodingKey {
        case name
        case browserDownloadURL = "browser_download_url"
        case size
        case digest
        case contentType = "content_type"
    }
}

public struct ReleaseFeedEntry: Codable, Equatable, Identifiable, Sendable {
    public let tagName: String
    public let name: String?
    public let body: String?
    public let htmlURL: URL?
    public let prerelease: Bool?
    public let publishedAt: String?
    public let assets: [ReleaseAsset]

    public var id: String { tagName }
    public var version: SemanticVersion? { SemanticVersion(parsing: tagName) }

    private enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case name
        case body
        case htmlURL = "html_url"
        case prerelease
        case publishedAt = "published_at"
        case assets
    }

    public func updateAsset(expectedName: String) -> ReleaseAsset? {
        if let exact = assets.first(where: { $0.name == expectedName && isZip($0.name) }) {
            return exact
        }
        return assets.first(where: { $0.name.hasPrefix("Obol-") && isZip($0.name) })
    }

    public func sha256(forFileNamed filename: String, inSums sums: String) -> String? {
        for line in sums.split(whereSeparator: \.isNewline) {
            let fields = line.split(maxSplits: 1, omittingEmptySubsequences: true, whereSeparator: { $0.isWhitespace })
            guard fields.count == 2 else { continue }
            var name = String(fields[1]).trimmingCharacters(in: .whitespacesAndNewlines)
            if name.first == "*" { name.removeFirst() }
            guard name == filename else { continue }
            let digest = String(fields[0]).lowercased()
            guard digest.count == 64, digest.allSatisfy({ $0.isHexDigit }) else { return nil }
            return digest
        }
        return nil
    }

    private func isZip(_ name: String) -> Bool {
        name.lowercased().hasSuffix(".zip")
    }
}

public typealias ReleaseFeed = ReleaseFeedEntry
