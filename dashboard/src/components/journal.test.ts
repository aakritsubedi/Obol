import { describe, expect, it } from "vitest";
import type { DayJournal, JournalSession } from "../api";
import {
  clipboardSummary,
  dayShape,
  efficiency,
  formatClock,
  formatHourLabel,
  groupTasks,
  narrative,
  noteStamp,
  noteTitle,
  relativeFile,
  sessionLabel,
  sessionRange,
  toolShares,
  weekOptions,
  workTags,
} from "./journal";

function journal(overrides: Partial<DayJournal> = {}): DayJournal {
  return {
    date: "2026-08-25",
    timezone: "UTC",
    idleMinutes: 15,
    activeMinutes: 120,
    blocks: 3,
    spanMinutes: 300,
    firstEventAt: "2026-08-25T03:00:00.000Z",
    lastEventAt: "2026-08-25T08:00:00.000Z",
    humanPrompts: 4,
    assistantTurns: 40,
    toolCalls: 200,
    toolMix: {},
    filesEdited: 10,
    testRuns: 2,
    sessions: [],
    projects: [],
    totalCost: 20,
    totalTokens: 1_000,
    computedAt: "2026-08-25T08:05:00.000Z",
    ...overrides,
  };
}

function session(overrides: Partial<JournalSession> = {}): JournalSession {
  return {
    id: "abcdef12-3456",
    provider: "claude",
    title: null,
    project: "demo",
    projectPath: "/Users/dev/demo",
    gitBranch: "main",
    startedAt: "2026-08-25T03:00:00.000Z",
    endedAt: "2026-08-25T04:30:00.000Z",
    activeMinutes: 60,
    humanPrompts: 2,
    assistantTurns: 20,
    toolCalls: 100,
    filesEdited: [],
    models: [],
    prompts: [],
    toolMix: {},
    totalCost: null,
    ...overrides,
  };
}

describe("efficiency", () => {
  it("derives cost and autonomy ratios", () => {
    const result = efficiency(journal());
    expect(result.costPerFile).toBe(2);
    expect(result.costPerActiveHour).toBe(10);
    expect(result.toolCallsPerPrompt).toBe(50);
  });

  it("returns null instead of zero when a denominator is missing", () => {
    const result = efficiency(journal({ filesEdited: 0, activeMinutes: 0, humanPrompts: 0 }));
    expect(result.costPerFile).toBeNull();
    expect(result.costPerActiveHour).toBeNull();
    expect(result.toolCallsPerPrompt).toBeNull();
  });
});

describe("formatClock", () => {
  it("renders a time for a valid instant", () => {
    expect(formatClock("2026-08-25T03:00:00.000Z", "en-US")).toMatch(/\d/);
  });

  it("falls back to an em dash for null and unparseable input", () => {
    expect(formatClock(null)).toBe("—");
    expect(formatClock("not-a-date")).toBe("—");
  });
});

describe("sessionRange and sessionLabel", () => {
  it("joins the start and end of a session", () => {
    expect(sessionRange(session(), "en-US")).toContain("–");
  });

  it("prefers the ai-title and falls back to a short session id", () => {
    expect(sessionLabel(session({ title: "Semester notes CORS error" }))).toBe("Semester notes CORS error");
    expect(sessionLabel(session({ title: "   " }))).toBe("Session abcdef12");
  });
});

describe("noteTitle and noteStamp", () => {
  it("titles the note with the weekday", () => {
    expect(noteTitle(journal(), "en-US")).toBe("Tuesday");
  });

  it("stamps the note with the day and the last recorded event", () => {
    const stamp = noteStamp(journal(), "en-US");
    expect(stamp).toContain("August 25, 2026");
    expect(stamp).toContain(" at ");
  });

  it("drops the time when the day recorded no events", () => {
    expect(noteStamp(journal({ lastEventAt: null }), "en-US")).toBe("August 25, 2026");
  });

  it("falls back to the raw date when it cannot be parsed", () => {
    expect(noteTitle(journal({ date: "not-a-date" }))).toBe("not-a-date");
  });
});

describe("narrative", () => {
  it("says so plainly when the day is empty", () => {
    expect(narrative(journal({ sessions: [] }))).toEqual(["Nothing was recorded on this day."]);
  });

  it("opens with active time, tasks, sittings and the day's window", () => {
    const lines = narrative(
      journal({ sessions: [session()], blocks: 1, activeMinutes: 90, spanMinutes: 200 }),
      "en-US",
    );
    expect(lines[0]).toContain("1h 30m of hands-on work");
    expect(lines[0]).toContain("1 task");
    expect(lines[0]).toContain("1 sitting");
    expect(lines[0]).toContain(" to ");
  });

  it("omits paragraphs that would only report zeroes", () => {
    const lines = narrative(
      journal({ sessions: [session()], filesEdited: 0, toolCalls: 0, testRuns: 0 }),
      "en-US",
    );
    expect(lines).toHaveLength(1);
  });

  it("reports output volume without mentioning cost", () => {
    const lines = narrative(journal({ sessions: [session()] }), "en-US").join(" ");
    expect(lines).toContain("10 files, 200 tool calls, 2 test runs");
    expect(lines).not.toContain("$");
  });
});

// An older daemon answering a newer dashboard omits fields the UI expects.
// These used to throw out of render and blank the entire page.
describe("tolerating an older daemon's payload", () => {
  it("treats a missing tool mix as no tools rather than throwing", () => {
    expect(() => toolShares(undefined)).not.toThrow();
    expect(toolShares(undefined)).toEqual([]);
    expect(toolShares(null)).toEqual([]);
  });

  it("ignores non-numeric counts in a tool mix", () => {
    expect(toolShares({ Bash: 3, Edit: undefined } as unknown as Record<string, number>)).toEqual([
      { name: "Bash", count: 3, share: 1 },
    ]);
  });

  it("summarises a journal whose sessions array is missing", () => {
    const stale = { ...journal(), sessions: undefined } as unknown as DayJournal;
    expect(() => narrative(stale)).not.toThrow();
    expect(narrative(stale)).toEqual(["Nothing was recorded on this day."]);
  });
});

describe("relativeFile", () => {
  it("strips the project path from a file inside the project", () => {
    expect(relativeFile("/Users/d/proj/src/api.ts", "/Users/d/proj")).toBe("src/api.ts");
  });

  it("falls back to the last two segments outside the project", () => {
    expect(relativeFile("/Users/d/other/lib/util.ts", "/Users/d/proj")).toBe("lib/util.ts");
  });

  it("does not treat a sibling directory as a prefix match", () => {
    expect(relativeFile("/Users/d/proj-two/src/api.ts", "/Users/d/proj")).toBe("src/api.ts");
  });

  it("copes with a missing project path", () => {
    expect(relativeFile("/a/b/c.ts")).toBe("b/c.ts");
  });
});

describe("workTags", () => {
  it("classifies files into the kinds of work they represent", () => {
    const tags = workTags(
      session({
        filesEdited: [
          "/p/src/Card.tsx",
          "/p/src/api.ts",
          "/p/src/api.test.ts",
          "/p/src/index.css",
          "/p/tsconfig.json",
          "/p/README.md",
        ],
      }),
    );
    expect(tags).toEqual(["UI", "logic", "tests", "styles", "config", "docs"]);
  });

  it("reads a test file as tests rather than logic", () => {
    expect(workTags(session({ filesEdited: ["/p/src/api.test.ts"] }))).toEqual(["tests"]);
    expect(workTags(session({ filesEdited: ["/p/__tests__/thing.ts"] }))).toEqual(["tests"]);
  });

  it("returns a stable order regardless of the order files were touched", () => {
    const forward = workTags(session({ filesEdited: ["/p/a.md", "/p/b.tsx"] }));
    const reverse = workTags(session({ filesEdited: ["/p/b.tsx", "/p/a.md"] }));
    expect(forward).toEqual(reverse);
    expect(forward).toEqual(["UI", "docs"]);
  });

  it("ignores files it cannot classify and a missing list", () => {
    expect(workTags(session({ filesEdited: ["/p/Makefile", "/p/image.png"] }))).toEqual([]);
    expect(workTags({ ...session(), filesEdited: undefined } as unknown as JournalSession)).toEqual([]);
  });
});

describe("clipboardSummary", () => {
  const day = journal({
    sessions: [
      session({ id: "aaaa1111-1", title: "Fix the CORS bug", activeMinutes: 90 }),
      session({
        id: "bbbb2222-2",
        title: null,
        project: "voicepal",
        projectPath: "/Users/dev/voicepal",
        filesEdited: ["/Users/dev/voicepal/src/api.ts"],
        activeMinutes: 20,
      }),
    ],
  });

  it("groups tasks under their project, in the order work started", () => {
    const text = clipboardSummary(day, "en-US");
    expect(text).toContain("Tuesday, August 25, 2026");
    expect(text.indexOf("demo")).toBeLessThan(text.indexOf("• Fix the CORS bug"));
    expect(text.indexOf("demo")).toBeLessThan(text.indexOf("voicepal"));
    expect(text).toContain("• Session bbbb2222");
  });

  it("opens with the card's summary sentence", () => {
    expect(clipboardSummary(day, "en-US")).toContain("2h of hands-on work across 2 tasks in 3 sittings");
  });

  it("never copies file details or cost", () => {
    const text = clipboardSummary(day, "en-US");
    expect(text).not.toContain("/Users/dev/voicepal/src/api.ts");
    expect(text).not.toContain("$");
  });

  it("says so when nothing was recorded", () => {
    expect(clipboardSummary(journal(), "en-US")).toContain("Nothing was recorded.");
  });
});

describe("groupTasks", () => {
  it("merges a handoff where one session picks up as another ends", () => {
    // A real morning: a named Codex session ends at 7:59 and a fresh rollout
    // continues the same install in the same checkout until 8:18.
    const day = journal({
      sessions: [
        session({
          id: "codex:abc",
          provider: "codex",
          title: "Read chatcut.io/chatgpt to install the ChatCut plugin",
          project: "rea",
          projectPath: "/Users/dev/rea",
          startedAt: "2026-08-25T07:55:00.000Z",
          endedAt: "2026-08-25T07:59:00.000Z",
          activeMinutes: 4,
          toolCalls: 25,
          toolMix: { Bash: 24, Wait: 1 },
          prompts: ["Read chatcut.io/chatgpt to install the ChatCut plugin"],
        }),
        session({
          id: "codex:rollout-1",
          provider: "codex",
          project: "rea",
          projectPath: "/Users/dev/rea",
          startedAt: "2026-08-25T07:59:00.000Z",
          endedAt: "2026-08-25T08:18:00.000Z",
          activeMinutes: 19,
          toolCalls: 50,
          toolMix: { Bash: 47, Wait: 3 },
        }),
      ],
    });
    const tasks = groupTasks(day);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      // The named session titles the task; the untitled successor does not
      // rename it.
      title: "Read chatcut.io/chatgpt to install the ChatCut plugin",
      project: "rea",
      startedAt: "2026-08-25T07:55:00.000Z",
      endedAt: "2026-08-25T08:18:00.000Z",
      activeMinutes: 23,
      toolCalls: 75,
      toolMix: { Bash: 71, Wait: 4 },
      providers: ["codex"],
      sessionCount: 2,
    });
  });

  it("keeps a handoff apart when the next session is a different project", () => {
    // Switching checkouts is new work, however fast it followed. Merged, the
    // task would label the second session's prompts with the first's project.
    const day = journal({
      sessions: [
        session({
          id: "claude:abc",
          title: "Generated samples review",
          project: "dossier-poc",
          projectPath: "/Users/dev/dossier-poc",
          startedAt: "2026-08-25T07:33:00.000Z",
          endedAt: "2026-08-25T07:40:00.000Z",
          prompts: ["Continue."],
        }),
        session({
          id: "claude:def",
          title: "Chart polish",
          project: "obol",
          projectPath: "/Users/dev/obol",
          startedAt: "2026-08-25T07:41:00.000Z",
          endedAt: "2026-08-25T07:53:00.000Z",
          prompts: ["In dashboard; the avg value we show looks so off"],
        }),
      ],
    });
    const tasks = groupTasks(day);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.project)).toEqual(["dossier-poc", "obol"]);
    expect(tasks.map((task) => task.prompts)).toEqual([
      ["Continue."],
      ["In dashboard; the avg value we show looks so off"],
    ]);
    expect(tasks.map((task) => task.sessionCount)).toEqual([1, 1]);
  });

  it("still merges a handoff when a session records no project at all", () => {
    // An unrecorded project is unknown, not a second project.
    const tasks = groupTasks(
      journal({
        sessions: [
          session({
            id: "a",
            startedAt: "2026-08-25T03:00:00.000Z",
            endedAt: "2026-08-25T03:30:00.000Z",
          }),
          session({
            id: "b",
            project: "",
            projectPath: "",
            startedAt: "2026-08-25T03:31:00.000Z",
            endedAt: "2026-08-25T03:50:00.000Z",
          }),
        ],
      }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].sessionCount).toBe(2);
  });

  it("keeps sessions apart when the gap exceeds the idle threshold", () => {
    const tasks = groupTasks(
      journal({
        sessions: [
          session({ id: "a", startedAt: "2026-08-25T03:00:00.000Z", endedAt: "2026-08-25T03:30:00.000Z" }),
          session({
            id: "b",
            startedAt: "2026-08-25T04:00:00.000Z",
            endedAt: "2026-08-25T04:30:00.000Z",
          }),
        ],
      }),
    );
    expect(tasks).toHaveLength(2);
  });

  it("keeps overlapping sessions on different projects apart", () => {
    const tasks = groupTasks(
      journal({
        sessions: [
          session({ id: "a", provider: "claude" }),
          session({
            id: "b",
            provider: "opencode",
            project: "voicepal",
            projectPath: "/Users/dev/voicepal",
          }),
        ],
      }),
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.providers[0])).toEqual(["claude", "opencode"]);
  });

  it("merges overlapping sessions on the same project", () => {
    const tasks = groupTasks(
      journal({
        sessions: [
          session({ id: "a", startedAt: "2026-08-25T03:00:00.000Z", endedAt: "2026-08-25T04:30:00.000Z" }),
          session({
            id: "b",
            provider: "opencode",
            startedAt: "2026-08-25T04:00:00.000Z",
            endedAt: "2026-08-25T05:00:00.000Z",
          }),
        ],
      }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      startedAt: "2026-08-25T03:00:00.000Z",
      endedAt: "2026-08-25T05:00:00.000Z",
      providers: ["claude", "opencode"],
    });
  });

  it("merges a chain of handoffs even though its ends sit far apart", () => {
    const at = (minute: number): Partial<JournalSession> => ({
      id: `s${minute}`,
      startedAt: new Date(Date.parse("2026-08-25T03:00:00.000Z") + minute * 60_000).toISOString(),
      endedAt: new Date(Date.parse("2026-08-25T03:00:00.000Z") + (minute + 10) * 60_000).toISOString(),
      activeMinutes: 10,
    });
    const tasks = groupTasks(journal({ sessions: [session(at(0)), session(at(20)), session(at(40))] }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].activeMinutes).toBe(30);
  });

  it("titles the task from the named session, whichever comes first", () => {
    const tasks = groupTasks(
      journal({
        sessions: [session({ id: "a", title: null }), session({ id: "b", title: "Ship the parser" })],
      }),
    );
    expect(tasks[0].title).toBe("Ship the parser");
  });

  it("sums cost only from the sessions that reported one", () => {
    const both = groupTasks(
      journal({
        sessions: [session({ id: "a", totalCost: 3 }), session({ id: "b", totalCost: null })],
      }),
    );
    expect(both[0].totalCost).toBe(3);
    const neither = groupTasks(journal({ sessions: [session({ id: "a" }), session({ id: "b" })] }));
    expect(neither[0].totalCost).toBeNull();
  });

  it("dedupes a prompt the agent replayed into a successor session", () => {
    const tasks = groupTasks(
      journal({
        sessions: [
          session({ id: "a", prompts: ["Ship it"], humanPrompts: 1 }),
          session({ id: "b", prompts: ["Ship it", "Tag it"], humanPrompts: 2 }),
        ],
      }),
    );
    expect(tasks[0].prompts).toEqual(["Ship it", "Tag it"]);
    expect(tasks[0].humanPrompts).toBe(3);
  });

  it("returns no tasks when the day recorded nothing", () => {
    expect(groupTasks(journal())).toEqual([]);
    expect(groupTasks({ ...journal(), sessions: undefined } as unknown as DayJournal)).toEqual([]);
  });
});

describe("weekOptions", () => {
  it("runs Sunday through today and ends on today", () => {
    // 2026-08-25 is a Tuesday.
    const options = weekOptions(new Date(2026, 7, 25), "en-US");
    expect(options.map((option) => option.label)).toEqual(["Sunday", "Yesterday", "Today"]);
    expect(options.map((option) => option.value)).toEqual(["2026-08-23", "2026-08-24", "2026-08-25"]);
    expect(options[options.length - 1].isToday).toBe(true);
  });

  it("offers only today when today is Sunday", () => {
    const options = weekOptions(new Date(2026, 7, 23), "en-US");
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ label: "Today", value: "2026-08-23", weekday: "Sunday" });
  });

  it("covers a whole week when today is Saturday", () => {
    const options = weekOptions(new Date(2026, 7, 29), "en-US");
    expect(options).toHaveLength(7);
    expect(options[0].value).toBe("2026-08-23");
    expect(options[6].label).toBe("Today");
  });

  it("keeps the real weekday available even where the label reads Today", () => {
    const options = weekOptions(new Date(2026, 7, 25), "en-US");
    expect(options[options.length - 1].weekday).toBe("Tuesday");
  });
});

describe("toolShares", () => {
  it("sorts by count and computes each share of the total", () => {
    const shares = toolShares({ Bash: 3, Edit: 1 });
    expect(shares.map((entry) => entry.name)).toEqual(["Bash", "Edit"]);
    expect(shares[0].share).toBe(0.75);
  });

  it("rolls the tail into a single other row that preserves the total", () => {
    const shares = toolShares({ a: 10, b: 9, c: 8, d: 7, e: 6, f: 5, g: 4 }, 5);
    expect(shares).toHaveLength(6);
    expect(shares[5]).toEqual({ name: "other", count: 9, share: 9 / 49 });
    expect(shares.reduce((sum, entry) => sum + entry.count, 0)).toBe(49);
  });

  it("returns nothing for an empty mix", () => {
    expect(toolShares({})).toEqual([]);
    expect(toolShares({ Bash: 0 })).toEqual([]);
  });
});

// Times are built from local components rather than written as UTC strings so
// these assertions hold in whatever timezone the suite runs in.
const at = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute).toISOString();

describe("dayShape", () => {
  it("spreads a session's active minutes across the hours it spans", () => {
    const shape = dayShape(
      journal({
        activeMinutes: 90,
        sessions: [session({ startedAt: at(9), endedAt: at(12), activeMinutes: 90 })],
      }),
    );
    // Three hours covered equally, so 30 active minutes land in each.
    expect(shape.hours[9].minutes).toBeCloseTo(30);
    expect(shape.hours[10].minutes).toBeCloseTo(30);
    expect(shape.hours[11].minutes).toBeCloseTo(30);
    expect(shape.hours[8].minutes).toBe(0);
    expect(shape.hours[12].minutes).toBe(0);
  });

  it("weights partial hours by how much of them the session covered", () => {
    const shape = dayShape(
      journal({
        sessions: [session({ startedAt: at(9, 45), endedAt: at(10, 15), activeMinutes: 30 })],
      }),
    );
    expect(shape.hours[9].minutes).toBeCloseTo(15);
    expect(shape.hours[10].minutes).toBeCloseTo(15);
  });

  it("puts a session with no measurable span in the hour it started", () => {
    const shape = dayShape(
      journal({ sessions: [session({ startedAt: at(14), endedAt: at(14), activeMinutes: 20 })] }),
    );
    expect(shape.hours[14].minutes).toBe(20);
  });

  it("never claims more than sixty active minutes in one hour", () => {
    const shape = dayShape(
      journal({
        sessions: [
          session({ id: "a", startedAt: at(9), endedAt: at(10), activeMinutes: 55 }),
          session({ id: "b", startedAt: at(9), endedAt: at(10), activeMinutes: 55 }),
        ],
      }),
    );
    expect(shape.hours[9].minutes).toBe(60);
    expect(shape.hours[9].level).toBe(4);
  });

  it("grades an hour by how much of it was active", () => {
    const levelFor = (minutes: number) =>
      dayShape(journal({ sessions: [session({ startedAt: at(9), endedAt: at(9), activeMinutes: minutes })] }))
        .hours[9].level;
    expect(levelFor(0)).toBe(0);
    expect(levelFor(10)).toBe(1);
    expect(levelFor(25)).toBe(2);
    expect(levelFor(40)).toBe(3);
    expect(levelFor(58)).toBe(4);
  });

  it("names the busiest hour and carries the day's own start and end", () => {
    const shape = dayShape(
      journal({
        firstEventAt: at(9),
        lastEventAt: at(17),
        sessions: [
          session({ id: "a", startedAt: at(9), endedAt: at(9), activeMinutes: 10 }),
          session({ id: "b", startedAt: at(15), endedAt: at(15), activeMinutes: 50 }),
        ],
      }),
    );
    expect(shape.peakHour).toBe(15);
    expect(shape.startedAt).toBe(at(9));
    expect(shape.endedAt).toBe(at(17));
  });

  it("returns a flat, idle day for missing or unparseable journals", () => {
    expect(dayShape(null).hours).toHaveLength(24);
    expect(dayShape(null).peakHour).toBeNull();
    expect(dayShape(journal({ date: "not-a-date" })).peakHour).toBeNull();
    expect(dayShape(journal({ sessions: [] })).hours.every((entry) => entry.level === 0)).toBe(true);
  });

  it("ignores sessions that recorded no active time", () => {
    const shape = dayShape(
      journal({ sessions: [session({ startedAt: at(9), endedAt: at(11), activeMinutes: 0 })] }),
    );
    expect(shape.hours.every((entry) => entry.minutes === 0)).toBe(true);
  });
});

describe("formatHourLabel", () => {
  it("names an hour of the clock", () => {
    expect(formatHourLabel(0, "en-US")).toBe("12 AM");
    expect(formatHourLabel(9, "en-US")).toBe("9 AM");
    expect(formatHourLabel(18, "en-US")).toBe("6 PM");
  });
});
