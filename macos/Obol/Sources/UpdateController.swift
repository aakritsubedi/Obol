import AppKit
import Combine
import CryptoKit
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

enum UpdateState: Equatable {
    case idle
    case checking
    case upToDate(checkedAt: Date)
    case available(ReleaseFeedEntry)
    case downloading(progress: Double)
    case readyToInstall(StagedUpdate)
    case installing
    case failed(String)
}

@MainActor
final class UpdateController: ObservableObject {
    @Published private(set) var state: UpdateState = .idle

    private var defaults = UpdateDefaults()
    private let installer = UpdateInstaller()
    private let client: ReleaseClient
    private var releaseEntry: ReleaseFeedEntry?
    private var checkTask: Task<Void, Never>?
    private var downloadTask: Task<Void, Never>?
    private var downloadSession: URLSession?
    private var launchTimer: Timer?
    private var cadenceTimer: Timer?

    init() {
        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
        let feedURL = environment["OBOL_UPDATE_FEED_URL"].flatMap(URL.init(string:))
        let repo = environment["OBOL_UPDATE_REPO"] ?? "aakritsubedi/obol"
        client = ReleaseClient(repo: repo, feedURL: feedURL)
        #else
        client = ReleaseClient()
        #endif

        if let cachedRelease = defaults.cachedRelease {
            releaseEntry = try? JSONDecoder().decode(ReleaseFeedEntry.self, from: cachedRelease)
        }

        launchTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.checkIfDue() }
        }
        cadenceTimer = Timer.scheduledTimer(withTimeInterval: 6 * 60 * 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkIfDue() }
        }
    }

    deinit {
        launchTimer?.invalidate()
        cadenceTimer?.invalidate()
        checkTask?.cancel()
        downloadTask?.cancel()
        downloadSession?.invalidateAndCancel()
    }

    var hasPendingUpdate: Bool {
        switch state {
        case .available, .readyToInstall: return true
        default: return false
        }
    }

    var availableVersion: String? {
        switch state {
        case let .available(entry): return entry.version?.description ?? entry.tagName
        case let .readyToInstall(staged): return staged.version.description
        default: return nil
        }
    }

    func popoverOpened() {
        checkIfDue()
    }

    func checkIfDue() {
        guard defaults.automaticChecks else { return }
        guard !isBusy else { return }
        guard defaults.rateLimitedUntil.map({ $0 > Date() }) != true else { return }
        if let lastCheckedAt = defaults.lastCheckedAt,
           Date().timeIntervalSince(lastCheckedAt) < 24 * 60 * 60 {
            return
        }
        startCheck(ignoreCadence: false, ignoreSkippedVersion: false)
    }

    func manualCheck() {
        guard !isBusy else { return }
        startCheck(ignoreCadence: true, ignoreSkippedVersion: true)
    }

    func skipCurrentVersion() {
        guard let entry = releaseEntry, let version = entry.version else { return }
        defaults.skippedVersion = version.description
        state = .idle
    }

    func beginUpdate() {
        guard case let .available(entry) = state,
              let version = entry.version,
              let asset = entry.updateAsset(expectedName: "Obol-\(version).zip") else {
            state = .failed("This release does not contain an Obol ZIP.")
            return
        }
        guard downloadTask == nil else { return }
        state = .downloading(progress: 0)
        downloadTask = Task { [weak self] in
            await self?.download(entry: entry, version: version, asset: asset)
        }
    }

    func installReadyUpdate() {
        guard case let .readyToInstall(staged) = state else { return }
        state = .installing
        do {
            DaemonController.shared?.stop()
            try installer.install(staged)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func openReleaseNotes() {
        guard let url = releaseEntry?.htmlURL else { return }
        NSWorkspace.shared.open(url)
    }

    func checkedAtHelp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return "Checked \(formatter.string(from: date))"
    }

    private var isBusy: Bool {
        switch state {
        case .checking, .downloading, .readyToInstall, .installing: return true
        default: return false
        }
    }

    private func startCheck(ignoreCadence: Bool, ignoreSkippedVersion: Bool) {
        guard checkTask == nil, !isBusy else { return }
        if !ignoreCadence {
            guard defaults.rateLimitedUntil.map({ $0 > Date() }) != true,
                  defaults.lastCheckedAt.map({ Date().timeIntervalSince($0) < 24 * 60 * 60 }) != true else {
                return
            }
        }
        state = .checking
        checkTask = Task { [weak self] in
            await self?.performCheck(ignoreSkippedVersion: ignoreSkippedVersion)
        }
    }

    private func performCheck(ignoreSkippedVersion: Bool) async {
        defer { checkTask = nil }
        do {
            let result = try await client.fetch(etag: defaults.feedETag)
            let checkedAt = Date()
            defaults.lastCheckedAt = checkedAt
            switch result {
            case let .release(entry, etag):
                defaults.feedETag = etag
                defaults.cachedRelease = try? JSONEncoder().encode(entry)
                defaults.rateLimitedUntil = nil
                releaseEntry = entry
                let decision = evaluateUpdate(
                    current: currentVersionString,
                    candidateTag: entry.tagName,
                    skippedVersion: ignoreSkippedVersion ? nil : defaults.skippedVersion,
                    allowPrerelease: false
                )
                switch decision {
                case .upToDate: state = .upToDate(checkedAt: checkedAt)
                case .skipped: state = .idle
                case .update: state = .available(entry)
                case let .unreadable(message): state = .failed(message)
                }
            case .notModified:
                guard let entry = releaseEntry else {
                    // A persisted ETag without its decoded release cannot be evaluated safely.
                    // Drop the conditional token so the next check gets a full payload.
                    defaults.feedETag = nil
                    state = .idle
                    break
                }
                switch evaluateUpdate(
                    current: currentVersionString,
                    candidateTag: entry.tagName,
                    skippedVersion: ignoreSkippedVersion ? nil : defaults.skippedVersion,
                    allowPrerelease: false
                ) {
                case .update:
                    state = .available(entry)
                case .skipped:
                    state = .idle
                case .upToDate:
                    state = .upToDate(checkedAt: checkedAt)
                case let .unreadable(message):
                    state = .failed(message)
                }
            case .noReleasesYet:
                releaseEntry = nil
                state = .idle
            case let .rateLimited(retryAfter):
                defaults.rateLimitedUntil = retryAfter
                state = .failed("Try again later")
            }
        } catch {
            defaults.lastCheckedAt = Date()
            state = .failed(error.localizedDescription)
        }
    }

    // Only CFBundleShortVersionString participates in update comparisons. CFBundleVersion is a
    // git revision count and is not comparable across shallow clones or release branches.
    private var currentVersionString: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? ""
    }

    private func download(entry: ReleaseFeedEntry, version: SemanticVersion, asset: ReleaseAsset) async {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent("Obol-update-\(UUID().uuidString)", isDirectory: true)
        do {
            try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
            let delegate = DownloadDelegate { [weak self] progress in
                Task { @MainActor [weak self] in
                    guard let self, case .downloading = self.state else { return }
                    self.state = .downloading(progress: progress)
                }
            }
            let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
            downloadSession = session
            var request = URLRequest(url: asset.browserDownloadURL)
            request.setValue("Obol-Updater/1.0 (https://github.com/aakritsubedi/obol)", forHTTPHeaderField: "User-Agent")
            let (temporaryURL, response) = try await session.download(for: request, delegate: delegate)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw UpdateDownloadError.badResponse
            }
            let archive = root.appendingPathComponent(asset.name)
            try fileManager.moveItem(at: temporaryURL, to: archive)
            if let expectedSize = asset.size {
                let values = try fileManager.attributesOfItem(atPath: archive.path)
                let actualSize = (values[.size] as? NSNumber)?.int64Value
                guard actualSize == expectedSize else { throw UpdateDownloadError.sizeMismatch }
            }
            let expectedHash = try await expectedSHA256(entry: entry, asset: asset)
            let actualHash = try streamingSHA256(at: archive)
            guard actualHash.caseInsensitiveCompare(expectedHash) == .orderedSame else {
                throw UpdateDownloadError.digestMismatch
            }
            let staged = try installer.stage(archiveURL: archive, currentVersion: currentVersion, stagingRoot: root)
            state = .readyToInstall(staged)
            downloadSession = nil
            session.finishTasksAndInvalidate()
            downloadTask = nil
            return
        } catch {
            try? fileManager.removeItem(at: root)
            downloadSession?.invalidateAndCancel()
            downloadSession = nil
            downloadTask = nil
            state = .failed(error.localizedDescription)
        }
    }

    private var currentVersion: SemanticVersion {
        SemanticVersion(parsing: currentVersionString) ?? SemanticVersion(parsing: "0.0.0")!
    }

    private func expectedSHA256(entry: ReleaseFeedEntry, asset: ReleaseAsset) async throws -> String {
        if let digest = asset.digest {
            let parts = digest.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            if parts.count == 2, parts[0].lowercased() == "sha256",
               parts[1].count == 64, parts[1].allSatisfy(\.isHexDigit) {
                return String(parts[1]).lowercased()
            }
        }
        guard let sumsAsset = entry.assets.first(where: { $0.name.uppercased() == "SHA256SUMS" }) else {
            throw UpdateDownloadError.missingChecksum
        }
        let (data, response) = try await URLSession.shared.data(from: sumsAsset.browserDownloadURL)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let sums = String(data: data, encoding: .utf8),
              let hash = entry.sha256(forFileNamed: asset.name, inSums: sums) else {
            throw UpdateDownloadError.missingChecksum
        }
        return hash
    }

    private func streamingSHA256(at url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

private enum UpdateDownloadError: LocalizedError {
    case badResponse
    case sizeMismatch
    case missingChecksum
    case digestMismatch

    var errorDescription: String? {
        switch self {
        case .badResponse: return "The update download returned an invalid response."
        case .sizeMismatch: return "The update download size did not match the release."
        case .missingChecksum: return "This release is missing a checksum"
        case .digestMismatch: return "The update checksum did not match."
        }
    }
}

private final class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    private let onProgress: (Double) -> Void

    init(onProgress: @escaping (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(_: URLSession, downloadTask _: URLSessionDownloadTask, didFinishDownloadingTo _: URL) {}

    func urlSession(
        _: URLSession,
        downloadTask _: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard totalBytesExpectedToWrite > 0 else { return }
        onProgress(min(1, max(0, Double(totalBytesWritten) / Double(totalBytesExpectedToWrite))))
    }
}
