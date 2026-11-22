"use client";

import { useEffect, useMemo, useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { SelettoreMese } from "@/components/SelettoreMese";
import { elencoFile, salvaFile } from "@/lib/presenze/archivioLocale";
import { riconosci } from "@/lib/presenze/riconosci";
import { caricaDatiMese } from "@/lib/presenze/carica";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { scarica } from "@/lib/presenze/excelUtil";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { isPresenzeGls, leggiPresenzeGls, mesePresenzeGls, type PresenzeGls } from "@/domain/gls/presenze";
import type { Festivo } from "@/domain/costi/festivi";
import type { ValorePerData } from "@/domain/costi/tariffe";
import { ETICHETTE_META, NOME_FILE_STIMA, PERCORSO_FILE_STIMA, PERCORSO_PRESENZE_GLS, VOCI_COSTO, VOCI_META, costiOraBase, giorniDelMese, nomePresenzeGls, oreMetaGls, oreMetaStation, totaliMeta, type CostiOra, type OreMeta, type StimaMeta } from "@/domain/costi/metaMese";
import { excelMetaMese, nomeFoglioMeta } from "@/lib/costi/excelMetaMese";
import { STATION_ORDINE } from "@/lib/costi/excelStimaPersonale";

type Props = { mese: string; oggi: string; canRun: boolean; tariffe: ValorePerData[]; festivi: Festivo[] };
type Ris = { sic: Record<string, OreMeta>; std: Record<string, OreMeta>; glsSic: OreMeta | null; glsStd: OreMeta | null; sesto: number; giorno: number; mancano: string[] };

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const ore = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });
const it = (m: string) => m.split("-").reverse().join("/");
const CHIAVE = "fleetdsp.metaMese.costiOra";

export function MetaMeseClient(p: Props) {
  const gMese = giorniDelMese(p.mese);
  // giorno proposto: ieri se il mese è quello in corso, altrimenti l'ultimo del mese
  const proposto = p.oggi.startsWith(p.mese) ? Math.max(1, Number(p.oggi.slice(8)) - 1) : gMese;
  const [giorno, setGiorno] = useState(proposto);
  const [archivio, setArchivio] = useState<{ station: string; tipo: string; nome: string }[]>([]);
  const [gls, setGls] = useState<{ nome: string; dati: PresenzeGls } | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [msg, setMsg] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [ris, setRis] = useState<Ris | null>(null);
  const base = useMemo(() => costiOraBase(p.tariffe, `${p.mese}-01`), [p.tariffe, p.mese]);
  const [costi, setCosti] = useState<CostiOra>(base);

  useEffect(() => { setGiorno(proposto); setRis(null); setGls(null); }, [p.mese]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // i costi orari cambiati a mano si ricordano su questo PC; le trasferte seguono sempre le tariffe del sito
    try { const s = JSON.parse(localStorage.getItem(CHIAVE) ?? "null"); if (s) setCosti({ ...base, ...s, trasfOrd: base.trasfOrd, trasfDom: base.trasfDom, trasfGls: base.trasfGls }); else setCosti(base); } catch { setCosti(base); }
  }, [base]);

  const aggiorna = async () => {
    const f = await elencoFile().catch(() => []);
    setArchivio(f.filter((x) => x.kind === "TRACKING" && x.mesi.includes(p.mese)).map((x) => ({ station: x.station!, tipo: x.tipo!, nome: x.nome })));
  };
  useEffect(() => { aggiorna(); }, [p.mese]); // eslint-disable-line react-hooks/exhaustive-deps

  const aggiungi = async (files: File[]) => {
    setLavoro(true); setErrore(null); setRis(null);
    const out: string[] = [];
    for (const f of files) {
      try {
        const g = await workbookToGrids(await f.arrayBuffer());
        if (isPresenzeGls(g)) {
          if (/magazzino/i.test(f.name)) throw new Error("è il file presenze GLS del Magazzino: per la stima serve solo quello Delivery");
          const m = mesePresenzeGls(g);
          if (m !== p.mese) throw new Error(`è il file presenze GLS di ${m ? it(m) : "un mese non riconosciuto"}, serve quello di ${it(p.mese)}`);
          setGls({ nome: f.name, dati: leggiPresenzeGls(g, m) });
          out.push(`${f.name}: presenze GLS di ${it(m)}`);
        } else {
          const r = await riconosci(f);
          if (r.kind !== "TRACKING") throw new Error("non è un tracking né il file presenze GLS");
          await salvaFile(r);
          out.push(`${f.name}: tracking ${r.station} ${r.tipo}, mesi ${r.mesi.map(it).join(", ")}`);
        }
      } catch (e) { out.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setMsg(out); await aggiorna(); setLavoro(false);
  };

  const presenti = (tipo: string) => new Set(archivio.filter((a) => a.tipo === tipo).map((a) => a.station));
  const sicP = presenti("SIC"), stdP = presenti("STD");

  const calcola = async () => {
    setLavoro(true); setErrore(null); setRis(null);
    try {
      const [anno, mm] = p.mese.split("-").map(Number);
      const finoA = `${p.mese}-${String(giorno).padStart(2, "0")}`;
      const dati = await caricaDatiMese(p.mese, setStato);
      const sic: Record<string, OreMeta> = {}, std: Record<string, OreMeta> = {};
      let sesto = 0;
      for (const t of dati.tracking) {
        setStato(`Calcolo ${t.station} ${t.tipo}…`);
        const { lavoratori } = leggiLavoratori(t.sheets, anno, mm, true);
        // i dispatcher dipendenti non prendono la trasferta in busta (come nella stima di fine mese)
        const r = oreMetaStation(t.station, lavoratori, p.festivi, p.tariffe, { mese: p.mese, finoA, dispatcherTrasferta: t.tipo !== "SIC" });
        (t.tipo === "SIC" ? sic : std)[t.station] = r.ore; sesto += r.sestoFestivo;
      }
      if (!Object.keys(sic).length && !Object.keys(std).length) throw new Error(`nessun tracking di ${it(p.mese)} nell'archivio: trascinali qui sopra`);
      const mancano = [...STATION_ORDINE.filter((s) => !sic[s]).map((s) => `${s} SIC`), ...STATION_ORDINE.filter((s) => !std[s]).map((s) => `${s} STD`), ...(gls ? [] : ["presenze GLS"])];
      setRis({ sic, std, glsSic: gls ? oreMetaGls(gls.dati, "SIC", p.festivi, p.tariffe, finoA) : null, glsStd: gls ? oreMetaGls(gls.dati, "STD", p.festivi, p.tariffe, finoA) : null, sesto, giorno, mancano });
      setMsg(dati.avvisi);
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); }
    setStato(""); setLavoro(false);
  };

  const stima: StimaMeta | null = ris ? { mese: p.mese, giorno: ris.giorno, giorniMese: gMese, costi, sic: ris.sic, std: ris.std, glsSic: ris.glsSic, glsStd: ris.glsStd } : null;
  const tot = stima ? totaliMeta(stima) : null;
  const cambia = (v: keyof CostiOra, s: string) => {
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    const nuovi = { ...costi, [v]: n };
    setCosti(nuovi);
    try { localStorage.setItem(CHIAVE, JSON.stringify(Object.fromEntries(Object.entries(nuovi).filter(([k]) => !k.startsWith("trasf"))))); } catch { /* ok */ }
  };

  const tabella = (titolo: string, per: Record<string, OreMeta>, voci: readonly (keyof OreMeta)[], glsOre: OreMeta | null) => (
    <section className="card p-4 md:p-5">
      <h2 className="text-[19px] font-semibold">{titolo}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="table-base text-sm">
          <thead><tr><th>Voce</th><th className="text-right">Totale</th>{STATION_ORDINE.map((s) => <th key={s} className="text-right">{s}</th>)}<th className="text-right">GLS</th></tr></thead>
          <tbody>
            {voci.map((v) => (
              <tr key={v}>
                <td>{ETICHETTE_META[v]}</td>
                <td className="text-right font-semibold">{ore(STATION_ORDINE.reduce((a, s) => a + (per[s]?.[v] ?? 0), 0))}</td>
                {STATION_ORDINE.map((s) => <td key={s} className="text-right">{per[s] ? ore(per[s][v]) : "—"}</td>)}
                <td className="text-right">{glsOre ? ore(glsOre[v]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-wrap items-end gap-4 p-4">
        <SelettoreMese value={p.mese} href="/costi/meta-mese" />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-muted">Stima fino al giorno</span>
          <input type="number" min={1} max={gMese} className="input h-11 w-24" value={giorno} onChange={(e) => { const n = Math.min(gMese, Math.max(1, Number(e.target.value) || 1)); setGiorno(n); setRis(null); }} />
        </label>
        <p className="max-w-md text-sm text-ink-muted">Metti l&apos;ultimo giorno che i tracking coprono per intero (di solito la domenica prima del terzo lunedì). Il mese ha {gMese} giorni.</p>
      </section>

      <section className="card p-4 text-sm">
        <h2 className="text-[19px] font-semibold">Cosa serve</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {(["SIC", "STD"] as const).map((t) => { const pr = t === "SIC" ? sicP : stdP; const manca = STATION_ORDINE.filter((s) => !pr.has(s)); return (
            <li key={t} className="flex items-start gap-2"><span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${manca.length ? (pr.size ? "bg-warn" : "bg-danger") : "bg-ok"}`} aria-hidden />
              <span>Tracking {t} di {it(p.mese)}: {pr.size} su {STATION_ORDINE.length}{manca.length ? ` — mancano ${manca.join(", ")}` : ""}</span></li>
          ); })}
          <li className="flex items-start gap-2"><span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${gls ? "bg-ok" : "bg-warn"}`} aria-hidden /><span>Presenze GLS di {it(p.mese)} {gls ? `— ${gls.nome}` : "— non caricate: la colonna GLS resta vuota"}</span></li>
        </ul>
        <p className="mt-2 text-ink-muted">Il file presenze GLS è <b>{nomePresenzeGls(p.mese)}</b> e si trova qui: <span className="font-mono text-[13px]">{PERCORSO_PRESENZE_GLS.join(" › ")}</span>. Serve solo il file <b>Delivery</b>, non il Magazzino.</p>
      </section>

      <Dropzone titolo="Tracking del mese e presenze GLS" multiple accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={aggiungi}
        testo={<>Trascina qui i <b>tracking SIC e STD</b> già verificati (se li hai caricati in Presenze sono già qui) e il file <b>presenze GLS Delivery</b> di {it(p.mese)}. Il tipo si riconosce dal contenuto.</>} />
      {msg.length > 0 && <ul className="text-sm text-ink-muted">{msg.map((m) => <li key={m}>{m}</li>)}</ul>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={lavoro || !p.canRun || archivio.length === 0} onClick={calcola}>{lavoro ? stato || "Lavoro…" : `Calcola la stima al ${giorno}/${p.mese.slice(5)}`}</button>
        {!p.canRun && <span className="text-sm text-ink-muted">Il tuo ruolo può solo guardare.</span>}
        {errore && <p role="alert" className="text-sm text-danger">{errore}</p>}
      </div>

      {ris && stima && tot && (
        <>
          {ris.mancano.length > 0 && <p role="alert" className="card border-warn p-3 text-sm"><b>Stima incompleta</b>: mancano {ris.mancano.join(", ")}. I totali qui sotto non li comprendono.</p>}
          <section className="card p-4 md:p-5">
            <h2 className="text-[19px] font-semibold">Totali stimati di {it(p.mese)}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="table-base text-sm">
                <thead><tr><th /><th className="text-right">Fino al {ris.giorno}</th><th className="text-right">Mese intero ({gMese} gg)</th><th className="text-right">Mese intero /3 ×4</th></tr></thead>
                <tbody>
                  <tr><td>Amazon SIC (parte variabile, senza Standard)</td><td className="text-right">{eur(tot.sic.alGiorno)}</td><td className="text-right font-semibold">{eur(tot.sic.mese)}</td><td className="text-right">{eur(tot.sic.quattroTerzi)}</td></tr>
                  <tr><td>Amazon STD</td><td className="text-right">{eur(tot.std.alGiorno)}</td><td className="text-right font-semibold">{eur(tot.std.mese)}</td><td className="text-right">{eur(tot.std.quattroTerzi)}</td></tr>
                  <tr><td>GLS (dipendenti {eur(tot.glsSic)} + somministrati {eur(tot.glsStd)})</td><td className="text-right">{ris.glsSic ? eur(tot.gls.alGiorno) : "—"}</td><td className="text-right font-semibold">{ris.glsSic ? eur(tot.gls.mese) : "—"}</td><td className="text-right">{ris.glsSic ? eur(tot.gls.quattroTerzi) : "—"}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-ink-muted">Mese intero = totale fino al giorno ÷ {ris.giorno} × {gMese}. {ris.sesto > 0 && <>Festivo lavorato come 6° giorno: {ore(ris.sesto)} ore passate dal 50% al 65%.</>}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => scarica(excelMetaMese(stima), `Stima_Costi_${nomeFoglioMeta(p.mese)}_al_${String(ris.giorno).padStart(2, "0")}.xlsx`)}>Scarica il foglio {nomeFoglioMeta(p.mese)}</button>
            </div>
            <div className="mt-4 rounded-control border border-line p-3 text-sm">
              <p className="font-semibold">Come metterlo nel file che si allega alla mail</p>
              <ol className="mt-1 list-decimal pl-5">
                <li>Apri il file <b>{NOME_FILE_STIMA}</b>. Si trova qui: <span className="font-mono text-[13px]">{PERCORSO_FILE_STIMA.join(" › ")}</span></li>
                <li>Apri anche il foglio scaricato. Tasto destro sulla linguetta <b>{nomeFoglioMeta(p.mese)}</b> in basso → <b>Sposta o copia</b>.</li>
                <li>In «Nella cartella» scegli <b>{NOME_FILE_STIMA}</b>, in «Prima del foglio» scegli <b>(sposta alla fine)</b>, spunta <b>Crea una copia</b> e premi OK.</li>
                <li>Se nel file c&apos;è già un foglio {nomeFoglioMeta(p.mese)} di una stima precedente, cancellalo prima (tasto destro → Elimina).</li>
                <li>Salva. Colori e formule sono gli stessi dei mesi precedenti: non c&apos;è altro da sistemare.</li>
              </ol>
            </div>
          </section>

          <section className="card p-4 md:p-5">
            <h2 className="text-[19px] font-semibold">Costo orario usato</h2>
            <p className="text-sm text-ink-muted">Sono i valori del tuo foglio di ottobre. Se li cambi restano salvati su questo PC. Le trasferte vengono dalle tariffe del sito (GLS: {eur(costi.trasfGls)} €).</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {VOCI_COSTO.map((v) => (
                <label key={v} className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">{ETICHETTE_META[v]}
                  <input className="input h-10 w-28" inputMode="decimal" defaultValue={String(costi[v]).replace(".", ",")} key={`${v}-${costi[v]}`} disabled={v.startsWith("trasf")} onBlur={(e) => cambia(v, e.target.value)} />
                </label>
              ))}
            </div>
          </section>

          {tabella("Ore dipendenti (SIC)", ris.sic, VOCI_META, ris.glsSic)}
          {tabella("Ore somministrati (STD)", ris.std, VOCI_COSTO, ris.glsStd)}
        </>
      )}
    </div>
  );
}
