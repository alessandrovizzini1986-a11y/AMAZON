"use client";

import { useState, useTransition } from "react";
import { eliminaRiga } from "./actions";

/** Pulsante con conferma: elimina una riga e ricalcola i totali della fattura. */
export function EliminaRiga({ id, descrizione, importo }: { id: string; descrizione: string; importo: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className="btn-danger px-2 py-1 text-xs" disabled={pending}
        onClick={() => { if (window.confirm(`Eliminare la riga "${descrizione}" da ${importo} €?\nI totali della fattura si ricalcolano. Non si annulla dal sito (resta traccia nell'Audit).`)) start(async () => { try { await eliminaRiga(id); } catch (e) { setErr((e as Error).message); } }); }}>
        {pending ? "Elimino…" : "Elimina"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
