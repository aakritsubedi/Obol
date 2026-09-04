import SwiftUI

struct UsageFooter: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    let onOpenSettings: () -> Void

    var body: some View {
        HStack {
            IconButton(systemName: "gearshape", help: "Settings", badge: updates.hasPendingUpdate) {
                onOpenSettings()
            }
            Spacer()
            IconButton(systemName: "power", help: "Quit Obol") {
                controller.quit()
            }
        }
    }
}
