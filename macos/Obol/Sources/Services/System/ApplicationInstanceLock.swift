import Darwin
import Foundation

/// Keeps multiple copies of the app from creating multiple status items.
///
/// macOS normally reuses an already-running application, but login services
/// and two different copies of the same bundle can bypass that behavior. A
/// kernel-owned advisory lock closes that gap, and is released automatically
/// if the process exits unexpectedly.
final class ApplicationInstanceLock {
    private let fileDescriptor: Int32

    init?() {
        let fileManager = FileManager.default
        guard let applicationSupport = fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first
        else {
            return nil
        }

        let directory = applicationSupport.appendingPathComponent("Obol", isDirectory: true)
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            return nil
        }

        let lockURL = directory.appendingPathComponent("instance.lock")
        let descriptor = lockURL.path.withCString { path in
            Darwin.open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        }
        guard descriptor >= 0 else { return nil }

        guard Self.setLock(.exclusive, on: descriptor) else {
            Darwin.close(descriptor)
            return nil
        }

        fileDescriptor = descriptor
    }

    deinit {
        _ = Self.setLock(.unlocked, on: fileDescriptor)
        Darwin.close(fileDescriptor)
    }

    private enum LockType {
        case exclusive
        case unlocked

        var value: Int16 {
            switch self {
            case .exclusive: return Int16(F_WRLCK)
            case .unlocked: return Int16(F_UNLCK)
            }
        }
    }

    private static func setLock(_ type: LockType, on descriptor: Int32) -> Bool {
        var lock = Darwin.flock()
        lock.l_type = type.value
        lock.l_whence = Int16(SEEK_SET)
        lock.l_start = 0
        lock.l_len = 0
        lock.l_pid = 0
        return Darwin.fcntl(descriptor, F_SETLK, &lock) == 0
    }
}
