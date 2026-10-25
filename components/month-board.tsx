"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { DayEntry, MemberTaskStat, MonthViewResponse, ScoreboardRow, TaskPriority } from "@/lib/types";

type MonthBoardProps = {
  data: MonthViewResponse;
  selectedMemberId: string | null;
};

type BoardTab = "today" | "statistics" | "frequency" | "history";

function getLabel(score: ScoreboardRow | undefined, fallback: string) {
  if (!score) {
    return fallback;
  }

  const pointsWord = score.points === 1 ? "bod" : score.points < 5 ? "body" : "bodů";
  return `${score.memberName} · ${score.points} ${pointsWord}`;
}

function getLocalTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getPriorityCopy(priority: TaskPriority) {
  if (priority.status === "no-frequency") return "Frekvence nenastavena";
  if (priority.status === "not-yet-completed") return "Zatím nezaznamenáno";
  if (priority.status === "overdue") {
    const days = Math.abs(priority.daysUntilDue ?? 0);
    return `${days} ${formatDays(days)} po termínu`;
  }
  if (priority.status === "due-soon") {
    return priority.daysUntilDue === 0
      ? "Termín dnes"
      : `Termín za ${priority.daysUntilDue} ${formatDays(priority.daysUntilDue)}`;
  }
  return `Termín za ${priority.daysUntilDue} dní`;
}

function getFrequencyCopy(priority: TaskPriority) {
  if (priority.frequencyDays === 0) {
    return priority.lastCompletedDate ? `Podle potřeby · naposledy ${priority.lastCompletedDate}` : "Podle potřeby";
  }

  const cadence = priority.frequencyDays === 1
    ? "Každý den"
    : `${priority.frequencyDays >= 2 && priority.frequencyDays <= 4 ? "Každé" : "Každých"} ${priority.frequencyDays} ${formatDays(priority.frequencyDays)}`;
  return `${cadence}${priority.lastCompletedDate ? ` · naposledy ${priority.lastCompletedDate}` : ""}`;
}

function formatDays(count: number) {
  return count === 1 ? "den" : count >= 2 && count <= 4 ? "dny" : "dní";
}

export function MonthBoard({ data, selectedMemberId }: MonthBoardProps) {
  const router = useRouter();
  const dayTableBodyRef = useRef<HTMLDivElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BoardTab>("today");
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

  function onMonthChange(nextMonth: string) {
    startTransition(() => {
      router.push(`/?month=${nextMonth}`);
    });
  }

  function onTabChange(tab: BoardTab) {
    setActiveTab(tab);

    const currentMonth = getLocalTodayIso().slice(0, 7);
    const targetMonth = tab === "today" ? currentMonth : tab === "history" ? getPreviousMonth(currentMonth) : data.selectedMonth;
    if (targetMonth !== data.selectedMonth) {
      onMonthChange(targetMonth);
    }
  }

  function scrollToToday() {
    if (!todayIso) return;
    dayTableBodyRef.current?.querySelector<HTMLElement>(`[data-date="${todayIso}"]`)?.scrollIntoView({ block: "center" });
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
        throw new Error(payload?.error ?? "Úkol se nepodařilo uložit.");
      }

      setError(null);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Úkol se nepodařilo uložit.");
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
        throw new Error("Vybraného člena se nepodařilo změnit.");
      }

      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "Vybraného člena se nepodařilo změnit."
      );
    } finally {
      setIsSessionMenuOpen(false);
    }
  }

  const todayPriorities = data.taskPriorities.filter(
    (priority) =>
      priority.status === "overdue" ||
      priority.status === "not-yet-completed" ||
      (priority.daysUntilDue !== null && priority.daysUntilDue <= 1)
  );

  return (
    <div className="board-layout">
      <div className="board-top">
        <div className="session-menu">
          <button
            type="button"
            className="session-menu__trigger"
            aria-label="Nastavení relace"
            aria-expanded={isSessionMenuOpen}
            onClick={() => setIsSessionMenuOpen((open) => !open)}
          >
            ...
          </button>
          {isSessionMenuOpen ? (
            <div className="session-menu__panel">
              <button type="button" className="session-menu__item" onClick={() => void resetMemberSelection()}>
                Přepnout člena
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
              <h1>Úklidový deník</h1>
              <p className="header__active-member">
                Aktivní člen: <strong>{selectedMember?.name ?? "Vyberte, kdo jste"}</strong>
              </p>
            </div>
          </div>
        </header>

        <nav className="board-tabs" aria-label="Pohledy úklidového deníku">
          {(["today", "statistics", "frequency", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "board-tab board-tab--active" : "board-tab"}
              aria-current={activeTab === tab ? "page" : undefined}
              onClick={() => onTabChange(tab)}
            >
              {tab === "today" ? "Dnes" : tab === "statistics" ? "Statistiky" : tab === "frequency" ? "Frekvence" : "Historie"}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "today" ? (
        <>
          <TodayView priorities={todayPriorities} onGoToToday={scrollToToday} />
          {error ? <p className="form-error form-error--banner">{error}</p> : null}
          <DayTable
            days={data.days}
            members={data.members}
            tasks={data.tasks}
            todayIso={todayIso}
            mobileVisibleMemberId={mobileVisibleMemberId}
            selectedMemberId={selectedMemberId}
            savingKey={savingKey}
            onSave={saveDay}
            tableBodyRef={dayTableBodyRef}
          />
        </>
      ) : null}
      {activeTab === "statistics" ? (
        <StatisticsView
          selectedMonth={data.selectedMonth}
          isPending={isPending}
          onMonthChange={onMonthChange}
          winner={winner}
          loser={loser}
          scoreboard={data.scoreboard}
          taskStats={data.memberTaskStats}
        />
      ) : null}
      {activeTab === "frequency" ? <TaskPriorityList priorities={data.taskPriorities} /> : null}
      {activeTab === "history" ? (
        <>
          <section className="history-heading">
            <div>
              <p className="eyebrow">Měsíční přehled</p>
              <h2>Historie</h2>
            </div>
            <label className="month-picker">
              <span>Měsíc</span>
              <input type="month" value={data.selectedMonth} onChange={(event) => onMonthChange(event.target.value)} disabled={isPending} />
            </label>
          </section>
          <DayTable
            days={data.days}
            members={data.members}
            tasks={data.tasks}
            todayIso={todayIso}
            mobileVisibleMemberId={null}
            selectedMemberId={null}
            savingKey={null}
            onSave={saveDay}
            tableBodyRef={dayTableBodyRef}
          />
        </>
      ) : null}
    </div>
  );
}

function TodayView({ priorities, onGoToToday }: { priorities: TaskPriority[]; onGoToToday: () => void }) {
  return (
    <section className="today-view" aria-labelledby="today-title">
      <div className="task-priorities__heading">
        <div>
          <p className="eyebrow">Začněte zde</p>
          <h2 id="today-title">Dnešní úklid</h2>
        </div>
        <p>Po termínu, nezapsané a úkoly s termínem dnes nebo zítra.</p>
      </div>
      {priorities.length ? <TaskPriorityCards priorities={priorities} /> : <p className="empty-state">Vše je hotovo. Na dnešek ani zítřek nic nepřipadá.</p>}
      <button type="button" className="secondary-button today-view__history-button" onClick={onGoToToday}>
        Zapsat dnešní úklid
      </button>
    </section>
  );
}

type DayTableProps = {
  days: MonthViewResponse["days"];
  members: MonthViewResponse["members"];
  tasks: MonthViewResponse["tasks"];
  todayIso: string | null;
  mobileVisibleMemberId: string | null;
  selectedMemberId: string | null;
  savingKey: string | null;
  onSave: (date: string, task1Id: string | null, task2Id: string | null) => Promise<void>;
  tableBodyRef: React.RefObject<HTMLDivElement | null>;
};

function DayTable({ days, members, tasks, todayIso, mobileVisibleMemberId, selectedMemberId, savingKey, onSave, tableBodyRef }: DayTableProps) {
  return <section className="day-table" aria-label="Měsíční přehled úkolů">
    <div className="day-table__header" style={{ "--member-columns": members.length } as React.CSSProperties}>
      <span>Den</span>
      {members.map((member) => <span key={member.id}>{member.name}</span>)}
    </div>
    <div ref={tableBodyRef} className="day-table__body">
      {days.map((day) => <DayRow key={day.date} day={day} isToday={day.date === todayIso} mobileVisibleMemberId={mobileVisibleMemberId} selectedMemberId={selectedMemberId} tasks={tasks} savingKey={savingKey} onSave={onSave} />)}
    </div>
  </section>;
}

function StatisticsView({ selectedMonth, isPending, onMonthChange, winner, loser, scoreboard, taskStats }: {
  selectedMonth: string;
  isPending: boolean;
  onMonthChange: (month: string) => void;
  winner: ScoreboardRow | undefined;
  loser: ScoreboardRow | undefined;
  scoreboard: ScoreboardRow[];
  taskStats: MemberTaskStat[];
}) {
  return (
    <section className="statistics-view" aria-labelledby="statistics-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Měsíční statistiky</p>
          <h2 id="statistics-title">Statistiky</h2>
        </div>
        <label className="month-picker"><span>Měsíc</span><input type="month" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} disabled={isPending} /></label>
      </div>
      <div className="score-strip">
        <div className="score-chip score-chip--winner"><span>Nejlepší čistič</span><strong>{getLabel(winner, "Zatím žádné úkoly")}</strong></div>
        <div className="score-chip score-chip--loser"><span>Největší guma</span><strong>{getLabel(loser, "Zatím žádné úkoly")}</strong></div>
      </div>
      <div className="statistics-members">
        {scoreboard.map((member) => (
          <article key={member.memberId} className="statistics-member">
            <h3>{member.memberName} <span>{member.points} {member.points === 1 ? "bod" : member.points < 5 ? "body" : "bodů"}</span></h3>
            <ul>
              {taskStats.filter((task) => task.memberId === member.memberId).map((task) => <li key={task.taskName}>{task.taskName} <span>{task.completions}× · {task.points} {task.points === 1 ? "bod" : task.points < 5 ? "body" : "bodů"}</span></li>)}
              {!taskStats.some((task) => task.memberId === member.memberId) ? <li className="statistics-member__empty">Žádné zapsané úkoly.</li> : null}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskPriorityList({ priorities }: { priorities: TaskPriority[] }) {
  return (
    <section className="task-priorities" aria-labelledby="task-priorities-title">
      <div className="task-priorities__heading">
        <div>
          <p className="eyebrow">Začněte zde</p>
          <h2 id="task-priorities-title">Co je potřeba udělat</h2>
        </div>
        <p>Seřazeno podle naléhavosti · „brzy“ znamená posledních 20 % intervalu.</p>
      </div>
      <TaskPriorityCards priorities={priorities} />
    </section>
  );
}

function TaskPriorityCards({ priorities }: { priorities: TaskPriority[] }) {
  return <div className="task-priorities__list">
    {priorities.map((priority) => (
      <article
        key={priority.taskId}
        className={`task-priority task-priority--${priority.status} ${priority.status !== "overdue" && priority.daysUntilDue !== null && priority.daysUntilDue <= 1 ? "task-priority--due-near" : ""}`}
      >
        <div>
          <h3>{priority.taskName}</h3>
          <p>
            {getFrequencyCopy(priority)}
          </p>
        </div>
        <strong>{getPriorityCopy(priority)}</strong>
      </article>
    ))}
  </div>;
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
    if (saveStatus === "saving") return "Ukládám...";
    if (saveStatus === "saved") return "Uloženo";
    if (saveStatus === "error") return "Chyba";
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
        {!isActive ? <small>Pouze pro čtení</small> : null}
      </div>
      <label className="task-select">
        <span className="sr-only">
          Úkol 1 pro {entry.memberName} dne {date}
        </span>
        <select value={task1Id} onChange={(event) => setTask1Id(event.target.value)} disabled={disabled}>
          <option value="">Bez úkolu</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name} ({task.size})
            </option>
          ))}
        </select>
      </label>
      <label className="task-select">
        <span className="sr-only">
          Úkol 2 pro {entry.memberName} dne {date}
        </span>
        <select value={task2Id} onChange={(event) => setTask2Id(event.target.value)} disabled={disabled}>
          <option value="">Bez úkolu</option>
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
