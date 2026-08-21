// Foundation-only updater core. Keep this file free of SwiftUI, AppKit, and Bundle.main
// so it can be compiled and tested by the ObolUpdateCore SwiftPM target.
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum ReleaseFetchResult: Equatable, Sendable {
    case release(ReleaseFeedEntry, etag: String?)
    case notModified
    case noReleasesYet
    case rateLimited(retryAfter: Date)
}

public enum ReleaseClientError: Error, Equatable, LocalizedError {
    case invalidFeedURL
    case invalidResponse
    case httpStatus(Int)
    case unreadableRelease(String)

    public var errorDescription: String? {
        switch self {
        case .invalidFeedURL: return "The update feed URL is invalid."
        case .invalidResponse: return "The update feed returned an invalid response."
        case let .httpStatus(status): return "The update feed returned HTTP \(status)."
        case let .unreadableRelease(message): return message
        }
    }
}

public struct ReleaseClient {
    public let session: URLSession
    public let repo: String
    public let feedURL: URL?

    public init(session: URLSession = .shared, repo: String = "aakritsubedi/obol", feedURL: URL? = nil) {
        self.session = session
        self.repo = repo
        self.feedURL = feedURL
    }

    public func fetch(etag: String? = nil) async throws -> ReleaseFetchResult {
        let url = try makeFeedURL()
        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue("Obol-Updater/1.0 (https://github.com/aakritsubedi/obol)", forHTTPHeaderField: "User-Agent")
        if let etag { request.setValue(etag, forHTTPHeaderField: "If-None-Match") }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ReleaseClientError.invalidResponse }
        switch http.statusCode {
        case 200:
            do {
                let entry = try JSONDecoder().decode(ReleaseFeedEntry.self, from: data)
                return .release(entry, etag: http.value(forHTTPHeaderField: "ETag"))
            } catch {
                throw ReleaseClientError.unreadableRelease(error.localizedDescription)
            }
        case 304:
            return .notModified
        case 404:
            return .noReleasesYet
        case 403, 429:
            if http.value(forHTTPHeaderField: "x-ratelimit-remaining") == "0" {
                let reset = http.value(forHTTPHeaderField: "x-ratelimit-reset").flatMap(TimeInterval.init)
                return .rateLimited(retryAfter: reset.map(Date.init(timeIntervalSince1970:)) ?? Date().addingTimeInterval(3600))
            }
            throw ReleaseClientError.httpStatus(http.statusCode)
        default:
            throw ReleaseClientError.httpStatus(http.statusCode)
        }
    }

    private func makeFeedURL() throws -> URL {
        if let feedURL { return feedURL }
        guard let url = URL(string: "https://api.github.com/repos/\(repo)/releases/latest") else {
            throw ReleaseClientError.invalidFeedURL
        }
        return url
    }
}
