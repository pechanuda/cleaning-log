import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPool } from "@/lib/db";
import { cookieOptions, MEMBER_COOKIE } from "@/lib/session";
import { dayEntrySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const selectedMemberId = cookieStore.get(MEMBER_COOKIE)?.value;

  if (!selectedMemberId) {
    return NextResponse.json({ error: "Select a member first" }, { status: 400 });
  }

  const json = await request.json();
  const payload = dayEntrySchema.parse(json);
  const pool = getPool();

  const memberResult = await pool.query("SELECT id FROM members WHERE id = $1 LIMIT 1", [selectedMemberId]);
  if (memberResult.rowCount === 0) {
    const response = NextResponse.json({ error: "Stored member does not exist" }, { status: 400 });
    response.cookies.set(MEMBER_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }

  const taskIds = [payload.task1Id, payload.task2Id].filter(Boolean);
  if (taskIds.length > 0) {
    const taskResult = await pool.query(
      "SELECT id FROM tasks WHERE id = ANY($1::uuid[])",
      [taskIds]
    );

    if (taskResult.rowCount !== taskIds.length) {
      return NextResponse.json({ error: "One or more tasks do not exist" }, { status: 400 });
    }
  }

  if (!payload.task1Id && !payload.task2Id) {
    await pool.query("DELETE FROM day_entries WHERE date = $1::date AND member_id = $2::uuid", [
      payload.date,
      selectedMemberId
    ]);
    return NextResponse.json({ ok: true });
  }

  await pool.query(
    `
      INSERT INTO day_entries (date, member_id, task_1_id, task_2_id, updated_at)
      VALUES ($1::date, $2::uuid, $3::uuid, $4::uuid, NOW())
      ON CONFLICT (date, member_id) DO UPDATE
        SET
            task_1_id = EXCLUDED.task_1_id,
            task_2_id = EXCLUDED.task_2_id,
            updated_at = NOW()
    `,
    [payload.date, selectedMemberId, payload.task1Id, payload.task2Id]
  );

  return NextResponse.json({ ok: true });
}
