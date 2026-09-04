import Foundation

public enum RefreshSchedule {
    public static func lastRefreshSlot(onOrBefore date: Date, calendar: Calendar = .current) -> Date {
        slots(on: date, calendar: calendar).last(where: { $0 <= date }) ?? calendar.startOfDay(for: date)
    }

    public static func nextRefreshSlot(after date: Date, calendar: Calendar = .current) -> Date {
        let next = slots(on: date, calendar: calendar).first(where: { $0 > date })
        if let next {
            return next
        }
        guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date)) else {
            return date.addingTimeInterval(86400)
        }
        return slots(on: tomorrow, calendar: calendar).first ?? tomorrow
    }

    private static func slots(on date: Date, calendar: Calendar) -> [Date] {
        [9, 15, 21].compactMap { calendar.date(bySettingHour: $0, minute: 0, second: 0, of: date) }
    }
}
