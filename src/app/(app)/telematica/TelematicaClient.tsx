"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { provaCollegamento } from "./actions";

type Fonte = "TARGA" | "FLOTTAWEB";
type Prova = { fonte: Fonte; chiamata: string; cosa: string; ok: boolean; stato: number | null; elementi: number | null; errore: string | null; eseguitaIl?: string };
const NOMI: Record<Fonte, string> = { TARGA: "Targa Telematics", FLOTTAWEB: "FlottaWeb" };
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "adesso");

export function TelematicaClient({ pronti, prove }: { pronti: Record<Fonte, boolean>; prove: Prova[] }) {
  const [righe, setRighe] = useState(prove);
  const [inCorso, setInCorso] = useState<Fonte | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [, parti] = useTransition();

  const prova = (f: Fonte) => {
    setInCorso(f); setErrore(null);
    parti(async () => {
      try { const esiti = await provaCollegamento(f); setRighe((r) => [...r.filter((x) => x.fonte !== f), ...esiti]); }
      catch { setErrore("La prova non è partita. Riprova tra un minuto."); }
      finally { setInCorso(null); }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {(Object.keys(NOMI) as Fonte[]).map((f) => {
        const mie = righe.filter((r) => r.fonte === f);
        return (
          <section key={f} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{NOMI[f]}</h2>
              {pronti[f] ? (
                <button className="btn-primary" disabled={inCorso !== null} onClick={() => prova(f)}>{inCorso === f ? "Sto provando…" : "Prova il collegamento"}</button>
              ) : (
                <Link href="/portali" className="btn-secondary">Inserisci utente e password</Link>
              )}
            </div>
            {!pronti[f] && <p className="text-sm text-slate-600">Vai in «Portali fornitori» e aggiungi un portale chiamato <b>{NOMI[f]}</b> con il tuo utente e la tua password. La password viene cifrata e non la vede nessuno.</p>}
            {mie.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Lettura</th><th className="py-1 pr-3">Esito</th><th className="py-1 pr-3">Elementi</th><th className="py-1">Quando</th></tr></thead>
                  <tbody>
                    {mie.map((r) => (
                      <tr key={r.chiamata} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{r.cosa}</td>
                        <td className={`py-1.5 pr-3 ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.ok ? "Riuscita" : r.errore ?? "Non riuscita"}</td>
                        <td className="py-1.5 pr-3">{r.elementi ?? "—"}</td>
                        <td className="py-1.5 text-slate-500">{quando(r.eseguitaIl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {errore && <p className="text-sm text-red-700">{errore}</p>}
    </div>
  );
}
