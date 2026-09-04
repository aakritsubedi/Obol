import AppKit
import Combine
import Foundation
import ObolCore

@MainActor
final class DaemonController: ObservableObject {
    @Published private(set) var summary = UsageSummary()
    @Published private(set) var config = WidgetConfig.default
    @Published private(set) var connected = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var isPopoverPresented = false
    @Published private(set) var notificationsDenied = false
    @Published private(set) var activeSessions: [ActiveSession] = []
    @Published private(set) var todayJournal: TodayJournal?
    /// Whether the sleep assertion is actually held right now, as opposed to
    /// merely switched on. Settings shows the difference.
    @Published private(set) var keepAwakeHolding = false
    /// Whether clamshell sleep is held off right now. Separate from the switch
    /// for the same reason: on and holding are not the same state.
    @Published private(set) var lidWakeHolding = false

    private let client: UsageFetching
    private let notifier: Notifying
    private let keepAwake: KeepAwakeControlling
    private let lidWake: LidWakeControlling
    private let process: DaemonProcessControlling
    private let nodeLocator: NodeLocator
    private let snapshotStore: SnapshotStoring
    private let loginItem: LoginItemControlling
    private var runtimeTimer: Timer?
    private var pollingTimer: Timer?
    private var baseURL: URL?
    private var token = ""
    private var fetchInFlight = false
    private var started = false
    private var shuttingDown = false
    private let onCurrencyChanged: (String, Double?) -> Void

    init(
        client: UsageFetching = UsageClient(),
        notifier: Notifying = Notifier(),
        keepAwake: KeepAwakeControlling = KeepAwakeController(),
        lidWake: LidWakeControlling? = nil,
        process: DaemonProcessControlling = DaemonProcessService(),
        nodeLocator: NodeLocator = NodeLocator(),
        snapshotStore: SnapshotStoring = SnapshotStore(),
        loginItem: LoginItemControlling = LoginItemService(),
        onCurrencyChanged: @escaping (String, Double?) -> Void = { _, _ in },
        startImmediately: Bool = true
    ) {
        self.client = client
        self.notifier = notifier
        self.keepAwake = keepAwake
        self.lidWake = lidWake ?? LidWakeController()
        self.process = process
        self.nodeLocator = nodeLocator
        self.snapshotStore = snapshotStore
        self.loginItem = loginItem
        self.onCurrencyChanged = onCurrencyChanged
        notifier.onAuthorizationChange = { [weak self] denied in
            self?.notificationsDenied = denied
        }
        // config.json is the shared record, but it is a second away at launch,
        // so the remembered choice restores the switch without waiting for it.
        // Nothing is held yet: the first session read decides that, and idle
        // sleep is minutes away regardless.
        config.keepAwake = Self.rememberedKeepAwake
        config.keepAwakeWithLidClosed = Self.rememberedLidWake
        // `disablesleep` outlives whatever set it, so a previous run that was
        // killed mid-hold is undone here rather than left on the machine.
        if startImmediately {
            start()
        }
    }

    private static let keepAwakeDefaultsKey = "com.aakritsubedi.obol.keepAwake"

    private static var rememberedKeepAwake: Bool {
        get { UserDefaults.standard.bool(forKey: keepAwakeDefaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: keepAwakeDefaultsKey) }
    }

    private static let lidWakeDefaultsKey = "com.aakritsubedi.obol.keepAwakeWithLidClosed"

    private static var rememberedLidWake: Bool {
        get { UserDefaults.standard.bool(forKey: lidWakeDefaultsKey) }
        set { UserDefaults.standard.set(newValue, forKey: lidWakeDefaultsKey) }
    }

    var liveLabel: String {
        summary.stale ? "Cached" : "Live"
    }

    var launchAtLogin: Bool {
        config.launchAtLogin
    }

    var keepAwakeEnabled: Bool {
        config.keepAwake
    }

    var lidWakeEnabled: Bool {
        config.keepAwakeWithLidClosed
    }

    func start() {
        guard !started else { return }
        started = true
        notifier.requestPermission()
        lidWake.reset(settingEnabled: config.keepAwakeWithLidClosed)
        loadSnapshot()
        spawnDaemon()
        // Nothing polls if the spawn failed; the status message already
        // explains what is missing.
        guard process.isRunning else { return }
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
            await loadActiveSessions()
            await loadTodayJournal()
        } catch {
            statusMessage = "Refresh unavailable; showing the last good snapshot."
        }
    }

    /// Fetched when the popover is showing the list, and whenever keep-awake is
    /// on — that setting decides on this data, so a shut window is no longer a
    /// reason to skip the read. With both off, serving it would walk today's
    /// transcripts for nobody.
    ///
    /// A failed read leaves the previous list in place rather than emptying it.
    /// A dropped poll then reads as "unchanged", which keeps the popover from
    /// flashing its empty state and — more importantly — keeps the machine
    /// awake through a blip rather than letting it sleep on a running agent.
    private func loadActiveSessions() async {
        guard isPopoverPresented || config.keepAwake else { return }
        guard let baseURL, !token.isEmpty else { return }
        guard let next = try? await client.activeSessions(baseURL: baseURL, token: token) else { return }
        activeSessions = next
        syncKeepAwake()
    }

    private func loadTodayJournal() async {
        guard isPopoverPresented else { return }
        guard let baseURL, !token.isEmpty else { return }
        guard let next = try? await client.todayJournal(baseURL: baseURL, token: token) else { return }
        todayJournal = next
    }

    func openDashboard() {
        guard let baseURL else { return }
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "t", value: token)]
        if let url = components?.url {
            NSWorkspace.shared.open(url)
        }
    }

    /// The display currency lives in the daemon's config so the menu bar and
    /// the dashboard read the same choice; the conversion itself happens in
    /// CurrencyController, at render time, in each surface.
    func setCurrency(_ code: String, rate: Double? = nil) {
        let currencyChanged = config.currency != code
        guard currencyChanged || (rate != nil && config.currencyRate != rate) else { return }
        config.currency = code
        if currencyChanged || rate != nil {
            config.currencyRate = rate
        }
        Task { await saveConfig() }
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        config.launchAtLogin = enabled
        do {
            try loginItem.setEnabled(enabled)
            Task { await saveConfig() }
        } catch {
            config.launchAtLogin = !enabled
            statusMessage = "Could not update Login Item settings."
        }
    }

    func setKeepAwake(_ enabled: Bool) {
        guard config.keepAwake != enabled else { return }
        config.keepAwake = enabled
        Self.rememberedKeepAwake = enabled
        syncKeepAwake()
        Task {
            // Nothing polls the session list while the setting is off, so
            // switching it on has to go and find out what is running before it
            // can hold anything. The write follows; a failed one costs the
            // setting only its persistence, which `saveConfig` reports.
            await loadActiveSessions()
            await loadTodayJournal()
            await saveConfig()
        }
    }

    /// Clamshell sleep is an extension of Keep awake rather than a setting of
    /// its own: it is the same hold, taken a step further, so it follows the
    /// same switch and the same sessions.
    ///
    /// Turning it on is the one moment that can ask for a password, and a
    /// dismissed prompt leaves the switch where it was rather than showing an
    /// on state the machine will not honour. Turning it off hands the grant
    /// back; a Mac keeps no standing permission it is not using.
    func setKeepAwakeWithLidClosed(_ enabled: Bool) {
        guard config.keepAwakeWithLidClosed != enabled else { return }
        if enabled {
            switch lidWake.authorize() {
            case .granted:
                break
            case .cancelled:
                return
            case .failed:
                statusMessage = "Could not get permission to keep working with the lid closed."
                return
            }
        } else {
            lidWake.revoke()
        }
        config.keepAwakeWithLidClosed = enabled
        Self.rememberedLidWake = enabled
        syncKeepAwake()
        Task {
            await loadActiveSessions()
            await saveConfig()
        }
    }

    /// The switch states an intent; the running sessions decide whether it has
    /// anything to act on. With nothing running, a switch left on behaves
    /// exactly as if it were off, so a machine abandoned after the work
    /// finished sleeps on its usual schedule instead of burning down the
    /// battery holding a vigil for an agent that already stopped.
    ///
    /// A session counts as running for as long as the daemon's idle window
    /// (15 minutes by default) after its last transcript write, so the hold
    /// outlives a quiet stretch mid-run rather than dropping between turns.
    private func syncKeepAwake() {
        let shouldHold = config.keepAwake && !activeSessions.isEmpty
        keepAwake.apply(shouldHold)
        keepAwakeHolding = shouldHold
        // Without the administrator grant the hold cannot be taken at all, so
        // the published state follows what the machine did, not what was asked.
        _ = lidWake.apply(shouldHold && config.keepAwakeWithLidClosed)
        lidWakeHolding = lidWake.isHolding
    }

    func quit() {
        stop()
        NSApp.terminate(nil)
    }

    func stop() {
        shuttingDown = true
        keepAwake.apply(false)
        keepAwakeHolding = false
        _ = lidWake.apply(false)
        lidWakeHolding = false
        runtimeTimer?.invalidate()
        pollingTimer?.invalidate()
        runtimeTimer = nil
        pollingTimer = nil
        process.stop()
        connected = false
    }

    private func loadSnapshot() {
        guard let snapshot = snapshotStore.load() else { return }
        summary = snapshot
        notifier.observe(snapshot)
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
        // Daemon crashes used to vanish into a null device; keep the last
        // run's output in ~/.obol/daemon.log so failures are diagnosable.
        let logURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".obol/daemon.log")
        do {
            try process.start(
                nodeURL: node,
                scriptURL: script,
                parentPID: getpid(),
                logURL: logURL
            ) { [weak self] code in
                Task { @MainActor in self?.daemonExited(code: code) }
            }
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
        guard process.isRunning else { return }
        let runtimePath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".obol/runtime.json")
        if let data = try? Data(contentsOf: runtimePath),
           let runtime = try? JSONDecoder().decode(RuntimeState.self, from: data),
           runtime.pid == Int(process.processIdentifier)
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
            // subsequent polling remains a cheap cached read. The config comes
            // with it so the display currency does not wait a poll interval.
            Task {
                await refresh()
                await loadConfig()
            }
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
            await loadConfig()
            await loadActiveSessions()
        } catch {
            connected = false
            statusMessage = "Daemon unavailable; showing the last good snapshot."
        }
    }

    private func loadConfig() async {
        guard let baseURL, !token.isEmpty else { return }
        guard let nextConfig = try? await client.config(baseURL: baseURL, token: token) else { return }
        config = adoptingKeepAwake(from: nextConfig)
        healLaunchAtLogin()
        // Re-evaluated on every poll so an edit made straight to config.json
        // still takes effect.
        syncKeepAwake()
        // config.json is the shared source of truth for the display currency,
        // so a change made in one surface reaches the other on its next read.
        onCurrencyChanged(nextConfig.currency, nextConfig.currencyRate)
    }

    private func saveConfig() async {
        guard let baseURL, !token.isEmpty else { return }
        do {
            let saved = try await client.update(config: config, baseURL: baseURL, token: token)
            config = adoptingKeepAwake(from: saved)
        } catch {
            statusMessage = "Could not save preferences."
        }
    }

    /// A daemon that predates `keepAwake` drops the key on the way through, so
    /// its reply describes every setting except this one. Taking the reply
    /// wholesale would turn the switch off again on the very next poll; the
    /// local choice stands until a daemon that knows the field speaks.
    private func adoptingKeepAwake(from next: WidgetConfig) -> WidgetConfig {
        var merged = next
        if !next.reportedKeepAwake {
            merged.keepAwake = config.keepAwake
        }
        if !next.reportedKeepAwakeWithLidClosed {
            merged.keepAwakeWithLidClosed = config.keepAwakeWithLidClosed
        }
        return merged
    }

    private func apply(_ next: UsageSummary) {
        summary = next
        connected = true
        notifier.observe(next)
    }

    private func healLaunchAtLogin() {
        guard config.launchAtLogin, !loginItem.isEnabled else { return }
        try? loginItem.setEnabled(true)
    }

    private func nodeURL() -> URL? {
        nodeLocator.locate()
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
