import SwiftUI

/// Quiet placeholder surfaces shared by the journal and session list.
struct SkeletonBar: View {
    var width: CGFloat?
    var height: CGFloat = 10

    var body: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(Color.primary.opacity(0.09))
            .frame(width: width, height: height)
            .accessibilityHidden(true)
    }
}

struct SkeletonPulse: ViewModifier {
    let active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        TimelineView(.animation(minimumInterval: 1 / 20, paused: reduceMotion || !active)) { context in
            let phase = context.date.timeIntervalSinceReferenceDate * .pi / 1.6
            content.opacity(reduceMotion || !active ? 1 : 0.8 + 0.2 * cos(phase))
        }
    }
}
