"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvaScadenza } from "../../actions";

/** Solo admin: corregge la scadenza del portale di questa riga (quella interna si ricalcola da sola). */
export function ScadenzaForm({ id, scadenza }: { id: string; scadenza: string | null; nota: string }) {
  const [d, setD] = useState(scadenza ?? "");
  const [attesa, parti] = useTransition();
  const [ok, setOk] = useState(false);
  const router = useRouter();
  return (
    <form className="flex flex-wrap items-end gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); parti(async () => { await salvaScadenza(id, d); setOk(true); router.refresh(); }); }}>
      <label className="flex flex-col gap-1 text-sm">Scadenza del portale<input type="date" className="input h-10 w-auto" value={d} onChange={(e) => { setD(e.target.value); setOk(false); }} /></label>
      <button className="btn-secondary h-10" disabled={attesa}>Salva la scadenza</button>
      {ok && <span className="text-sm text-ok">Salvata: la scadenza interna è stata ricalcolata.</span>}
    </form>
  );
}
