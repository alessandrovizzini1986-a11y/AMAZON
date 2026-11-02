"use client";

import { useState, useTransition } from "react";
import { aggiornaEsitoOps } from "../../actions";

/** Esito della verifica con gli Ops (aperto / chiuso / giustificato) + nota, salvati subito. */
export function EsitoOps({ id, esito, nota, disabled }: { id: string; esito: string; nota: string; disabled: boolean }) {
  const [e, setE] = useState(esito);
  const [n, setN] = useState(nota);
  const [salvato, setSalvato] = useState("");
  const [pending, start] = useTransition();
  const salva = (nuovoEsito = e, nuovaNota = n) =>
    start(async () => {
      await aggiornaEsitoOps(id, nuovoEsito, nuovaNota);
      setSalvato("salvato ✓");
      window.setTimeout(() => setSalvato(""), 1500);
    });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select className="input h-9 w-36 text-sm" value={e} disabled={disabled || pending} onChange={(ev) => { setE(ev.target.value); salva(ev.target.value, n); }}>
          <option value="aperto">Aperto</option>
          <option value="chiuso">Chiuso</option>
          <option value="giustificato">Giustificato</option>
        </select>
        <span className="text-xs text-ok">{pending ? "…" : salvato}</span>
      </div>
      <input className="input h-9 text-sm" placeholder="Nota (risposta Ops)" value={n} disabled={disabled} onChange={(ev) => setN(ev.target.value)} onBlur={() => n !== nota && salva()} />
    </div>
  );
}
