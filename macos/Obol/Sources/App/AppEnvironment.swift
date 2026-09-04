import Foundation

/// The native composition root. Controllers are built once, wired together in
/// `AppDelegate`, and handed to the menu-bar surface as one environment.
@MainActor
struct AppEnvironment {
    let daemon: DaemonController
    let updates: UpdateController
    let currency: CurrencyController
    let menuBar: MenuBarPanelController

    init(daemon: DaemonController, updates: UpdateController, currency: CurrencyController) {
        self.daemon = daemon
        self.updates = updates
        self.currency = currency
        menuBar = MenuBarPanelController(controller: daemon, updates: updates, currency: currency)
    }
}
