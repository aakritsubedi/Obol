import Foundation

protocol DaemonProcessControlling: AnyObject {
    var isRunning: Bool { get }
    var processIdentifier: Int32 { get }

    func start(
        nodeURL: URL,
        scriptURL: URL,
        parentPID: Int32,
        logURL: URL,
        onExit: @escaping (Int32) -> Void
    ) throws
    func stop()
}

/// Owns the Node child process and its diagnostic log. The controller only
/// coordinates lifecycle and reacts to the exit callback.
final class DaemonProcessService: DaemonProcessControlling {
    private var process: Process?

    var isRunning: Bool {
        process?.isRunning == true
    }

    var processIdentifier: Int32 {
        process?.processIdentifier ?? 0
    }

    func start(
        nodeURL: URL,
        scriptURL: URL,
        parentPID: Int32,
        logURL: URL,
        onExit: @escaping (Int32) -> Void
    ) throws {
        let process = Process()
        process.executableURL = nodeURL
        process.arguments = [scriptURL.path, "--parent-pid", String(parentPID)]

        try? FileManager.default.createDirectory(
            at: logURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if let log = FileHandle(forWritingAtPath: logURL.path) {
            try? log.seekToEnd()
            process.standardOutput = log
            process.standardError = log
        }
        process.terminationHandler = { process in
            onExit(process.terminationStatus)
        }
        try process.run()
        self.process = process
    }

    func stop() {
        if let process, process.isRunning {
            process.terminate()
        }
        process = nil
    }
}
