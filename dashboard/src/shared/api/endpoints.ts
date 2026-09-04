import { request } from "./client";
import type { DayJournal, Report, Summary, WidgetConfig } from "./types";

export const getSummary = () => request<Summary>("/api/summary");
export const getReport = () => request<Report>("/api/report");
export const getConfig = () => request<WidgetConfig>("/api/config");
export const getJournal = (date?: string) =>
  request<DayJournal>(`/api/journal${date ? `?date=${encodeURIComponent(date)}` : ""}`);
export const refresh = () => request<Summary>("/api/refresh", { method: "POST" });
export const updateConfig = (patch: Partial<WidgetConfig>) =>
  request<WidgetConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
