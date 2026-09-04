import { weekOptions } from "@features/journal/model/journal";
import { type DayJournal, getJournal } from "@shared/api";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useJournal() {
  const journalOptions = useMemo(() => weekOptions(new Date()), []);
  const todayJournalDate = journalOptions[journalOptions.length - 1]?.value || "";
  const [journalDate, setJournalDate] = useState(() => todayJournalDate);
  const [journal, setJournal] = useState<DayJournal | null>(null);
  const [journalLoading, setJournalLoading] = useState(true);
  const [todayJournal, setTodayJournal] = useState<DayJournal | null>(null);

  const load = useCallback(
    async (date: string): Promise<void> => {
      if (!date) return;
      setJournalLoading(true);
      try {
        const next = await getJournal(date);
        setJournal(next);
        if (date === todayJournalDate) setTodayJournal(next);
      } catch {
        setJournal(null);
      } finally {
        setJournalLoading(false);
      }
    },
    [todayJournalDate],
  );

  useEffect(() => {
    void load(journalDate);
  }, [journalDate, load]);

  return {
    journal,
    todayJournal,
    journalOptions,
    journalDate,
    todayJournalDate,
    journalLoading,
    setJournalDate,
    reload: () => load(journalDate),
  };
}
