"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SheetGrid } from "@/domain/presenze/grid";
import { controlloFineMese, type EsitoFineMese } from "@/domain/presenze/controlloFineMese";
import { giorniDelMese } from "@/domain/presenze/domeniche";
import { messaggioFineMese, nomeMese, risultatiFineMese, stationsConDati } from "@/domain/presenze/vistaFineMese";
import { ddmm, entroGiorniLavorativi } from "@/domain/presenze/messaggi";
import type { Station } from "@/domain/presenze/regole";
import { caricaDatiMese } from "@/lib/presenze/carica";
import { excelFineMese } from "@/lib/presenze/excelFineMese";
import { scarica } from "@/lib/presenze/excelUtil";
import { salvaEsecuzione } from "../actions";
import { CopiaMessaggio } from "../CopiaMessaggio";
import type { RunSalvata } from "../settimanale/SettimanaleClient";
import { Aiuto } from "@/components/Aiuto";
import { useAvvisoUscita } from "@/components/Percorso";
import { BloccoMog, type DatiMogClient } from "../BloccoMog";
import type { TrackingInput } from "@/domain/presenze/controlloSettimanale";

const oggiIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mesePrecedente = () => {
  const d = new Date(oggiIso().slice(0, 7) + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const n2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");

export function FineMeseClient({ referenti, runs, canRun, mog }: { referenti: Record<string, string>; runs: RunSalvata[]; canRun: boolean; mog: DatiMogClient }) {
  const router = useRouter();
  const [mese, setMese] = useState(mesePrecedente);
  const [stato, setStato] = useState("");
  const [errori, setErrori] = useState<string[]>([]);
  const [esito, setEsito] = useState<EsitoFineMese | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const [vista, setVista] = useState<"" | "consec" | "6dom">("");
  const [stMatrice, setStMatrice] = useState<Station | "">("");
  const [mogIn, setMogIn] = useState<{ mese: string; finoA: string; tracking: TrackingInput[] } | null>(null);
  const [salvata, setSalvata] = useState<string | null>(null);
  useAvvisoUscita(!!esito && !salvata);

  const esegui = async () => {
    setLavoro(true); setErrori([]); setEsito(null); setSalvata(null);
    try {
      const dati = await caricaDatiMese(mese, setStato);
      setMogIn({ mese: mese, finoA: `${mese}-31`, tracking: dati.tracking.filter((t) => t.tipo === "STD") });
      const err = [...dati.avvisi];
      const map = (tipo: "SIC" | "STD") => Object.fromEntries(dati.tracking.filter((t) => t.tipo === tipo).map((t) => [t.station, t.sheets])) as Partial<Record<Station, SheetGrid[]>>;
      const sic = map("SIC");
      const zuc = Object.fromEntries(dati.zucchetti.map((z) => [z.station, z.sheets])) as Partial<Record<Station, SheetGrid[]>>;
      if (!Object.keys(sic).length) err.push("Nessun tracking SIC del mese nell'archivio: caricalo nel passo 1.");
      if (!Object.keys(zuc).length) err.push("Nessun file Zucchetti del mese nell'archivio: caricalo nel passo 1.");
      setStato("Confronto in corso…");
      await new Promise((r) => setTimeout(r, 0));
      const e = controlloFineMese({ trackingSic: sic, trackingStd: map("STD"), zucchetti: zuc, anno: Number(mese.slice(0, 4)), mese: Number(mese.slice(5, 7)) });
      err.push(...e.mancanti);
      setEsito(e); setErrori(err); setStato("");
      setStMatrice(e.riepilogo[0]?.station ?? "");
    } catch (e) {
      setErrori([e instanceof Error ? e.message : "Errore nella lettura dei file"]);
    } finally {
      setLavoro(false);
    }
  };

  const entro = entroGiorniLavorativi(oggiIso());
  const messaggi = esito ? stationsConDati(esito).map((s) => messaggioFineMese(esito, s, referenti[s] ?? null, entro)).filter((m) => m.nAnomalie > 0) : [];
  const nConsec = esito?.consecutivi.length ?? 0;
  const seiDom = esito ? Object.entries(esito.tabellaSeiPiuDom).flatMap(([st, t]) => Object.entries(t ?? {}).flatMap(([dom, nomi]) => nomi.map((n) => ({ station: st, dom: Number(dom), nome: n })))) : [];
  const giorni = esito ? giorniDelMese(esito.anno, esito.mese) : [];

  const excel = async () => { if (esito) await scarica(excelFineMese(esito), `Controllo_fine_mese_${mese}.xlsx`); };
  const salva = async () => {
    if (!esito) return;
    const ultimo = giorni[giorni.length - 1];
    const { id } = await salvaEsecuzione({
      tipo: "FINE_MESE", station: null, periodoDa: `${mese}-01`, periodoA: ultimo,
      riepilogo: { stations: esito.riepilogo, consecutivi: nConsec, seiPiuDom: seiDom.length },
      risultati: risultatiFineMese(esito).map((r) => ({ ...r, oreTracking: Math.round(r.oreTracking * 100) / 100, nota: r.nota.slice(0, 2000) })),
    });
    setSalvata(id);
    router.refresh();
  };

  const matrice = esito && stMatrice ? esito.matrici[stMatrice] ?? [] : [];
  const perLav = new Map<string, { nome: string; g: Map<string, (typeof matrice)[number]> }>();
  for (const x of matrice) {
    if (!perLav.has(x.matricola)) perLav.set(x.matricola, { nome: x.lavoratore, g: new Map() });
    perLav.get(x.matricola)!.g.set(x.data, x);
  }
  const conDelta = [...perLav.entries()].filter(([, v]) => [...v.g.values()].some((c) => Math.abs(c.delta) > 0.01));

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-wrap items-end gap-3 p-4 md:p-5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Mese
          <input type="month" className="input h-11 w-48" value={mese} onChange={(e) => setMese(e.target.value)} />
        </label>
        <div className="text-xs text-ink-muted">Servono: tracking SIC (e STD per i consecutivi) e file Zucchetti del mese, per ogni station.</div>
        <button type="button" className="btn-primary ml-auto h-11" onClick={esegui} disabled={lavoro || !mese}>{lavoro ? "Controllo in corso…" : "Esegui controllo"}</button> <Aiuto k="presenze.finemese.esegui" />
        {stato && <p className="w-full text-sm text-ink-muted">{stato}</p>}
      </section>

      {errori.length > 0 && (
        <ul className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">
          {errori.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}

      {esito && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setVista(vista === "consec" ? "" : "consec")} className={`card p-4 text-left ${nConsec > 0 ? "border-danger bg-danger-soft" : ""}`}>
              <div className="text-sm font-medium text-ink-muted">Lavoratori con 7 o più giorni consecutivi</div>
              <div className={`text-3xl font-bold ${nConsec > 0 ? "text-danger" : ""}`}>{nConsec}</div>
              <div className="text-xs text-brand">{nConsec ? "Mostra elenco ↓" : "Nessuna violazione"}</div>
            </button>
            <button type="button" onClick={() => setVista(vista === "6dom" ? "" : "6dom")} className="card p-4 text-left">
              <div className="text-sm font-medium text-ink-muted">Casi 6 giorni + domenica (SIC)</div>
              <div className="text-3xl font-bold">{seiDom.length}</div>
              <div className="text-xs text-brand">{seiDom.length ? "Mostra elenco ↓" : "Nessun caso"}</div>
            </button>
          </section>

          {vista === "consec" && (
            <section className="card overflow-x-auto p-4 md:p-5">
              <h2 className="mb-3 text-[19px] font-semibold">7 o più giorni consecutivi</h2>
              {nConsec === 0 ? <p className="text-sm text-ink-muted">Nessuno.</p> : (
                <table className="table-base text-sm">
                  <thead><tr><th>Station</th><th>Tipo</th><th>Lavoratore</th><th>Dal–al</th><th>N. giorni</th></tr></thead>
                  <tbody>{esito.consecutivi.map((c, i) => <tr key={i}><td className="font-mono">{c.station}</td><td>{c.tipo}</td><td className="font-semibold">{c.lavoratore}</td><td>{ddmm(c.dal)}–{ddmm(c.al)}</td><td className="font-bold text-danger">{c.giorni}</td></tr>)}</tbody>
                </table>
              )}
            </section>
          )}

          {vista === "6dom" && (
            <section className="card overflow-x-auto p-4 md:p-5">
              <h2 className="mb-3 text-[19px] font-semibold">6 giorni + domenica (SIC)</h2>
              {seiDom.length === 0 ? <p className="text-sm text-ink-muted">Nessun caso.</p> : (
                <table className="table-base text-sm">
                  <thead><tr><th>Station</th><th>Domenica</th><th>Lavoratore</th></tr></thead>
                  <tbody>{seiDom.map((x, i) => <tr key={i}><td className="font-mono">{x.station}</td><td>{String(x.dom).padStart(2, "0")}/{mese.slice(5, 7)}</td><td>{x.nome}</td></tr>)}</tbody>
                </table>
              )}
            </section>
          )}

          <section className="card overflow-x-auto p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-[19px] font-semibold">Riepilogo {nomeMese(esito.anno, esito.mese)}</h2>
              <button type="button" className="btn-secondary h-10" onClick={excel}>Scarica Excel</button> <Aiuto k="presenze.finemese.excel" />
              {canRun && <><button type="button" className="btn-primary h-10" onClick={salva} disabled={!!salvata}>{salvata ? "Salvata ✓" : "Salva esecuzione"}</button> <Aiuto k="presenze.salva" /></>}
              {salvata && <Link className="text-sm font-semibold text-brand hover:underline" href={`/presenze/esecuzioni/${salvata}`}>Apri per segnare gli esiti →</Link>}
            </div>
            <table className="table-base text-sm">
              <thead><tr><th>Station</th><th>Lav. tracking</th><th>Lav. Zucchetti</th><th>Abbinati</th><th>Solo tracking</th><th>Solo Zucchetti</th><th>Giorni con delta</th><th>Delta ore</th><th>Ore tracking</th><th>Ore Zucchetti</th></tr></thead>
              <tbody>
                {esito.riepilogo.map((r) => (
                  <tr key={r.station}>
                    <td className="font-mono font-semibold">{r.station}</td><td>{r.lavoratoriTracking}</td><td>{r.lavoratoriZucchetti}</td><td>{r.abbinati}</td>
                    <td className={r.soloTracking ? "font-bold text-warn" : ""}>{r.soloTracking}</td><td className={r.soloZucchetti ? "font-bold text-warn" : ""}>{r.soloZucchetti}</td>
                    <td className={r.giorniConDelta ? "font-bold text-danger" : ""}>{r.giorniConDelta}</td><td>{n2(r.deltaOreTot)}</td><td>{n2(r.oreTrackingTot)}</td><td>{n2(r.oreZucchettiTot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {messaggi.length > 0 && (
            <section>
              <h2 className="mb-3 text-[19px] font-semibold">Messaggi Teams per gli Ops</h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{messaggi.map((m) => <CopiaMessaggio key={m.station} m={m} />)}</div>
            </section>
          )}

          <section className="card overflow-x-auto p-4 md:p-5">
            <h2 className="mb-3 text-[19px] font-semibold">Giorni con ore diverse ({esito.delta.length})</h2>
            {esito.delta.length === 0 ? <p className="text-sm text-ink-muted">Nessuna differenza: tracking e Zucchetti coincidono.</p> : (
              <table className="table-base text-sm">
                <thead><tr><th>Station</th><th>Matricola</th><th>Lavoratore</th><th>Giorno</th><th>Ore tracking</th><th>Ore Zucchetti</th><th>Delta</th><th>Lettura</th><th>Voci tracking</th></tr></thead>
                <tbody>
                  {esito.delta.map((d, i) => (
                    <tr key={i}>
                      <td className="font-mono">{d.station}</td><td className="font-mono">{d.matricola}</td><td className="font-semibold">{d.lavoratore}</td><td>{d.giorno} {ddmm(d.data)}</td>
                      <td>{n2(d.oreTracking)}</td><td>{n2(d.oreZucchetti)}</td><td className={`font-bold ${d.delta > 0 ? "text-danger" : "text-warn"}`}>{d.delta > 0 ? "+" : ""}{n2(d.delta)}</td><td>{d.lettura}</td><td className="text-ink-muted">{d.vociTracking}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card overflow-x-auto p-4 md:p-5">
            <h2 className="mb-3 text-[19px] font-semibold">Lavoratori non abbinati ({esito.nonAbbinati.length})</h2>
            {esito.nonAbbinati.length === 0 ? <p className="text-sm text-ink-muted">Tutti abbinati.</p> : (
              <table className="table-base text-sm">
                <thead><tr><th>Station</th><th>Dove</th><th>Matricola</th><th>Lavoratore</th><th>Contratto</th><th>Ore mese</th><th>Nota</th></tr></thead>
                <tbody>{esito.nonAbbinati.map((x, i) => <tr key={i}><td className="font-mono">{x.station}</td><td>{x.fonte === "TRACKING" ? "solo tracking" : "solo Zucchetti"}</td><td className="font-mono">{x.matricola}</td><td className="font-semibold">{x.lavoratore}</td><td>{x.contratto}</td><td>{n2(x.oreMese)}</td><td className="text-ink-muted">{x.nota}</td></tr>)}</tbody>
              </table>
            )}
          </section>

          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <h2 className="mr-auto text-[19px] font-semibold">Matrice tracking | Zucchetti | delta</h2>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Station
                <select className="input h-10 w-32" value={stMatrice} onChange={(e) => setStMatrice(e.target.value as Station)}>
                  {esito.riepilogo.map((r) => <option key={r.station}>{r.station}</option>)}
                </select>
              </label>
            </div>
            <p className="mb-2 text-sm text-ink-muted">Solo i lavoratori con almeno un giorno diverso ({conDelta.length} su {perLav.size}). Per ogni giorno: ore tracking / ore Zucchetti.</p>
            {conDelta.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead><tr className="text-left text-[11px] uppercase text-ink-muted"><th className="sticky left-0 bg-surface-raised px-2 py-2">Lavoratore</th>{giorni.map((d) => <th key={d} className="px-1 text-center">{Number(d.slice(8))}</th>)}</tr></thead>
                  <tbody>
                    {conDelta.map(([k, v]) => (
                      <tr key={k} className="border-t border-[#eef1f4]">
                        <td className="sticky left-0 whitespace-nowrap bg-surface-raised px-2 py-1.5 font-semibold">{v.nome}</td>
                        {giorni.map((d) => {
                          const c = v.g.get(d);
                          const diff = c && Math.abs(c.delta) > 0.01;
                          return <td key={d} className={`whitespace-nowrap px-1 text-center ${diff ? (c!.delta > 0 ? "bg-danger-soft font-bold text-danger" : "bg-warn-soft font-bold text-warn") : "text-ink-faint"}`}>{c && (c.tracking || c.zucchetti) ? `${n2(c.tracking)}/${n2(c.zucchetti)}` : ""}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {mogIn && !lavoro && <BloccoMog mese={mogIn.mese} finoA={mogIn.finoA} tracking={mogIn.tracking} mog={mog} modo="finemese" canSave={canRun} />}

      <section className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Esecuzioni salvate</h2>
        {runs.length === 0 ? <p className="text-sm text-ink-muted">Nessuna esecuzione salvata.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>Mese</th><th>Righe</th><th>Ancora aperte</th><th>Eseguita da</th><th>Il</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.a.slice(5, 7)}/{r.a.slice(0, 4)}</td><td>{r.nAlert}</td>
                  <td className={r.aperti ? "font-semibold text-warn" : "text-ok"}>{r.aperti}</td><td>{r.eseguitoDa}</td>
                  <td>{new Date(r.eseguitoIl).toLocaleString("it-IT")}</td>
                  <td><Link className="font-semibold text-brand hover:underline" href={`/presenze/esecuzioni/${r.id}`}>Apri</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
