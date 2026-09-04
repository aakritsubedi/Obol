import Foundation
import ObolCore

final class NodeLocator {
    private let fileManager: FileManager

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func locate(bundle: Bundle = .main) -> URL? {
        // The release bundle ships its own interpreter; users need nothing.
        if let resource = bundle.resourceURL {
            let vendored = resource.appendingPathComponent("runtime/bin/node")
            if fileManager.isExecutableFile(atPath: vendored.path) {
                return vendored
            }
        }

        // Development builds fall back to whatever the machine provides.
        let direct = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/opt/local/bin/node",
            "/usr/bin/node",
            NSString(string: "~/.volta/bin/node").expandingTildeInPath,
        ].map { URL(fileURLWithPath: $0) }
        if let hit = direct.first(where: { fileManager.isExecutableFile(atPath: $0.path) }) {
            return hit
        }

        // Version managers keep interpreters under versioned folders; prefer
        // the highest version so an old default doesn't shadow a newer one.
        let managed: [(parent: String, subpath: String)] = [
            (NSString(string: "~/.nvm/versions/node").expandingTildeInPath, "bin/node"),
            (NSString(string: "~/.local/share/mise/installs/node").expandingTildeInPath, "bin/node"),
            (
                NSString(string: "~/Library/Application Support/fnm/node-versions").expandingTildeInPath,
                "installation/bin/node"
            ),
            (NSString(string: "~/.fnm/node-versions").expandingTildeInPath, "installation/bin/node"),
        ]
        for (parent, subpath) in managed {
            guard let versions = try? fileManager.contentsOfDirectory(atPath: parent) else { continue }
            let candidate = versions
                .filter { !$0.hasPrefix(".") }
                .sorted { VersionCompare.compare($0, $1) == .orderedDescending }
                .map { URL(fileURLWithPath: parent).appendingPathComponent($0 + "/" + subpath) }
                .first { fileManager.isExecutableFile(atPath: $0.path) }
            if let candidate {
                return candidate
            }
        }
        return nil
    }
}
