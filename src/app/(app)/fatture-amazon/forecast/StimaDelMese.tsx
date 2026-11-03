import Link from "next/link";
import type { RigaStimaMese } from "@/domain/forecast/stimaMese";

const MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const eur = (x: number) => (Math.round(x) || 0).toLocaleString("it-IT");
const pct = (x: number) => `${(x * 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })} %`;

/** Stima del fatturato del mese: fatturato già arrivato + previsto dal forecast per il resto, per DS. */
export function StimaDelMese({ stima }: { stima: RigaStimaMese[] }) {
  const mesi = [...new Set(stima.map((x) => x.mese))];
  const ds = [...new Set(stima.map((x) => x.ds))];
  const nessunFatturato = !stima.some((x) => x.fatturato);
  return (
    <section className="card p-4 md:p-5" aria-label="Stima del fatturato del mese">
      <h2 className="mb-1 text-[19px] font-semibold">Stima del fatturato del mese</h2>
      <p className="mb-3 text-sm text-ink-muted">
        <b>Fatturato</b> = righe delle fatture già sul sito (tutte le voci). <b>Previsto</b> = forecast in uso per le settimane che quella DS non ha ancora in fattura (rotte + extra previsti, niente incentivi una tantum).
        Le settimane a cavallo di due mesi si dividono per giorni. <b>Giorni senza dati</b> = né fatture né forecast next (con solo il same day il previsto è parziale): lì la stima è incompleta.
      </p>
      {nessunFatturato && <p className="mb-3 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Sul sito non ci sono ancora righe di fatturato: carica lo storico in <Link className="underline" href="/fatture-amazon/allinea">Allinea e storico → Carica storico righe</Link> (file AGGREGATO), altrimenti la stima è solo il previsto.</p>}
      <div className="flex flex-col gap-5">
        {mesi.map((m) => {
          const r = (d: string) => stima.find((x) => x.mese === m && x.ds === d)!;
          const tot = (k: "fatturato" | "previsto" | "totale") => stima.filter((x) => x.mese === m).reduce((t, x) => t + x[k], 0);
          const ap = stima.filter((x) => x.mese === m);
          const apTot = ap.some((x) => x.annoPrima !== null) ? ap.reduce((t, x) => t + (x.annoPrima ?? 0), 0) : null;
          const T = tot("totale"), F = tot("fatturato");
          const righe: [string, (d: string) => string, string][] = [
            ["Fatturato", (d) => eur(r(d).fatturato), eur(F)],
            ["Previsto", (d) => eur(r(d).previsto), eur(tot("previsto"))],
            ["Totale stimato", (d) => eur(r(d).totale), eur(T)],
            ["Quota già fatturata", (d) => pct(r(d).quotaCerta), T ? pct(F / T) : "—"],
            ["Giorni senza dati", (d) => String(r(d).giorniSenza), ""],
            ...(apTot !== null ? [["Stesso mese anno prima", (d: string) => eur(r(d).annoPrima ?? 0), eur(apTot)] as [string, (d: string) => string, string],
              ["Variazione sull'anno prima", (d: string) => { const a = r(d).annoPrima; return a ? `${((r(d).totale - a) / a * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, signDisplay: "always" })} %` : "—"; }, apTot ? `${((T - apTot) / apTot * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, signDisplay: "always" })} %` : "—"] as [string, (d: string) => string, string]] : []),
          ];
          return (
            <div key={m}>
              <h3 className="mb-2 font-semibold">{MESI[Number(m.slice(5))]} {m.slice(0, 4)} — {eur(T)} € stimati {T ? <span className="text-sm font-normal text-ink-muted">({pct(F / T)} già fatturato)</span> : null}</h3>
              <div className="overflow-x-auto"><table className="table-base text-sm">
                <thead><tr><th>Voce</th>{ds.map((d) => <th key={d} className="text-right">{d}</th>)}<th className="text-right">Totale</th></tr></thead>
                <tbody>{righe.map(([l, f, t]) => <tr key={l} className={l === "Totale stimato" ? "font-semibold" : ""}><td>{l}</td>{ds.map((d) => <td key={d} className={`text-right font-mono ${l === "Giorni senza dati" && r(d).giorniSenza ? "bg-warn-soft text-warn" : ""}`}>{f(d)}</td>)}<td className="text-right font-mono">{t}</td></tr>)}</tbody>
              </table></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
