import ObolCore
import SwiftUI

struct TodayShapeSection: View {
    let journal: TodayJournal?
    var isLoading = false
    var isUnavailable = false
    var isPresented = true

    static func activeMinutes(in journal: TodayJournal?) -> Double {
        journal.map { DayShape.from($0).activeMinutes } ?? 0
    }

    var body: some View {
        let shape = journal.map { DayShape.from($0) } ?? DayShape()
        return Group {
            if isLoading {
                skeleton
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Today’s shape")
                            .font(WidgetStyle.TypeScale.sectionLabel)
                            .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        Text(journal == nil ? "" : "\(DayShape.duration(shape.activeMinutes)) active")
                            .font(WidgetStyle.TypeScale.footnote)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 3) {
                        ForEach(0 ..< 24, id: \.self) { hour in
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(Self.shapeColor(level: shape.levels[hour]))
                                .frame(maxWidth: .infinity, minHeight: 22, maxHeight: 22)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(DayShape.accessibilityLabel(shape))

                    HStack(spacing: 3) {
                        ForEach(0 ..< 24, id: \.self) { hour in
                            Text([0, 6, 12, 18].contains(hour) ? DayShape.hourLabel(hour) : "")
                                .font(.system(size: 9))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity)
                        }
                    }

                    Text(isUnavailable || journal == nil ? "Today’s activity is unavailable." :
                        shape.activeMinutes > 0 ? "Started \(DayShape.clock(shape.startedAt))" +
                        (shape.peakHour.map { " · busiest \(DayShape.hourLabel($0))" } ?? "") :
                        "No activity recorded today.")
                        .font(WidgetStyle.TypeScale.footnote)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Today’s shape")
                    .font(WidgetStyle.TypeScale.sectionLabel)
                    .tracking(WidgetStyle.TypeScale.sectionLabelTracking)
                    .foregroundStyle(.secondary)
                Spacer()
                SkeletonBar(width: 64)
            }
            HStack(spacing: 3) {
                ForEach(0 ..< 24, id: \.self) { _ in
                    SkeletonBar(height: 22)
                }
            }
            HStack {
                ForEach(0 ..< 4, id: \.self) { _ in
                    SkeletonBar(width: 12, height: 9)
                    Spacer(minLength: 0)
                }
            }
            SkeletonBar(width: 155, height: 12)
        }
        .modifier(SkeletonPulse(active: isPresented))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading today’s activity")
    }

    private static func shapeColor(level: Int) -> Color {
        Color.primary.opacity([0.07, 0.16, 0.3, 0.52, 0.75][min(
            4,
            max(0, level)
        )])
    }
}
