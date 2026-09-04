import AppKit
import SwiftUI

struct PopoverView: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    @ObservedObject var currency: CurrencyController

    @State private var showingSettings = false
    @State private var currencyPickerOpen = false
    @State private var currencyQuery = ""
    @FocusState private var currencySearchFocused: Bool

    var body: some View {
        Group {
            if showingSettings {
                settingsPanel
            } else {
                usagePanel
            }
        }
        .padding(.horizontal, WidgetStyle.inset)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(width: WidgetStyle.popoverWidth)
        // The card itself is painted by the panel's chrome, which draws the
        // arrow out of the same shape.
        //
        // The panel is ordered out rather than torn down, so `onDisappear`
        // never runs; the controller's own record of being open is what says
        // to put the view back to usage for the next opening.
        .onChange(of: controller.isPopoverPresented) { presented in
            guard !presented else { return }
            showingSettings = false
            closeCurrencyPicker()
        }
    }

    // MARK: - Usage

    private var usagePanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            usageHeader

            providerBreakdown
                .padding(.top, 26)

            hairline
                .padding(.top, 18)

            todayShapeSection
                .padding(.top, 14)

            if todayShape.activeMinutes > 0 {
                hairline
                    .padding(.top, 14)
            }

            activeSessionsSection
                .padding(.top, 14)

            if let statusMessage = controller.statusMessage {
                Text(statusMessage)
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
            }

            hairline
                .padding(.top, 17)

            usageFooter
                .padding(.top, 10)
        }
    }

    private var usageHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("Today")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)

                Spacer(minLength: 8)

                statusLabel

                iconButton(systemName: "arrow.triangle.2.circlepath", help: "Refresh usage") {
                    Task { await controller.refresh() }
                }
                iconButton(
                    systemName: "arrow.up.forward.square",
                    help: controller.connected ? "Open dashboard" : "Dashboard starts with the daemon"
                ) {
                    controller.openDashboard()
                }
                .disabled(!controller.connected)
                .opacity(controller.connected ? 1 : 0.35)
                .animation(.easeOut(duration: 0.15), value: controller.connected)
            }

            totalAmount
        }
    }

    /// Symbol and value are separate runs so the locale-aware currency
    /// formatter never gets a chance to render `US$`; they are styled
    /// identically so the total still reads as one number.
    private var totalAmount: some View {
        let value = currency.amount(controller.summary.today.totalCost)
        let tracking = WidgetStyle.TypeScale.heroTracking

        return HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(currency.symbol)
                .tracking(tracking)
            Text(value)
                .monospacedDigit()
                .tracking(tracking)
        }
        .font(WidgetStyle.TypeScale.hero)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        // Roll the digits when a refresh lands rather than snapping to the
        // new total; the bar below eases with the same curve.
        .contentTransition(.numericText())
        .animation(.easeOut(duration: 0.35), value: value)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Spent today")
        .accessibilityValue("\(value) \(currency.active.name)")
    }

    private var statusLabel: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(controller.liveStatusColor)
                .frame(width: 6, height: 6)
                .modifier(PulsingDot(active: !controller.summary.stale))
            Text(controller.liveLabel)
                .font(WidgetStyle.TypeScale.status)
        }
        .foregroundStyle(controller.liveStatusColor)
        .padding(.trailing, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(controller.liveLabel)
    }

    private var providerBreakdown: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("By provider")
                .font(WidgetStyle.TypeScale.sectionLabel)
                .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                .foregroundStyle(.secondary)

            if controller.summary.agents.isEmpty {
                Text("No provider activity today.")
                    .font(WidgetStyle.TypeScale.row)
                    .foregroundStyle(.secondary)
            } else {
                providerBar
                    .padding(.bottom, 2)
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(controller.summary.agents) { provider in
                        HStack(spacing: 10) {
                            ProviderBadge(agent: provider.agent, size: 20)
                            Text(ProviderCatalog.name(for: provider.agent))
                            Spacer(minLength: 8)
                            // Tokens are secondary context beside the money:
                            // smaller, muted, and pinned to a fixed-width
                            // column so the price stays the aligned anchor.
                            Text(UsageClient.compactTokens(provider.totalTokens))
                                .monospacedDigit()
                                .font(WidgetStyle.TypeScale.caption)
                                .foregroundStyle(.secondary)
                                .frame(minWidth: 36, alignment: .trailing)
                            Text(currency.display(provider.totalCost))
                                .monospacedDigit()
                        }
                        .font(WidgetStyle.TypeScale.row)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(
                            "\(ProviderCatalog.name(for: provider.agent)) "
                                + "\(UsageClient.compactTokens(provider.totalTokens)) tokens, "
                                + "\(currency.amount(provider.totalCost)) \(currency.active.name)"
                        )
                    }
                }
            }
        }
    }

    /// The work happening right now, under its own rule: everything above is the
    /// day's accumulated total, and these are the sessions still being written
    /// to. A session counts as running while its last transcript write falls
    /// inside the daemon's idle window.
    private var activeSessionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Text("Active now")
                    .font(WidgetStyle.TypeScale.sectionLabel)
                    .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                    .foregroundStyle(.secondary)

                if !controller.activeSessions.isEmpty {
                    Text("\(controller.activeSessions.count)")
                        .font(.system(size: 10, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(
                            Capsule(style: .continuous)
                                .fill(Color.primary.opacity(0.08))
                        )
                        .accessibilityLabel("\(controller.activeSessions.count) active sessions")
                }

                Spacer(minLength: 0)
            }

            if controller.activeSessions.isEmpty {
                Text("No agent is running right now.")
                    .font(WidgetStyle.TypeScale.row)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.vertical) {
                    LazyVStack(alignment: .leading, spacing: 9) {
                        ForEach(controller.activeSessions) { session in
                            activeSessionRow(session)
                        }
                    }
                }
                .frame(maxHeight: WidgetStyle.activeSessionsMaxHeight)
                .clipped()
                .accessibilityLabel("Active sessions")
            }
        }
        .animation(.easeOut(duration: 0.2), value: controller.activeSessions.map(\.id))
    }

    /// A compact copy of the dashboard's Today’s shape strip. The journal is
    /// fetched after the active-session list so this remains useful even when
    /// there is no session running right now.
    private var todayShapeSection: some View {
        let shape = todayShape
        return Group {
            if shape.activeMinutes > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Today’s shape")
                            .font(WidgetStyle.TypeScale.sectionLabel)
                            .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        Text("\(Self.duration(shape.activeMinutes)) active")
                            .font(WidgetStyle.TypeScale.footnote)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 3) {
                        ForEach(0 ..< 24, id: \.self) { hour in
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(Self.shapeColor(level: shape.levels[hour]))
                                .frame(maxWidth: .infinity, minHeight: 18, maxHeight: 18)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Self.shapeLabel(shape))

                    HStack(spacing: 3) {
                        ForEach(0 ..< 24, id: \.self) { hour in
                            Text([0, 6, 12, 18].contains(hour) ? Self.hourLabel(hour) : "")
                                .font(.system(size: 9))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity)
                        }
                    }

                    Text("Started \(Self.clock(shape.startedAt))" +
                        (shape.peakHour.map { " · busiest \(Self.hourLabel($0))" } ?? ""))
                        .font(WidgetStyle.TypeScale.footnote)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var todayShape: ShapeData {
        guard let journal = controller.todayJournal else { return ShapeData() }
        var minutes = Array(repeating: 0.0, count: 24)
        let calendar = Calendar.current
        guard let first = Self.parseDate(journal.firstEventAt),
              let midnight = calendar.date(from: calendar.dateComponents([.year, .month, .day], from: first)) else {
            return ShapeData()
        }
        let bounds = (0 ... 24).map { calendar.date(byAdding: .hour, value: $0, to: midnight)! }
        for session in journal.sessions {
            guard let start = Self.parseDate(session.startedAt) else { continue }
            let end = Self.parseDate(session.endedAt) ?? start
            let spans = (0 ..< 24).map { hour in
                max(0, min(end.timeIntervalSince1970, bounds[hour + 1].timeIntervalSince1970) - max(start.timeIntervalSince1970, bounds[hour].timeIntervalSince1970))
            }
            let covered = spans.reduce(0, +)
            if covered > 0 {
                for hour in 0 ..< 24 { minutes[hour] += session.activeMinutes * spans[hour] / covered }
            }
        }
        let peak = minutes.enumerated().max(by: { $0.element < $1.element })
        let levels: [Int] = minutes.map { Self.shapeLevel($0) }
        let peakHour: Int? = peak?.offset
        return ShapeData(
            activeMinutes: journal.activeMinutes,
            levels: levels,
            startedAt: journal.firstEventAt,
            peakHour: peakHour
        )
    }

    private struct ShapeData {
        var activeMinutes: Double = 0
        var levels: [Int] = Array(repeating: 0, count: 24)
        var startedAt: String? = nil
        var peakHour: Int? = nil
    }

    private static func shapeLevel(_ minutes: Double) -> Int { minutes < 1 ? 0 : minutes <= 15 ? 1 : minutes <= 30 ? 2 : minutes <= 45 ? 3 : 4 }
    private static func shapeColor(level: Int) -> Color { Color.primary.opacity([0.07, 0.16, 0.3, 0.52, 0.75][min(4, max(0, level))]) }
    private static func duration(_ minutes: Double) -> String { "\(Int(minutes) / 60)h \(Int(minutes) % 60)m" }
    private static func hourLabel(_ hour: Int) -> String { hour == 0 ? "12" : hour > 12 ? "\(hour - 12)" : "\(hour)" }
    private static func clock(_ iso: String?) -> String {
        guard let date = parseDate(iso) else { return "—" }
        return date.formatted(.dateTime.hour().minute())
    }
    private static func parseDate(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: iso) ?? {
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: iso)
        }()
    }
    private static func shapeLabel(_ shape: ShapeData) -> String {
        "Work started at \(clock(shape.startedAt)), \(duration(shape.activeMinutes)) active today"
            + (shape.peakHour.map { ", busiest around \(hourLabel($0))" } ?? "")
    }

    /// The project leads — it is what the row is about — with the agent and the
    /// branch demoted to matching glyph-and-label tags beneath it. Tokens sit
    /// above the price in a trailing column rather than beside it: at this width
    /// a long converted amount and a token count competed for the same inches
    /// and left the project barely a word wide.
    private func activeSessionRow(_ session: ActiveSession) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "folder")
                .font(.system(size: 14))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.secondary)
                .frame(width: 20, height: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.project)
                    .lineLimit(1)
                    .truncationMode(.tail)

                HStack(spacing: 8) {
                    HStack(spacing: 3) {
                        ProviderBadge(agent: session.provider, size: 11)
                        Text(ProviderCatalog.name(for: session.provider))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    // The agent names itself in full; the branch gives up its
                    // middle first, since both ends carry the meaning.
                    .layoutPriority(1)

                    if let branch = session.gitBranch, !branch.isEmpty {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.triangle.branch")
                                .font(.system(size: 9))
                            Text(branch)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                }
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            // Nothing is drawn for a figure the session never reported, so the
            // column simply ends where the data does.
            VStack(alignment: .trailing, spacing: 2) {
                if let tokens = Self.sessionTokens(session) {
                    Text(tokens)
                        .monospacedDigit()
                        .font(WidgetStyle.TypeScale.footnote)
                        .foregroundStyle(.secondary)
                }

                if let cost = sessionCost(session) {
                    Text(cost)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
        .font(WidgetStyle.TypeScale.row)
        .help(session.totalCost == nil ? "" : "Estimated share of this project's spend today")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(for: session))
    }

    /// Nil when the transcript reported no usage — Codex records none at all.
    private static func sessionTokens(_ session: ActiveSession) -> String? {
        session.outputTokens.map(UsageClient.compactTokens)
    }

    /// Nil for a session with no per-project spend to draw on; only Claude's
    /// join to one. The figure is apportioned from the project's daily total
    /// rather than measured, so it carries a `≈` instead of presenting as an
    /// exact charge.
    private func sessionCost(_ session: ActiveSession) -> String? {
        session.totalCost.map { "≈\(currency.display($0))" }
    }

    private func accessibilityLabel(for session: ActiveSession) -> String {
        var parts = [ProviderCatalog.name(for: session.provider), session.project]
        if let branch = session.gitBranch, !branch.isEmpty {
            parts.append("branch \(branch)")
        }
        // A figure the session never reported is left unsaid here too, so the
        // spoken row matches the drawn one.
        if let tokens = session.outputTokens {
            parts.append("\(UsageClient.compactTokens(tokens)) output tokens")
        }
        if let cost = session.totalCost {
            parts.append("about \(currency.amount(cost)) \(currency.active.name)")
        }
        return parts.joined(separator: ", ")
    }

    private var providerBar: some View {
        GeometryReader { geometry in
            let providers = controller.summary.agents.filter { $0.totalCost > 0 }
            let total = providers.reduce(0) { $0 + $1.totalCost }
            let weights = providers.map(\.totalCost)

            HStack(spacing: 0) {
                if total > 0 {
                    ForEach(providers) { provider in
                        Rectangle()
                            .fill(ProviderCatalog.color(for: provider.agent))
                            .frame(width: max(2, geometry.size.width * provider.totalCost / total))
                    }
                } else {
                    Rectangle()
                        .fill(WidgetStyle.hairline)
                        .frame(maxWidth: .infinity)
                }
            }
            .clipShape(Capsule())
            .animation(.easeOut(duration: 0.35), value: weights)
        }
        .frame(height: 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Provider cost split")
    }

    private var usageFooter: some View {
        HStack {
            iconButton(systemName: "gearshape", help: "Settings", badge: updates.hasPendingUpdate) {
                showingSettings = true
            }
            Spacer()
            iconButton(systemName: "power", help: "Quit Obol") {
                controller.quit()
            }
        }
    }

    // MARK: - Settings

    private var settingsPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text("Settings")
                    .font(WidgetStyle.TypeScale.title)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                iconButton(systemName: "xmark", help: "Back to usage") {
                    showingSettings = false
                    closeCurrencyPicker()
                }
            }

            hairline
                .padding(.top, 14)

            currencyRow

            hairline

            // Label and control are separate views rather than a plain Toggle:
            // a Toggle sizes to its content, which parks the switch against the
            // label instead of at the trailing edge the Version row sets.
            HStack(spacing: 8) {
                Text("Launch at login")
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.launchAtLogin },
                    set: { controller.setLaunchAtLogin($0) }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .accessibilityLabel("Launch at login")
            }
            .font(WidgetStyle.TypeScale.row)
            .padding(.vertical, 14)

            hairline

            keepAwakeRow

            hairline

            lidWakeRow

            if controller.notificationsDenied {
                hairline

                HStack(spacing: 8) {
                    Text("Budget alerts are disabled in System Settings.")
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Button("Open") { Self.openNotificationSettings() }
                        .buttonStyle(.link)
                }
                .font(WidgetStyle.TypeScale.caption)
                .foregroundStyle(.secondary)
                .padding(.vertical, 14)
                .accessibilityElement(children: .combine)
            }

            hairline

            updateRow

            hairline

            HStack(spacing: 8) {
                Text("Version")
                Spacer(minLength: 8)
                Text(Self.appVersion)
                    .monospacedDigit()
            }
            .font(WidgetStyle.TypeScale.caption)
            .foregroundStyle(.secondary)
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Version")
            .accessibilityValue(Self.appVersion)
        }
        .onAppear { currency.settingsOpened() }
    }

    /// Holds off idle sleep so an agent left running overnight is still working
    /// in the morning. The caption names the two limits up front — the lid, and
    /// the display — so nobody closes the laptop expecting the run to survive.
    private var keepAwakeRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Keep awake")
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.keepAwakeEnabled },
                    set: { controller.setKeepAwake($0) }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .accessibilityLabel("Keep awake")
            }

            Text(keepAwakeCaption)
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .animation(.easeInOut(duration: 0.15), value: controller.keepAwakeEnabled)
        .animation(.easeInOut(duration: 0.15), value: controller.keepAwakeHolding)
    }

    /// The second half of Keep awake: holding idle sleep off does nothing for a
    /// closed lid, which sleeps the Mac regardless. Off on its own until Keep
    /// awake is on, because on its own it has nothing to extend.
    private var lidWakeRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Keep going with the lid closed")
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.lidWakeEnabled },
                    set: { controller.setKeepAwakeWithLidClosed($0) }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .accessibilityLabel("Keep going with the lid closed")
            }

            Text(lidWakeCaption)
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .disabled(!controller.keepAwakeEnabled)
        .opacity(controller.keepAwakeEnabled ? 1 : 0.5)
        .animation(.easeInOut(duration: 0.15), value: controller.keepAwakeEnabled)
        .animation(.easeInOut(duration: 0.15), value: controller.lidWakeEnabled)
        .animation(.easeInOut(duration: 0.15), value: controller.lidWakeHolding)
    }

    /// The password is the part worth saying before the switch is touched; once
    /// it has been given, the caption goes back to reporting what is happening.
    private var lidWakeCaption: String {
        guard controller.keepAwakeEnabled else {
            return "Turn on Keep awake first."
        }
        guard controller.lidWakeEnabled else {
            return "Will ask for the administrator password once."
        }
        return controller.lidWakeHolding
            ? "Sleep is off, so closing the lid leaves the run going."
            : "Nothing is running, so closing the lid sleeps as usual."
    }

    /// Which of the two states an enabled switch is actually in. "On" no longer
    /// means "holding", and the difference is invisible without saying so.
    private var keepAwakeCaption: String {
        guard controller.keepAwakeEnabled else {
            return "Your Mac sleeps on its usual schedule."
        }
        let count = controller.activeSessions.count
        guard count > 0 else {
            return "Nothing is running, so your Mac sleeps as usual."
        }
        return count == 1
            ? "Holding sleep off while 1 session runs."
            : "Holding sleep off while \(count) sessions run."
    }

    /// Everything the daemon reports is priced in USD; picking a currency here
    /// converts at display time only, so budgets and alerts keep their units.
    /// Spacing is per-gap rather than one VStack value: the receipt sits tight
    /// under the row it annotates, while the picker — a bordered box, not a line
    /// of text — still needs room to read as a separate surface.
    private var currencyRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("Currency")
                Spacer(minLength: 8)
                currencyTrigger
            }

            if currencyPickerOpen {
                currencyPicker
                    .padding(.top, 8)
            }

            HStack(spacing: 10) {
                Text(currencyCaption)
                    .fixedSize(horizontal: false, vertical: true)
                currencyRetry
            }
            .font(WidgetStyle.TypeScale.footnote)
            .foregroundStyle(.secondary)
            .padding(.top, 3)
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .animation(.easeInOut(duration: 0.15), value: currency.rateState)
    }

    /// The trigger shows the code alone: the row it sits in is 340pt wide, and
    /// the names belong in the list it opens.
    private var currencyTrigger: some View {
        Button {
            if currencyPickerOpen {
                closeCurrencyPicker()
            } else {
                currencyPickerOpen = true
            }
        } label: {
            HStack(spacing: 5) {
                Text(currency.selected.code)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.primary.opacity(0.06))
            )
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Display currency")
        .accessibilityValue(currency.selected.name)
    }

    /// The list keeps a fixed height and scrolls inside it. The directory runs
    /// to 165 entries, and a list that grew with the result count would resize
    /// the whole popover on every keystroke.
    private var currencyPicker: some View {
        VStack(spacing: 0) {
            currencySearchField
            hairline
            currencyList
        }
        .background(Color.primary.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(WidgetStyle.hairline)
        )
    }

    private var currencySearchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            TextField("Search currencies", text: $currencyQuery)
                .textFieldStyle(.plain)
                .focused($currencySearchFocused)
                .onAppear { currencySearchFocused = true }
            if !currencyQuery.isEmpty {
                Button {
                    currencyQuery = ""
                    currencySearchFocused = true
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
    }

    private var currencyList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if currencyResults.isEmpty {
                        Text(currencyEmptyMessage)
                            .font(WidgetStyle.TypeScale.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 10)
                    } else {
                        ForEach(currencyResults) { option in
                            CurrencyRow(option: option, selected: option.code == currency.selected.code) {
                                currency.select(option)
                                closeCurrencyPicker()
                            }
                            .id(option.code)
                        }
                    }
                }
                .padding(4)
            }
            .frame(height: 186)
            // Open onto the current pick rather than the top of the alphabet.
            .onAppear { proxy.scrollTo(currency.selected.code, anchor: .center) }
        }
    }

    /// The directory carries USD along with everything else. Until it loads,
    /// USD and the current pick are the only entries there are to offer.
    private var currencyResults: [CurrencyOption] {
        let directory = currency.options.isEmpty ? currencyFallback : currency.options
        return directory.filter { currency.matches($0, query: currencyQuery) }
    }

    private var currencyFallback: [CurrencyOption] {
        guard currency.selected.code != CurrencyOption.usd.code else { return [.usd] }
        return [.usd, currency.selected].sorted { $0.code < $1.code }
    }

    private var currencyEmptyMessage: String {
        if currency.options.isEmpty, case .loading = currency.optionsState {
            return "Loading the currency list…"
        }
        return "No currency matches “\(currencyQuery.trimmingCharacters(in: .whitespaces))”."
    }

    private func closeCurrencyPicker() {
        currencyPickerOpen = false
        currencyQuery = ""
        currencySearchFocused = false
    }

    private var currencyCaption: String {
        switch currency.rateState {
        case .loading:
            return "Fetching today's exchange rate…"
        case let .failed(message):
            return message
        case .idle:
            break
        }
        guard currency.options.isEmpty else {
            return currency.rateSummary ?? currency.selected.name
        }
        switch currency.optionsState {
        case .loading: return "Loading the currency list…"
        case let .failed(message): return message
        case .idle: return currency.rateSummary ?? currency.selected.name
        }
    }

    @ViewBuilder
    private var currencyRetry: some View {
        if case .failed = currency.rateState {
            Button("Retry") { currency.retryRate() }
                .buttonStyle(.link)
        } else if case .failed = currency.optionsState {
            Button("Retry") { currency.retryOptions() }
                .buttonStyle(.link)
        }
    }

    private var updateRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text("Updates")
                Spacer(minLength: 8)
                updateControl
            }

            switch updates.state {
            case .available:
                HStack(spacing: 10) {
                    Button("What's new") { updates.openReleaseNotes() }
                    Button("Skip this version") { updates.skipCurrentVersion() }
                }
                .buttonStyle(.link)
                .font(WidgetStyle.TypeScale.caption)
            case let .failed(message):
                Text(message)
                    .font(WidgetStyle.TypeScale.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            default:
                EmptyView()
            }
        }
        .font(WidgetStyle.TypeScale.row)
        .padding(.vertical, 14)
        .animation(.easeInOut(duration: 0.15), value: updates.state)
    }

    @ViewBuilder
    private var updateControl: some View {
        switch updates.state {
        case .idle:
            Button("Check") { updates.manualCheck() }
                .buttonStyle(.link)
                .frame(height: 20)
        case .checking:
            ProgressView()
                .controlSize(.small)
                .frame(width: 20, height: 20)
        case let .upToDate(checkedAt):
            Text("Up to date")
                .foregroundStyle(.secondary)
                .frame(height: 20)
                .help(updates.checkedAtHelp(checkedAt))
        case let .available(entry):
            Button("Update to \(entry.version?.description ?? entry.tagName)") { updates.beginUpdate() }
                .buttonStyle(.link)
                .foregroundStyle(Color.accentColor)
                .frame(height: 20)
        case let .downloading(progress):
            HStack(spacing: 7) {
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                    .frame(width: 110)
                Text("\(Int(progress * 100))%")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .frame(height: 20)
        case .readyToInstall:
            Button("Install and Relaunch") { updates.installReadyUpdate() }
                .buttonStyle(.link)
                .frame(height: 20)
        case .installing:
            ProgressView()
                .controlSize(.small)
                .frame(width: 20, height: 20)
        case .failed:
            Button("Retry") { updates.manualCheck() }
                .buttonStyle(.link)
                .frame(height: 20)
        }
    }

    /// Read from the bundle rather than a constant, so the number in Settings
    /// can never drift from the one the packaging script stamps on the build.
    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "—"
        guard let build = info?["CFBundleVersion"] as? String, build != short else { return short }
        return "\(short) (\(build))"
    }

    private static func openNotificationSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.notifications") else { return }
        NSWorkspace.shared.open(url)
    }

    // MARK: - Building blocks

    private var hairline: some View {
        Rectangle()
            .fill(WidgetStyle.hairline)
            .frame(height: 1)
    }

    private func iconButton(
        systemName: String,
        help: String,
        badge: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        IconButton(systemName: systemName, help: help, badge: badge, action: action)
    }
}

/// One line of the currency list. The code sits in a fixed column so the names
/// beside it start on a common left edge, the way the provider rows align.
private struct CurrencyRow: View {
    let option: CurrencyOption
    let selected: Bool
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(option.code)
                    .monospacedDigit()
                    .frame(width: 34, alignment: .leading)
                Text(option.name)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 6)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                }
            }
            .font(WidgetStyle.TypeScale.row)
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(Color.primary.opacity(hovering ? 0.07 : 0))
            )
            .contentShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option.code), \(option.name)")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// Toolbar-style glyph button. Hierarchical rendering softens the symbol;
/// hovering lifts it to primary color over a faint rounded fill so the
/// hit target is discoverable without adding chrome at rest.
private struct IconButton: View {
    let systemName: String
    let help: String
    var badge = false
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(WidgetStyle.TypeScale.icon)
                .symbolRenderingMode(.hierarchical)
                .frame(width: 24, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.primary.opacity(hovering ? 0.07 : 0))
                )
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 5, height: 5)
                            .offset(x: 1, y: -1)
                    }
                }
                .foregroundStyle(hovering ? Color.primary : Color.secondary)
                .animation(.easeOut(duration: 0.12), value: hovering)
                .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(help)
        .accessibilityLabel(badge ? "\(help), update available" : help)
    }
}

/// Breathing opacity for the live indicator; stays static when the popover
/// is only showing cached data.
private struct PulsingDot: ViewModifier {
    let active: Bool
    @State private var pulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(pulsing ? 0.45 : 1)
            .onAppear {
                guard active else { return }
                start()
            }
            .onChange(of: active) { isLive in
                if isLive {
                    start()
                } else {
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) { pulsing = false }
                }
            }
    }

    private func start() {
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            pulsing = true
        }
    }
}
