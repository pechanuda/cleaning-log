import type { PoolClient } from "pg";

import { getPool } from "@/lib/db";
import type { DayEntry, Member, MonthDay, MonthViewResponse, ScoreboardRow, Task } from "@/lib/types";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

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

async function getHouseholdName(client: PoolClient) {
  const result = await client.query<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'household_name' LIMIT 1"
  );

  return result.rows[0]?.value ?? "Cleaning Log";
}

export async function getMonthView(selectedMonth?: string): Promise<MonthViewResponse> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { key, start, end } = getMonthBounds(selectedMonth);
    const startIso = toIsoDate(start);
    const endIso = toIsoDate(end);

    const [householdName, membersResult, tasksResult, dayEntriesResult, scoreboardResult] =
      await Promise.all([
        getHouseholdName(client),
        client.query<Member>("SELECT id, name FROM members ORDER BY name ASC"),
        client.query<Task>("SELECT id, name, size, points FROM tasks ORDER BY points ASC, name ASC"),
        client.query<DayRowRecord>(
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
        client.query<ScoreboardRow>(
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
      scoreboard: scoreboardResult.rows
    };
  } finally {
    client.release();
  }
}
