import SwiftUI

/// The popover composition root. Each screen owns its own layout and local
/// interaction state; this view only decides which screen is visible.
struct PopoverView: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var updates: UpdateController
    @ObservedObject var currency: CurrencyController

    @State private var showingSettings = false

    var body: some View {
        Group {
            if showingSettings {
                SettingsPanel(controller: controller, updates: updates, currency: currency) {
                    showingSettings = false
                }
            } else {
                UsagePanel(controller: controller, updates: updates, currency: currency) {
                    showingSettings = true
                }
            }
        }
        .padding(.horizontal, WidgetStyle.inset)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(width: WidgetStyle.popoverWidth)
        // The card itself is painted by the panel's chrome, which draws the
        // arrow out of the same shape.
        //
        // The panel is ordered out rather than torn down, so `onDisappear`
        // never runs; the controller's own record of being open is what says
        // to put the view back to usage for the next opening.
        .onChange(of: controller.isPopoverPresented) { presented in
            guard !presented else { return }
            showingSettings = false
        }
    }
}
