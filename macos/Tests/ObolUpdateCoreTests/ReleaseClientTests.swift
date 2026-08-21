import Foundation
import XCTest
@testable import ObolUpdateCore

final class ReleaseClientTests: XCTestCase {
    private final class StubURLProtocol: URLProtocol {
        static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))!

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

        override func startLoading() {
            do {
                let (response, data) = try Self.handler(request)
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data)
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
        }

        override func stopLoading() {}
    }

    private func client(status: Int, headers: [String: String] = [:], body: Data = Data("{}".utf8)) -> ReleaseClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/vnd.github+json")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-GitHub-Api-Version"), "2022-11-28")
            XCTAssertNotNil(request.value(forHTTPHeaderField: "User-Agent"))
            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            return (response, body)
        }
        return ReleaseClient(session: URLSession(configuration: configuration), feedURL: URL(string: "http://fixture.test/latest"))
    }

    func testNotModifiedSendsConditionalETag() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "If-None-Match"), "\"etag-1\"")
            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 304,
                httpVersion: "HTTP/1.1",
                headerFields: [:]
            )!
            return (response, Data())
        }
        let result = try await ReleaseClient(
            session: URLSession(configuration: configuration),
            feedURL: URL(string: "http://fixture.test/latest")
        ).fetch(etag: "\"etag-1\"")
        XCTAssertEqual(result, .notModified)
    }

    func testNoReleaseAndRateLimitResponses() async throws {
        let noRelease = try await client(status: 404).fetch()
        XCTAssertEqual(noRelease, .noReleasesYet)
        let reset = String(Int(Date().addingTimeInterval(600).timeIntervalSince1970))
        let result = try await client(
            status: 429,
            headers: ["x-ratelimit-remaining": "0", "x-ratelimit-reset": reset]
        ).fetch()
        guard case let .rateLimited(retryAfter) = result else {
            return XCTFail("expected rate limited result")
        }
        XCTAssertGreaterThan(retryAfter, Date())
    }

    func testBareForbiddenResponseThrows() async {
        do {
            _ = try await client(status: 403, headers: ["x-ratelimit-remaining": "2"]).fetch()
            XCTFail("expected HTTP error")
        } catch let error as ReleaseClientError {
            XCTAssertEqual(error, .httpStatus(403))
        } catch {
            XCTFail("unexpected error: \(error)")
        }
    }
}
