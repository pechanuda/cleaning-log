import { NextResponse } from "next/server";

import { cookieOptions, MEMBER_COOKIE } from "@/lib/session";
import { getPool } from "@/lib/db";
import { memberSessionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const json = await request.json();
  const payload = memberSessionSchema.parse(json);
  const memberResult = await getPool().query("SELECT id FROM members WHERE id = $1 LIMIT 1", [payload.memberId]);

  if (memberResult.rowCount === 0) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(MEMBER_COOKIE, payload.memberId, cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(MEMBER_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
