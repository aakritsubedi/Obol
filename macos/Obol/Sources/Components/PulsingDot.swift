import SwiftUI

/// Breathing opacity for the live indicator; stays static when the popover is
/// only showing cached data.
struct PulsingDot: ViewModifier {
    let active: Bool
    @State private var pulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(pulsing ? 0.45 : 1)
            .onAppear {
                guard active else { return }
                start()
            }
            .onChange(of: active) { isLive in
                if isLive {
                    start()
                } else {
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) { pulsing = false }
                }
            }
    }

    private func start() {
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            pulsing = true
        }
    }
}
