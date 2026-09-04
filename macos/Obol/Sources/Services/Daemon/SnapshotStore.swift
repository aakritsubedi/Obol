import Foundation
import ObolCore

protocol SnapshotStoring {
    func load() -> UsageSummary?
}

final class SnapshotStore: SnapshotStoring {
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func load() -> UsageSummary? {
        let path = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent(".obol/snapshot.json")
        guard let data = try? Data(contentsOf: path),
              let snapshot = try? JSONDecoder().decode(SnapshotEnvelope.self, from: data)
        else {
            return nil
        }
        return snapshot.summary
    }

    private struct SnapshotEnvelope: Decodable {
        let summary: UsageSummary
    }
}
