import AppKit
import Combine
import Foundation
import ServiceManagement
import SwiftUI

@MainActor
final class DaemonController: ObservableObject {
    weak static var shared: DaemonController?

    @Published private(set) var summary = UsageSummary()
    @Published private(set) var config = WidgetConfig.default
    @Published private(set) var connected = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var isPopoverPresented = false
    @Published private(set) var notificationsDenied = false

    private let client = UsageClient()
    private let notifier = Notifier()
    private var daemon: Process?
    private var runtimeTimer: Timer?
    private var pollingTimer: Timer?
    private var baseURL: URL?
    private var token = ""
    private var fetchInFlight = false
    private var started = false
    private var shuttingDown = false

    init() {
        Self.shared = self
        notifier.onAuthorizationChange = { [weak self] denied in
            self?.notificationsDenied = denied
        }
        notifier.requestPermission()
        start()
    }

    var menuTitle: String {
        UsageClient.currencySymbol + UsageClient.amount(summary.today.totalCost)
    }

    var liveLabel: String {
        summary.stale ? "Cached" : "Live"
    }

    var liveColor: Color {
        if summary.stale {
            return WidgetStyle.warning
        }
        switch summary.budgetStatus {
        case .ok: return WidgetStyle.codex
        case .warn: return WidgetStyle.warning
        case .over: return WidgetStyle.danger
        }
    }

    var launchAtLogin: Bool {
        config.launchAtLogin
    }

    func start() {
        guard !started else { return }
        started = true
        loadSnapshot()
        spawnDaemon()
        // Nothing polls if the spawn failed; the status message already
        // explains what is missing.
        guard daemon != nil else { return }
        waitForRuntime(attempt: 0)
    }

    func popoverOpened() {
        isPopoverPresented = true
        guard connected else { return }
        Task { await refresh() }
    }

    func popoverClosed() {
        isPopoverPresented = false
    }

    func refresh() async {
        guard let baseURL, !token.isEmpty, !fetchInFlight else { return }
        fetchInFlight = true
        defer { fetchInFlight = false }
        do {
            let next = try await client.refresh(baseURL: baseURL, token: token)
            apply(next)
        } catch {
            statusMessage = "Refresh unavailable; showing the last good snapshot."
        }
    }

    func openDashboard() {
        guard let baseURL else { return }
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "t", value: token)]
        if let url = components?.url {
            NSWorkspace.shared.open(url)
        }
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        config.launchAtLogin = enabled
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            Task { await saveConfig() }
        } catch {
            config.launchAtLogin = !enabled
            statusMessage = "Could not update Login Item settings."
        }
    }

    func quit() {
        stop()
        NSApp.terminate(nil)
    }

    func stop() {
        shuttingDown = true
        runtimeTimer?.invalidate()
        pollingTimer?.invalidate()
        runtimeTimer = nil
        pollingTimer = nil
        if let daemon, daemon.isRunning {
            daemon.terminate()
        }
        daemon = nil
        connected = false
    }

    private func loadSnapshot() {
        let path = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".obol/snapshot.json")
        guard let data = try? Data(contentsOf: path), let snapshot = try? JSONDecoder().decode(
            SnapshotEnvelope.self,
            from: data
        ) else { return }
        summary = snapshot.summary
        notifier.observe(summary)
    }

    private func spawnDaemon() {
        guard let script = daemonScriptURL() else {
            statusMessage = "Build daemon/dist first, then launch the app again."
            return
        }
        // The daemon is a plain Node script; without an interpreter it dies
        // before writing runtime.json and the wait loop would spin to its
        // timeout with nothing to show for it. Say so up front instead.
        guard let node = nodeURL() else {
            statusMessage = "Node.js isn't available. The packaged app ships one; if you launched a dev build, install Node from nodejs.org."
            return
        }
        let process = Process()
        process.executableURL = node
        process.arguments = [script.path, "--parent-pid", String(getpid())]
        // Daemon crashes used to vanish into a null device; keep the last
        // run's output in ~/.obol/daemon.log so failures are diagnosable.
        let logURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".obol/daemon.log")
        try? FileManager.default.createDirectory(
            at: logURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if let log = FileHandle(forWritingAtPath: logURL.path) {
            try? log.seekToEnd()
            process.standardOutput = log
            process.standardError = log
        }
        process.terminationHandler = { [weak self] process in
            let code = process.terminationStatus
            Task { @MainActor in self?.daemonExited(code: code) }
        }
        do {
            try process.run()
            daemon = process
        } catch {
            statusMessage = "Could not start the local daemon."
        }
    }

    private func daemonExited(code: Int32) {
        guard !shuttingDown else { return }
        statusMessage = "The local daemon exited (code \(code)). Check ~/.obol/daemon.log — usually a missing or outdated Node.js."
    }

    private func waitForRuntime(attempt: Int) {
        guard attempt < 120 else {
            statusMessage = "Waiting for the local daemon timed out. Check ~/.obol/daemon.log."
            return
        }
        // The process is gone; the termination handler owns the message now.
        guard let daemon, daemon.isRunning else { return }
        let runtimePath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".obol/runtime.json")
        if let data = try? Data(contentsOf: runtimePath),
           let runtime = try? JSONDecoder().decode(RuntimeState.self, from: data),
           runtime.pid == Int(daemon.processIdentifier)
        {
            token = runtime.token
            baseURL = URL(string: "http://127.0.0.1:\(runtime.port)/")
            connected = true
            statusMessage = nil
            runtimeTimer?.invalidate()
            pollingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
                Task { await self?.pollSummary() }
            }
            // One daemon-managed refresh on startup replaces the disk snapshot;
            // subsequent polling remains a cheap cached read.
            Task { await refresh() }
            return
        }
        runtimeTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.waitForRuntime(attempt: attempt + 1) }
        }
    }

    private func pollSummary() async {
        guard let baseURL, !token.isEmpty else { return }
        do {
            let next = try await client.summary(baseURL: baseURL, token: token)
            apply(next)
            if let nextConfig = try? await client.config(baseURL: baseURL, token: token) {
                config = nextConfig
                healLaunchAtLogin()
            }
        } catch {
            connected = false
            statusMessage = "Daemon unavailable; showing the last good snapshot."
        }
    }

    private func saveConfig() async {
        guard let baseURL, !token.isEmpty else { return }
        do { config = try await client.update(config: config, baseURL: baseURL, token: token) } catch {
            statusMessage = "Could not save preferences."
        }
    }

    private func apply(_ next: UsageSummary) {
        summary = next
        connected = true
        notifier.observe(next)
    }

    private func healLaunchAtLogin() {
        guard config.launchAtLogin, SMAppService.mainApp.status != .enabled else { return }
        try? SMAppService.mainApp.register()
    }

    private func nodeURL() -> URL? {
        // The release bundle ships its own interpreter; users need nothing.
        if let resource = Bundle.main.resourceURL {
            let vendored = resource.appendingPathComponent("runtime/bin/node")
            if FileManager.default.isExecutableFile(atPath: vendored.path) {
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
        if let hit = direct.first(where: { FileManager.default.isExecutableFile(atPath: $0.path) }) {
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
            guard let versions = try? FileManager.default.contentsOfDirectory(atPath: parent) else { continue }
            let candidate = versions
                .filter { !$0.hasPrefix(".") }
                .sorted { Self.compareVersions($0, $1) == .orderedDescending }
                .compactMap { URL(fileURLWithPath: parent).appendingPathComponent($0 + "/" + subpath).path }
                .first { FileManager.default.isExecutableFile(atPath: $0) }
            if let candidate {
                return URL(fileURLWithPath: candidate)
            }
        }
        return nil
    }

    /// Orders `v22.1.0`-style tags by their numeric components.
    static func compareVersions(_ lhs: String, _ rhs: String) -> ComparisonResult {
        let left = lhs.split(separator: ".").map { Int($0.filter(\.isNumber)) ?? 0 }
        let right = rhs.split(separator: ".").map { Int($0.filter(\.isNumber)) ?? 0 }
        for index in 0 ..< max(left.count, right.count) {
            let l = index < left.count ? left[index] : 0
            let r = index < right.count ? right[index] : 0
            if l != r {
                return l < r ? .orderedAscending : .orderedDescending
            }
        }
        return .orderedSame
    }

    private func daemonScriptURL() -> URL? {
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("daemon/dist/index.js"),
           FileManager.default.fileExists(atPath: bundled.path)
        {
            return bundled
        }
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0 ..< 3 {
            root.deleteLastPathComponent()
        }
        let development = root.appendingPathComponent("daemon/dist/index.js")
        return FileManager.default.fileExists(atPath: development.path) ? development : nil
    }
}

private struct SnapshotEnvelope: Decodable {
    let summary: UsageSummary
}
