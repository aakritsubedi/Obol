// SwiftPM generates the Bundle.module accessor when it compiles these tests
// (swift test). Xcode compiles this target directly, so provide the equivalent
// pointing at the test bundle, where the Fixtures folder reference lands.
#if !SWIFT_PACKAGE
import Foundation

extension Bundle {
    static let module = Bundle(for: ModuleMarker.self)
}

private final class ModuleMarker {}
#endif
