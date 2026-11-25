"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RiepilogoTarga } from "@/domain/telematica";
import { aggiornaRifornimentiTelematica, scaricaGiornoTelematica } from "../actions";

type Giorno = { giorno: string; scaricato: boolean; definitivo: boolean; errori: number };
/** il numero conta le giornate (un furgone in un giorno) da riscaricare, non i singoli rifornimenti */
const giornate = (n: number) => `${n.toLocaleString("it-IT")} ${n === 1 ? "giornata" : "giornate"} con rifornimenti`;
const num = (x: number | null, dec = 0) => (x === null ? "—" : x.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
type Colonna = { k: keyof RiepilogoTarga; nome: string; dec?: number; testo?: boolean };
const COLONNE: Colonna[] = [
  { k: "targa", nome: "Targa", testo: true }, { k: "station", nome: "Station", testo: true }, { k: "giorniUsati", nome: "Giorni usati" }, { k: "km", nome: "Km totali" }, { k: "kmMedi", nome: "Km al giorno", dec: 1 },
  { k: "guidaOre", nome: "Ore guida", dec: 1 }, { k: "fermoMotoreAccOre", nome: "Fermo a motore acceso (h)", dec: 1 }, { k: "velMax", nome: "Vel. max" }, { k: "rifornimenti", nome: "Rifornimenti" }, { k: "litri", nome: "Litri", dec: 1 }, { k: "litri100km", nome: "L/100 km", dec: 1 },
];

export function MeseClient({ mese, riepilogo, calendario, spazioMb, rifSenzaDettaglio }: { mese: string; riepilogo: RiepilogoTarga[]; calendario: Giorno[]; spazioMb: number; rifSenzaDettaglio: number }) {
  const router = useRouter();
  const [station, setStation] = useState("TUTTE");
  const [ordine, setOrdine] = useState<{ k: keyof RiepilogoTarga; su: boolean }>({ k: "station", su: true });
  const [stato, setStato] = useState<{ fatti: number; totale: number; giorno: string } | null>(null);
  const [avvisi, setAvvisi] = useState<string[]>([]);

  const [rif, setRif] = useState<string | null>(null);
  const dettaglioRifornimenti = async () => {
    let restano = rifSenzaDettaglio, errori = 0;
    try {
      while (restano > 0) { setRif(`Scarico ora, luogo e coordinate dei rifornimenti: restano ${giornate(restano)}…`); const e = await aggiornaRifornimentiTelematica(mese); errori += e.errori; if (e.fatte === 0) break; restano = e.restano; }
      setRif(restano > 0 ? `Non sono riuscito a completare: restano ${giornate(restano)}. Riprova tra un minuto.` : errori ? `Fatto, con ${errori} letture non riuscite.` : null);
    } catch { setRif("Scarico non riuscito. Riprova tra un minuto."); }
    router.refresh();
  };
  const mancanti = calendario.filter((g) => !g.definitivo).map((g) => g.giorno);
  const stations = useMemo(() => [...new Set(riepilogo.map((r) => r.station ?? "Senza station"))].sort(), [riepilogo]);
  const righe = useMemo(() => {
    const f = riepilogo.filter((r) => station === "TUTTE" || (r.station ?? "Senza station") === station);
    const v = (r: RiepilogoTarga) => r[ordine.k];
    return [...f].sort((a, b) => { const x = v(a), y = v(b); const c = typeof x === "number" || typeof y === "number" ? Number(x ?? -1) - Number(y ?? -1) : String(x ?? "~").localeCompare(String(y ?? "~")); return ordine.su ? c : -c; });
  }, [riepilogo, station, ordine]);
  const tot = useMemo(() => ({ km: righe.reduce((a, r) => a + r.km, 0), litri: righe.reduce((a, r) => a + r.litri, 0), usati: righe.filter((r) => r.giorniUsati > 0).length }), [righe]);

  const scarica = async (giorni: string[]) => {
    setAvvisi([]);
    const problemi: string[] = [];
    for (let i = 0; i < giorni.length; i++) {
      setStato({ fatti: i, totale: giorni.length, giorno: giorni[i] });
      try { const e = await scaricaGiornoTelematica(giorni[i]); if (e.errori) problemi.push(`${giorni[i].slice(8)}/${giorni[i].slice(5, 7)}: ${e.errori} letture non riuscite${e.messaggi[0] ? ` (${e.messaggi[0]})` : ""}`); }
      catch { problemi.push(`${giorni[i].slice(8)}/${giorni[i].slice(5, 7)}: scarico non riuscito`); }
    }
    setStato(null); setAvvisi(problemi); router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="month" className="input w-auto" value={mese} onChange={(e) => e.target.value && router.push(`/telematica/mese?mese=${e.target.value}`)} aria-label="Mese" />
          <button className="btn-primary" disabled={!!stato || mancanti.length === 0} onClick={() => scarica(mancanti)}>{mancanti.length ? `Scarica i ${mancanti.length} giorni che mancano` : "Mese già scaricato"}</button>
          <button className="btn-secondary" disabled={!!stato || calendario.length === 0} onClick={() => scarica(calendario.map((g) => g.giorno))}>Riscarica tutto il mese</button>
          <a className="btn-secondary" href={`/api/telematica/mese?mese=${mese}`}>Scarica Excel</a>
          {rifSenzaDettaglio > 0 && <button className="btn-secondary" disabled={!!stato || (!!rif && rif.startsWith("Scarico ora"))} onClick={dettaglioRifornimenti}>Scarica ora, luogo e coordinate di {giornate(rifSenzaDettaglio)}</button>}
        </div>
        {rif && <p className="text-sm text-slate-700">{rif}</p>}
        {stato && <p className="text-sm text-slate-700">Sto scaricando il giorno {stato.giorno.slice(8)}/{stato.giorno.slice(5, 7)} ({stato.fatti + 1} di {stato.totale}). Lascia aperta la pagina: ogni giorno richiede circa mezzo minuto.</p>}
        <div className="flex flex-wrap gap-1" aria-label="Giorni scaricati">
          {calendario.map((g) => (
            <span key={g.giorno} title={g.definitivo ? "Scaricato" : g.scaricato ? (g.errori ? "Scaricato con errori" : "Scaricato a giornata non finita") : "Da scaricare"}
              className={`inline-flex h-7 w-7 items-center justify-center rounded text-xs ${g.definitivo ? "bg-emerald-100 text-emerald-800" : g.scaricato ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{Number(g.giorno.slice(8))}</span>
          ))}
        </div>
        <p className="text-xs text-slate-500">Verde: giorno scaricato. Giallo: scaricato prima che la giornata finisse, o con errori. Grigio: da scaricare. Ogni notte il sito scarica da solo il giorno prima. Spazio usato nel database da tutta la telematica: {spazioMb.toLocaleString("it-IT")} MB su 500 disponibili; il dettaglio di guide e soste si cancella da solo dopo 120 giorni, i numeri restano.</p>
        {avvisi.map((a) => <p key={a} className="text-sm text-amber-700">{a}</p>)}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select className="input w-auto" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station">
          <option value="TUTTE">Tutte le station</option>
          {stations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-slate-600">{righe.length} targhe · {tot.usati} usate nel mese · {num(tot.km)} km · {num(tot.litri)} litri</span>
      </div>

      {riepilogo.length === 0 ? (
        <p className="card p-4 text-sm text-slate-600">Per questo mese non c&apos;è ancora niente. Premi «Scarica i giorni che mancano».</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                {COLONNE.map((c) => (
                  <th key={c.k} className={`cursor-pointer whitespace-nowrap px-3 py-2 ${c.testo ? "" : "text-right"}`} onClick={() => setOrdine((o) => ({ k: c.k, su: o.k === c.k ? !o.su : !!c.testo }))}>{c.nome}{ordine.k === c.k ? (ordine.su ? " ▲" : " ▼") : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={`${r.fonte}|${r.targa}`} className="border-t border-slate-100">
                  {COLONNE.map((c) => <td key={c.k} className={`whitespace-nowrap px-3 py-1.5 ${c.testo ? (c.k === "targa" ? "font-medium" : "") : "text-right tabular-nums"}`}>{c.testo ? String(r[c.k] ?? "—") : num(r[c.k] as number | null, c.dec)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
