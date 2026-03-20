import { NextResponse } from "next/server";

import { getMonthView } from "@/lib/month";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? undefined;
  const view = await getMonthView(month);

  return NextResponse.json(view);
}
