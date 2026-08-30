import SwiftUI

@main
struct ObolApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        // The whole app is the status item and the panel it opens, which
        // AppKit owns — SwiftUI's own menu bar scene cannot draw the arrow.
        // A scene is still required, and Settings is the one that opens no
        // window in an accessory app.
        Settings {
            EmptyView()
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: DaemonController?
    private var updates: UpdateController?
    private var currency: CurrencyController?
    private var menuBar: MenuBarPanelController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = DaemonController()
        let updates = UpdateController()
        let currency = CurrencyController()

        self.controller = controller
        self.updates = updates
        self.currency = currency
        menuBar = MenuBarPanelController(controller: controller, updates: updates, currency: currency)
    }
}
