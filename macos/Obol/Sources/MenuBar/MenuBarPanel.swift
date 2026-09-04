import AppKit
import Combine
import SwiftUI

/// The status item and the panel it opens.
///
/// `MenuBarExtra(.window)` draws a plain rectangle wherever the status item
/// happens to sit and offers no way to point it at anything. Owning the status
/// item and the window instead buys the two things a menu bar popover needs:
/// the card centres itself under the item, and the arrow is cut out of the same
/// shape that fills the card, so it is the card's own colour rather than a
/// system material peeking out behind it.
@MainActor
final class MenuBarPanelController: NSObject {
    private let controller: DaemonController
    private let updates: UpdateController
    private let currency: CurrencyController

    private let statusItem: NSStatusItem
    private let panel: MenuBarPanel
    private let arrow = PanelArrow()
    private var labelHost: NSHostingView<MenuBarLabel>?
    private var escapeMonitor: Any?
    private var cancellables: Set<AnyCancellable> = []

    /// When the panel last closed. Clicking the status item while the panel is
    /// open resigns its key state — closing it — before the button's action
    /// runs, so without this the dismissing click would immediately reopen it.
    private var closedAt: Date?

    init(controller: DaemonController, updates: UpdateController, currency: CurrencyController) {
        self.controller = controller
        self.updates = updates
        self.currency = currency
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        panel = MenuBarPanel(
            contentRect: NSRect(x: 0, y: 0, width: WidgetStyle.popoverWidth, height: 1),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        super.init()
        configureStatusItem()
        configurePanel()
    }

    // MARK: - Status item

    private func configureStatusItem() {
        guard let button = statusItem.button else { return }
        button.target = self
        button.action = #selector(statusItemClicked)

        let host = NSHostingView(rootView: MenuBarLabel(controller: controller, currency: currency))
        // Report the size SwiftUI wants rather than the one the button hands
        // down, so the measurement below is the label's own width.
        host.sizingOptions = [.intrinsicContentSize]
        host.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(host)
        NSLayoutConstraint.activate([
            host.leadingAnchor.constraint(equalTo: button.leadingAnchor),
            host.trailingAnchor.constraint(equalTo: button.trailingAnchor),
            host.topAnchor.constraint(equalTo: button.topAnchor),
            host.bottomAnchor.constraint(equalTo: button.bottomAnchor),
        ])
        labelHost = host

        // A status item sizes itself from its length, not from what is inside
        // it, so the width the label needs has to be measured and pushed back
        // whenever the total or the currency changes. `objectWillChange` fires
        // before the value lands; the hop measures the label it will produce.
        controller.objectWillChange
            .merge(with: currency.objectWillChange)
            .sink { [weak self] _ in
                Task { @MainActor in self?.resizeStatusItem() }
            }
            .store(in: &cancellables)
        resizeStatusItem()
    }

    private func resizeStatusItem() {
        guard let labelHost else { return }
        statusItem.length = labelHost.intrinsicContentSize.width
    }

    // MARK: - Panel

    private func configurePanel() {
        let content = MenuBarPanelContent(
            arrow: arrow,
            onContentResize: { [weak self] in
                Task { @MainActor in self?.syncPanelSize() }
            }
        ) {
            PopoverView(controller: controller, updates: updates, currency: currency)
        }
        panel.contentViewController = NSHostingController(rootView: content)
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.animationBehavior = .none
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

        // Settings, the currency list and a session appearing all change the
        // card's height. The panel hangs from the menu bar, so every resize
        // has to re-anchor it rather than let it grow off the bottom.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(panelDidResize),
            name: NSWindow.didResizeNotification,
            object: panel
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(panelDidResignKey),
            name: NSWindow.didResignKeyNotification,
            object: panel
        )
    }

    @objc private func statusItemClicked() {
        if panel.isVisible {
            hide()
            return
        }
        if let closedAt, Date().timeIntervalSince(closedAt) < 0.2 {
            self.closedAt = nil
            return
        }
        show()
    }

    private func show() {
        syncPanelSize()

        controller.popoverOpened()
        updates.popoverOpened()
        currency.popoverOpened()

        panel.alphaValue = 0
        panel.makeKeyAndOrderFront(nil)
        // An accessory app has to activate for the currency search field to
        // take a keystroke; the panel gives focus back the moment it closes.
        NSApp.activate(ignoringOtherApps: true)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.12
            panel.animator().alphaValue = 1
        }

        escapeMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard event.keyCode == 53 else { return event }
            Task { @MainActor in self?.hide() }
            return nil
        }
    }

    private func hide() {
        guard panel.isVisible else { return }
        closedAt = Date()
        if let escapeMonitor {
            NSEvent.removeMonitor(escapeMonitor)
            self.escapeMonitor = nil
        }
        controller.popoverClosed()

        let panel = panel
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.1
            panel.animator().alphaValue = 0
        } completionHandler: {
            panel.orderOut(nil)
        }
    }

    @objc private func panelDidResignKey() {
        hide()
    }

    @objc private func panelDidResize() {
        guard panel.isVisible else { return }
        reposition()
        // The window is transparent, so its shadow is traced from the content's
        // alpha and has to be redrawn when the card changes height.
        panel.invalidateShadow()
    }

    /// Matches the window to the card SwiftUI just laid out and re-anchors it.
    private func syncPanelSize() {
        guard let content = panel.contentViewController?.view else { return }
        panel.setContentSize(content.fittingSize)
        reposition()
    }

    /// Centres the card under the status item, slides it back inside the screen
    /// if centring would push it over an edge, and keeps the arrow on the item
    /// when it does.
    private func reposition() {
        guard let button = statusItem.button, let buttonWindow = button.window else { return }
        let anchor = buttonWindow.convertToScreen(button.convert(button.bounds, to: nil))
        guard let screen = buttonWindow.screen ?? NSScreen.main else { return }

        let size = panel.frame.size
        let bounds = screen.visibleFrame
        let minX = bounds.minX + WidgetStyle.Chrome.screenInset
        let maxX = bounds.maxX - WidgetStyle.Chrome.screenInset - size.width
        let x = min(max(anchor.midX - size.width / 2, minX), max(minX, maxX))
        let y = anchor.minY - WidgetStyle.Chrome.menuBarGap - size.height
        panel.setFrameOrigin(NSPoint(x: x, y: y))

        // Never far enough to reach the rounded corner, where the arrow would
        // have nothing square to sit on.
        let limit = max(
            0,
            size.width / 2 - WidgetStyle.Chrome.cornerRadius - WidgetStyle.Chrome.arrowWidth / 2
        )
        arrow.offset = min(max(anchor.midX - (x + size.width / 2), -limit), limit)
    }
}

/// A borderless window refuses key status, which would leave the currency
/// search field unable to take a keystroke.
private final class MenuBarPanel: NSPanel {
    override var canBecomeKey: Bool {
        true
    }
}

/// Where the arrow points, in points from the card's horizontal centre. Held
/// separately so the shape redraws when a screen edge pushes the card off
/// centre without rebuilding the popover.
@MainActor
final class PanelArrow: ObservableObject {
    @Published var offset: CGFloat = 0
}

/// The status item's contents: the budget dot and today's total.
struct MenuBarLabel: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var currency: CurrencyController

    var body: some View {
        Text(currency.display(controller.summary.today.totalCost))
            .font(WidgetStyle.TypeScale.row)
            .monospacedDigit()
            // Padding is constant so the item keeps its width when the popover
            // opens; only the highlight behind it appears.
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background {
                if controller.isPopoverPresented {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(.primary.opacity(0.12))
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Today's spend")
            .accessibilityValue(currency.display(controller.summary.today.totalCost))
    }
}

/// The card the popover is drawn on: one shape for the arrow and the body, so
/// the two share an edge instead of meeting at one.
struct MenuBarPanelContent<Content: View>: View {
    @ObservedObject var arrow: PanelArrow
    let onContentResize: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        let card = PanelChromeShape(arrowOffset: arrow.offset)

        content
            .padding(.top, WidgetStyle.Chrome.arrowHeight)
            .background(card.fill(Color(nsColor: .windowBackgroundColor)))
            // A white card on a white window needs an edge of its own; the
            // shadow alone leaves the two touching.
            .overlay(card.strokeBorder(WidgetStyle.hairline, lineWidth: 1))
            .clipShape(card)
            // Opening Settings or the currency list changes the card's height.
            // The window is told the new one from here rather than left to
            // infer it, so it never clips what SwiftUI has already drawn.
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: PanelHeightKey.self, value: proxy.size.height)
                }
            )
            .onPreferenceChange(PanelHeightKey.self) { _ in onContentResize() }
    }
}

private struct PanelHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// A rounded card with an arrow rising out of its top edge, drawn as a single
/// outline so no seam shows where the two meet.
struct PanelChromeShape: InsettableShape {
    var arrowOffset: CGFloat
    var inset: CGFloat = 0

    func inset(by amount: CGFloat) -> PanelChromeShape {
        var shape = self
        shape.inset += amount
        return shape
    }

    func path(in rect: CGRect) -> Path {
        let rect = rect.insetBy(dx: inset, dy: inset)
        let arrowHeight = WidgetStyle.Chrome.arrowHeight
        let half = WidgetStyle.Chrome.arrowWidth / 2
        let radius = WidgetStyle.Chrome.cornerRadius
        let top = rect.minY + arrowHeight

        // Both ends of each flank are curved: the tip is blunted rather than
        // drawn as a needle, and the base flares into the top edge instead of
        // landing on it at a corner, which is what keeps the arrow reading as
        // part of the card rather than a triangle set on top of it.
        let length = max(1, sqrt(half * half + arrowHeight * arrowHeight))
        let unit = CGPoint(x: half / length, y: arrowHeight / length)
        let tip = WidgetStyle.Chrome.arrowTipRadius
        let join = WidgetStyle.Chrome.arrowJoinRadius
        let tipCut = CGPoint(x: unit.x * tip, y: unit.y * tip)
        let joinCut = CGPoint(x: unit.x * join, y: unit.y * join)

        // The flare is part of the arrow's footprint, so the corner it may not
        // reach is that much closer.
        let span = half + join
        let tipX = min(max(rect.midX + arrowOffset, rect.minX + radius + span),
                       rect.maxX - radius - span)

        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: top + radius))
        path.addArc(
            tangent1End: CGPoint(x: rect.minX, y: top),
            tangent2End: CGPoint(x: rect.minX + radius, y: top),
            radius: radius
        )
        path.addLine(to: CGPoint(x: tipX - span, y: top))
        path.addQuadCurve(
            to: CGPoint(x: tipX - half + joinCut.x, y: top - joinCut.y),
            control: CGPoint(x: tipX - half, y: top)
        )
        path.addLine(to: CGPoint(x: tipX - tipCut.x, y: rect.minY + tipCut.y))
        path.addQuadCurve(
            to: CGPoint(x: tipX + tipCut.x, y: rect.minY + tipCut.y),
            control: CGPoint(x: tipX, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: tipX + half - joinCut.x, y: top - joinCut.y))
        path.addQuadCurve(
            to: CGPoint(x: tipX + span, y: top),
            control: CGPoint(x: tipX + half, y: top)
        )
        path.addArc(
            tangent1End: CGPoint(x: rect.maxX, y: top),
            tangent2End: CGPoint(x: rect.maxX, y: top + radius),
            radius: radius
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(
            tangent1End: CGPoint(x: rect.maxX, y: rect.maxY),
            tangent2End: CGPoint(x: rect.maxX - radius, y: rect.maxY),
            radius: radius
        )
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addArc(
            tangent1End: CGPoint(x: rect.minX, y: rect.maxY),
            tangent2End: CGPoint(x: rect.minX, y: rect.maxY - radius),
            radius: radius
        )
        path.closeSubpath()
        return path
    }
}
