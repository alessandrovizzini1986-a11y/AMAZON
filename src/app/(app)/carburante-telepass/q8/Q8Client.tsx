"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Carta } from "@/domain/telepass/anagrafiche";
import { MESI } from "@/domain/telepass/comune";
import { elaboraQ8, type EsitoQ8 } from "@/domain/telepass/q8";
import { leggiFile, PAGINA } from "@/lib/telepass/riconosci";
import { excelQ8 } from "@/lib/telepass/excelQ8";
import { scarica } from "@/lib/presenze/excelUtil";
import { partiDaInviare, transazioniDaEsito, type Q8TransazioneIn } from "@/domain/carburante/q8Righe";
import { salvaQ8Run, salvaTransazioniQ8, type EsitoParteQ8 } from "../actions";
import type { RunRiga } from "../dati";
import { Dropzone } from "@/components/Dropzone";
import { Griglia } from "../Griglia";
import { Storico } from "../Storico";
import { Spiega } from "@/components/Spiega";
import { Aiuto } from "@/components/Aiuto";

const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// useGrouping "always": in italiano i numeri di 4 cifre altrimenti restano senza punto (2000 invece di 2.000)
const intero = (x: number) => x.toLocaleString("it-IT", { useGrouping: "always" });
/** transazioni mandate al server al massimo per ogni chiamata */
const PEZZO = 1000;
/** byte al massimo per chiamata: il corpo di una server action resta sotto 1 MB, con margine */
const MAX_BYTE = 800_000;
/** errore non previsto (rete, database): il dettaglio non serve a chi usa la pagina */
const NON_RIUSCITO = "Salvataggio non riuscito: premi Riprova";
type InvioTx = { stato: "invio" | "fatto" | "errore"; fatte: number; totale: number; parte: number; errore?: string; nuove?: number; tolte?: number };
/** Un caricamento delle transazioni: lo stesso id e le stesse parti anche quando si riprende dopo un errore. */
type Caricamento = { id: string; parti: Q8TransazioneIn[][]; chiavi: string[]; totale: number; inserite: number; tolte: number };

export function Q8Client({ censimento, runs, canRun }: { censimento: Carta[]; runs: RunRiga[]; canRun: boolean }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<React.ReactNode>(null);
  const [e, setE] = useState<(EsitoQ8 & { origine: string; hash: string }) | null>(null);
  const [filtro, setFiltro] = useState("GLS");
  const [salvata, setSalvata] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroreSalva, setErroreSalva] = useState<string | null>(null);
  const [tx, setTx] = useState<InvioTx | null>(null);
  const caricamento = useRef<Caricamento | null>(null);
  const giaFatto = e ? runs.find((r) => r.anno === e.anno && r.mese === e.mese) : undefined;

  const carica = async (files: File[]) => {
    if (!files.length) return;
    setLavoro(true); setErrore(null); setE(null); setSalvata(false); setErroreSalva(null); setTx(null);
    caricamento.current = null;
    try {
      const f = await leggiFile(files[0]);
      if (f.tipo !== "Q8") {
        setErrore(<>{f.nome} è un {PAGINA[f.tipo].descr}: va nella pagina <Link className="font-semibold underline" href={PAGINA[f.tipo].href}>{PAGINA[f.tipo].nome}</Link>.</>);
        return;
      }
      setE({ ...elaboraQ8(f.sheets, censimento), origine: f.nome, hash: f.hash });
    } catch (x) {
      setErrore(x instanceof Error ? x.message : String(x));
    } finally {
      setLavoro(false);
    }
  };

  const genera = async () => { if (e) { setLavoro(true); try { await scarica(excelQ8(e, filtro), e.nomeFile); } finally { setLavoro(false); } } };
  const salva = async () => {
    if (!e || salvando) return;
    setSalvando(true); setErroreSalva(null);
    try {
      let r: Awaited<ReturnType<typeof salvaQ8Run>>;
      try {
        r = await salvaQ8Run({
          nomeFile: e.origine, hash: e.hash, anno: e.anno, mese: e.mese, righeExport: e.righeExport, tenute: e.tenute,
          scartate: e.scartate.reduce((s, x) => s + x.n, 0), nonCensite: e.nonCensite.length, perIdentificativo: e.perIdentificativo.length,
          totale: e.totale, totali: e.totali, anomalie: e.anomalie.map((a) => ({ ...a })),
        });
      } catch { r = { errore: NON_RIUSCITO }; }
      if ("errore" in r) { setErroreSalva(r.errore); return; }
      setSalvata(true);
      router.refresh();
      await avviaTransazioni();
    } finally {
      setSalvando(false);
    }
  };
  /** Prepara un nuovo caricamento delle transazioni del file (nuovo id, parti sotto il limite) e lo manda. */
  const avviaTransazioni = async () => {
    if (!e) return;
    caricamento.current = null;
    try {
      const righe = transazioniDaEsito(e);
      if (!righe.length) {
        setTx({ stato: "errore", fatte: 0, totale: 0, parte: 0, errore: "nel file non ci sono transazioni con data e litri validi: niente da salvare." });
        return;
      }
      const { parti, chiavi } = partiDaInviare(righe, PEZZO, MAX_BYTE);
      caricamento.current = { id: crypto.randomUUID(), parti, chiavi, totale: righe.length, inserite: 0, tolte: 0 };
    } catch (x) {
      setTx({ stato: "errore", fatte: 0, totale: 0, parte: 0, errore: x instanceof Error ? x.message : String(x) });
      return;
    }
    await inviaParti(0);
  };
  /**
   * Transazioni riga per riga per l'incrocio con la telematica, una parte alla volta e in ordine; se una parte non va si
   * riprende da lì con lo stesso caricamento. Solo l'ultima parte toglie dal mese le righe che non sono più nel file.
   */
  const inviaParti = async (daParte: number) => {
    const c = caricamento.current;
    if (!e || !c) return;
    for (let parte = daParte; parte < c.parti.length; parte++) {
      const fatte = c.parti.slice(0, parte).reduce((s, p) => s + p.length, 0);
      const ultima = parte === c.parti.length - 1;
      setTx({ stato: "invio", fatte, totale: c.totale, parte });
      let r: EsitoParteQ8;
      try {
        r = await salvaTransazioniQ8({
          caricamento: c.id, nomeFile: e.origine, hash: e.hash, anno: e.anno, mese: e.mese, parte, totaleParti: c.parti.length,
          righe: c.parti[parte], inseriteFinora: c.inserite, ...(ultima ? { chiaviFile: c.chiavi } : {}),
        });
      } catch { r = { errore: NON_RIUSCITO }; }
      if ("errore" in r) { setTx({ stato: "errore", fatte, totale: c.totale, parte, errore: r.errore }); return; }
      c.inserite += r.inserite;
      if (ultima) c.tolte = r.tolte ?? 0;
    }
    setTx({ stato: "fatto", fatte: c.totale, totale: c.totale, parte: c.parti.length, nuove: c.inserite, tolte: c.tolte });
  };
  const nScartate = e ? e.scartate.reduce((s, x) => s + x.n, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      {censimento.length === 0 && (
        <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Il censimento fuel card è vuoto: prima importalo nella pagina <Link className="font-semibold underline" href="/carburante-telepass/anagrafiche">Anagrafiche</Link>, altrimenti ogni rifornimento risulta NON CENSITA.</p>
      )}
      {canRun && (
        <Dropzone titolo="Trascina qui l'export Q8" aiuto="q8.elabora" accept=".xlsx" lavoro={lavoro} onFiles={carica}
          testo={<>Portale Q8 Flotte → Transazioni → Esporta Excel. Mese e anno si leggono dalla colonna Data; censimento attuale: {censimento.length} carte.</>} />
      )}
      {errore && <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{errore}</p>}

      {e && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi l="Mese" v={`${MESI[e.mese]} ${e.anno}`} />
            <Kpi k="q8.tenute" l="Rifornimenti tenuti (AMZ/GLS)" v={`${e.tenute.toLocaleString("it-IT")} su ${e.righeExport.toLocaleString("it-IT")}`} />
            <Kpi k="q8.totale" l="Imp. Scontato no IVA €" v={eur(e.totale)} />
            <Kpi k="q8.nonCensite" l="Carte non censite" v={String(e.nonCensite.length)} rosso={e.nonCensite.length > 0} />
            <Kpi k="q8.identificativo" l="Abbinate per Identificativo" v={String(e.perIdentificativo.length)} giallo={e.perIdentificativo.length > 0} />
          </section>

          {(e.nonCensite.length > 0 || e.perIdentificativo.length > 0) && (
            <section className="card border-warn p-4 md:p-5">
              <h2 className="mb-1 text-[19px] font-semibold">Anomalie da guardare prima di generare</h2>
              <p className="mb-3 text-sm text-ink-muted">Si correggono aggiornando il censimento in <Link className="font-semibold text-brand" href="/carburante-telepass/anagrafiche">Anagrafiche</Link> (nuovo PAN di una carta riemessa, DS mancante) e rielaborando.</p>
              <table className="table-base text-sm">
                <thead><tr><th>Tipo</th><th>PAN</th><th>Identificativo</th><th>Rifornimenti</th><th>Nota</th></tr></thead>
                <tbody>
                  {e.nonCensite.map((x) => <tr key={x.pan + x.identificativo} className="bg-danger-soft"><td>Carta non nel censimento (o senza DS)</td><td className="font-mono text-xs">{x.pan}</td><td className="font-semibold">{x.identificativo}</td><td>{x.n}</td><td>aggiornare il censimento fuel card</td></tr>)}
                  {e.perIdentificativo.map((x) => <tr key={x.pan + x.identificativo}><td>PAN non censito: abbinata per Identificativo</td><td className="font-mono text-xs">{x.pan}</td><td className="font-semibold">{x.identificativo}</td><td>{x.n}</td><td className="text-ink-muted">STATION {x.station} presa dalla carta con lo stesso identificativo (carta riemessa?), {eur(x.importo)} €: aggiungere il nuovo PAN al censimento</td></tr>)}
                </tbody>
              </table>
            </section>
          )}

          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <h2 className="mr-auto text-[19px] font-semibold">Imp. Scontato no IVA per station e settimana</h2>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Giornaliero nel Recap per
                <select className="input h-10 w-36" value={filtro} onChange={(x) => setFiltro(x.target.value)}>{e.stazioni.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <button type="button" className="btn-primary h-10" disabled={lavoro} onClick={genera}>Genera Excel</button> <Aiuto k="telepass.excel" />
              {canRun && <button type="button" className="btn-secondary h-10" disabled={salvata || salvando} onClick={salva}>{salvata ? "Salvata ✓" : salvando ? "Salvo…" : "Salva elaborazione"}</button>}
            </div>
            {erroreSalva && <p className="mb-2 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">Elaborazione non salvata. {erroreSalva}</p>}
            {tx?.stato === "invio" && <p className="mb-2 text-sm text-ink-muted" role="status">Salvo le transazioni per l&apos;incrocio con la telematica: {intero(tx.fatte)} su {intero(tx.totale)}…</p>}
            {tx?.stato === "fatto" && (
              <p className="mb-2 text-sm text-ok" role="status">
                Transazioni salvate per l&apos;incrocio con la telematica: {intero(tx.totale)}
                {tx.nuove !== undefined && <> (nuove {intero(tx.nuove)}{tx.tolte ? <>, tolte {intero(tx.tolte)} che non sono più nel file</> : null})</>}.
              </p>
            )}
            {tx?.stato === "errore" && (
              <p className="mb-2 flex flex-wrap items-center gap-2 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">
                {tx.totale > 0
                  ? <span>Elaborazione salvata, ma le transazioni per l&apos;incrocio con la telematica si sono fermate a {intero(tx.fatte)} su {intero(tx.totale)}. {tx.errore?.replace(/\.$/, "")}. Le transazioni salvate prima restano tutte finché il caricamento non arriva in fondo.</span>
                  : <span>Elaborazione salvata, ma le transazioni per l&apos;incrocio con la telematica non sono state salvate: {tx.errore}</span>}
                {tx.totale > 0 && <button type="button" className="btn-secondary h-9" disabled={salvando} onClick={() => inviaParti(tx.parte)}>Riprova</button>}
              </p>
            )}
            {giaFatto && !salvata && <p className="mb-2 text-sm text-warn">{MESI[e.mese]} {e.anno} è già stato elaborato il {new Date(giaFatto.eseguitoIl).toLocaleDateString("it-IT")} da {giaFatto.eseguitoDa}: salvando ne registri una nuova versione.</p>}
            <Griglia titolo="STATION" settimane={e.settimane} stazioni={e.stazioni} totali={e.totali} perStation={e.perStation} totale={e.totale} />
          </section>

          <section className="card p-4 md:p-5">
            <h2 className="mb-1 text-[19px] font-semibold">Righe scartate ({nScartate})</h2>
            <p className="mb-3 text-sm text-ink-muted">Identificativo che non inizia per AMZ o GLS: non sono nostri appalti.</p>
            <div className="flex flex-wrap gap-2">{e.scartate.map((s) => <span key={s.prefisso} className="rounded-full border border-line px-3 py-1 text-sm"><b className="font-mono">{s.prefisso}</b> {s.n}</span>)}</div>
          </section>
        </>
      )}

      <Storico runs={runs} etichettaRighe="Rifornimenti" />
    </div>
  );
}

function Kpi({ l, v, rosso, giallo, k }: { l: string; v: string; rosso?: boolean; giallo?: boolean; k?: string }) {
  return (
    <div className={`card p-4 ${rosso ? "border-danger bg-danger-soft" : giallo ? "border-warn bg-warn-soft" : ""}`}>
      <div className="text-xs font-medium text-ink-muted">{l}{k && <Spiega k={k} />}</div>
      <div className={`text-2xl font-bold ${rosso ? "text-danger" : giallo ? "text-warn" : ""}`}>{v}</div>
    </div>
  );
}
