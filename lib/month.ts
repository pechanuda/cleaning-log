import { getPool } from "@/lib/db";
import type {
  DayEntry,
  Member,
  MonthDay,
  MonthViewResponse,
  MemberTaskStat,
  ScoreboardRow,
  Task,
  TaskPriority
} from "@/lib/types";

const weekdayFormatter = new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "UTC" });

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMonthBounds(selectedMonth?: string) {
  const today = new Date();
  const monthKey = /^\d{4}-\d{2}$/.test(selectedMonth ?? "") ? selectedMonth! : toIsoDate(today).slice(0, 7);
  const [inputYear, inputMonth] = monthKey.split("-");
  const year = Number(inputYear);
  const monthIndex = Number(inputMonth) - 1;

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));

  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    start,
    end
  };
}

type DayRowRecord = {
  date: string;
  member_id: string;
  member_name: string;
  task_1_id: string | null;
  task_2_id: string | null;
};

type TaskCompletionRecord = Task & {
  last_completed_date: string | null;
};

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return toIsoDate(result);
}

function daysBetween(fromIsoDate: string, toIsoDate: string) {
  const [fromYear, fromMonth, fromDay] = fromIsoDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toIsoDate.split("-").map(Number);
  const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const to = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((to - from) / 86_400_000);
}

function getTaskPriorities(rows: TaskCompletionRecord[], todayIso: string): TaskPriority[] {
  const priorities = rows.map((task) => {
    if (task.frequencyDays === 0) {
      return {
        taskId: task.id,
        taskName: task.name,
        frequencyDays: 0,
        lastCompletedDate: task.last_completed_date,
        dueDate: null,
        daysUntilDue: null,
        status: "no-frequency" as const
      };
    }

    if (!task.last_completed_date) {
      return {
        taskId: task.id,
        taskName: task.name,
        frequencyDays: task.frequencyDays,
        lastCompletedDate: null,
        dueDate: null,
        daysUntilDue: null,
        status: "not-yet-completed" as const
      };
    }

    const dueDate = addDays(task.last_completed_date, task.frequencyDays);
    const daysUntilDue = daysBetween(todayIso, dueDate);
    const dueSoonWindow = Math.max(1, Math.ceil(task.frequencyDays * 0.2));
    const status: TaskPriority["status"] =
      daysUntilDue < 0 ? "overdue" : daysUntilDue <= dueSoonWindow ? "due-soon" : "on-track";

    return {
      taskId: task.id,
      taskName: task.name,
      frequencyDays: task.frequencyDays,
      lastCompletedDate: task.last_completed_date,
      dueDate,
      daysUntilDue,
      status
    };
  });

  const rank = { overdue: 0, "not-yet-completed": 1, "due-soon": 2, "on-track": 3, "no-frequency": 4 };
  return priorities.sort(
    (left, right) =>
      rank[left.status] - rank[right.status] ||
      (left.daysUntilDue ?? Number.NEGATIVE_INFINITY) -
        (right.daysUntilDue ?? Number.NEGATIVE_INFINITY) ||
      left.taskName.localeCompare(right.taskName)
  );
}

async function getHouseholdName() {
  const result = await getPool().query<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'household_name' LIMIT 1"
  );

  return result.rows[0]?.value ?? "Úklidový deník";
}

export async function getMonthView(selectedMonth?: string): Promise<MonthViewResponse> {
  const pool = getPool();
  const { key, start, end } = getMonthBounds(selectedMonth);
  const startIso = toIsoDate(start);
  const endIso = toIsoDate(end);
  const todayIso = toIsoDate(new Date());

    const [householdName, membersResult, tasksResult, dayEntriesResult, scoreboardResult, memberTaskStatsResult, completionsResult] =
      await Promise.all([
        getHouseholdName(),
        pool.query<Member>("SELECT id, name FROM members ORDER BY name ASC"),
        pool.query<Task>(
          'SELECT id, name, size, points, frequency_days AS "frequencyDays" FROM tasks ORDER BY points ASC, name ASC'
        ),
        pool.query<DayRowRecord>(
          `
            SELECT
              day_entries.date::text AS date,
              day_entries.member_id,
              members.name AS member_name,
              day_entries.task_1_id,
              day_entries.task_2_id
            FROM day_entries
            LEFT JOIN members ON members.id = day_entries.member_id
            WHERE day_entries.date BETWEEN $1::date AND $2::date
          `,
          [startIso, endIso]
        ),
        pool.query<ScoreboardRow>(
          `
            SELECT
              members.id AS "memberId",
              members.name AS "memberName",
              COALESCE(SUM(task_points.points), 0)::int AS points
            FROM members
            LEFT JOIN day_entries ON day_entries.member_id = members.id
              AND day_entries.date BETWEEN $1::date AND $2::date
            LEFT JOIN LATERAL (
              SELECT points FROM tasks WHERE id = day_entries.task_1_id
              UNION ALL
              SELECT points FROM tasks WHERE id = day_entries.task_2_id
            ) AS task_points ON TRUE
            GROUP BY members.id, members.name
            ORDER BY points DESC, members.name ASC
          `,
          [startIso, endIso]
        ),
        pool.query<MemberTaskStat>(
          `
            SELECT
              members.id AS "memberId",
              members.name AS "memberName",
              tasks.name AS "taskName",
              COUNT(*)::int AS completions,
              SUM(tasks.points)::int AS points
            FROM day_entries
            JOIN members ON members.id = day_entries.member_id
            CROSS JOIN LATERAL (VALUES (day_entries.task_1_id), (day_entries.task_2_id)) AS logged(task_id)
            JOIN tasks ON tasks.id = logged.task_id
            WHERE day_entries.date BETWEEN $1::date AND $2::date
            GROUP BY members.id, members.name, tasks.id, tasks.name
            ORDER BY members.name ASC, completions DESC, tasks.name ASC
          `,
          [startIso, endIso]
        ),
        pool.query<TaskCompletionRecord>(
          `
            SELECT
              tasks.id,
              tasks.name,
              tasks.size,
              tasks.points,
              tasks.frequency_days AS "frequencyDays",
              MAX(day_entries.date)::text AS last_completed_date
            FROM tasks
            LEFT JOIN day_entries
              ON (day_entries.task_1_id = tasks.id OR day_entries.task_2_id = tasks.id)
              AND day_entries.date <= $1::date
            GROUP BY tasks.id, tasks.name, tasks.size, tasks.points, tasks.frequency_days
          `,
          [todayIso]
        )
      ]);

  const entriesByDate = new Map<string, Map<string, DayEntry>>();
  for (const row of dayEntriesResult.rows) {
      const byMember = entriesByDate.get(row.date) ?? new Map<string, DayEntry>();
      byMember.set(row.member_id, {
        date: row.date,
        memberId: row.member_id,
        memberName: row.member_name,
        task1Id: row.task_1_id,
        task2Id: row.task_2_id
      });
      entriesByDate.set(row.date, byMember);
    }

  const days: MonthDay[] = [];

  for (let day = 1; day <= end.getUTCDate(); day += 1) {
      const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
      const isoDate = toIsoDate(current);
      const dayEntries = entriesByDate.get(isoDate);

      days.push({
        date: isoDate,
        dayOfMonth: day,
        weekdayShort: weekdayFormatter.format(current),
        entries: membersResult.rows.map((member) => {
          const entry = dayEntries?.get(member.id);

          return {
            date: isoDate,
            memberId: member.id,
            memberName: member.name,
            task1Id: entry?.task1Id ?? null,
            task2Id: entry?.task2Id ?? null
          };
        })
      });
    }

  return {
    householdName,
    selectedMonth: key,
    members: membersResult.rows,
    tasks: tasksResult.rows,
    days,
    scoreboard: scoreboardResult.rows,
    memberTaskStats: memberTaskStatsResult.rows,
    taskPriorities: getTaskPriorities(completionsResult.rows, todayIso)
  };
}
