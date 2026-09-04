// Foundation-only updater core. Keep this file free of SwiftUI, AppKit, and Bundle.main
// so it can be compiled and tested by the ObolUpdateCore SwiftPM target.
import Foundation

public struct SemanticVersion: Comparable, Equatable, Hashable, Sendable, CustomStringConvertible {
    public let major: Int
    public let minor: Int
    public let patch: Int
    public let prerelease: [String]

    public var isPrerelease: Bool {
        !prerelease.isEmpty
    }

    public var description: String {
        let core = "\(major).\(minor).\(patch)"
        return prerelease.isEmpty ? core : "\(core)-\(prerelease.joined(separator: "."))"
    }

    public init?(parsing rawValue: String) {
        guard !rawValue.isEmpty else { return nil }
        var value = rawValue
        if value.first == "v" {
            value.removeFirst()
        }
        guard !value.isEmpty else { return nil }

        let buildParts = value.split(separator: "+", maxSplits: 1, omittingEmptySubsequences: false)
        guard buildParts.count <= 2 else { return nil }
        if buildParts.count == 2, !Self.isValidBuild(String(buildParts[1])) {
            return nil
        }
        let coreAndPrerelease = String(buildParts[0])
        let hyphenIndex = coreAndPrerelease.firstIndex(of: "-")
        let core = hyphenIndex.map { String(coreAndPrerelease[..<$0]) } ?? coreAndPrerelease
        let prerelease = hyphenIndex.map {
            String(coreAndPrerelease[coreAndPrerelease.index(after: $0)...]).split(
                separator: ".",
                omittingEmptySubsequences: false
            ).map(String.init)
        } ?? []
        guard core.split(separator: ".", omittingEmptySubsequences: false).count == 3 else { return nil }
        let numbers = core.split(separator: ".", omittingEmptySubsequences: false)
        guard let major = Self.parseNumericIdentifier(String(numbers[0])),
              let minor = Self.parseNumericIdentifier(String(numbers[1])),
              let patch = Self.parseNumericIdentifier(String(numbers[2])),
              prerelease.allSatisfy(Self.isValidPrereleaseIdentifier)
        else {
            return nil
        }
        self.major = major
        self.minor = minor
        self.patch = patch
        self.prerelease = prerelease
    }

    public static func parse(_ rawValue: String) -> SemanticVersion? {
        SemanticVersion(parsing: rawValue)
    }

    public static func < (lhs: SemanticVersion, rhs: SemanticVersion) -> Bool {
        let coreComparison = [lhs.major, lhs.minor, lhs.patch].lexicographicallyPrecedes([
            rhs.major,
            rhs.minor,
            rhs.patch,
        ])
        if lhs.major != rhs.major || lhs.minor != rhs.minor || lhs.patch != rhs.patch {
            return coreComparison
        }
        if lhs.prerelease.isEmpty != rhs.prerelease.isEmpty {
            return !lhs.prerelease.isEmpty
        }
        for (left, right) in zip(lhs.prerelease, rhs.prerelease) {
            if left == right {
                continue
            }
            let leftNumber = Int(left)
            let rightNumber = Int(right)
            switch (leftNumber, rightNumber) {
            case let (left?, right?):
                return left < right
            case (_?, nil):
                return true
            case (nil, _?):
                return false
            case (nil, nil):
                return left < right
            }
        }
        return lhs.prerelease.count < rhs.prerelease.count
    }

    private static func parseNumericIdentifier(_ value: String) -> Int? {
        guard !value.isEmpty, value == "0" || !value.hasPrefix("0"),
              value.allSatisfy(\.isNumber) else { return nil }
        return Int(value)
    }

    private static func isValidPrereleaseIdentifier(_ value: String) -> Bool {
        guard !value.isEmpty else { return false }
        guard value.allSatisfy({ $0.isNumber || $0.isLetter || $0 == "-" }) else { return false }
        return !value.allSatisfy(\.isNumber) || value == "0" || !value.hasPrefix("0")
    }

    private static func isValidBuild(_ value: String) -> Bool {
        guard !value.isEmpty else { return false }
        return value.split(separator: ".", omittingEmptySubsequences: false).allSatisfy {
            !$0.isEmpty && $0.allSatisfy { $0.isNumber || $0.isLetter || $0 == "-" }
        }
    }
}

public enum UpdateDecision: Equatable, Sendable {
    case upToDate
    case update(to: SemanticVersion)
    case skipped(SemanticVersion)
    case unreadable(String)
}

public func evaluateUpdate(
    current: String,
    candidateTag: String,
    skippedVersion: String?,
    allowPrerelease: Bool
) -> UpdateDecision {
    guard let currentVersion = SemanticVersion(parsing: current) else {
        return .unreadable("The installed version is unreadable")
    }
    guard let candidate = SemanticVersion(parsing: candidateTag) else {
        return .unreadable("The release version is unreadable")
    }
    guard allowPrerelease || !candidate.isPrerelease else { return .upToDate }
    guard candidate > currentVersion else { return .upToDate }
    if let skippedVersion, let skipped = SemanticVersion(parsing: skippedVersion), skipped == candidate {
        return .skipped(candidate)
    }
    return .update(to: candidate)
}
