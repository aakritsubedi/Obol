// Foundation-only updater core. Keep this file free of SwiftUI, AppKit, and Bundle.main
// so it can be compiled and tested by the ObolUpdateCore SwiftPM target.
import Foundation

public struct UpdateDefaults {
    public let store: UserDefaults

    public init(store: UserDefaults = .standard) {
        self.store = store
    }

    public var lastCheckedAt: Date? {
        get { store.object(forKey: Keys.lastCheckedAt) as? Date }
        set { store.set(newValue, forKey: Keys.lastCheckedAt) }
    }

    public var skippedVersion: String? {
        get { store.string(forKey: Keys.skippedVersion) }
        set { store.set(newValue, forKey: Keys.skippedVersion) }
    }

    public var feedETag: String? {
        get { store.string(forKey: Keys.feedETag) }
        set { store.set(newValue, forKey: Keys.feedETag) }
    }

    public var cachedRelease: Data? {
        get { store.data(forKey: Keys.cachedRelease) }
        set { store.set(newValue, forKey: Keys.cachedRelease) }
    }

    public var rateLimitedUntil: Date? {
        get { store.object(forKey: Keys.rateLimitedUntil) as? Date }
        set { store.set(newValue, forKey: Keys.rateLimitedUntil) }
    }

    public var automaticChecks: Bool {
        get {
            guard store.object(forKey: Keys.automaticChecks) != nil else { return true }
            return store.bool(forKey: Keys.automaticChecks)
        }
        set { store.set(newValue, forKey: Keys.automaticChecks) }
    }

    private enum Keys {
        static let prefix = "com.aakritsubedi.obol.update."
        static let lastCheckedAt = "\(prefix)lastCheckedAt"
        static let skippedVersion = "\(prefix)skippedVersion"
        static let feedETag = "\(prefix)feedETag"
        static let cachedRelease = "\(prefix)cachedRelease"
        static let rateLimitedUntil = "\(prefix)rateLimitedUntil"
        static let automaticChecks = "\(prefix)automaticChecks"
    }
}
