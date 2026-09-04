import ObolCore
import SwiftUI

struct ActiveSessionsSection: View {
    @ObservedObject var controller: DaemonController
    @ObservedObject var currency: CurrencyController

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Text("Active now")
                    .font(WidgetStyle.TypeScale.sectionLabel)
                    .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                    .foregroundStyle(.secondary)

                if !controller.activeSessions.isEmpty {
                    Text("\(controller.activeSessions.count)")
                        .font(.system(size: 10, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(
                            Capsule(style: .continuous)
                                .fill(Color.primary.opacity(0.08))
                        )
                        .accessibilityLabel("\(controller.activeSessions.count) active sessions")
                }

                Spacer(minLength: 0)
            }

            if controller.activeSessions.isEmpty {
                Text("No agent is running right now.")
                    .font(WidgetStyle.TypeScale.row)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.vertical) {
                    LazyVStack(alignment: .leading, spacing: 9) {
                        ForEach(controller.activeSessions) { session in
                            activeSessionRow(session)
                        }
                    }
                }
                .frame(maxHeight: WidgetStyle.activeSessionsMaxHeight)
                .clipped()
                .accessibilityLabel("Active sessions")
            }
        }
        .animation(.easeOut(duration: 0.2), value: controller.activeSessions.map(\.id))
    }

    /// The project leads — it is what the row is about — with the agent and the
    /// branch demoted to matching glyph-and-label tags beneath it. Tokens sit
    /// above the price in a trailing column rather than beside it: at this width
    /// a long converted amount and a token count competed for the same inches
    /// and left the project barely a word wide.
    private func activeSessionRow(_ session: ActiveSession) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "folder")
                .font(.system(size: 14))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.secondary)
                .frame(width: 20, height: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.project)
                    .lineLimit(1)
                    .truncationMode(.tail)

                HStack(spacing: 8) {
                    HStack(spacing: 3) {
                        ProviderBadge(agent: session.provider, size: 11)
                        Text(ProviderPresentation.name(for: session.provider))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    // The agent names itself in full; the branch gives up its
                    // middle first, since both ends carry the meaning.
                    .layoutPriority(1)

                    if let branch = session.gitBranch, !branch.isEmpty {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.triangle.branch")
                                .font(.system(size: 9))
                            Text(branch)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                }
                .font(WidgetStyle.TypeScale.footnote)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            // Nothing is drawn for a figure the session never reported, so the
            // column simply ends where the data does.
            VStack(alignment: .trailing, spacing: 2) {
                if let tokens = Self.sessionTokens(session) {
                    Text(tokens)
                        .monospacedDigit()
                        .font(WidgetStyle.TypeScale.footnote)
                        .foregroundStyle(.secondary)
                }

                if let cost = sessionCost(session) {
                    Text(cost)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
        .font(WidgetStyle.TypeScale.row)
        .help(session.totalCost == nil ? "" : "Estimated share of this project's spend today")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(for: session))
    }

    /// Nil when the transcript reported no usage — Codex records none at all.
    private static func sessionTokens(_ session: ActiveSession) -> String? {
        session.outputTokens.map(UsageClient.compactTokens)
    }

    /// Nil for a session with no per-project spend to draw on; only Claude's
    /// join to one. The figure is apportioned from the project's daily total
    /// rather than measured, so it carries a `≈` instead of presenting as an
    /// exact charge.
    private func sessionCost(_ session: ActiveSession) -> String? {
        session.totalCost.map { "≈\(currency.display($0))" }
    }

    private func accessibilityLabel(for session: ActiveSession) -> String {
        var parts = [ProviderPresentation.name(for: session.provider), session.project]
        if let branch = session.gitBranch, !branch.isEmpty {
            parts.append("branch \(branch)")
        }
        // A figure the session never reported is left unsaid here too, so the
        // spoken row matches the drawn one.
        if let tokens = session.outputTokens {
            parts.append("\(UsageClient.compactTokens(tokens)) output tokens")
        }
        if let cost = session.totalCost {
            parts.append("about \(currency.amount(cost)) \(currency.active.name)")
        }
        return parts.joined(separator: ", ")
    }
}
