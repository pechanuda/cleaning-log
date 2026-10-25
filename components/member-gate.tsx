"use client";

import { useEffect, useState, useTransition } from "react";

import type { Member } from "@/lib/types";

type MemberGateProps = {
  members: Member[];
  selectedMemberId: string | null;
};

export function MemberGate({ members, selectedMemberId }: MemberGateProps) {
  const [selectedId, setSelectedId] = useState(selectedMemberId ?? members[0]?.id ?? "");
  const [isOpen, setIsOpen] = useState(!selectedMemberId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsOpen(!selectedMemberId);
    if (selectedMemberId) {
      setSelectedId(selectedMemberId);
    }
  }, [selectedMemberId]);

  async function saveMember(memberId: string) {
    const response = await fetch("/api/session/member", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ memberId })
    });

    if (!response.ok) {
      throw new Error("Vybraného člena se nepodařilo uložit.");
    }

    window.location.reload();
  }

  function onSubmit() {
    startTransition(async () => {
      try {
        setError(null);
        await saveMember(selectedId);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error ? submissionError.message : "Vybraného člena se nepodařilo uložit."
        );
      }
    });
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-shell" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="member-gate-title">
        <p className="eyebrow">Úklidový deník</p>
        <h2 id="member-gate-title">Kdo jste?</h2>
        <p className="modal-copy">Toto zařízení si uloží vybraného člena domácnosti do cookie prohlížeče.</p>
        <div className="member-list">
          {members.map((member) => (
            <label
              key={member.id}
              className={`member-option ${selectedId === member.id ? "member-option--selected" : ""}`}
            >
              <input
                type="radio"
                name="member"
                value={member.id}
                checked={selectedId === member.id}
                onChange={() => setSelectedId(member.id)}
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="button" className="primary-button" disabled={isPending || !selectedId} onClick={onSubmit}>
          {isPending ? "Ukládám..." : "Začít uklízet..."}
        </button>
      </div>
    </div>
  );
}
