"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cartaNonAttribuita, confrontaImport, leggiCensimento, leggiMappaTelepass, type Carta, type Dispositivo } from "@/domain/telepass/anagrafiche";
import { DS_CARTA, STATION_TELEPASS } from "@/domain/telepass/comune";
import { leggiFile, PAGINA } from "@/lib/telepass/riconosci";
import { aggiornaCarta, aggiornaDispositivo, importaCarte, importaDispositivi, type RisultatoImport } from "../actions";
import { Dropzone } from "../Dropzone";

type DispRiga = Dispositivo & { note: string | null; nonPiuInFile: boolean; aggiornatoIl: string; aggiornatoDa: string | null };
type CartaRiga = Carta & { note: string | null; nonPiuInFile: boolean; aggiornatoIl: string; aggiornatoDa: string | null };
type ImportRiga = { id: string; tipo: string; nomeFile: string; righe: number; nuovi: number; aggiornati: number; invariati: number; spariti: number; eseguitoDa: string; eseguitoIl: string };

type Anteprima =
  | { tipo: "MAPPA"; nome: string; hash: string; righe: Dispositivo[]; conteggi: ReturnType<typeof confrontaImport> }
  | { tipo: "CENSIMENTO"; nome: string; hash: string; righe: Carta[]; conteggi: ReturnType<typeof confrontaImport> };

const data = (iso: string) => new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

export function AnagraficheClient({ canEdit, dispositivi, carte, imports }: { canEdit: boolean; dispositivi: DispRiga[]; carte: CartaRiga[]; imports: ImportRiga[] }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [errori, setErrori] = useState<React.ReactNode[]>([]);
  const [anteprime, setAnteprime] = useState<Anteprima[]>([]);
  const [esiti, setEsiti] = useState<{ nome: string; r: RisultatoImport }[]>([]);
  const [vista, setVista] = useState<"TELEPASS" | "CARTE">("TELEPASS");

  const carica = async (files: File[]) => {
    setLavoro(true); setErrori([]); setEsiti([]);
    const err: React.ReactNode[] = [];
    const out: Anteprima[] = [];
    for (const file of files) {
      try {
        const f = await leggiFile(file);
        if (f.tipo === "MAPPA") {
          const righe = leggiMappaTelepass(f.sheets);
          out.push({ tipo: "MAPPA", nome: f.nome, hash: f.hash, righe, conteggi: confrontaImport(dispositivi, righe, "codice", ["station", "targa", "progetto", "check"]) });
        } else if (f.tipo === "CENSIMENTO") {
          const righe = leggiCensimento(f.sheets);
          out.push({ tipo: "CENSIMENTO", nome: f.nome, hash: f.hash, righe, conteggi: confrontaImport(carte, righe, "pan", ["numeroCarta", "identificativo", "targa", "bloccata", "dataBlocco", "centroCosto", "appalto", "ds"]) });
        } else {
          err.push(<>{f.nome} è un {PAGINA[f.tipo].descr}: va nella pagina <Link className="font-semibold underline" href={PAGINA[f.tipo].href}>{PAGINA[f.tipo].nome}</Link>.</>);
        }
      } catch (e) {
        err.push(e instanceof Error ? e.message : String(e));
      }
    }
    setAnteprime(out); setErrori(err); setLavoro(false);
    if (out.length) setVista(out[0].tipo === "MAPPA" ? "TELEPASS" : "CARTE");
  };

  const conferma = async (a: Anteprima) => {
    setLavoro(true);
    try {
      const r = a.tipo === "MAPPA"
        ? await importaDispositivi({ nomeFile: a.nome, hash: a.hash, righe: a.righe })
        : await importaCarte({ nomeFile: a.nome, hash: a.hash, righe: a.righe.map(({ ordine, ...c }) => ({ ...c, ordine })) });
      setEsiti((x) => [...x, { nome: a.nome, r }]);
      setAnteprime((x) => x.filter((y) => y !== a));
      router.refresh();
    } catch (e) {
      setErrori([e instanceof Error ? e.message : "Errore durante l'import"]);
    } finally {
      setLavoro(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <Dropzone
          titolo="Trascina qui i file delle anagrafiche"
          testo={<><code>TBusiness_carica_veicoli.xlsx</code> (foglio TELEPASS FINALE) e/o il censimento <code>AAMM_Censimento_fuel_card.xlsx</code> (foglio Carte Q8 Flotte). Il tipo si riconosce dal contenuto.</>}
          accept=".xlsx,.xlsm" multiple lavoro={lavoro} onFiles={carica}
        />
      )}

      {errori.length > 0 && <ul className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{errori.map((e, i) => <li key={i}>• {e}</li>)}</ul>}

      {anteprime.map((a) => (
        <section key={a.hash} className="card border-brand p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">{a.tipo === "MAPPA" ? "Mappa Telepass" : "Censimento fuel card"}: {a.nome}</h2>
          <p className="mb-3 text-sm text-ink-muted">{a.righe.length} {a.tipo === "MAPPA" ? "dispositivi" : "carte"} nel file. Controlla il riepilogo e conferma: i record assenti dal file non si cancellano, vengono segnati &quot;non più nel file&quot;.</p>
          <Conteggi c={a.conteggi} />
          {a.conteggi.dettaglio.filter((d) => d.esito === "aggiornato").length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-brand">Cosa cambia ({a.conteggi.aggiornati})</summary>
              <ul className="mt-2 max-h-64 overflow-y-auto font-mono text-xs">
                {a.conteggi.dettaglio.filter((d) => d.esito === "aggiornato").slice(0, 300).map((d) => <li key={d.chiave}>{d.chiave}: {d.cambi.join("; ")}</li>)}
              </ul>
            </details>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary" disabled={lavoro} onClick={() => conferma(a)}>Conferma import</button>
            <button type="button" className="btn-secondary" disabled={lavoro} onClick={() => setAnteprime((x) => x.filter((y) => y !== a))}>Annulla</button>
          </div>
        </section>
      ))}

      {esiti.map((x, i) => (
        <section key={i} className="card bg-ok-soft p-4 text-sm">
          <p className="font-semibold text-ok">Import di {x.nome} completato</p>
          <Conteggi c={x.r} />
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setVista("TELEPASS")} className={vista === "TELEPASS" ? "btn-primary" : "btn-secondary"}>Dispositivi Telepass ({dispositivi.length})</button>
        <button type="button" onClick={() => setVista("CARTE")} className={vista === "CARTE" ? "btn-primary" : "btn-secondary"}>Fuel card ({carte.length})</button>
      </div>

      {vista === "TELEPASS" ? <TabellaDispositivi righe={dispositivi} canEdit={canEdit} /> : <TabellaCarte righe={carte} canEdit={canEdit} />}

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Storico import</h2>
        {imports.length === 0 ? <p className="text-sm text-ink-muted">Nessun import ancora.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>Quando</th><th>Anagrafica</th><th>File</th><th>Righe</th><th>Nuovi</th><th>Aggiornati</th><th>Invariati</th><th>Spariti</th><th>Da</th></tr></thead>
            <tbody>{imports.map((r) => <tr key={r.id}><td>{data(r.eseguitoIl)}</td><td>{r.tipo === "TELEPASS" ? "Telepass" : "Fuel card"}</td><td className="text-xs">{r.nomeFile}</td><td>{r.righe}</td><td>{r.nuovi}</td><td>{r.aggiornati}</td><td>{r.invariati}</td><td className={r.spariti ? "font-semibold text-warn" : ""}>{r.spariti}</td><td>{r.eseguitoDa}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Conteggi({ c }: { c: { nuovi: number; aggiornati: number; invariati: number; spariti: number } }) {
  const box = (l: string, n: number, cls = "") => <div className="rounded-control border border-line bg-surface-raised px-3 py-2"><div className="text-xs text-ink-muted">{l}</div><div className={`text-xl font-bold ${n ? cls : ""}`}>{n}</div></div>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {box("Nuovi", c.nuovi, "text-ok")}{box("Aggiornati", c.aggiornati, "text-info")}{box("Invariati", c.invariati)}{box("Spariti dal file", c.spariti, "text-warn")}
    </div>
  );
}

function TabellaDispositivi({ righe, canEdit }: { righe: DispRiga[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [st, setSt] = useState("TUTTE");
  const [filtro, setFiltro] = useState("TUTTI");
  const [edit, setEdit] = useState<string | null>(null);
  const stazioni = useMemo(() => [...new Set(righe.map((r) => r.station))].sort(), [righe]);
  const vis = righe.filter((r) =>
    (st === "TUTTE" || r.station === st) &&
    (filtro === "TUTTI" || (filtro === "SPARITI" ? r.nonPiuInFile : filtro === "NONSTD" ? !STATION_TELEPASS.includes(r.station) : r.check !== "Attivo")) &&
    (!q || `${r.codice} ${r.targa ?? ""} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="card p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-[19px] font-semibold">Dispositivi Telepass ({vis.length})</h2>
        <input className="input h-10 w-56" placeholder="Cerca codice, targa, note" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-10 w-48" value={st} onChange={(e) => setSt(e.target.value)}><option value="TUTTE">Tutte le station</option>{stazioni.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input h-10 w-56" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="TUTTI">Tutti</option><option value="NONSTD">STATION non standard</option><option value="SPARITI">Non più nel file</option><option value="NONATTIVI">Bloccati / disattivi</option>
        </select>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="table-base text-sm">
          <thead className="sticky top-0 bg-surface-raised"><tr><th>Dispositivo</th><th>Station</th><th>Targa (Area C)</th><th>Progetto</th><th>Check</th><th>Note</th><th>Aggiornato</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {vis.map((r) => edit === r.codice
              ? <RigaEdit key={r.codice} chiave={r.codice} valore={r.station} opzioni={STATION_TELEPASS} note={r.note}
                  onSave={async (v, note) => { await aggiornaDispositivo(r.codice, { station: v, note }); setEdit(null); }} onCancel={() => setEdit(null)}
                  prima={<><td>{r.targa ?? "—"}</td><td>{r.progetto ?? ""}</td><td>{r.check ?? ""}</td></>} />
              : (
                <tr key={r.codice} className={r.nonPiuInFile ? "opacity-60" : ""}>
                  <td className="font-mono">{r.codice}{r.nonPiuInFile && <span className="ml-2 badge-warn">non più nel file</span>}</td>
                  <td className={STATION_TELEPASS.includes(r.station) ? "font-semibold" : "font-semibold text-warn"} title={STATION_TELEPASS.includes(r.station) ? "" : "station non standard: nelle elaborazioni diventa GLS - CASTEL MAGGIORE"}>{r.station || "—"}</td>
                  <td>{r.targa ?? "—"}</td><td>{r.progetto ?? ""}</td><td>{r.check ?? ""}</td><td className="text-ink-muted">{r.note ?? ""}</td>
                  <td className="text-xs text-ink-muted">{data(r.aggiornatoIl)}{r.aggiornatoDa ? ` · ${r.aggiornatoDa}` : ""}</td>
                  {canEdit && <td><button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setEdit(r.codice)}>Modifica</button></td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TabellaCarte({ righe, canEdit }: { righe: CartaRiga[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [ds, setDs] = useState("TUTTE");
  const [filtro, setFiltro] = useState("TUTTI");
  const [edit, setEdit] = useState<string | null>(null);
  const dss = useMemo(() => [...new Set(righe.map((r) => r.ds ?? ""))].sort(), [righe]);
  const nonAttr = righe.filter((r) => cartaNonAttribuita(r.ds) && !r.nonPiuInFile).length;
  const vis = righe.filter((r) =>
    (ds === "TUTTE" || (r.ds ?? "") === ds) &&
    (filtro === "TUTTI" || (filtro === "NONATTR" ? cartaNonAttribuita(r.ds) : filtro === "SPARITI" ? r.nonPiuInFile : r.bloccata?.toUpperCase() === "SI")) &&
    (!q || `${r.pan} ${r.identificativo ?? ""} ${r.targa ?? ""} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="card p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-[19px] font-semibold">Fuel card ({vis.length}){nonAttr > 0 && <button type="button" onClick={() => setFiltro("NONATTR")} className="ml-3 badge-warn align-middle">{nonAttr} non attribuite</button>}</h2>
        <input className="input h-10 w-56" placeholder="Cerca PAN, identificativo, targa" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-10 w-40" value={ds} onChange={(e) => setDs(e.target.value)}><option value="TUTTE">Tutte le DS</option>{dss.map((s) => <option key={s} value={s}>{s || "(vuoto)"}</option>)}</select>
        <select className="input h-10 w-52" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="TUTTI">Tutte</option><option value="NONATTR">Non attribuite (DS vuoto / da verificare)</option><option value="SPARITI">Non più nel file</option><option value="BLOCCATE">Bloccate</option>
        </select>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="table-base text-sm">
          <thead className="sticky top-0 bg-surface-raised"><tr><th>PAN</th><th>Identificativo</th><th>DS</th><th>Appalto</th><th>Targa</th><th>Bloccata</th><th>Centro di costo</th><th>Note</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {vis.map((r) => edit === r.pan
              ? <RigaCartaEdit key={r.pan} r={r} onDone={() => setEdit(null)} />
              : (
                <tr key={r.pan} className={`${r.nonPiuInFile ? "opacity-60" : ""} ${cartaNonAttribuita(r.ds) ? "bg-warn-soft" : ""}`}>
                  <td className="font-mono text-xs">{r.pan}{r.nonPiuInFile && <span className="ml-2 badge-warn">non più nel file</span>}</td>
                  <td className="font-semibold">{r.identificativo ?? "—"}</td>
                  <td className={cartaNonAttribuita(r.ds) ? "font-bold text-warn" : "font-semibold"}>{r.ds || "—"}</td>
                  <td>{r.appalto ?? ""}</td><td>{r.targa ?? ""}</td><td>{r.bloccata ?? ""}{r.dataBlocco ? ` (${r.dataBlocco.split("-").reverse().join("/")})` : ""}</td><td>{r.centroCosto ?? ""}</td><td className="text-ink-muted">{r.note ?? ""}</td>
                  {canEdit && <td><button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setEdit(r.pan)}>Modifica</button></td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RigaEdit({ chiave, valore, opzioni, note, prima, onSave, onCancel }: {
  chiave: string; valore: string; opzioni: string[]; note: string | null; prima: React.ReactNode; onSave: (v: string, note: string) => Promise<void>; onCancel: () => void;
}) {
  const [v, setV] = useState(valore);
  const [n, setN] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const opz = opzioni.includes(valore) || !valore ? opzioni : [valore, ...opzioni];
  return (
    <tr className="bg-brand-light">
      <td className="font-mono">{chiave}</td>
      <td><select className="input h-9 w-52" value={v} onChange={(e) => setV(e.target.value)}>{opz.map((o) => <option key={o}>{o}</option>)}</select></td>
      {prima}
      <td><input className="input h-9 w-56" value={n} onChange={(e) => setN(e.target.value)} placeholder="Note" maxLength={500} /></td>
      <td colSpan={2}><div className="flex gap-2">
        <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(v, n); } finally { setBusy(false); } }}>Salva</button>
        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={onCancel}>Annulla</button>
      </div></td>
    </tr>
  );
}

function RigaCartaEdit({ r, onDone }: { r: CartaRiga; onDone: () => void }) {
  const [ds, setDs] = useState(r.ds ?? "");
  const [app, setApp] = useState(r.appalto ?? "");
  const [n, setN] = useState(r.note ?? "");
  const [busy, setBusy] = useState(false);
  const opz = ["", "Da verificare", ...DS_CARTA];
  return (
    <tr className="bg-brand-light">
      <td className="font-mono text-xs">{r.pan}</td><td className="font-semibold">{r.identificativo ?? "—"}</td>
      <td><select className="input h-9 w-36" value={ds} onChange={(e) => setDs(e.target.value)}>{(opz.includes(ds) ? opz : [ds, ...opz]).map((o) => <option key={o} value={o}>{o || "(vuoto)"}</option>)}</select></td>
      <td><select className="input h-9 w-24" value={app} onChange={(e) => setApp(e.target.value)}><option value=""></option><option>AMZ</option><option>GLS</option></select></td>
      <td>{r.targa ?? ""}</td><td>{r.bloccata ?? ""}</td><td>{r.centroCosto ?? ""}</td>
      <td><input className="input h-9 w-48" value={n} onChange={(e) => setN(e.target.value)} placeholder="Note" maxLength={500} /></td>
      <td><div className="flex gap-2">
        <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={async () => { setBusy(true); try { await aggiornaCarta(r.pan, { ds, appalto: app, note: n }); onDone(); } finally { setBusy(false); } }}>Salva</button>
        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={onDone}>Annulla</button>
      </div></td>
    </tr>
  );
}
