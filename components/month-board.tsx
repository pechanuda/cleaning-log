"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { DayEntry, MonthViewResponse, ScoreboardRow } from "@/lib/types";

type MonthBoardProps = {
  data: MonthViewResponse;
  selectedMemberId: string | null;
};

function getLabel(score: ScoreboardRow | undefined, fallback: string) {
  if (!score) {
    return fallback;
  }

  return `${score.memberName} · ${score.points} pt${score.points === 1 ? "" : "s"}`;
}

function getLocalTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MonthBoard({ data, selectedMemberId }: MonthBoardProps) {
  const router = useRouter();
  const dayTableBodyRef = useRef<HTMLDivElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [todayIso, setTodayIso] = useState<string | null>(null);
  const [mobileVisibleMemberId, setMobileVisibleMemberId] = useState<string | null>(
    selectedMemberId ?? data.members[0]?.id ?? null
  );

  const selectedMember = data.members.find((member) => member.id === selectedMemberId) ?? null;
  const mobileVisibleMember =
    data.members.find((member) => member.id === mobileVisibleMemberId) ?? selectedMember ?? data.members[0] ?? null;
  const winner = data.scoreboard[0];
  const loser = [...data.scoreboard].sort((left, right) => left.points - right.points || left.memberName.localeCompare(right.memberName))[0];

  useEffect(() => {
    setTodayIso(getLocalTodayIso());
  }, []);

  useEffect(() => {
    setMobileVisibleMemberId(selectedMemberId ?? data.members[0]?.id ?? null);
  }, [data.members, selectedMemberId]);

  useEffect(() => {
    if (!todayIso) {
      return;
    }

    const currentMonth = todayIso.slice(0, 7);

    if (data.selectedMonth !== currentMonth) {
      return;
    }

    const row = dayTableBodyRef.current?.querySelector<HTMLElement>(`[data-date="${todayIso}"]`);
    if (!row) {
      return;
    }

    row.scrollIntoView({ block: "center" });
  }, [data.selectedMonth, mobileVisibleMemberId, todayIso]);

  function onMonthChange(nextMonth: string) {
    startTransition(() => {
      router.push(`/?month=${nextMonth}`);
    });
  }

  async function saveDay(date: string, task1Id: string | null, task2Id: string | null) {
    const saveKey = `${date}:${selectedMemberId ?? "missing"}`;
    setSavingKey(saveKey);

    try {
      const response = await fetch("/api/day-entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ date, task1Id, task2Id })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to save the day entry.");
      }

      setError(null);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save the day entry.");
      throw submissionError;
    } finally {
      setSavingKey(null);
    }
  }

  async function resetMemberSelection() {
    setError(null);

    try {
      const response = await fetch("/api/session/member", {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Unable to reset the selected member.");
      }

      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "Unable to reset the selected member."
      );
    } finally {
      setIsSessionMenuOpen(false);
    }
  }

  return (
    <div className="board-layout">
      <div className="board-top">
        <div className="session-menu">
          <button
            type="button"
            className="session-menu__trigger"
            aria-label="Session options"
            aria-expanded={isSessionMenuOpen}
            onClick={() => setIsSessionMenuOpen((open) => !open)}
          >
            ...
          </button>
          {isSessionMenuOpen ? (
            <div className="session-menu__panel">
              <button type="button" className="session-menu__item" onClick={() => void resetMemberSelection()}>
                Switch member
              </button>
            </div>
          ) : null}
        </div>
        <header className="header">
          <div className="header__topline">
            <p className="eyebrow">{data.householdName}</p>
          </div>
          <div className="header__hero">
            <div className="header__identity">
              <div className="header__titlebar">
                <h1>Cleaning Log</h1>
                <label className="month-picker">
                  <span>Month</span>
                  <input
                    type="month"
                    defaultValue={data.selectedMonth}
                    onChange={(event) => onMonthChange(event.target.value)}
                    disabled={isPending}
                  />
                </label>
              </div>
              <p className="header__active-member">
                Active member: <strong>{selectedMember?.name ?? "Select who you are"}</strong>
              </p>
            </div>
          <div className="score-strip">
            <div className="score-chip score-chip--winner">
              <span>Nejlepší Čistič</span>
              <strong>{getLabel(winner, "No tasks yet")}</strong>
            </div>
            <div className="score-chip score-chip--loser">
              <span>Největší guma</span>
              <strong>{getLabel(loser, "No tasks yet")}</strong>
            </div>
            </div>
          </div>
        </header>

        <section className="scoreboard">
          {data.scoreboard.map((row) => (
            <button
              key={row.memberId}
              type="button"
              className={`scoreboard-card ${selectedMemberId === row.memberId ? "scoreboard-card--active" : ""} ${mobileVisibleMemberId === row.memberId ? "scoreboard-card--focused" : ""}`}
              onClick={() => setMobileVisibleMemberId(row.memberId)}
              aria-pressed={mobileVisibleMemberId === row.memberId}
            >
              <span>{row.memberName}</span>
              <strong>{row.points}</strong>
            </button>
          ))}
        </section>

        <p className="mobile-focus-note">
          Mobile view shows <strong>{mobileVisibleMember?.name ?? "the selected member"}</strong>. Tap a score card to preview another member in read-only mode.
        </p>

        {error ? <p className="form-error form-error--banner">{error}</p> : null}
      </div>

      <section className="day-table" aria-label="Month task log">
        <div
          className="day-table__header"
          style={{ "--member-columns": data.members.length } as React.CSSProperties}
        >
          <span>Day</span>
          {data.members.map((member) => (
            <span key={member.id}>{member.name}</span>
          ))}
        </div>
        <div ref={dayTableBodyRef} className="day-table__body">
          {data.days.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              isToday={day.date === todayIso}
              mobileVisibleMemberId={mobileVisibleMemberId}
              selectedMemberId={selectedMemberId}
              tasks={data.tasks}
              savingKey={savingKey}
              onSave={saveDay}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type DayRowProps = {
  day: MonthViewResponse["days"][number];
  isToday: boolean;
  tasks: MonthViewResponse["tasks"];
  mobileVisibleMemberId: string | null;
  selectedMemberId: string | null;
  savingKey: string | null;
  onSave: (date: string, task1Id: string | null, task2Id: string | null) => Promise<void>;
};

function DayRow({ day, isToday, tasks, mobileVisibleMemberId, selectedMemberId, savingKey, onSave }: DayRowProps) {
  return (
    <div
      className={`day-row ${isToday ? "day-row--today" : ""}`}
      data-date={day.date}
      style={{ "--member-columns": day.entries.length } as React.CSSProperties}
    >
      <div className="day-label" aria-hidden="true">
        <strong>{String(day.dayOfMonth).padStart(2, "0")}</strong>
        <span>{day.weekdayShort}</span>
      </div>
      {day.entries.map((entry) => (
        <MemberTaskBlock
          key={`${day.date}:${entry.memberId}`}
          date={day.date}
          dayOfMonth={day.dayOfMonth}
          weekdayShort={day.weekdayShort}
          entry={entry}
          tasks={tasks}
          isActive={selectedMemberId === entry.memberId}
          isMobileVisible={!mobileVisibleMemberId || mobileVisibleMemberId === entry.memberId}
          isSaving={savingKey === `${day.date}:${entry.memberId}`}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

type MemberTaskBlockProps = {
  date: string;
  dayOfMonth: number;
  weekdayShort: string;
  entry: DayEntry;
  tasks: MonthViewResponse["tasks"];
  isActive: boolean;
  isMobileVisible: boolean;
  isSaving: boolean;
  onSave: (date: string, task1Id: string | null, task2Id: string | null) => Promise<void>;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function MemberTaskBlock({
  date,
  dayOfMonth,
  weekdayShort,
  entry,
  tasks,
  isActive,
  isMobileVisible,
  isSaving,
  onSave
}: MemberTaskBlockProps) {
  const [task1Id, setTask1Id] = useState(entry.task1Id ?? "");
  const [task2Id, setTask2Id] = useState(entry.task2Id ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const hydratedRef = useRef(false);
  const syncedRef = useRef({ task1Id: entry.task1Id ?? "", task2Id: entry.task2Id ?? "" });
  const statusTimeoutRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const disabled = !isActive || isSaving;

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    setTask1Id(entry.task1Id ?? "");
    setTask2Id(entry.task2Id ?? "");
    syncedRef.current = {
      task1Id: entry.task1Id ?? "",
      task2Id: entry.task2Id ?? ""
    };
  }, [entry.task1Id, entry.task2Id]);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !isActive) {
      return;
    }

    const matchesSyncedState =
      task1Id === syncedRef.current.task1Id && task2Id === syncedRef.current.task2Id;

    if (matchesSyncedState) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        await onSaveRef.current(date, task1Id || null, task2Id || null);
        syncedRef.current = { task1Id, task2Id };
        setSaveStatus("saved");
        if (statusTimeoutRef.current) {
          window.clearTimeout(statusTimeoutRef.current);
        }
        statusTimeoutRef.current = window.setTimeout(() => {
          setSaveStatus((current) => (current === "saved" ? "idle" : current));
          statusTimeoutRef.current = null;
        }, 1500);
      } catch {
        setSaveStatus("error");
        if (statusTimeoutRef.current) {
          window.clearTimeout(statusTimeoutRef.current);
        }
        statusTimeoutRef.current = window.setTimeout(() => {
          setSaveStatus((current) => (current === "error" ? "idle" : current));
          statusTimeoutRef.current = null;
        }, 2000);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [date, isActive, task1Id, task2Id]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  function getStatusLabel() {
    if (saveStatus === "saving") return "Saving...";
    if (saveStatus === "saved") return "Saved";
    if (saveStatus === "error") return "Failed";
    return null;
  }

  return (
    <div
      className={`member-block ${isActive ? "member-block--active" : "member-block--inactive"} ${isMobileVisible ? "" : "member-block--mobile-hidden"}`}
    >
      {isActive && getStatusLabel() ? (
        <div className={`status-overlay status-overlay--${saveStatus}`}>{getStatusLabel()}</div>
      ) : null}
      <div className="member-block__header">
        <div className="member-block__title">
          <div className="member-block__mobile-day" aria-hidden="true">
            <strong>{String(dayOfMonth).padStart(2, "0")}</strong>
            <span>{weekdayShort}</span>
          </div>
          <span>{entry.memberName}</span>
        </div>
        {!isActive ? <small>Read only</small> : null}
      </div>
      <label className="task-select">
        <span className="sr-only">
          Task slot 1 for {entry.memberName} on {date}
        </span>
        <select value={task1Id} onChange={(event) => setTask1Id(event.target.value)} disabled={disabled}>
          <option value="">No task</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name} ({task.size})
            </option>
          ))}
        </select>
      </label>
      <label className="task-select">
        <span className="sr-only">
          Task slot 2 for {entry.memberName} on {date}
        </span>
        <select value={task2Id} onChange={(event) => setTask2Id(event.target.value)} disabled={disabled}>
          <option value="">No task</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name} ({task.size})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
