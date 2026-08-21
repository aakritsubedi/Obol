import AppKit
import Foundation
import ObolUpdateCore

/*
 The updater trust model is documented once in SECURITY.md. Summary: TLS to GitHub is the real
 boundary, the SHA-256 digest makes the download tamper-evident, and codesign --verify --deep
 --strict below is an integrity check only — an ad-hoc signature carries no identity.
*/

struct StagedUpdate: Equatable {
    let rootURL: URL
    let appURL: URL
    let version: SemanticVersion
}

enum UpdateInstallerError: LocalizedError {
    case invalidArchive(String)
    case wrongBundleIdentifier
    case downgrade
    case unsignedBundle
    case targetPathRefused
    case targetNotWritable(URL)
    case helperCouldNotStart(Error)

    var errorDescription: String? {
        switch self {
        case let .invalidArchive(message): return message
        case .wrongBundleIdentifier: return "The downloaded app is not an Obol bundle."
        case .downgrade: return "The downloaded app is not newer than this copy."
        case .unsignedBundle: return "The downloaded app failed its integrity check."
        case .targetPathRefused: return "Updates are unavailable while Obol is running from a build directory."
        case let .targetNotWritable(stagedURL):
            return "Obol could not replace the installed app. The downloaded update is ready at \(stagedURL.path)."
        case let .helperCouldNotStart(error): return "Could not start the update helper: \(error.localizedDescription)"
        }
    }
}

final class UpdateInstaller {
    private let fileManager = FileManager.default

    func stage(archiveURL: URL, currentVersion: SemanticVersion, stagingRoot suppliedRoot: URL? = nil) throws -> StagedUpdate {
        let root = suppliedRoot ?? fileManager.temporaryDirectory
            .appendingPathComponent("Obol-update-\(UUID().uuidString)", isDirectory: true)
        let ownsRoot = suppliedRoot == nil
        do {
            try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
            try run("/usr/bin/ditto", arguments: ["-x", "-k", "--rsrc", archiveURL.path, root.path])
            let apps = try fileManager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
                .filter { $0.pathExtension.lowercased() == "app" }
            guard apps.count == 1, let appURL = apps.first else {
                throw UpdateInstallerError.invalidArchive("The update archive must contain exactly one top-level app.")
            }
            guard let bundle = Bundle(url: appURL),
                  let identifier = bundle.bundleIdentifier,
                  identifier == Bundle.main.bundleIdentifier else {
                throw UpdateInstallerError.wrongBundleIdentifier
            }
            guard let versionString = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
                  let version = SemanticVersion(parsing: versionString) else {
                throw UpdateInstallerError.invalidArchive("The downloaded app has an unreadable version.")
            }
            guard version > currentVersion else { throw UpdateInstallerError.downgrade }
            // TODO(dev-id): pin SecRequirement at this exact call site once Developer ID signing exists.
            guard try run("/usr/bin/codesign", arguments: ["--verify", "--deep", "--strict", appURL.path], allowsFailure: true) == 0 else {
                throw UpdateInstallerError.unsignedBundle
            }
            return StagedUpdate(rootURL: root, appURL: appURL, version: version)
        } catch {
            if ownsRoot { try? fileManager.removeItem(at: root) }
            throw error
        }
    }

    func install(_ staged: StagedUpdate) throws {
        let target = Bundle.main.bundleURL
        let targetPath = target.path
        guard !targetPath.contains("/DerivedData/"), !targetPath.contains(".xcodebuild") else {
            throw UpdateInstallerError.targetPathRefused
        }
        let parent = target.deletingLastPathComponent()
        guard fileManager.isWritableFile(atPath: parent.path) else {
            NSWorkspace.shared.activateFileViewerSelecting([staged.appURL])
            throw UpdateInstallerError.targetNotWritable(staged.appURL)
        }

        let helper = staged.rootURL.appendingPathComponent("obol-swap.sh")
        try Self.swapScript.write(to: helper, atomically: true, encoding: .utf8)
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: helper.path)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [
            helper.path,
            String(ProcessInfo.processInfo.processIdentifier),
            staged.appURL.path,
            target.path,
            staged.rootURL.path,
        ]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            throw UpdateInstallerError.helperCouldNotStart(error)
        }
        NSApp.terminate(nil)
    }

    @discardableResult
    private func run(_ executable: String, arguments: [String], allowsFailure: Bool = false) throws -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        if !allowsFailure, process.terminationStatus != 0 {
            throw UpdateInstallerError.invalidArchive("\((executable as NSString).lastPathComponent) could not process the update archive.")
        }
        return process.terminationStatus
    }

    private static let swapScript = """
    #!/bin/sh
    set -eu
    PARENT_PID="$1"
    NEW_APP="$2"
    TARGET="$3"
    STAGING_ROOT="$4"
    BACKUP="${TARGET}.obol-backup.$$"
    LOG="$HOME/.obol/update.log"

    while kill -0 "$PARENT_PID" 2>/dev/null; do
      sleep 0.2
    done
    sleep 1.5
    rm -rf "$BACKUP"
    if ! mv "$TARGET" "$BACKUP"; then
      mkdir -p "$(dirname "$LOG")"
      printf '%s update failed: could not move the existing app\\n' "$(date -u +%FT%TZ)" >> "$LOG"
      exit 1
    fi

    if ! ditto "$NEW_APP" "$TARGET" ||
       ! codesign --verify --deep --strict "$TARGET"; then
      rm -rf "$TARGET"
      mv "$BACKUP" "$TARGET"
      mkdir -p "$(dirname "$LOG")"
      printf '%s update failed: integrity check after swap; restored backup\\n' "$(date -u +%FT%TZ)" >> "$LOG"
      open "$TARGET" >/dev/null 2>&1 || true
      rm -rf "$STAGING_ROOT"
      exit 1
    fi

    rm -rf "$BACKUP"
    open "$TARGET" >/dev/null 2>&1 || true
    rm -rf "$STAGING_ROOT"
    """
}
