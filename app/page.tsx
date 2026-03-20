import { cookies } from "next/headers";

import { MemberGate } from "@/components/member-gate";
import { MonthBoard } from "@/components/month-board";
import { getMonthView } from "@/lib/month";
import { MEMBER_COOKIE } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{
    month?: string;
  }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedMonth = params.month;
  const data = await getMonthView(selectedMonth);
  const cookieStore = await cookies();
  const selectedMemberId = cookieStore.get(MEMBER_COOKIE)?.value ?? null;

  return (
    <main className="shell">
      <div className="shell__backdrop" />
      <section className="app-card">
        <MonthBoard data={data} selectedMemberId={selectedMemberId} />
      </section>
      <MemberGate members={data.members} selectedMemberId={selectedMemberId} />
    </main>
  );
}
