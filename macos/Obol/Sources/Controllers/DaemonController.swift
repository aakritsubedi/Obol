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
    @Published private(set) var todayShape = DayShape()
    @Published private(set) var isRefreshing = false
    @Published private(set) var isLoadingActiveSessions = false
    @Published private(set) var isLoadingTodayJournal = false
    @Published private(set) var hasLoadedActiveSessions = false
    @Published private(set) var activeSessionsUnavailable = false
    @Published private(set) var todayJournalUnavailable = false
    /// Whether the sleep assertion is actually held right now, as opposed to
    /// merely switched on. Settings shows the difference.
    @Published private(set) var keepAwakeHolding = false
    /// Whether clamshell sleep is held off right now. Separate from the switch
    /// for the same reason: on and holding are not the same state.
    @Published private(set) var lidWakeHolding = false

    private let client: UsageFetching
    private let events: UsageEventStreaming
    private let notifier: Notifying
    private let keepAwake: KeepAwakeControlling
    private let lidWake: LidWakeControlling
    private let process: DaemonProcessControlling
    private let nodeLocator: NodeLocator
    private let snapshotStore: SnapshotStoring
    private let loginItem: LoginItemControlling
    private var runtimeTimer: Timer?
    /// Liveness and config, not the summary: the event stream carries that.
    private var heartbeatTimer: Timer?
    /// Runs only while a sleep assertion is actually being held.
    private var keepAwakeTimer: Timer?
    private var eventsTask: Task<Void, Never>?
    private var configSaveTask: Task<Void, Never>?
    private var configSaveRequested = false
    private var baseURL: URL?
    private var token = ""
    private var started = false
    private var shuttingDown = false
    private let onCurrencyChanged: (String, Double?) -> Void

    init(
        client: UsageFetching = UsageClient(),
        events: UsageEventStreaming = UsageEventStream(),
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
        self.events = events
        self.notifier = notifier
        self.keepAwake = keepAwake
        self.lidWake = lidWake ?? LidWakeController()
        self.process = process
        self.nodeLocator = nodeLocator
        self.snapshotStore = snapshotStore
        self.loginItem = loginItem
        self.onCurrencyChanged = onCurrencyChanged
        notifier.onAuthorizationChange = { [weak self] denied in
            guard let self, self.notificationsDenied != denied else { return }
            self.notificationsDenied = denied
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

    static let minimumRefreshIntervalSeconds = 30
    static let refreshIntervalStepSeconds = 5

    /// How often the menu bar checks that the daemon is still there and rereads
    /// config.json. Summaries arrive on the event stream in between, so this is
    /// a safety net rather than the way data gets in — and it is given a wide
    /// tolerance so macOS can fold the wake-up into whatever else it is doing.
    private static let heartbeatSeconds: TimeInterval = 300
    private static let heartbeatTolerance: TimeInterval = 30

    /// Keep-awake is the one setting that acts on the session list with the
    /// popover shut, so it gets a tick of its own — and only while it is holding.
    private static let keepAwakeSeconds: TimeInterval = 60
    private static let keepAwakeTolerance: TimeInterval = 10

    /// Matches the daemon's own refresh floor: below it, a forced refresh is
    /// work whose result the daemon would have declined to recompute anyway.
    private static let popoverRefreshFloor: TimeInterval = 60

    var refreshIntervalSeconds: Int {
        max(Self.minimumRefreshIntervalSeconds, config.refreshIntervalMs / 1000)
    }

    /// Reserve the sections during startup, before a runtime URL is available.
    /// Subsequent reads keep their last successful content on screen.
    var showsActiveSessionsSkeleton: Bool {
        !hasLoadedActiveSessions && !activeSessionsUnavailable &&
            (isLoadingActiveSessions || statusMessage == nil)
    }

    var showsTodayJournalSkeleton: Bool {
        todayJournal == nil && !todayJournalUnavailable &&
            (isLoadingTodayJournal || statusMessage == nil)
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
        if !isPopoverPresented {
            isPopoverPresented = true
        }
        guard connected else { return }
        Task {
            // The summary on screen arrived on the event stream, so opening the
            // popover only has to fetch what the popover alone shows. Forcing a
            // rebuild every time re-read every transcript for a number that had
            // not changed since the last broadcast.
            if Recency.isStale(updatedAt: summary.updatedAt, now: Date(), olderThan: Self.popoverRefreshFloor) {
                await refresh()
            } else {
                await loadActiveSessions()
                await loadTodayJournal()
            }
        }
    }

    func popoverClosed() {
        if isPopoverPresented {
            isPopoverPresented = false
        }
    }

    func refresh() async {
        guard let baseURL, !token.isEmpty, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let next = try await client.refresh(baseURL: baseURL, token: token)
            apply(next)
        } catch {
            statusMessage = "Refresh unavailable; showing the last good snapshot."
        }
        // These endpoints can still succeed when the usage refresh fails.
        async let sessions: Void = loadActiveSessions()
        async let journal: Void = loadTodayJournal()
        _ = await (sessions, journal)
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
        guard let baseURL, !token.isEmpty, !isLoadingActiveSessions else { return }
        isLoadingActiveSessions = true
        if activeSessionsUnavailable {
            activeSessionsUnavailable = false
        }
        defer { isLoadingActiveSessions = false }
        guard let next = try? await client.activeSessions(baseURL: baseURL, token: token) else {
            if !activeSessionsUnavailable {
                activeSessionsUnavailable = true
            }
            return
        }
        let changed = activeSessions != next
        if changed {
            activeSessions = next
        }
        if !hasLoadedActiveSessions {
            hasLoadedActiveSessions = true
        }
        if changed {
            syncKeepAwake()
        }
    }

    private func loadTodayJournal() async {
        guard isPopoverPresented else { return }
        guard let baseURL, !token.isEmpty, !isLoadingTodayJournal else { return }
        isLoadingTodayJournal = true
        if todayJournalUnavailable {
            todayJournalUnavailable = false
        }
        defer { isLoadingTodayJournal = false }
        guard let next = try? await client.todayJournal(baseURL: baseURL, token: token) else {
            if !todayJournalUnavailable {
                todayJournalUnavailable = true
            }
            return
        }
        if todayJournal != next {
            todayJournal = next
            todayShape = DayShape.from(next)
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
        requestConfigSave()
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        config.launchAtLogin = enabled
        do {
            try loginItem.setEnabled(enabled)
            requestConfigSave()
        } catch {
            config.launchAtLogin = !enabled
            statusMessage = "Could not update Login Item settings."
        }
    }

    func setRefreshInterval(seconds: Int) {
        let value = max(0, seconds)
        let step = Self.refreshIntervalStepSeconds
        let rounded = value % step == 0 ? value : value + step - value % step
        let normalized = max(Self.minimumRefreshIntervalSeconds, rounded)
        let milliseconds = normalized * 1000
        guard config.refreshIntervalMs != milliseconds else { return }
        config.refreshIntervalMs = milliseconds
        requestConfigSave()
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
            // setting only its persistence, which the queued write reports.
            await loadActiveSessions()
            await loadTodayJournal()
            requestConfigSave()
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
            requestConfigSave()
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
        if keepAwakeHolding != shouldHold {
            keepAwake.apply(shouldHold)
            keepAwakeHolding = shouldHold
        }
        // Without the administrator grant the hold cannot be taken at all, so
        // the published state follows what the machine did, not what was asked.
        let shouldHoldLid = shouldHold && config.keepAwakeWithLidClosed
        if lidWakeHolding != shouldHoldLid {
            _ = lidWake.apply(shouldHoldLid)
            let holding = lidWake.isHolding
            if lidWakeHolding != holding {
                lidWakeHolding = holding
            }
        }
        syncKeepAwakeTimer()
    }

    func quit() {
        stop()
        NSApp.terminate(nil)
    }

    func stop() {
        shuttingDown = true
        configSaveTask?.cancel()
        configSaveTask = nil
        keepAwake.apply(false)
        keepAwakeHolding = false
        _ = lidWake.apply(false)
        lidWakeHolding = false
        runtimeTimer?.invalidate()
        heartbeatTimer?.invalidate()
        keepAwakeTimer?.invalidate()
        runtimeTimer = nil
        heartbeatTimer = nil
        keepAwakeTimer = nil
        eventsTask?.cancel()
        eventsTask = nil
        events.stop()
        process.stop()
        connected = false
    }

    private func loadSnapshot() {
        guard let snapshot = snapshotStore.load() else { return }
        if summary != snapshot {
            summary = snapshot
            notifier.observe(snapshot)
        }
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
            // A setting can be changed while the daemon is starting. Retry it
            // now that a runtime URL exists instead of letting the first config
            // poll replace the local choice with the daemon's old value.
            resumeConfigSave()
            runtimeTimer?.invalidate()
            startEventStream()
            startHeartbeat()
            // One daemon-managed refresh on startup replaces the disk snapshot;
            // everything after it arrives on the event stream. The config comes
            // with it so the display currency does not wait for a heartbeat.
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

    /// Listens for the summaries the daemon broadcasts as it computes them.
    ///
    /// Everything that used to justify a 15-second poll happens here instead,
    /// at the rate the underlying data actually changes.
    private func startEventStream() {
        guard let baseURL, !token.isEmpty else { return }
        eventsTask?.cancel()
        let stream = events.summaries(baseURL: baseURL, token: token)
        eventsTask = Task { @MainActor [weak self] in
            for await next in stream {
                guard let self else { return }
                self.apply(next)
                if self.statusMessage != nil {
                    self.statusMessage = nil
                }
                // A new summary means the day moved on, so the views that read
                // transcripts are worth re-reading — for whoever is looking.
                await self.loadActiveSessions()
                await self.loadTodayJournal()
            }
        }
    }

    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: Self.heartbeatSeconds, repeats: true) { [weak self] _ in
            Task { await self?.pollSummary() }
        }
        // Lets macOS fire this alongside a wake-up it was going to make anyway
        // rather than starting the CPU for it alone.
        timer.tolerance = Self.heartbeatTolerance
        heartbeatTimer = timer
    }

    /// Scheduled only while keep-awake is switched on and the daemon is
    /// reachable — the one case where the session list has to be read with the
    /// popover shut, since a session starting is what the hold waits for. With
    /// the setting off, nothing is scheduled at all.
    private func syncKeepAwakeTimer() {
        let needed = config.keepAwake && connected
        if !needed {
            keepAwakeTimer?.invalidate()
            keepAwakeTimer = nil
            return
        }
        guard keepAwakeTimer == nil else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: Self.keepAwakeSeconds, repeats: true) { [weak self] _ in
            Task { await self?.loadActiveSessions() }
        }
        timer.tolerance = Self.keepAwakeTolerance
        keepAwakeTimer = timer
    }

    private func pollSummary() async {
        guard let baseURL, !token.isEmpty else { return }
        async let summary = client.summary(baseURL: baseURL, token: token)
        async let config: Void = loadConfig()
        async let sessions: Void = loadActiveSessions()
        async let journal: Void = loadTodayJournal()
        do {
            let next = try await summary
            apply(next)
            _ = await (config, sessions, journal)
        } catch {
            _ = await (config, sessions, journal)
            if connected {
                connected = false
                // Nothing to read from while the daemon is gone; the stream's
                // own reconnect is what brings this back.
                syncKeepAwakeTimer()
            }
            let message = "Daemon unavailable; showing the last good snapshot."
            if statusMessage != message {
                statusMessage = message
            }
        }
    }

    private func loadConfig() async {
        guard let baseURL, !token.isEmpty else { return }
        guard let nextConfig = try? await client.config(baseURL: baseURL, token: token) else { return }
        let previous = config
        // A local write owns the in-memory config until the daemon acknowledges
        // that snapshot. Without this guard, a poll that started before a PUT
        // completed could put USD back over a freshly selected NPR value.
        let hasPendingWrite = configSaveRequested || configSaveTask != nil
        let adopted = hasPendingWrite ? config : adoptingKeepAwake(from: nextConfig)
        if config != adopted {
            config = adopted
        }
        healLaunchAtLogin()
        // Re-evaluated on every poll so an edit made straight to config.json
        // still takes effect.
        syncKeepAwake()
        // config.json is the shared source of truth for the display currency,
        // so a change made in one surface reaches the other on its next read.
        if !hasPendingWrite,
           previous.currency != nextConfig.currency || previous.currencyRate != nextConfig.currencyRate
        {
            onCurrencyChanged(nextConfig.currency, nextConfig.currencyRate)
        }
    }

    /// Coalesce preference changes and send them in order. A setting can be
    /// changed before the daemon has published its runtime URL, so the request
    /// remains pending until the next connection attempt.
    private func requestConfigSave() {
        configSaveRequested = true
        resumeConfigSave()
    }

    private func resumeConfigSave() {
        guard configSaveRequested else { return }
        guard configSaveTask == nil else { return }
        configSaveTask = Task { @MainActor [weak self] in
            await self?.drainConfigSaves()
        }
    }

    private func drainConfigSaves() async {
        defer { configSaveTask = nil }

        while configSaveRequested {
            guard let baseURL, !token.isEmpty else { return }
            configSaveRequested = false
            let requested = config
            do {
                let saved = try await client.update(config: requested, baseURL: baseURL, token: token)
                // Keep any newer local change made while the request was in
                // flight. The loop below sends that newer snapshot next.
                if config == requested {
                    let adopted = adoptingKeepAwake(from: saved)
                    if config != adopted {
                        config = adopted
                    }
                } else {
                    configSaveRequested = true
                }
            } catch {
                // Keep the dirty bit so a later connection or preference edit
                // retries the write instead of silently losing the selection.
                configSaveRequested = true
                statusMessage = "Could not save preferences."
                return
            }
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
        if summary != next {
            summary = next
            notifier.observe(next)
        }
        if !connected {
            connected = true
            syncKeepAwakeTimer()
        }
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
