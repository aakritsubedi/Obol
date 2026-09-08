import Foundation
import ObolCore

protocol UsageEventStreaming: AnyObject {
    /// Delivers every summary the daemon broadcasts until the task is cancelled.
    func summaries(baseURL: URL, token: String) -> AsyncStream<UsageSummary>
    func stop()
}

/// Subscribes to the daemon's `/api/events` broadcast.
///
/// The menu bar used to ask for a summary every 15 seconds whether or not one
/// had changed — 240 wake-ups an hour on a timer with no tolerance, each one
/// pulling the daemon through work of its own. The daemon already publishes a
/// summary the moment it computes one, so this listens instead of asking.
///
/// Reconnects on its own with a backoff, because a stream that dies quietly is
/// worse than a poll: the menu bar would sit on a stale figure forever.
final class UsageEventStream: UsageEventStreaming {
    private let session: URLSession
    private var task: Task<Void, Never>?

    /// Long enough that an idle daemon does not look dead. The daemon refreshes
    /// on its own cadence and broadcasts each time, so silence past this is a
    /// dropped connection rather than a quiet period.
    private static let idleTimeout: TimeInterval = 15 * 60
    private static let firstRetryDelay: Duration = .seconds(1)
    private static let maxRetryDelay: Duration = .seconds(60)

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
            return
        }
        let configuration = URLSessionConfiguration.ephemeral
        // A summary can be minutes apart; the default 60s request timeout would
        // tear the stream down mid-idle and reconnect for nothing.
        configuration.timeoutIntervalForRequest = Self.idleTimeout
        configuration.timeoutIntervalForResource = .infinity
        configuration.waitsForConnectivity = false
        self.session = URLSession(configuration: configuration)
    }

    func summaries(baseURL: URL, token: String) -> AsyncStream<UsageSummary> {
        stop()
        return AsyncStream { continuation in
            let task = Task { [session] in
                var delay = Self.firstRetryDelay
                while !Task.isCancelled {
                    let connected = await Self.consume(
                        session: session,
                        baseURL: baseURL,
                        token: token,
                        continuation: continuation
                    )
                    if Task.isCancelled {
                        break
                    }
                    // A stream that carried something before it dropped is a
                    // healthy daemon that restarted or a connection that aged
                    // out, so the next attempt starts from the short delay.
                    delay = connected ? Self.firstRetryDelay : min(delay * 2, Self.maxRetryDelay)
                    do {
                        try await Task.sleep(for: delay)
                    } catch {
                        break
                    }
                }
                continuation.finish()
            }
            self.task = task
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// Returns whether the connection delivered anything before it ended.
    private static func consume(
        session: URLSession,
        baseURL: URL,
        token: String,
        continuation: AsyncStream<UsageSummary>.Continuation
    ) async -> Bool {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/events"))
        // The token travels as a header rather than in the query string. The
        // dashboard has no choice — EventSource cannot set headers — but this
        // client can, so the token stays out of the URL.
        request.setValue(token, forHTTPHeaderField: "x-token")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = idleTimeout

        var delivered = false
        do {
            let (lines, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
                return false
            }
            var parser = ServerSentEventParser()
            let decoder = JSONDecoder()
            for try await line in lines.lines {
                guard let event = parser.consume(line: line), event.event == "summary" else { continue }
                guard let data = event.data.data(using: .utf8),
                      let summary = try? decoder.decode(UsageSummary.self, from: data)
                else { continue }
                delivered = true
                continuation.yield(summary)
            }
        } catch {
            // Cancellation and a dropped daemon arrive here alike; the caller's
            // loop decides whether to try again.
        }
        return delivered
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    deinit {
        task?.cancel()
    }
}
