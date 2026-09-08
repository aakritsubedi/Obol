import Foundation

/// One decoded server-sent event.
public struct ServerSentEvent: Equatable, Sendable {
    /// The `event:` field, or `message` when the stream did not name one.
    public let event: String
    /// The `data:` field. Multiple data lines join with newlines, per the spec.
    public let data: String

    public init(event: String, data: String) {
        self.event = event
        self.data = data
    }
}

/// Assembles server-sent events from a byte stream that arrives a line at a time.
///
/// The daemon already broadcasts every summary it computes on `/api/events`, so
/// the menu bar can be told what changed instead of asking on a timer. Kept
/// here, apart from the URLSession that feeds it, because the framing is where
/// the mistakes live and this is the layer that can be tested.
public struct ServerSentEventParser {
    private var event: String?
    private var data: [String] = []

    public init() {}

    /// Feeds one line and returns an event when that line completed one.
    ///
    /// A blank line dispatches. A line with no colon is a field with an empty
    /// value, and a leading space after the colon is part of the framing rather
    /// than the value — both are spec requirements that a naive split gets wrong.
    public mutating func consume(line: String) -> ServerSentEvent? {
        // Tolerate CRLF: the line may still carry its carriage return.
        let line = line.hasSuffix("\r") ? String(line.dropLast()) : line

        if line.isEmpty {
            defer {
                event = nil
                data = []
            }
            guard !data.isEmpty else { return nil }
            return ServerSentEvent(event: event ?? "message", data: data.joined(separator: "\n"))
        }

        // A line beginning with a colon is a comment, which is how a server
        // keeps an idle connection alive.
        guard !line.hasPrefix(":") else { return nil }

        let field: String
        var value: String
        if let separator = line.firstIndex(of: ":") {
            field = String(line[line.startIndex ..< separator])
            value = String(line[line.index(after: separator)...])
            if value.hasPrefix(" ") {
                value.removeFirst()
            }
        } else {
            field = line
            value = ""
        }

        switch field {
        case "event": event = value
        case "data": data.append(value)
        default: break // id and retry carry nothing this client acts on.
        }
        return nil
    }

    /// Forgets a partially assembled event, for use when a connection drops.
    public mutating func reset() {
        event = nil
        data = []
    }
}
