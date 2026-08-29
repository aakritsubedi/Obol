import Foundation

/// Holds a power-management assertion for as long as Keep awake is on, so a
/// long agent run is not cut short by the Mac idling into sleep.
///
/// `beginActivity` is the Foundation wrapper over an `IOPMAssertion`: the
/// kernel owns the assertion and drops it when the process goes away, so a
/// crash can never leave a machine pinned awake with nothing left to switch it
/// back. Only *idle* system sleep is held off — closing the lid, choosing Sleep
/// from the Apple menu, and a critically low battery all still sleep the Mac.
/// The display is deliberately left alone; it can dim and switch off on its own
/// schedule while the work underneath keeps running.
final class KeepAwakeController {
    private var token: NSObjectProtocol?

    var isActive: Bool {
        token != nil
    }

    /// Idempotent, so the config poll can call it on every read without
    /// stacking assertions or churning one that is already in the right state.
    func apply(_ enabled: Bool) {
        if enabled {
            begin()
        } else {
            end()
        }
    }

    private func begin() {
        guard token == nil else { return }
        token = ProcessInfo.processInfo.beginActivity(
            options: [.idleSystemSleepDisabled, .userInitiated],
            reason: "Obol: keeping the Mac awake for a running agent"
        )
    }

    private func end() {
        guard let token else { return }
        ProcessInfo.processInfo.endActivity(token)
        self.token = nil
    }

    deinit {
        end()
    }
}
