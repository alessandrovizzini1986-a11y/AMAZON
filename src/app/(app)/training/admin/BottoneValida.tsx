"use client";

import { useState, useTransition } from "react";
import { valida } from "../actions";

export function BottoneValida({ userId, activityId, validato }: { userId: string; activityId: string; validato: boolean }) {
  const [v, setV] = useState(validato);
  const [lavoro, start] = useTransition();
  return (
    <button type="button" disabled={lavoro} className={v ? "btn-secondary border-ok text-ok" : "btn-primary"}
      onClick={() => { const n = !v; setV(n); start(async () => { try { await valida({ userId, activityId, valido: n }); } catch { setV(!n); } }); }}>
      {v ? "✓ Validato" : "Valida"}
    </button>
  );
}
