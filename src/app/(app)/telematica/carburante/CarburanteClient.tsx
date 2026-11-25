"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SelettoreMese } from "@/components/SelettoreMese";
import { Spiega } from "@/components/Spiega";
import { etichettaMese } from "@/lib/mesi";
import { conFlotta, filtraRighe, filtroDaIndirizzo, queryFiltro, quanteArchiviate, riepilogoScope, targhePresenti, type FiltroCarburante, type FlottaFiltro } from "@/lib/carburante/filtro";
import { ESITO_LUOGO } from "@/lib/carburante/esporta";
import type { Stato } from "@/domain/carburante/riconciliazione";
import { giustifica, riapri } from "./actions";
import { GuidaCarburante } from "./GuidaCarburante";
import { LinkPagina } from "./LinkPagina";
import { PannelloDati } from "./PannelloDati";
import {
  abilitata, EVENTO_DATI, EVENTO_GUIDA, MOTIVI_GIUSTIFICA, MOTIVO_CON_NOTA, NOME_PANNELLO, PAGINE, percorsoMenu, STILE_STATO,
  euro, giornoBreve, giornoLungo, litri, litriConSegno, quando, type DatiVista, type MotivoGiustifica, type RigaVista,
} from "./testi";

const PAGINA = "/telematica/carburante";
const PASSO_RIGHE = 200;
const num = (x: number) => x.toLocaleString("it-IT");
const apriDati = () => window.dispatchEvent(new Event(EVENTO_DATI));
const BREVE: Record<"SERBATOIO_FERMO" | "LITRI" | "LUOGO" | "SENZA_Q8", string> = { SERBATOIO_FERMO: "serbatoio fermo", LITRI: "discrepanza litri", LUOGO: "luogo diverso", SENZA_Q8: "senza Q8" };
/** giornate = un furgone in un giorno: è l'unità che Furgoni → Il mese riscarica */
const giornate = (n: number) => `${num(n)} ${n === 1 ? "giornata" : "giornate"}`;

/** Pulsanti dell'intestazione: aprono guida e pannello (che vivono nella parte interattiva della pagina). */
export function PulsantiIntestazione() {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" className="btn-secondary" onClick={() => window.dispatchEvent(new Event(EVENTO_GUIDA))}>Rivedi guida</button>
      <button type="button" className="btn-secondary" data-guida="alimenta" onClick={apriDati}>{NOME_PANNELLO}</button>
    </div>
  );
}

export function BadgeStato({ stato }: { stato: Stato }) {
  const s = STILE_STATO[stato];
  return <span className={`${s.classe} whitespace-nowrap`} title={`Tipo: ${s.testo} (${s.colore})`}><span aria-hidden>{s.icona}</span>{s.testo}</span>;
}

/** Riga archiviata quando era meno grave: con i dati nuovi è peggiorata, quindi torna tra quelle da guardare. */
function BadgeCambiato({ prima }: { prima: Stato }) {
  return <span className="badge-warn whitespace-nowrap" title={`Era stata archiviata come «${STILE_STATO[prima].testo}»`}><span aria-hidden>⚠️</span>stato cambiato dopo l&apos;archiviazione</span>;
}
const testoCambiato = (prima: Stato) => <>Era stata archiviata come «{STILE_STATO[prima].testo}»: con i dati nuovi è peggiorata, va ricontrollata.</>;

type Avviso = { tono: "warn" | "info"; testo: React.ReactNode };

export function CarburanteClient({ dati, guidaVista, utente, nascosti }: { dati: DatiVista; guidaVista: boolean; utente: string; nascosti: string[] }) {
  const router = useRouter();
  // i filtri stanno solo nell'indirizzo (export, link, ricarica e «Indietro» li vedono uguali); il mese invece ricarica dal server
  const params = useSearchParams();
  const f = useMemo(() => filtroDaIndirizzo(params, dati.mese), [params, dati.mese]);
  const [cambioMese, startCambioMese] = useTransition();
  const [quante, setQuante] = useState(PASSO_RIGHE);
  const [daGiustificare, setDaGiustificare] = useState<RigaVista | null>(null);
  const [riaprendo, setRiaprendo] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const nomeMese = etichettaMese(dati.mese);
  const meseMin = nomeMese.toLowerCase();
  const giornataOk = abilitata(PAGINE.giornata, nascosti);

  // senza passare dal server (ricalcolare il mese a ogni interruttore costa secondi): Next aggiorna useSearchParams da solo
  const scrivi = (nuovo: FiltroCarburante) => { window.history.replaceState(null, "", `${PAGINA}?${queryFiltro(nuovo)}`); setQuante(PASSO_RIGHE); };
  const cambia = (x: Partial<FiltroCarburante>) => scrivi({ ...f, ...x });
  const cambiaMese = (m: string) => { if (m === f.mese) return; startCambioMese(() => router.replace(`${PAGINA}?${queryFiltro({ ...f, mese: m })}`, { scroll: false })); };

  const targhe = useMemo(() => {
    const t = targhePresenti(dati.righe, f.flotta);
    return f.targa && !t.includes(f.targa) ? [f.targa, ...t] : t;
  }, [dati.righe, f.flotta, f.targa]);
  const righe = useMemo(() => filtraRighe(dati.righe, f), [dati.righe, f]);
  const riepilogo = useMemo(() => (f.targa ? riepilogoScope(dati.righe, f) : dati.riepilogo[f.flotta]), [dati.righe, dati.riepilogo, f]);
  const archiviate = useMemo(() => quanteArchiviate(dati.righe, f), [dati.righe, f]);
  const nascoste = useMemo(() => {
    const scope = filtraRighe(dati.righe, { ...f, regolari: true, nonVerificabili: true });
    return { regolari: scope.filter((r) => r.stato === "REGOLARE").length, nonVerificabili: scope.filter((r) => r.stato === "NON_VERIFICABILE").length };
  }, [dati.righe, f]);
  const scopeCopertura = useMemo(() => dati.copertura.filter((c) => f.flotta === "TUTTE" || c.flotta === f.flotta), [dati.copertura, f.flotta]);
  // zero anomalie non è "tutto a posto" se mancano i pagamenti Q8 o dei giorni di telematica
  const incompleto = riepilogo.pagamentiQ8 === 0 ? "nessuna transazione Q8 da confrontare" : scopeCopertura.some((c) => c.targa.giorniScaricati < c.targa.giorniDaScaricare) ? "mancano giorni di telematica" : null;
  const tonoAnomalie = riepilogo.anomalie ? "danger" : incompleto ? "neutro" : "ok";

  // avvisi su quello che manca per un incrocio completo
  const avvisi = useMemo(() => {
    const out: Avviso[] = [];
    const [a, m] = dati.mese.split("-").map(Number);
    const ultimoDelMese = `${dati.mese}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
    const meseFinito = new Date().toISOString().slice(0, 10) > ultimoDelMese;
    // un file che finisce 1-2 giorni prima può essere solo un fine mese senza rifornimenti: si avvisa da 3 giorni in su
    const sogliaFile = new Date(Date.UTC(a, m - 1, new Date(Date.UTC(a, m, 0)).getUTCDate() - 2)).toISOString().slice(0, 10);
    const versoQ8 = (testo: string) => <LinkPagina href={PAGINE.q8} nascosti={nascosti}>{testo}</LinkPagina>;
    const versoMese = (testo: string) => <LinkPagina href={`${PAGINE.mese}?mese=${dati.mese}`} nascosti={nascosti}>{testo}</LinkPagina>;
    for (const c of scopeCopertura) {
      if (c.q8.transazioni === 0) out.push({ tono: "warn", testo: <><b>{c.flotta}</b>: il file Q8 di {meseMin} non è caricato. {versoQ8(`Caricalo da ${percorsoMenu(PAGINE.q8)}`)}</> });
      else if (meseFinito && c.q8.ultimoGiorno && c.q8.ultimoGiorno < sogliaFile) out.push({ tono: "info", testo: <><b>{c.flotta}</b>: il file Q8 caricato arriva al {giornoLungo(c.q8.ultimoGiorno)}: i rifornimenti dopo quel giorno risultano non verificabili. {versoQ8(`Carica il file completo da ${percorsoMenu(PAGINE.q8)}`)}</> });
      const giorni = c.targa.giorniDaScaricare - c.targa.giorniScaricati;
      if (giorni > 0) out.push({ tono: "warn", testo: <><b>{c.flotta}</b>: {num(giorni)} {giorni === 1 ? "giorno" : "giorni"} di {meseMin} senza telematica scaricata. {versoMese(`Scaricali da ${percorsoMenu(PAGINE.mese)}`)}</> });
      // "da completare" con la stessa regola del pulsante di Furgoni → Il mese: dettaglio assente o senza coordinate
      const senzaOra = Math.max(0, c.targa.rifornimenti - c.targa.conOra), senzaCoordinate = Math.max(0, c.targa.conOra - c.targa.conCoordinate);
      if (c.targa.daCompletare > 0) {
        out.push({ tono: senzaOra > 0 ? "warn" : "info", testo: <><b>{c.flotta}</b>: {giornate(c.targa.daCompletare)} di {meseMin} con rifornimenti senza ora, luogo o coordinate. {versoMese(`Completale da ${percorsoMenu(PAGINE.mese)}`)} con «Scarica ora, luogo e coordinate…»: con l&apos;ora il pagamento si può abbinare, con le coordinate il luogo si confronta a distanza (entro {num(dati.tolleranze.raggioKm)} km) invece che per comune e via.</> });
      } else {
        // niente da riscaricare: il dato manca perché il portale Targa non lo dà
        if (senzaOra > 0) out.push({ tono: "info", testo: <><b>{c.flotta}</b>: per {num(senzaOra)} {senzaOra === 1 ? "rifornimento" : "rifornimenti"} di {meseMin} il portale Targa non dà l&apos;ora: non si possono abbinare e restano non verificabili.</> });
        if (senzaCoordinate > 0) out.push({ tono: "info", testo: <><b>{c.flotta}</b>: per {num(senzaCoordinate)} {senzaCoordinate === 1 ? "rifornimento" : "rifornimenti"} di {meseMin} il portale Targa non dà le coordinate: il luogo si confronta per comune e via.</> });
      }
      if (c.nota) out.push({ tono: "info", testo: <><b>{c.flotta}</b>: {c.nota}</> });
    }
    for (const x of dati.avvisi ?? []) out.push({ tono: "info", testo: x });
    return out;
  }, [scopeCopertura, dati.avvisi, dati.mese, dati.tolleranze.raggioKm, meseMin, nascosti]);

  const onRiapri = async (chiave: string) => {
    setErrore(null); setRiaprendo(chiave);
    try { await riapri(chiave); } catch { setErrore("Non sono riuscito a riaprire la riga. Riprova."); }
    setRiaprendo(null);
  };

  const exportHref = (formato: "xlsx" | "csv") => `/api/carburante/riconciliazione?${queryFiltro(f, { formato })}`;
  const mostrate = righe.slice(0, quante);
  const perStato = riepilogo.perStato;
  const azioni = (r: RigaVista) => ({ riaprendo: riaprendo === r.chiave, onGiustifica: () => { setErrore(null); setDaGiustificare(r); }, onRiapri: () => onRiapri(r.chiave) });

  return (
    <div className="flex flex-col gap-4">
      {/* filtri: una riga che va a capo sul telefono */}
      <div className="card flex flex-col gap-3 p-4" data-guida="filtri">
        <div className="flex flex-wrap items-end gap-3">
          <SelettoreMese value={dati.mese} onChange={cambiaMese} ricorda={false} mesiAvanti={0} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-muted">Flotta</span>
            <select className="input h-11 w-auto" value={f.flotta} onChange={(e) => scrivi(conFlotta(f, e.target.value as FlottaFiltro, dati.righe))}>
              <option value="TUTTE">Tutte</option>
              {dati.copertura.map((c) => <option key={c.flotta} value={c.flotta}>{c.flotta}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-muted">Targa</span>
            <select className="input h-11 w-auto min-w-[9rem]" value={f.targa ?? ""} onChange={(e) => cambia({ targa: e.target.value || null })}>
              <option value="">Tutte ({targhe.length})</option>
              {targhe.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:ml-auto" data-guida="export">
            <a className="btn-secondary" href={exportHref("xlsx")}>Excel</a>
            <a className="btn-secondary" href={exportHref("csv")}>CSV</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={f.regolari} onChange={(e) => cambia({ regolari: e.target.checked })} />Mostra anche i regolari <span className="text-ink-muted">({num(nascoste.regolari)})</span></label>
          <label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={f.nonVerificabili} onChange={(e) => cambia({ nonVerificabili: e.target.checked })} />Mostra i non verificabili <span className="text-ink-muted">({num(nascoste.nonVerificabili)})</span></label>
          <label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={f.archiviate} onChange={(e) => cambia({ archiviate: e.target.checked })} />Mostra archiviate <span className="text-ink-muted">({num(archiviate)})</span></label>
        </div>
        {cambioMese && <p className="text-sm text-ink-muted" role="status">Carico il mese scelto: il calcolo richiede qualche secondo…</p>}
      </div>

      {avvisi.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Cosa manca per un incrocio completo">
          {avvisi.map((a, k) => (
            <li key={k} className={`flex gap-2 rounded-control border px-3 py-2 text-sm ${a.tono === "warn" ? "border-warn/30 bg-warn-soft text-[#6b4000]" : "border-info/30 bg-info-soft text-ink"}`}>
              <span aria-hidden>{a.tono === "warn" ? "⚠️" : "ℹ️"}</span><span>{a.testo}</span>
            </li>
          ))}
          <li className="text-xs text-ink-muted">Passi e mesi caricati: <button type="button" className="font-medium text-brand underline" onClick={apriDati}>{NOME_PANNELLO}</button></li>
        </ul>
      )}

      {/* schede: riepilogo della flotta (e targa) scelta; le righe archiviate non contano */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guida="schede">
        <div className="card p-3 md:p-4">
          <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-ink-muted">Transazioni Q8 analizzate<Spiega k="carburante.transazioni" /></div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{num(riepilogo.pagamentiQ8)}</div>
          <div className="text-xs text-ink-muted">{f.flotta === "TUTTE" ? "DER2 e GLS" : f.flotta}{f.targa ? ` · ${f.targa}` : ""} · {nomeMese}</div>
        </div>
        <div className="card relative overflow-hidden p-3 pl-4 md:p-4 md:pl-5">
          <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tonoAnomalie === "danger" ? "bg-danger" : tonoAnomalie === "ok" ? "bg-ok" : "bg-ink-faint"}`} />
          <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-ink-muted">Anomalie<Spiega k="carburante.anomalie" /></div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${tonoAnomalie === "danger" ? "text-danger" : tonoAnomalie === "ok" ? "text-ok" : "text-ink"}`}>{num(riepilogo.anomalie)}</div>
          {incompleto && <div className="text-xs font-medium text-ink-muted">Dati incompleti: {incompleto}</div>}
          <ul className="mt-1 flex flex-col text-xs text-ink-muted">
            {(["SERBATOIO_FERMO", "LITRI", "LUOGO", "SENZA_Q8"] as const).map((s) => <li key={s}><span aria-hidden>{STILE_STATO[s].icona}</span> {num(perStato[s])} {BREVE[s]}</li>)}
          </ul>
        </div>
        <div className="card p-3 md:p-4">
          <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-ink-muted">Litri non giustificati<Spiega k="carburante.litri" /></div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${riepilogo.litriMancanti ? "text-warn" : ""}`}>{litri(riepilogo.litriMancanti)}</div>
          <div className="text-xs text-ink-muted">pagati ma non entrati nel serbatoio</div>
        </div>
        <div className="card p-3 md:p-4">
          <div className="flex items-center text-xs font-semibold uppercase tracking-wide text-ink-muted">Valore stimato dell&apos;ammanco<Spiega k="carburante.euro" /></div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${riepilogo.euroMancanti ? "text-danger" : ""}`}>{euro(riepilogo.euroMancanti)}</div>
          <div className="text-xs text-ink-muted">IVA esclusa, al prezzo pagato</div>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="flex items-center text-sm text-ink-muted"><span aria-hidden className="mr-1">{STILE_STATO.REGOLARE.icona}</span>Regolari<Spiega k="carburante.regolari" /></span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{num(perStato.REGOLARE)}</span>
            <button type="button" className="text-xs font-medium text-brand underline" aria-pressed={f.regolari} onClick={() => cambia({ regolari: !f.regolari })}>{f.regolari ? "nascondi" : "mostra"}</button>
          </span>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="flex items-center text-sm text-ink-muted"><span aria-hidden className="mr-1">{STILE_STATO.NON_VERIFICABILE.icona}</span>Non verificabili<Spiega k="carburante.nonVerificabili" /></span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{num(perStato.NON_VERIFICABILE)}</span>
            <button type="button" className="text-xs font-medium text-brand underline" aria-pressed={f.nonVerificabili} onClick={() => cambia({ nonVerificabili: !f.nonVerificabili })}>{f.nonVerificabili ? "nascondi" : "mostra"}</button>
          </span>
        </div>
        <p className="col-span-2 self-center text-xs text-ink-muted">
          Il sito ha riconosciuto il furgone abituale di {num(dati.appreso.carteAbituali)} {dati.appreso.carteAbituali === 1 ? "carta" : "carte"} e il posto di {num(dati.appreso.distributoriLocalizzati)} {dati.appreso.distributoriLocalizzati === 1 ? "distributore" : "distributori"}. Le righe archiviate non contano nei totali.
        </p>
      </div>

      {errore && <p className="text-sm text-danger" role="alert">{errore}</p>}

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-muted">{righe.length === 0 ? "Nessuna riga" : `${num(righe.length)} ${righe.length === 1 ? "riga" : "righe"}`}, dalla più grave; {f.regolari ? "regolari inclusi" : "regolari nascosti"}, {f.nonVerificabili ? "non verificabili inclusi" : "non verificabili nascosti"}.</span>
      </div>

      {/* stato vuoto: è anche il bersaglio delle tappe "tabella" e "azioni" della guida (con "vuoto" la guida lo dice) */}
      {dati.righe.length === 0 ? (
        <p className="card p-4 text-sm text-ink-muted" data-guida="tabella azioni vuoto">Per {meseMin} non ci sono né pagamenti Q8 né rifornimenti di DER2 e GLS. Carica il file Q8 e scarica la telematica: <button type="button" className="font-medium text-brand underline" onClick={apriDati}>{NOME_PANNELLO.toLowerCase()}</button>.</p>
      ) : righe.length === 0 ? (
        <p className="card p-4 text-sm text-ink-muted" data-guida="tabella azioni vuoto">Con questi filtri non c&apos;è niente da guardare. Accendi «Mostra anche i regolari» o «Mostra i non verificabili» per vedere tutte le righe.</p>
      ) : (
        <>
          {/* telefono e tablet: una scheda per riga, tutto leggibile senza scorrere di lato */}
          <ul className="flex flex-col gap-3 lg:hidden" data-guida="tabella">
            {mostrate.map((r, k) => <SchedaRiga key={r.chiave} r={r} prima={k === 0} giornataOk={giornataOk} {...azioni(r)} />)}
          </ul>
          <div className="card hidden overflow-x-auto p-0 lg:block" data-guida="tabella">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="whitespace-nowrap bg-[#f9fafb] px-3 py-2">Data e ora</th>
                  <th className="whitespace-nowrap px-3 py-2">Targa e flotta</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Litri Q8</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Litri Targa</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Delta litri e €</th>
                  <th className="px-3 py-2">Luogo Q8 e posizione Targa</th>
                  <th className="px-3 py-2">Azioni</th>
                </tr>
              </thead>
              {mostrate.map((r, k) => <RigaTabella key={r.chiave} r={r} prima={k === 0} giornataOk={giornataOk} {...azioni(r)} />)}
            </table>
          </div>
        </>
      )}
      {righe.length > quante && (
        <button type="button" className="btn-secondary self-start" onClick={() => setQuante((q) => q + PASSO_RIGHE)}>Mostra altre {num(Math.min(PASSO_RIGHE, righe.length - quante))} (ne restano {num(righe.length - quante)})</button>
      )}

      {daGiustificare && <DialogGiustifica key={daGiustificare.chiave} riga={daGiustificare} mese={dati.mese} onChiudi={() => setDaGiustificare(null)} />}
      <PannelloDati dati={dati} nascosti={nascosti} />
      <GuidaCarburante vista={guidaVista} tolleranze={dati.tolleranze} utente={utente} nascosti={nascosti} />
    </div>
  );
}

type PropsRiga = { r: RigaVista; prima: boolean; giornataOk: boolean; riaprendo: boolean; onGiustifica: () => void; onRiapri: () => void };

const hrefGiornata = (r: RigaVista) => (r.targa ? `${PAGINE.giornata}?station=${encodeURIComponent(r.flotta)}&giorno=${r.giorno}&targa=${encodeURIComponent(r.targa)}` : null);

/** "Apri la giornata" se la pagina è abilitata per l'utente; altrimenti lo dice, senza link */
function ApriGiornata({ r, giornataOk, className }: { r: RigaVista; giornataOk: boolean; className: string }) {
  const href = hrefGiornata(r);
  if (!href) return null;
  if (!giornataOk) return <span className="text-xs text-ink-muted">Giornata: pagina non abilitata per il tuo utente</span>;
  return <Link className={className} href={href}>Apri la giornata</Link>;
}

function RigaTabella({ r, prima, giornataOk, riaprendo, onGiustifica, onRiapri }: PropsRiga) {
  const carte = [...new Set(r.q8.map((q) => q.identificativo).filter(Boolean))];
  const ammanco = (r.stato === "LITRI" || r.stato === "SERBATOIO_FERMO") && (r.deltaLitri ?? 0) < 0;
  return (
    <tbody className={`border-t border-line ${r.archiviata ? "bg-surface text-ink-muted" : ""}`}>
      <tr className="align-top">
        <td className="whitespace-nowrap px-3 pb-1 pt-2 tabular-nums">
          <div className="font-medium text-ink">{giornoBreve(r.giorno)}</div>
          <div className="text-xs">Q8 {r.oraQ8 ?? "—"}</div>
          <div className="text-xs">Targa {r.oraTarga ?? "—"}</div>
        </td>
        <td className="whitespace-nowrap px-3 pb-1 pt-2">
          <div className="font-medium text-ink">{r.targa ?? <span className="font-normal text-ink-muted">furgone non trovato</span>}</div>
          <div className="text-xs text-ink-muted">{r.flotta}</div>
        </td>
        <td className="px-3 pb-1 pt-2">
          <div className="flex flex-col items-start gap-1"><BadgeStato stato={r.stato} />{r.statoCambiato && <BadgeCambiato prima={r.statoCambiato.prima} />}</div>
        </td>
        <td className="whitespace-nowrap px-3 pb-1 pt-2 text-right tabular-nums">{litri(r.litriQ8)}</td>
        <td className="whitespace-nowrap px-3 pb-1 pt-2 text-right tabular-nums">{litri(r.litriTarga)}</td>
        <td className="whitespace-nowrap px-3 pb-1 pt-2 text-right tabular-nums">
          <div className={ammanco ? "font-semibold text-danger" : ""}>{litriConSegno(r.deltaLitri)}</div>
          {r.euro !== null && <div className="text-xs">≈ {euro(r.euro)}</div>}
        </td>
        <td className="min-w-[15rem] max-w-[22rem] px-3 pb-1 pt-2">
          <div><span className="text-xs text-ink-muted">Q8: </span>{r.luogoQ8 ?? "—"}</div>
          <div><span className="text-xs text-ink-muted">Targa: </span>{r.luogoTarga ?? "—"}</div>
          {r.luogo !== "IGNOTO" && <div className={`text-xs ${r.luogo === "DIVERSO" ? "font-medium text-warn" : "text-ink-muted"}`}>{ESITO_LUOGO[r.luogo]}{r.distanzaKm !== null ? `, ${r.distanzaKm.toLocaleString("it-IT")} km` : ""}</div>}
        </td>
        <td className="px-3 pb-1 pt-2" data-guida={prima ? "azioni" : undefined}>
          <div className="flex flex-col items-start gap-1.5">
            <ApriGiornata r={r} giornataOk={giornataOk} className="whitespace-nowrap text-sm font-medium text-brand underline" />
            {r.archiviata
              ? <button type="button" className="btn-secondary whitespace-nowrap px-2.5 py-1 text-xs" disabled={riaprendo} onClick={onRiapri}>{riaprendo ? "Riapro…" : "Riapri"}</button>
              : <button type="button" className="btn-secondary whitespace-nowrap px-2.5 py-1 text-xs" onClick={onGiustifica}>Giustifica / Archivia</button>}
          </div>
        </td>
      </tr>
      <tr>
        <td aria-hidden className="px-3 pb-2" />
        <td colSpan={7} className="px-3 pb-2 text-[13px]">
          <span className="text-ink">{r.motivo}</span>
          {(carte.length > 0 || r.abituale) && (
            <span className="ml-2 text-xs text-ink-muted">
              {carte.length > 0 && <>Carta {carte.join(", ")}</>}
              {carte.length > 0 && r.abituale && " · "}
              {r.abituale && <>furgone abituale {r.abituale.targa} ({r.abituale.volte} rifornimenti su {r.abituale.su})</>}
            </span>
          )}
          {r.statoCambiato && <div className="mt-1 text-xs text-[#6b4000]">{testoCambiato(r.statoCambiato.prima)}</div>}
          {r.archiviata && (
            <div className="mt-1 text-xs">
              <span className="badge-neutral mr-1.5">Archiviata</span>
              <b>{r.archiviata.motivo}</b>{r.archiviata.nota ? ` — ${r.archiviata.nota}` : ""} · da {r.archiviata.da}, il {quando(r.archiviata.il)}
            </div>
          )}
        </td>
      </tr>
    </tbody>
  );
}

/** La stessa riga come scheda, per telefono e tablet. */
function SchedaRiga({ r, prima, giornataOk, riaprendo, onGiustifica, onRiapri }: PropsRiga) {
  const carte = [...new Set(r.q8.map((q) => q.identificativo).filter(Boolean))];
  const ammanco = (r.stato === "LITRI" || r.stato === "SERBATOIO_FERMO") && (r.deltaLitri ?? 0) < 0;
  return (
    <li className={`card flex flex-col gap-2 p-3 text-sm ${r.archiviata ? "bg-surface text-ink-muted" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5"><BadgeStato stato={r.stato} />{r.statoCambiato && <BadgeCambiato prima={r.statoCambiato.prima} />}</span>
        <span className="tabular-nums text-xs text-ink-muted">{giornoBreve(r.giorno)} · Q8 {r.oraQ8 ?? "—"} · Targa {r.oraTarga ?? "—"}</span>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-ink">{r.targa ?? <span className="font-normal text-ink-muted">furgone non trovato</span>} <span className="text-xs font-normal text-ink-muted">{r.flotta}</span></span>
        <span className="tabular-nums">Q8 {litri(r.litriQ8)} · Targa {litri(r.litriTarga)}</span>
      </div>
      {r.deltaLitri !== null && (
        <div className={`tabular-nums ${ammanco ? "font-semibold text-danger" : ""}`}>Delta {litriConSegno(r.deltaLitri)}{r.euro !== null ? ` ≈ ${euro(r.euro)}` : ""}</div>
      )}
      <div className="text-[13px] text-ink">{r.motivo}</div>
      {r.statoCambiato && <div className="text-xs text-[#6b4000]">{testoCambiato(r.statoCambiato.prima)}</div>}
      <div className="text-xs text-ink-muted">
        <div>Q8: {r.luogoQ8 ?? "—"}</div>
        <div>Targa: {r.luogoTarga ?? "—"}</div>
        {r.luogo !== "IGNOTO" && <div className={r.luogo === "DIVERSO" ? "font-medium text-warn" : ""}>{ESITO_LUOGO[r.luogo]}{r.distanzaKm !== null ? `, ${r.distanzaKm.toLocaleString("it-IT")} km` : ""}</div>}
        {(carte.length > 0 || r.abituale) && <div>{carte.length > 0 && <>Carta {carte.join(", ")}</>}{carte.length > 0 && r.abituale && " · "}{r.abituale && <>furgone abituale {r.abituale.targa}</>}</div>}
      </div>
      {r.archiviata && (
        <div className="text-xs"><span className="badge-neutral mr-1.5">Archiviata</span><b>{r.archiviata.motivo}</b>{r.archiviata.nota ? ` — ${r.archiviata.nota}` : ""} · da {r.archiviata.da}, il {quando(r.archiviata.il)}</div>
      )}
      <div className="flex flex-wrap items-center gap-3" data-guida={prima ? "azioni" : undefined}>
        <ApriGiornata r={r} giornataOk={giornataOk} className="text-sm font-medium text-brand underline" />
        {r.archiviata
          ? <button type="button" className="btn-secondary px-2.5 py-1 text-xs" disabled={riaprendo} onClick={onRiapri}>{riaprendo ? "Riapro…" : "Riapri"}</button>
          : <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={onGiustifica}>Giustifica / Archivia</button>}
      </div>
    </li>
  );
}

/** Riquadro "Giustifica / Archivia": motivo e note; dialog nativo (Esc chiude, il fuoco resta dentro). */
function DialogGiustifica({ riga, mese, onChiudi }: { riga: RigaVista; mese: string; onChiudi: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // il clic chiude sullo sfondo solo se anche la pressione è cominciata lì (non quando si seleziona del testo e si esce)
  const premutoSfondo = useRef(false);
  const [motivo, setMotivo] = useState<MotivoGiustifica>(MOTIVI_GIUSTIFICA[0]);
  const [nota, setNota] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [salvo, startSalvo] = useTransition();
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);

  const salva = (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo === MOTIVO_CON_NOTA && !nota.trim()) { setErrore("Con «Altro» scrivi una nota: serve a chi ricontrolla."); return; }
    setErrore(null);
    startSalvo(async () => {
      try {
        // con lo stato e i numeri di adesso: se la riga poi peggiora, torna da sola tra quelle da guardare
        await giustifica({ chiave: riga.chiave, mese, motivo, nota: nota.trim() || null, stato: riga.stato, deltaLitri: riga.deltaLitri, euro: riga.euro });
        ref.current?.close();
      } catch { setErrore("Non sono riuscito a salvare. Riprova tra poco."); }
    });
  };

  return (
    <dialog ref={ref} aria-labelledby="giustifica-titolo" onClose={onChiudi}
      onCancel={(e) => { if (salvo) e.preventDefault(); }}
      onPointerDown={(e) => { premutoSfondo.current = e.target === ref.current; }}
      onClick={(e) => { const sfondo = e.target === ref.current && premutoSfondo.current; premutoSfondo.current = false; if (sfondo && !salvo) ref.current?.close(); }}
      className="w-[min(520px,calc(100vw-24px))] max-w-none rounded-card border border-line bg-surface-raised p-0 text-ink shadow-lift backdrop:bg-black/40">
      <form onSubmit={salva} className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-5">
        <h2 id="giustifica-titolo" className="text-lg font-semibold">Giustifica / Archivia</h2>
        <div className="rounded-control bg-surface px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2"><BadgeStato stato={riga.stato} /><span>{giornoBreve(riga.giorno)} · {riga.targa ?? "furgone non trovato"} · {riga.flotta}</span></div>
          {(riga.deltaLitri !== null || riga.euro !== null) && <div className="mt-1 tabular-nums">Delta {litriConSegno(riga.deltaLitri)}{riga.euro !== null ? ` · ≈ ${euro(riga.euro)}` : ""}</div>}
          <div className="mt-1 text-ink-muted">{riga.motivo}</div>
          {riga.statoCambiato && <div className="mt-1 text-xs text-[#6b4000]">{testoCambiato(riga.statoCambiato.prima)}</div>}
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">Motivo</legend>
          {MOTIVI_GIUSTIFICA.map((m) => (
            <label key={m} className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="motivo" value={m} checked={motivo === m} onChange={() => setMotivo(m)} />{m}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Note {motivo === MOTIVO_CON_NOTA ? "(obbligatorie)" : "(facoltative)"}</span>
          <textarea className="input min-h-[80px]" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. furgone sostitutivo dal 3 al 10, telematica non montata" />
          <span className="self-end text-xs text-ink-muted">{nota.length}/500</span>
        </label>
        <p className="text-xs text-ink-muted">La riga sparisce dall&apos;elenco e non conta più nei totali. La ritrovi con «Mostra archiviate» e la puoi riaprire. Se con dati nuovi diventa più grave, torna da sola tra quelle da guardare.</p>
        {errore && <p className="text-sm text-danger" role="alert">{errore}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={salvo} onClick={() => ref.current?.close()}>Annulla</button>
          <button type="submit" className="btn-primary" disabled={salvo}>{salvo ? "Salvo…" : "Archivia"}</button>
        </div>
      </form>
    </dialog>
  );
}
