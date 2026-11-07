"use client";

import { useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { fogliDelFile, matriceFoglio } from "@/lib/fatture/xlsxStream";
import { leggiFattureAld, leggiFattureArval, leggiFattureAvis, leggiFattureEuropcar, leggiListaAttivi, leggiListaCessati, type Matrice } from "@/lib/flotta/leggi";
import type { CessatoRiga, FatturaRiga, ListaRiga } from "@/domain/flotta/riconcilia";
import { anteprimaFlotta, applicaFlotta, salvaCanoniStimati, type AnteprimaFlotta } from "./actions";

type Esito = Awaited<ReturnType<typeof applicaFlotta>>;
const eur = (v: number | null) => (v === null ? "—" : v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const LETTORI: [FatturaRiga["fornitore"], (m: Matrice) => FatturaRiga[]][] = [["ALD", leggiFattureAld], ["ARVAL", leggiFattureArval], ["AVIS", leggiFattureAvis], ["EUROPCAR", leggiFattureEuropcar]];

function Tabella({ titolo, col, righe, vuoto }: { titolo: string; col: string[]; righe: (string | number | null)[][]; vuoto?: string }) {
  return (
    <details className="card p-4" open={righe.length > 0 && righe.length <= 20}>
      <summary className="cursor-pointer font-semibold">{titolo} ({righe.length})</summary>
      {righe.length ? (
        <div className="mt-2 max-h-96 overflow-auto"><table className="table-base text-sm">
          <thead><tr>{col.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{righe.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "text-right font-mono" : ""}>{typeof v === "number" ? eur(v) : v ?? "—"}</td>)}</tr>)}</tbody>
        </table></div>
      ) : <p className="mt-1 text-sm text-ink-muted">{vuoto ?? "Nessuna."}</p>}
    </details>
  );
}

export function AggiornaClient() {
  const [lista, setLista] = useState<{ nome: string; attivi: ListaRiga[]; cessati: CessatoRiga[] } | null>(null);
  const [fatture, setFatture] = useState<{ nome: string; fornitore: string; righe: FatturaRiga[] }[]>([]);
  const [preferisciSito, setPreferisciSito] = useState(true);
  const [ante, setAnte] = useState<AnteprimaFlotta | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [manuali, setManuali] = useState<Record<string, string>>({});
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [msg, setMsg] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async (files: File[]) => {
    setLavoro(true); setErrore(null); setAnte(null); setEsito(null);
    const out: string[] = [];
    for (const f of files) {
      try {
        setStato(`Lettura di ${f.name}…`);
        const buf = await f.arrayBuffer();
        const fogli = await fogliDelFile(buf);
        const trova = (n: string) => fogli.find((x) => x.trim().toLowerCase() === n);
        if (trova("attivi") && trova("cessati")) {
          const attivi = leggiListaAttivi(await matriceFoglio(buf, trova("attivi")!));
          const cessati = leggiListaCessati(await matriceFoglio(buf, trova("cessati")!));
          setLista({ nome: f.name, attivi, cessati });
          out.push(`${f.name}: Lista Targhe, ${attivi.length} attivi, ${cessati.length} righe nei Cessati`);
          continue;
        }
        let best: { fornitore: FatturaRiga["fornitore"]; righe: FatturaRiga[] } | null = null;
        for (const nome of fogli.slice(0, 6)) {
          const m = await matriceFoglio(buf, nome);
          for (const [fornitore, leggi] of LETTORI) {
            try { const r = leggi(m); if (r.length && (!best || r.length > best.righe.length)) best = { fornitore, righe: r }; } catch { /* non è questo fornitore */ }
          }
        }
        if (!best) throw new Error("non è una Lista Targhe né una fattura ALD, Arval, Avis o Europcar riconosciuta");
        setFatture((x) => [...x.filter((y) => y.nome !== f.name), { nome: f.name, fornitore: best!.fornitore, righe: best!.righe }]);
        out.push(`${f.name}: fatture ${best.fornitore}, ${best.righe.length} righe`);
      } catch (e) { out.push(`${f.name}: ${(e as Error).message}`); }
    }
    setStato(""); setMsg(out); setLavoro(false);
  };

  const payload = () => ({
    lista: lista!.attivi, cessati: lista!.cessati, fatture: fatture.flatMap((f) => f.righe), preferisciSito,
    fonte: [lista!.nome, ...fatture.map((f) => f.nome)].join(", "),
  });
  const anteprima = async () => {
    setLavoro(true); setErrore(null); setEsito(null); setStato("Confronto con il sito…");
    try { setAnte(await anteprimaFlotta(payload())); } catch (e) { setErrore((e as Error).message); } finally { setLavoro(false); setStato(""); }
  };
  const applica = async () => {
    if (!ante || !confirm(`Applico sul sito: ${ante.conteggi.crea} nuove, ${ante.conteggi.riattiva} riattivate, ${ante.conteggi.aggiorna} aggiornate, ${ante.conteggi.dismetti} dismesse. Procedo?`)) return;
    setLavoro(true); setErrore(null); setStato("Scrittura sul sito in una transazione…");
    try {
      const r = await applicaFlotta(payload(), ante.firma);
      setEsito(r); setScelte(new Set(r.stime.filter((s) => s.canone !== null).map((s) => s.targa))); setAnte(null);
    } catch (e) { setErrore((e as Error).message); } finally { setLavoro(false); setStato(""); }
  };
  const salvaStime = async () => {
    if (!esito) return;
    const num = (t: string) => Number((manuali[t] ?? "").replace(/\./g, "").replace(",", "."));
    const s = esito.stime.filter((x) => scelte.has(x.targa)).map((x) => (x.canone !== null ? { targa: x.targa, canone: x.canone, base: x.base } : { targa: x.targa, canone: num(x.targa), base: "canone inserito a mano" })).filter((x) => x.canone > 0);
    setLavoro(true);
    try { await salvaCanoniStimati(s); setEsito({ ...esito, stime: esito.stime.filter((x) => !scelte.has(x.targa)) }); setMsg([`${s.length} canoni stimati salvati: nella nota del mezzo c'è da dove vengono.`]); }
    catch (e) { setErrore((e as Error).message); } finally { setLavoro(false); }
  };

  const c = ante?.conteggi;
  return (
    <div className="flex flex-col gap-5">
      <section className="card p-4 md:p-5">
        <ol className="flex flex-col gap-1 text-sm">
          <li className={lista ? "text-ok" : ""}>{lista ? "✓" : "1."} Lista Targhe (fogli Attivi e Cessati){lista && ` — ${lista.nome}`}</li>
          <li className={fatture.length ? "text-ok" : "text-ink-muted"}>{fatture.length ? "✓" : "2."} Fatture dei noleggiatori (facoltative: ALD YTD, Arval mese, Avis YTD, Europcar mese){fatture.length > 0 && ` — ${fatture.map((f) => `${f.fornitore} (${f.righe.length})`).join(", ")}`}</li>
        </ol>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={preferisciSito} onChange={(e) => setPreferisciSito(e.target.checked)} />
          <span>Se una targa non ha fattura, <b>tieni il canone già sul sito</b> invece della tariffa della Lista (consigliato: spesso viene da una fattura di prima)</span>
        </label>
      </section>

      <Dropzone titolo="File della flotta" aiuto="flotta.aggiorna.file" multiple accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={carica}
        testo={<>Trascina la <b>Lista Targhe</b> e, se le hai, le <b>fatture dei noleggiatori</b>. Il tipo si riconosce dal contenuto; i file non si salvano.</>} />
      {stato && <p className="text-sm text-ink-muted">{stato}</p>}
      {msg.length > 0 && <ul className="text-sm text-ink-muted">{msg.map((m) => <li key={m}>{m}</li>)}</ul>}
      {errore && <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={!lista || lavoro} onClick={anteprima}>Anteprima delle modifiche</button><Aiuto k="flotta.aggiorna.anteprima" />
        {ante && <><button type="button" className="btn-primary" disabled={lavoro || ante.senzaStation.length > 0} onClick={applica}>Applica sul sito</button><Aiuto k="flotta.aggiorna.applica" /></>}
      </div>

      {ante && c && (
        <section className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[["Nuove", c.crea], ["Riattivate", c.riattiva], ["Aggiornate", c.aggiorna], ["Da dismettere", c.dismetti], ["Da verificare", c.daVerificare]].map(([l, n]) => (
              <div key={l} className="card p-3"><div className="text-xs text-ink-muted">{l}</div><div className="text-2xl font-bold">{n}</div></div>
            ))}
          </div>
          {ante.senzaStation.length > 0 && <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">Station non presenti sul sito: {ante.senzaStation.join(", ")}. Aggiungile in Configurazione prima di applicare.</p>}
          <Tabella titolo="Nuove" col={["Targa", "Station", "Stato", "Società", "Modello", "Inizio", "Canone €/mese", "Da dove"]} righe={ante.crea.map((x) => [x.targa, x.station, x.stato, x.societa, x.modello, x.inizio, x.canone, x.fonte])} />
          <Tabella titolo="Riattivate" col={["Targa", "Station", "Cambi"]} righe={ante.riattiva.map((x) => [x.targa, x.station, x.cambi])} />
          <Tabella titolo="Aggiornate" col={["Targa", "Station", "Cambi"]} righe={ante.aggiorna.map((x) => [x.targa, x.station, x.cambi])} />
          <Tabella titolo="Da dismettere (sono nei Cessati)" col={["Targa", "Station", "Stato", "Società", "Cessata il"]} righe={ante.dismetti.map((x) => [x.targa, x.station, x.stato, x.societa, x.fine])} />
          <Tabella titolo="Da verificare (attive sul sito, né in Attivi né in Cessati: restano come sono)" col={["Targa", "Station", "Stato", "Motivo"]} righe={ante.daVerificare.map((x) => [x.targa, x.station, x.stato, x.motivo])} />
          <Tabella titolo="Anomalie da contestare o controllare (non cambiano il sito)" col={["Tipo", "Targa", "Fornitore", "Mese", "Importo", "Dettaglio"]} righe={ante.dettaglioAnomalie.map((a) => [a.tipo, a.targa, a.fornitore, a.mese, a.importo, a.dettaglio])} />
        </section>
      )}

      {esito && (
        <section className="flex flex-col gap-3">
          <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">✓ Flotta aggiornata. Nomi uniformati su {esito.nomi} veicoli.</p>
          <div className="card p-4 text-sm">
            <h2 className="mb-2 text-[19px] font-semibold">Controllo dopo la scrittura</h2>
            <ul className="flex flex-col gap-1">
              <li className={esito.controlli.listaNonSulSito.length ? "text-danger" : "text-ok"}>Targhe della Lista non attive sul sito: {esito.controlli.listaNonSulSito.length || "nessuna"} {esito.controlli.listaNonSulSito.join(", ")}</li>
              <li className={esito.controlli.sitoNonInLista.length ? "text-warn" : "text-ok"}>Attive sul sito ma non in Lista: {esito.controlli.sitoNonInLista.length || "nessuna"} {esito.controlli.sitoNonInLista.join(", ")}</li>
              <li className={esito.controlli.doppie.length ? "text-danger" : "text-ok"}>Targhe doppie: {esito.controlli.doppie.length || "nessuna"} {esito.controlli.doppie.join(", ")}</li>
              <li className={esito.controlli.sostitutiviConCanone.length ? "text-danger" : "text-ok"}>Sostitutivi con canone (non si pagano): {esito.controlli.sostitutiviConCanone.length || "nessuno"}</li>
              <li className={esito.controlli.attiviSenzaCanone.length ? "text-warn" : "text-ok"}>Attivi senza canone: {esito.controlli.attiviSenzaCanone.length || "nessuno"}</li>
            </ul>
          </div>
          {esito.stime.length > 0 && (
            <div className="card p-4 text-sm">
              <h2 className="mb-1 text-[19px] font-semibold">Canoni stimati per gli attivi senza canone</h2>
              <p className="mb-2 text-ink-muted">Mediana dei mezzi uguali (stessa società, modello e contratto). Scegli quali salvare: la prima fattura li sostituisce.</p>
              <div className="max-h-96 overflow-auto"><table className="table-base">
                <thead><tr><th /><th>Targa</th><th>Società</th><th>Modello</th><th>Tipo</th><th className="text-right">€/mese</th><th>Base</th></tr></thead>
                <tbody>{esito.stime.map((s) => (
                  <tr key={s.targa}><td><input type="checkbox" className="h-4 w-4" disabled={s.canone === null && !(Number((manuali[s.targa] ?? "").replace(",", ".")) > 0)} checked={scelte.has(s.targa)} aria-label={`Salva il canone di ${s.targa}`}
                    onChange={(e) => { const n = new Set(scelte); if (e.target.checked) n.add(s.targa); else n.delete(s.targa); setScelte(n); }} /></td>
                    <td>{s.targa}</td><td>{s.societa}</td><td>{s.modello}</td><td>{s.tipo}</td><td className="text-right font-mono">{s.canone !== null ? eur(s.canone) : (
                      <input className="input h-9 w-24 text-right" inputMode="decimal" placeholder="€/mese" aria-label={`Canone di ${s.targa}`} value={manuali[s.targa] ?? ""}
                        onChange={(e) => { setManuali({ ...manuali, [s.targa]: e.target.value }); const n = new Set(scelte); if (Number(e.target.value.replace(",", ".")) > 0) n.add(s.targa); else n.delete(s.targa); setScelte(n); }} />
                    )}</td><td className="text-xs">{s.canone === null ? "nessun mezzo simile: scrivilo a mano (es. dal preventivo)" : s.base}</td></tr>
                ))}</tbody>
              </table></div>
              <button type="button" className="btn-primary mt-3" disabled={lavoro || scelte.size === 0} onClick={salvaStime}>Salva {scelte.size} canoni stimati</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
