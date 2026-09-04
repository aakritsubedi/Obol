import Foundation

/// Keeps a Mac working with its lid shut, for as long as an agent is running.
///
/// Idle sleep is a per-process assertion any app may hold, which is all
/// `KeepAwakeController` needs. Clamshell sleep is not: the kernel sleeps the
/// machine on lid close unless `pmset disablesleep` says otherwise, and that
/// switch belongs to root. So turning this on asks for the administrator
/// password once and spends it installing a `/etc/sudoers.d` rule that lets
/// this account flip that one switch — and delete the rule again — with no
/// further prompt. Nothing else is granted: the rule names `pmset` by absolute
/// path with its arguments spelled out, and sudo matches both exactly.
///
/// That one-time grant is what makes the hold safe to take and give back on
/// every session, instead of leaving a machine that can never sleep.
enum LidWakeAuthorization {
    case granted
    /// The password prompt was dismissed. Nothing changed; nothing to say.
    case cancelled
    case failed
}

@MainActor
protocol LidWakeControlling: AnyObject {
    var isHolding: Bool { get }
    var isAuthorized: Bool { get }

    func apply(_ shouldHold: Bool) -> Bool
    func authorize() -> LidWakeAuthorization
    func revoke()
    func reset(settingEnabled: Bool)
}

@MainActor
final class LidWakeController: LidWakeControlling {
    typealias Authorization = LidWakeAuthorization

    /// Whether `disablesleep` is set right now, as opposed to merely wanted.
    private(set) var isHolding = false

    private static let rulePath = "/etc/sudoers.d/obol-lid-sleep"
    private static let pmset = "/usr/bin/pmset"
    private static let sudo = "/usr/bin/sudo"

    /// The grant is a file, so its presence is the whole answer — and a cheap
    /// one, which matters because the settings row asks on every render.
    var isAuthorized: Bool {
        FileManager.default.fileExists(atPath: Self.rulePath)
    }

    /// Idempotent, so the session poll can call it on every read. Returns
    /// whether the machine actually reached the requested state; without the
    /// grant it never does, and the caller shows the switch as not holding.
    @discardableResult
    func apply(_ shouldHold: Bool) -> Bool {
        guard shouldHold != isHolding else { return true }
        guard setDisableSleep(shouldHold) else { return false }
        isHolding = shouldHold
        return true
    }

    /// Asks for the administrator password — once — and installs the rule.
    /// Deliberately leaves `disablesleep` alone: whether to hold it right now
    /// is a question about running sessions, and `apply` answers it next.
    func authorize() -> LidWakeAuthorization {
        if isAuthorized {
            return .granted
        }
        guard let user = Self.sudoersUser() else { return .failed }

        // NSAppleScript blocks the caller while the prompt is up, and has to
        // run on the main thread. That is the trade for a dialog that names
        // Obol: shelling out to `osascript` instead would put a stranger's
        // name on the password box.
        let source = "do shell script \(Self.appleScriptLiteral(Self.installScript(user: user)))"
            + " with administrator privileges"
        guard let script = NSAppleScript(source: source) else { return .failed }
        var error: NSDictionary?
        script.executeAndReturnError(&error)
        if let error {
            let code = error[NSAppleScript.errorNumber] as? Int ?? 0
            return code == Self.userCancelled ? .cancelled : .failed
        }
        return isAuthorized ? .granted : .failed
    }

    /// Gives the grant back when the setting is switched off. Sleep is restored
    /// first: a rule removed while `disablesleep` is still set would leave the
    /// machine unable to sleep with no silent way left to fix it.
    func revoke() {
        setDisableSleep(false)
        isHolding = false
        guard isAuthorized else { return }
        run(Self.sudo, ["-n", "/bin/rm", "-f", Self.rulePath])
    }

    /// Called at launch. `disablesleep` outlives the process that set it — a
    /// reboot included — so a crash mid-hold could leave a Mac that never
    /// sleeps and nothing on screen explaining why. The grant survives the
    /// crash too, so clearing it costs no prompt.
    func reset(settingEnabled: Bool) {
        isHolding = false
        guard isAuthorized else { return }
        if settingEnabled {
            setDisableSleep(false)
        } else {
            revoke()
        }
    }

    @discardableResult
    private func setDisableSleep(_ on: Bool) -> Bool {
        run(Self.sudo, ["-n", Self.pmset, "-a", "disablesleep", on ? "1" : "0"]) == 0
    }

    /// A sudoers rule is one line of a file sudo parses as root, so the only
    /// part of it that varies is checked first. Real macOS short names are
    /// narrower than this, and anything outside it aborts rather than being
    /// quoted into a file this process cannot re-read.
    private static func sudoersUser() -> String? {
        let name = NSUserName()
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz")
            .union(CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"))
        guard !name.isEmpty, name.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
        return name
    }

    /// Written to a temporary file, checked by `visudo -c`, and only then moved
    /// into place: a malformed drop-in breaks `sudo` for the whole machine, and
    /// this app is in no position to ask for that to be repaired.
    private static func installScript(user: String) -> String {
        let rule = "\(user) ALL=(root) NOPASSWD: "
            + "\(pmset) -a disablesleep 0, \(pmset) -a disablesleep 1, /bin/rm -f \(rulePath)"
        return """
        set -e
        tmp=$(/usr/bin/mktemp /tmp/obol-lid-sleep.XXXXXX)
        trap '/bin/rm -f "$tmp"' EXIT
        /bin/echo '\(rule)' > "$tmp"
        /usr/sbin/visudo -cf "$tmp" >/dev/null
        /bin/cp -f "$tmp" \(rulePath)
        /usr/sbin/chown root:wheel \(rulePath)
        /bin/chmod 440 \(rulePath)
        """
    }

    /// `errAEWaitCanceled`'s sibling: what AppleScript reports when the user
    /// dismisses the authorization dialog rather than typing a password.
    private static let userCancelled = -128

    private static func appleScriptLiteral(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "\"\(escaped)\""
    }

    @discardableResult
    private func run(_ launchPath: String, _ arguments: [String]) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        // `sudo -n` fails loudly on a machine without the rule, and that is an
        // expected outcome here rather than something to print at the user.
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus
        } catch {
            return -1
        }
    }
}
