import AppKit
import Foundation

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var environment: AppEnvironment?

    func applicationDidFinishLaunching(_: Notification) {
        let daemon = DaemonController { [weak self] code, rate in
            self?.environment?.currency.adopt(code: code, rate: rate)
        }

        let updates = UpdateController { [weak self] in
            self?.environment?.daemon.stop()
        }

        let currency = CurrencyController { [weak self] code, rate in
            self?.environment?.daemon.setCurrency(code, rate: rate)
        }
        environment = AppEnvironment(daemon: daemon, updates: updates, currency: currency)
    }
}
