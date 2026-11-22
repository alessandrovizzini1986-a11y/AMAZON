"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { controlloSettimanale, type EsitoSettimanale } from "@/domain/presenze/controlloSettimanale";
import { componi, entroGiorniLavorativi, TESTI, type Messaggio } from "@/domain/presenze/messaggi";
import { addDays, weekday } from "@/domain/presenze/grid";
import { STATIONS, type Station } from "@/domain/presenze/regole";
import { ETICHETTA_STATO, ETICHETTA_TIPO, ORDINE_TIPO, personeDelMese, richiesteDaAmazon, tettoAccordo, verificaOre, type EsitoVerifica, type Richiesta, type Stato, type TipoRichiesta } from "@/domain/presenze/verifica";
import { caricaDatiMese } from "@/lib/presenze/carica";
import { excelVerifica, leggiStatiExcel } from "@/lib/presenze/excelVerifica";
import { scarica } from "@/lib/presenze/excelUtil";
import { Aiuto } from "@/components/Aiuto";
import { CopiaMessaggio } from "../CopiaMessaggio";
import { aggiornaRichieste, richiesteDelMese, sincronizzaRichieste, type RichiestaVista } from "../actions";

const oggiIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
/** Di base: il mese di ieri, fino all'ultima domenica passata (le settimane si controllano intere). */
function periodoDefault() {
  const ieri = addDays(oggiIso(), -1);
  let dom = ieri; while (weekday(dom) !== 6) dom = addDays(dom, -1);
  const mese = ieri.slice(0, 7);
  return { mese, finoA: dom.startsWith(mese) ? dom : ieri };
}
const ultimoDelMese = (mese: string) => { const [y, m] = mese.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const mesePrima = (mese: string) => { const [y, m] = mese.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const it = (iso: string) => iso.split("-").reverse().join("/");
const COLORE: Record<Stato, string> = { DA_FARE: "bg-danger-soft text-danger", RICHIESTA: "bg-warn-soft text-warn", OK: "bg-ok-soft text-ok", RISOLTA: "bg-surface-sunken text-ink-muted" };
const etTipo = (t: string) => ETICHETTA_TIPO[t as TipoRichiesta] ?? t;
type StatoFile = { station: Station; sic: boolean; std: boolean; prima: boolean; csv: number; senzaCsv: string[] };

export function VerificaClient({ utente, giustificativi, dispatcher, referenti, canRun }: { utente: string; giustificativi: string[]; dispatcher: string[]; referenti: Record<string, string>; canRun: boolean }) {
  const [p, setP] = useState(periodoDefault);
  const [righe, setRighe] = useState<RichiestaVista[]>([]);
  const [verifica, setVerifica] = useState<EsitoVerifica | null>(null);
  const [file, setFile] = useState<StatoFile[]>([]);
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [esito, setEsito] = useState("");
  const [fSt, setFSt] = useState("TUTTE");
  const [fTipo, setFTipo] = useState("TUTTI");
  const [fStato, setFStato] = useState<"APERTE" | Stato | "TUTTE">("APERTE");
  const inputExcel = useRef<HTMLInputElement>(null);

  // le richieste già salvate del mese si vedono subito, anche senza rifare il controllo
  useEffect(() => { let vivo = true; richiesteDelMese(p.mese).then((r) => { if (vivo) setRighe(r); }).catch(() => { /* tabella non ancora creata */ }); return () => { vivo = false; }; }, [p.mese]);

  const esegui = async () => {
    setLavoro(true); setAvvisi([]); setEsito(""); setVerifica(null); setFile([]);
    try {
      const da = `${p.mese}-01`, a = p.finoA;
      const dati = await caricaDatiMese(p.mese, setMsg);
      const prima = await caricaDatiMese(mesePrima(p.mese), setMsg);
      const err = [...dati.avvisi];
      const stations = STATIONS.filter((s) => dati.tracking.some((t) => t.station === s));
      if (!stations.length) { setAvvisi([`Nell'archivio di questo PC non c'è nessun tracking di ${p.mese.slice(5)}/${p.mese.slice(0, 4)}: caricali nel passo 1.`]); return; }
      if (!dati.flex.length) err.push("Nessun CSV Amazon nell'archivio: il controllo su chi ha lavorato davvero non si può fare. Caricali nel passo 1.");
      const trovate: Richiesta[] = [], stato: StatoFile[] = [];
      for (const st of stations) {
        setMsg(`Controllo ${st}…`);
        await new Promise((r) => setTimeout(r, 0));
        const trk = dati.tracking.filter((t) => t.station === st);
        const sic = trk.some((t) => t.tipo === "SIC"), std = trk.some((t) => t.tipo === "STD");
        let e: EsitoSettimanale | null = null;
        if (sic && std && dati.flex.length) {
          try { e = controlloSettimanale(trk, dati.flex, { station: st, da, a, giustificativi, dispatcher }, dati.tracking); trovate.push(...richiesteDaAmazon(e, p.mese)); }
          catch (x) { err.push(`${st}: ${x instanceof Error ? x.message : "errore nel controllo con Amazon"}`); }
        } else if (!(sic && std)) err.push(`${st}: manca il tracking ${[!sic && "SIC", !std && "STD"].filter(Boolean).join(" e ")}: controllo con Amazon saltato per questa station`);
        stato.push({ station: st, sic, std, prima: prima.tracking.some((t) => t.station === st), csv: e?.giorniCsv.length ?? 0, senzaCsv: e?.giorniSenzaCsv ?? [] });
      }
      setMsg("Controllo delle ore (CCNL e Accordo)…");
      await new Promise((r) => setTimeout(r, 0));
      const pers = personeDelMese(dati.tracking, p.mese, prima.tracking);
      const v = verificaOre(pers.persone, pers.coperti, { mese: p.mese, finoA: a, dispatcher });
      trovate.push(...v.richieste);
      err.push(...pers.avvisi);
      setVerifica(v); setFile(stato); setAvvisi(err);
      if (canRun) {
        setMsg("Salvo le richieste…");
        const s = await sincronizzaRichieste({ mese: p.mese, stations, trovate });
        setRighe(s.richieste);
        setEsito(`Fatto: ${s.nuove} richieste nuove, ${s.sparite} sparite da sole (tracking corretto), ${s.riaperte} riaperte.`);
      } else setEsito("Controllo fatto. Non hai il permesso di salvare le richieste.");
    } catch (x) {
      setAvvisi([x instanceof Error ? x.message : "Errore nella lettura dei file"]);
    } finally { setLavoro(false); setMsg(""); }
  };

  const cambia = async (chiavi: string[], stato: Stato, nota?: string) => {
    const prima = righe;
    setRighe((rs) => rs.map((r) => (chiavi.includes(r.chiave) ? { ...r, stato, ...(nota !== undefined ? { nota } : {}) } : r)));
    try { await aggiornaRichieste(chiavi.map((chiave) => ({ chiave, stato, ...(nota !== undefined ? { nota } : {}) }))); }
    catch { setRighe(prima); setEsito("Non sono riuscito a salvare lo stato: riprova."); }
  };

  const caricaExcel = async (f: File | undefined) => {
    if (!f) return;
    try {
      const stati = await leggiStatiExcel(await f.arrayBuffer());
      const noti = new Map(righe.map((r) => [r.chiave, r]));
      // l'Excel può solo far avanzare una riga (da chiedere → chiesta → ok): un file vecchio non riporta indietro gli stati del sito
      const passo: Record<Stato, number> = { DA_FARE: 0, RICHIESTA: 1, OK: 2, RISOLTA: 2 };
      const cambi = stati.flatMap((s) => {
        const r = noti.get(s.chiave);
        if (!r) return [];
        const avanti = passo[s.stato] > passo[r.stato];
        const nota = s.nota && s.nota !== r.nota ? s.nota : undefined;
        return avanti || nota !== undefined ? [{ chiave: s.chiave, stato: avanti ? s.stato : r.stato, ...(nota !== undefined ? { nota } : {}) }] : [];
      });
      if (cambi.length) await aggiornaRichieste(cambi);
      setRighe(await richiesteDelMese(p.mese));
      setEsito(`Excel letto: ${cambi.length} righe aggiornate su ${stati.length}.`);
    } catch (x) { setEsito(x instanceof Error ? x.message : "Non riesco a leggere l'Excel."); }
    finally { if (inputExcel.current) inputExcel.current.value = ""; }
  };

  const conta = (s: Stato) => righe.filter((r) => r.stato === s).length;
  const stationsViste = useMemo(() => [...new Set(righe.map((r) => r.station))].sort(), [righe]);
  const tipiVisti = useMemo(() => ORDINE_TIPO.filter((t) => righe.some((r) => r.tipo === t)), [righe]);
  const visibili = righe.filter((r) => (fSt === "TUTTE" || r.station === fSt) && (fTipo === "TUTTI" || r.tipo === fTipo) && (fStato === "TUTTE" || (fStato === "APERTE" ? r.stato === "DA_FARE" || r.stato === "RICHIESTA" : r.stato === fStato)))
    .sort((a, b) => a.station.localeCompare(b.station) || ORDINE_TIPO.indexOf(a.tipo as TipoRichiesta) - ORDINE_TIPO.indexOf(b.tipo as TipoRichiesta) || a.driver.localeCompare(b.driver) || a.rif.localeCompare(b.rif));
  const entro = entroGiorniLavorativi(oggiIso());
  const messaggi: Messaggio[] = stationsViste.map((st) => {
    const mie = righe.filter((r) => r.station === st && r.stato === "DA_FARE");
    return componi(st, `${TESTI.saluto(referenti[st] ?? null)}, verifica tracking ${st} di ${p.mese.slice(5)}/${p.mese.slice(0, 4)} (fino al ${it(p.finoA).slice(0, 5)}). Ci servono queste verifiche entro ${entro}:`,
      ORDINE_TIPO.map((t) => ({ titolo: etTipo(t).toUpperCase(), colonne: ["Driver", "Tipo", "Periodo", "Cosa serve"], righe: mie.filter((r) => r.tipo === t).map((r) => [r.driver, r.pop, r.periodo, r.testo]) })));
  }).filter((m) => m.nAnomalie > 0);

  const excel = () => scarica(excelVerifica({ mese: p.mese, finoA: p.finoA, utente, richieste: righe, verifica, avvisi }), `Verifica_tracking_${p.mese}_al_${p.finoA.slice(8)}.xlsx`);
  const tile = (titolo: string, n: number, sotto: string, tono: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} className={`card p-4 text-left ${tono}`}><div className="text-sm font-medium text-ink-muted">{titolo}</div><div className="text-3xl font-bold">{n}</div><div className="text-xs text-ink-muted">{sotto}</div></button>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-3 p-4 md:p-5" aria-label="Passi">
        <ol className="grid gap-2 text-sm md:grid-cols-4">
          <li><b>1. File.</b> CSV Amazon e tracking SIC e STD di tutte le station in <Link className="underline" href="/presenze/archivio">Archivio file</Link>.</li>
          <li><b>2. Verifica.</b> Scegli fino a che giorno e premi il pulsante.</li>
          <li><b>3. Chiedi.</b> Copia il messaggio di ogni station e segna le righe come chieste.</li>
          <li><b>4. Chiudi.</b> Quando l&apos;OS risponde metti OK. Al prossimo giro le righe chiuse non tornano.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Mese
            <input type="month" className="input h-11 w-44" value={p.mese} onChange={(e) => { const mese = e.target.value; if (!mese) return; const fine = ultimoDelMese(mese); setP({ mese, finoA: fine < oggiIso() ? fine : periodoDefault().finoA.startsWith(mese) ? periodoDefault().finoA : fine }); setVerifica(null); setFile([]); }} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Fino al
            <input type="date" className="input h-11 w-44" min={`${p.mese}-01`} max={ultimoDelMese(p.mese)} value={p.finoA} onChange={(e) => e.target.value.startsWith(p.mese) && setP({ ...p, finoA: e.target.value })} />
          </label>
          <span className="text-xs text-ink-muted">Le settimane si controllano intere, da lunedì a domenica.<br />Tetto Accordo: {tettoAccordo(p.finoA)} ore.</span>
          <button type="button" className="btn-primary ml-auto h-11" onClick={esegui} disabled={lavoro}>{lavoro ? "Verifica in corso…" : "Fai la verifica"}</button> <Aiuto k="presenze.verifica.esegui" />
        </div>
        {msg && <p className="text-sm text-ink-muted">{msg}</p>}
        {esito && <p className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok" role="status">{esito}</p>}
      </section>

      {avvisi.length > 0 && <ul className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{avvisi.map((e, i) => <li key={i}>• {e}</li>)}</ul>}

      {file.length > 0 && (
        <section className="card overflow-x-auto p-4 md:p-5">
          <h2 className="mb-2 text-[19px] font-semibold">Cosa ho letto</h2>
          <table className="table-base text-sm">
            <thead><tr><th>Station</th><th>Tracking SIC</th><th>Tracking STD</th><th>Mese prima</th><th>Giorni con CSV Amazon</th><th>Giorni senza CSV</th></tr></thead>
            <tbody>{file.map((f) => (
              <tr key={f.station}><td className="font-semibold">{f.station}</td>
                {[f.sic, f.std].map((ok, i) => <td key={i} className={ok ? "text-ok" : "bg-danger-soft font-semibold text-danger"}>{ok ? "c'è" : "manca"}</td>)}
                <td className={f.prima ? "text-ok" : "text-warn"}>{f.prima ? "c'è" : "manca: la prima settimana a cavallo può non essere controllata"}</td>
                <td className="font-mono">{f.csv}</td>
                <td className={f.senzaCsv.length ? "bg-danger-soft text-danger" : "text-ok"}>{f.senzaCsv.length ? f.senzaCsv.map((d) => d.slice(8)).join(", ") : "nessuno"}</td></tr>
            ))}</tbody>
          </table>
          {verifica && verifica.nonVerificabili.length > 0 && <p className="mt-2 text-xs text-warn">{verifica.nonVerificabili.length} settimane a cavallo non controllate perché manca il tracking del mese prima: l&apos;elenco è nel foglio Avvisi dell&apos;Excel.</p>}
        </section>
      )}

      {righe.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {tile("Da chiedere", conta("DA_FARE"), "non ancora mandate all'OS", conta("DA_FARE") ? "border-danger bg-danger-soft" : "", () => setFStato("DA_FARE"))}
            {tile("Chieste", conta("RICHIESTA"), "aspetto la risposta", conta("RICHIESTA") ? "border-warn bg-warn-soft" : "", () => setFStato("RICHIESTA"))}
            {tile("OK, chiuse", conta("OK"), "non tornano più", "", () => setFStato("OK"))}
            {tile("Sparite da sole", conta("RISOLTA"), "tracking corretto", "", () => setFStato("RISOLTA"))}
            {tile("6° giorno di domenica", verifica?.seiDomenica.length ?? 0, verifica ? "già visti, elenco sotto" : "si vedono dopo il controllo", "")}
          </section>

          <section className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="mr-auto text-[19px] font-semibold">Richieste per gli Operation Supervisor ({visibili.length})</h2>
              <button type="button" className="btn-secondary h-10" onClick={excel}>Scarica Excel</button> <Aiuto k="presenze.verifica.excel" />
              {canRun && <><button type="button" className="btn-secondary h-10" onClick={() => inputExcel.current?.click()}>Carica Excel con gli stati</button> <Aiuto k="presenze.verifica.carica" />
                <input ref={inputExcel} type="file" accept=".xlsx" className="hidden" onChange={(e) => caricaExcel(e.target.files?.[0])} /></>}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div role="group" aria-label="Station" className="flex flex-wrap overflow-hidden rounded-control border border-[#d5dbe3]">
                {["TUTTE", ...stationsViste].map((s, i) => <button key={s} type="button" aria-pressed={fSt === s} onClick={() => setFSt(s)} className={`h-10 px-3 text-sm ${i ? "border-l border-[#d5dbe3]" : ""} ${fSt === s ? "bg-brand font-semibold text-white" : "bg-surface-raised"}`}>{s === "TUTTE" ? "Tutte" : s}</button>)}
              </div>
              <select className="input h-10 w-72" aria-label="Tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="TUTTI">Tutti i tipi</option>{tipiVisti.map((t) => <option key={t} value={t}>{etTipo(t)} ({righe.filter((r) => r.tipo === t && (r.stato === "DA_FARE" || r.stato === "RICHIESTA")).length} aperte)</option>)}</select>
              <select className="input h-10 w-56" aria-label="Stato" value={fStato} onChange={(e) => setFStato(e.target.value as typeof fStato)}><option value="APERTE">Aperte (da chiedere + chieste)</option>{(Object.keys(ETICHETTA_STATO) as Stato[]).map((s) => <option key={s} value={s}>{ETICHETTA_STATO[s]}</option>)}<option value="TUTTE">Tutte</option></select>
              {canRun && visibili.some((r) => r.stato === "DA_FARE") && <button type="button" className="btn-secondary h-10" onClick={() => cambia(visibili.filter((r) => r.stato === "DA_FARE").map((r) => r.chiave), "RICHIESTA")}>Segna come chieste le {visibili.filter((r) => r.stato === "DA_FARE").length} in elenco</button>}
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="table-base text-sm">
                <thead className="sticky top-0 bg-surface-raised"><tr><th>Station</th><th>Tipo</th><th>Driver</th><th>Periodo</th><th>Cosa chiedere</th><th>Stato</th><th>Nota</th></tr></thead>
                <tbody>{visibili.slice(0, 400).map((r) => (
                  <tr key={r.chiave}>
                    <td className="font-semibold">{r.station}<div className="text-xs font-normal text-ink-muted">{r.pop}</div></td>
                    <td>{etTipo(r.tipo)}</td><td className="font-medium">{r.driver}</td><td className="whitespace-nowrap font-mono text-xs">{r.periodo}</td>
                    <td className="min-w-[320px] text-ink-muted">{r.testo}</td>
                    <td>{canRun
                      ? <select aria-label={`Stato di ${r.driver} ${r.periodo}`} className={`h-9 rounded-control border border-[#d5dbe3] px-2 text-xs font-semibold ${COLORE[r.stato]}`} value={r.stato} onChange={(e) => cambia([r.chiave], e.target.value as Stato)}>{(Object.keys(ETICHETTA_STATO) as Stato[]).map((s) => <option key={s} value={s}>{ETICHETTA_STATO[s]}</option>)}</select>
                      : <span className={`rounded-full px-2 py-1 text-xs font-semibold ${COLORE[r.stato]}`}>{ETICHETTA_STATO[r.stato]}</span>}</td>
                    <td>{canRun ? <input className="input h-9 w-44 text-xs" defaultValue={r.nota} placeholder="risposta dell'OS" maxLength={500} onBlur={(e) => e.target.value.trim() !== r.nota && cambia([r.chiave], r.stato, e.target.value.trim())} /> : r.nota}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {visibili.length > 400 && <p className="text-xs text-ink-muted">Mostro le prime 400 righe: filtra per station o per tipo, oppure scarica l&apos;Excel.</p>}
            {visibili.length === 0 && <p className="text-sm text-ink-muted">Nessuna riga con questi filtri.</p>}
          </section>

          {messaggi.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[19px] font-semibold">Messaggi per gli OS (solo le righe da chiedere)</h2>
              <p className="text-sm text-ink-muted">Copia il messaggio, incollalo in Teams e poi premi «Segna come chieste» filtrando la station: così al prossimo giro non le rimandi.</p>
              <div className="grid gap-3 lg:grid-cols-2">{messaggi.map((m) => <CopiaMessaggio key={m.station} m={m} />)}</div>
            </section>
          )}
        </>
      )}

      {verifica && verifica.seiDomenica.length > 0 && (
        <section className="card overflow-x-auto p-4 md:p-5">
          <h2 className="mb-1 text-[19px] font-semibold">6° giorno di domenica: 5 giorni + la domenica ({verifica.seiDomenica.length})</h2>
          <p className="mb-3 text-sm text-ink-muted">Sono dentro la regola (6 giorni su 7), ma è il limite: li trovi già qui, così a fine mese non devi ricontrollarli. Se lavorano anche il giorno dopo il riposo salta fuori da solo tra le richieste «7 o più giorni di fila».</p>
          <table className="table-base text-sm">
            <thead><tr><th>Station</th><th>Pop.</th><th>Driver</th><th>Contratto</th><th>Domenica</th><th>Giorno di riposo</th><th className="text-right">Ore della settimana</th></tr></thead>
            <tbody>{verifica.seiDomenica.filter((s) => fSt === "TUTTE" || s.station === fSt).map((s, i) => <tr key={i}><td className="font-semibold">{s.station}</td><td>{s.pop}</td><td>{s.driver}</td><td>{s.contratto}</td><td className="font-mono">{it(s.domenica)}</td><td>{s.riposo}</td><td className="text-right font-mono">{s.ore.toLocaleString("it-IT")}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {righe.length === 0 && !lavoro && !verifica && <p className="card p-5 text-sm text-ink-muted">Per questo mese non c&apos;è ancora nessuna richiesta salvata. Carica i file nell&apos;archivio e premi «Fai la verifica».</p>}
      {verifica && righe.length === 0 && <p className="card p-5 text-sm text-ok">Verifica fatta: nessuna richiesta da fare.</p>}
    </div>
  );
}
