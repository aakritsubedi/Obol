export interface JournalSession {
  id: string;
  provider: string;
  title: string | null;
  project: string;
  projectPath: string;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string;
  activeMinutes: number;
  humanPrompts: number;
  assistantTurns: number;
  toolCalls: number;
  filesEdited: string[];
  models: string[];
  prompts: string[];
  toolMix: Record<string, number>;
  outputTokens: number | null;
  totalCost: number | null;
}

export interface ActiveSession {
  id: string;
  provider: string;
  project: string;
  gitBranch: string | null;
  startedAt: string;
  lastEventAt: string;
  activeMinutes: number;
  outputTokens: number | null;
  totalCost: number | null;
}

export interface JournalProject {
  name: string;
  path: string;
  activeMinutes: number;
  sessions: number;
  filesEdited: number;
  toolCalls: number;
  providers: string[];
  totalCost: number | null;
}

export interface DayJournal {
  date: string;
  timezone: string;
  idleMinutes: number;
  activeMinutes: number;
  blocks: number;
  spanMinutes: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  humanPrompts: number;
  assistantTurns: number;
  toolCalls: number;
  toolMix: Record<string, number>;
  filesEdited: number;
  testRuns: number;
  providers: string[];
  sessions: JournalSession[];
  projects: JournalProject[];
  totalCost: number;
  totalTokens: number;
  computedAt: string;
}
