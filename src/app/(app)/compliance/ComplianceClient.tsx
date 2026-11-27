"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RigaVista } from "@/lib/compliance/dati";
import { giorniA, it, MESI, NOME_REGOLA, nomeMese, REGOLE, type Regola } from "@/domain/compliance/scadenze";
import { chiusa, COLORE_STATO, mia, NOME_STATO, puoSpuntare, puoTogliereSpunta, scaduta, STATI, type Stato } from "@/domain/compliance/stato";
import { FAC_SIMILE } from "@/domain/compliance/seed";
import { mailRichiesta, mailSollecito, mailto, nomeEntita } from "@/domain/compliance/mail";
import { daIndirizzo, type Differenza } from "@/domain/compliance/importa";
import { anteprimaImport, applicaImport, cambiaStato, generaMeseAzione, salvaTemplate, segnaRichiesti, spunta, togliSpunta } from "./actions";

type Tpl = { id: string; entita: string; area: string; folder: string; documento: string; formato: string; nomeFileStandard: string; regolaScadenza: string; mesiAttivi: string; owner: string; ownerEmail: string; usato: boolean };
type Vista = "OGGI" | "MESE" | "TRE" | "SCADENZE" | "FAC" | "MAIL" | "GESTIONE";
type Props = { righe: RigaVista[]; oggi: string; admin: boolean; io: { id: string; nome: string; cognome: string }; template: Tpl[] };

const ora = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const fac = (codice: string | null) => (codice ? FAC_SIMILE[codice] ?? [] : []);
const urlFac = (file: string) => `/api/compliance/fac-simile/${encodeURIComponent(file)}`;

function Etichetta({ r, oggi }: { r: RigaVista; oggi: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLORE_STATO[r.stato]}`}>{NOME_STATO[r.stato]}</span>
      {scaduta(r, r.workflow, oggi) && <span className="rounded-full bg-black px-2 py-0.5 text-xs font-semibold text-white">SCADUTO</span>}
    </span>
  );
}

function Mancano({ data, oggi }: { data: string | null; oggi: string }) {
  if (!data) return <span className="text-ink-faint">—</span>;
  const g = giorniA(data, oggi);
  return <span className="whitespace-nowrap">{it(data)} <span className={`text-xs ${g < 0 ? "font-semibold text-red-700" : g <= 7 ? "font-semibold text-orange-700" : "text-ink-muted"}`}>({g < 0 ? `${-g} gg fa` : g === 0 ? "oggi" : `tra ${g} gg`})</span></span>;
}

export function ComplianceClient({ righe, oggi, admin, io, template }: Props) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("OGGI");
  const [soloMie, setSoloMie] = useState(false);
  const [entita, setEntita] = useState<"TUTTE" | "PS" | "ADECCO">("TUTTE");
  const mesi = useMemo(() => [...new Set(righe.map((r) => `${r.anno}-${String(r.mese).padStart(2, "0")}`))].sort(), [righe]);
  const [meseSel, setMeseSel] = useState(() => mesi.filter((m) => m <= oggi.slice(0, 7)).slice(-2)[0] ?? mesi[0] ?? oggi.slice(0, 7));
  const [attesa, parti] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  // arrivo dal segnalibro del portale: i dati sono nell'indirizzo dopo il cancelletto. Li passo all'import e pulisco l'indirizzo
  const [daPortale, setDaPortale] = useState<string | null>(null);
  useEffect(() => {
    const j = daIndirizzo(window.location.hash);
    if (j === null) return;
    router.replace(window.location.pathname, { scroll: false });
    if (admin) { setDaPortale(j); setVista("GESTIONE"); } else setErrore("L'import dal portale lo può fare solo l'amministratore del registro.");
  }, [admin]); // eslint-disable-line react-hooks/exhaustive-deps
  const fai = (f: () => Promise<unknown>) => parti(async () => { setErrore(null); try { await f(); router.refresh(); } catch (e) { setErrore(e instanceof Error ? e.message : "Operazione non riuscita"); } });

  const filtrate = righe.filter((r) => (entita === "TUTTE" || r.entita === entita) && (!soloMie || mia(r.owner, io)));
  const aperte = filtrate.filter((r) => !chiusa(r.stato, r.workflow)).sort((a, b) => (a.scadenzaInterna ?? "9999").localeCompare(b.scadenzaInterna ?? "9999") || a.entita.localeCompare(b.entita));
  const tutteAperte = righe.filter((r) => !chiusa(r.stato, r.workflow));
  const conta = { scaduti: tutteAperte.filter((r) => scaduta(r, r.workflow, oggi)).length, sette: tutteAperte.filter((r) => r.scadenzaPortale && !scaduta(r, r.workflow, oggi) && giorniA(r.scadenzaPortale, oggi) <= 7).length, respinti: tutteAperte.filter((r) => r.stato === "RESPINTO").length };

  const spuntaRiga = (r: RigaVista) => { const n = window.prompt(`Nome del file caricato sul portale (facoltativo)\n${r.nomeFileStandard ? `Standard: ${r.nomeFileStandard}` : ""}`, ""); if (n === null) return; fai(() => spunta(r.id, n)); };

  const Riga = ({ r }: { r: RigaVista }) => (
    <article className="card flex flex-col gap-2 p-3 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-ink-muted">{nomeEntita(r.entita)} · {r.area} · {nomeMese(r.anno, r.mese)}</div>
          <Link href={`/compliance/riga/${r.id}`} className="font-semibold text-brand hover:underline">{r.folder}</Link>
          <div className="text-sm text-ink-muted">{r.documento} <span className="whitespace-nowrap">({r.formato})</span></div>
        </div>
        <Etichetta r={r} oggi={oggi} />
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div><span className="text-ink-muted">Chi: </span>{r.owner}</div>
        <div><span className="text-ink-muted">Interna: </span><Mancano data={r.scadenzaInterna} oggi={oggi} /></div>
        <div><span className="text-ink-muted">Portale: </span><Mancano data={r.scadenzaPortale} oggi={oggi} /></div>
      </div>
      {r.stato === "RESPINTO" && r.motivoRifiuto && <p className="rounded-control bg-red-50 px-2 py-1 text-sm text-red-800">Respinto dal portale: {r.motivoRifiuto}</p>}
      {r.caricatoDa && r.caricatoIl && <p className="text-sm">✓ Caricato da <b>{r.caricatoDa}</b> il {ora(r.caricatoIl)}{r.nomeFileCaricato ? <> · <span className="break-all">{r.nomeFileCaricato}</span></> : ""}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {puoSpuntare(r.stato) && <button type="button" className="btn-primary min-h-[40px] px-3" disabled={attesa} onClick={() => spuntaRiga(r)}>☐ Caricato sul portale</button>}
        {puoTogliereSpunta(r, { id: io.id, admin }) && <button type="button" className="btn-secondary min-h-[40px] px-3" disabled={attesa} onClick={() => fai(() => togliSpunta(r.id))}>Togli la spunta</button>}
        {fac(r.facSimile).map((f) => <a key={f.file} className="underline" href={urlFac(f.file)}>Fac-simile{fac(r.facSimile).length > 1 ? `: ${f.nome.replace(/.*\(|\)/g, "")}` : ""}</a>)}
        {admin && (
          <select className="input ml-auto h-10 w-auto text-sm" aria-label={`Stato di ${r.folder}`} value={r.stato} disabled={attesa}
            onChange={(e) => { const s = e.target.value as Stato; let m = ""; if (s === "RESPINTO") { m = window.prompt("Motivo del rifiuto (obbligatorio)", "FileNonConforme") ?? ""; if (!m.trim()) return; } fai(() => cambiaStato(r.id, s, m, r.note ?? "")); }}>
            {STATI.map((s) => <option key={s} value={s}>{NOME_STATO[s]}</option>)}
          </select>
        )}
      </div>
    </article>
  );

  const [anno, mm] = meseSel.split("-").map(Number);
  const delMese = righe.filter((r) => r.anno === anno && r.mese === mm && (entita === "TUTTE" || r.entita === entita));
  const pct = (q: RigaVista[]) => { const u = q.filter((r) => r.stato !== "NON_APPLICABILE"); return u.length ? Math.round((u.filter((r) => chiusa(r.stato, r.workflow)).length / u.length) * 100) : 0; };
  const csv = `/api/compliance/csv?mese=${meseSel}${entita === "TUTTE" ? "" : `&entita=${entita}`}`;
  const tre = mesi.slice(Math.max(0, mesi.indexOf(meseSel) - 1), Math.max(0, mesi.indexOf(meseSel) - 1) + 3);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {([["Scaduti", conta.scaduti, "text-red-700"], ["Entro 7 giorni", conta.sette, "text-orange-700"], ["Respinti", conta.respinti, "text-red-900"]] as const).map(([t, n, c]) => <div key={t} className="card p-3"><div className="text-xs text-ink-muted">{t}</div><div className={`text-2xl font-semibold ${n ? c : "text-ink-faint"}`}>{n}</div></div>)}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Viste del registro">
        {([["OGGI", "Cosa fare oggi"], ["MESE", "Mese"], ["TRE", "3 mesi"], ["SCADENZE", "Scadenze"], ["FAC", "Fac-simile"], ...(admin ? [["MAIL", "Richieste e solleciti"], ["GESTIONE", "Gestione"]] : [])] as [Vista, string][]).map(([v, n]) => <button key={v} type="button" onClick={() => setVista(v)} aria-current={vista === v ? "page" : undefined} className={`h-10 rounded-full border px-4 text-sm font-semibold ${vista === v ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink"}`}>{n}</button>)}
      </nav>
      {vista !== "FAC" && vista !== "GESTIONE" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["TUTTE", "PS", "ADECCO"] as const).map((e) => <button key={e} type="button" onClick={() => setEntita(e)} className={entita === e ? "btn-primary" : "btn-secondary"}>{e === "TUTTE" ? "Tutte" : e === "PS" ? "Professional Solutions" : "Adecco"}</button>)}
          {(vista === "OGGI" || vista === "SCADENZE") && <label className="ml-1 flex min-h-[40px] items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={soloMie} onChange={(e) => setSoloMie(e.target.checked)} />Solo le mie</label>}
          {(vista === "MESE" || vista === "TRE") && <select className="input h-10 w-auto" aria-label="Mese di competenza" value={meseSel} onChange={(e) => setMeseSel(e.target.value)}>{mesi.map((m) => <option key={m} value={m}>{nomeMese(Number(m.slice(0, 4)), Number(m.slice(5)))}</option>)}</select>}
        </div>
      )}
      {errore && <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}

      {vista === "OGGI" && (aperte.length === 0 ? <p className="card bg-ok-soft p-4 text-sm text-ok">✓ Niente di aperto{soloMie ? " tra le tue righe" : ""}.</p> : <div className="flex flex-col gap-2">{aperte.map((r) => <Riga key={r.id} r={r} />)}</div>)}

      {vista === "MESE" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm"><span>Chiuse: <b>{pct(delMese)}%</b> delle righe di {nomeMese(anno, mm)}</span><a className="btn-secondary ml-auto" href={csv}>Scarica CSV</a></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1 pr-3 font-normal">Folder</th><th className="py-1 pr-3 font-normal">Stato</th><th className="py-1 pr-3 font-normal">Interna</th><th className="py-1 pr-3 font-normal">Portale</th><th className="py-1 pr-3 font-normal">Chi</th><th className="py-1 pr-3 font-normal">Caricato da</th></tr></thead>
              <tbody>
                {delMese.map((r, i) => (
                  <tr key={r.id} className={`border-t border-line align-top ${i > 0 && (delMese[i - 1].entita !== r.entita || delMese[i - 1].area !== r.area) ? "border-t-2 border-t-ink-faint" : ""}`}>
                    <td className="py-1.5 pr-3"><Link className="font-medium text-brand hover:underline" href={`/compliance/riga/${r.id}`}>{r.folder}</Link><div className="text-xs text-ink-muted">{r.entita} · {r.area}</div></td>
                    <td className="py-1.5 pr-3"><Etichetta r={r} oggi={oggi} /></td>
                    <td className="py-1.5 pr-3"><Mancano data={r.scadenzaInterna} oggi={oggi} /></td>
                    <td className="py-1.5 pr-3"><Mancano data={r.scadenzaPortale} oggi={oggi} /></td>
                    <td className="py-1.5 pr-3">{r.owner}</td>
                    <td className="py-1.5 pr-3">{r.caricatoDa && r.caricatoIl ? <>{r.caricatoDa}<div className="text-xs text-ink-muted">{ora(r.caricatoIl)}</div></> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vista === "TRE" && (["PS", "ADECCO"] as const).filter((e) => entita === "TUTTE" || entita === e).map((e) => {
        const q = righe.filter((r) => r.entita === e && tre.includes(`${r.anno}-${String(r.mese).padStart(2, "0")}`));
        const folder = [...new Map(q.map((r) => [`${r.area}|${r.folder}`, r])).values()].sort((a, b) => b.area.localeCompare(a.area) || a.ordine - b.ordine);
        return (
          <section key={e} className="card overflow-x-auto p-3 md:p-4">
            <h2 className="mb-2 text-base font-semibold">{nomeEntita(e)}</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1 pr-2 font-normal">Folder</th>{tre.map((m) => <th key={m} className="py-1 pr-2 text-center font-normal">{MESI[Number(m.slice(5)) - 1].slice(0, 3)}<div>{pct(q.filter((r) => `${r.anno}-${String(r.mese).padStart(2, "0")}` === m))}%</div></th>)}</tr></thead>
              <tbody>{folder.map((f) => <tr key={`${f.area}|${f.folder}`} className="border-t border-line"><td className="py-1 pr-2">{f.folder}{f.area === "Fiscale" && <span className="text-xs text-ink-muted"> · Fiscale</span>}</td>{tre.map((m) => { const r = q.find((x) => x.area === f.area && x.folder === f.folder && `${x.anno}-${String(x.mese).padStart(2, "0")}` === m); return <td key={m} className="py-1 pr-2 text-center">{r ? <Link href={`/compliance/riga/${r.id}`} title={`${NOME_STATO[r.stato]}${scaduta(r, r.workflow, oggi) ? " · scaduto" : ""}`} className={`inline-block h-6 w-12 rounded ${COLORE_STATO[r.stato]} ${scaduta(r, r.workflow, oggi) ? "ring-2 ring-black" : ""}`}><span className="sr-only">{NOME_STATO[r.stato]}</span></Link> : <span className="text-ink-faint">–</span>}</td>; })}</tr>)}</tbody>
            </table>
            <p className="mt-2 flex flex-wrap gap-2 text-xs">{STATI.map((s) => <span key={s} className={`rounded px-1.5 py-0.5 ${COLORE_STATO[s]}`}>{NOME_STATO[s]}</span>)}<span className="rounded px-1.5 py-0.5 ring-2 ring-black">scaduto</span></p>
          </section>
        );
      })}

      {vista === "SCADENZE" && (() => {
        const q = aperte.filter((r) => r.scadenzaPortale && giorniA(r.scadenzaPortale, oggi) <= 60).sort((a, b) => a.scadenzaPortale!.localeCompare(b.scadenzaPortale!));
        const date = [...new Set(q.map((r) => r.scadenzaPortale!))];
        return q.length === 0 ? <p className="card p-4 text-sm text-ink-muted">Nessuna scadenza aperta nei prossimi 60 giorni.</p> : (
          <div className="flex flex-col gap-3">{date.map((d) => <section key={d} className="card p-3 md:p-4"><h2 className="mb-1 text-base font-semibold"><Mancano data={d} oggi={oggi} /> <span className="text-xs font-normal text-ink-muted">scadenza del portale</span></h2><ul className="flex flex-col gap-1 text-sm">{q.filter((r) => r.scadenzaPortale === d).map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2"><Etichetta r={r} oggi={oggi} /><Link className="font-medium text-brand hover:underline" href={`/compliance/riga/${r.id}`}>{r.folder}</Link><span className="text-ink-muted">{r.entita} · {nomeMese(r.anno, r.mese)} · {r.owner}</span></li>)}</ul></section>)}</div>
        );
      })()}

      {vista === "FAC" && (
        <div className="flex flex-col gap-3">
          <div><a className="btn-primary" href="/api/compliance/fac-simile/tutti.zip">Scarica tutti i fac-simile (zip)</a></div>
          {([["PS e Adecco", ["01", "02", "03", "04", "05", "06", "07", "08", "09"]], ["Solo Professional Solutions", ["11", "12", "13"]], ["Solo Adecco", ["A1", "A2"]], ["No workflow (li vede solo Amazon)", ["14", "15", "16"]]] as [string, string[]][]).map(([t, codici]) => (
            <section key={t} className="card p-3 md:p-4"><h2 className="mb-2 text-base font-semibold">{t}</h2><ul className="flex flex-col gap-1 text-sm">{codici.flatMap((c) => fac(c)).map((f) => <li key={f.file}><a className="flex min-h-[40px] items-center underline" href={urlFac(f.file)}>{f.nome} <span className="ml-1 text-xs text-ink-muted">({f.file.split(".").pop()})</span></a></li>)}</ul></section>
          ))}
          <p className="text-xs text-ink-muted">Scaricati dal portale il 27/11/2026. &quot;Varie&quot; e &quot;F24 Dilazioni&quot; non hanno fac-simile. Regole di caricamento: PDF originale (xlsx dove ammesso), 2 MB per file.</p>
        </div>
      )}

      {vista === "MAIL" && admin && <Mail righe={righe.filter((r) => entita === "TUTTE" || r.entita === entita)} oggi={oggi} attesa={attesa} fai={fai} />}
      {vista === "GESTIONE" && admin && <Gestione template={template} attesa={attesa} fai={fai} oggi={oggi} daPortale={daPortale} />}
    </div>
  );
}

/** Richieste (righe da richiedere) e solleciti (richieste vicine alla scadenza interna), una mail per persona, entità e mese. */
function Mail({ righe, oggi, attesa, fai }: { righe: RigaVista[]; oggi: string; attesa: boolean; fai: (f: () => Promise<unknown>) => void }) {
  const gruppi = (q: RigaVista[]) => [...q.reduce((m, r) => { const k = `${r.owner}|${r.entita}|${r.anno}|${r.mese}`; m.set(k, [...(m.get(k) ?? []), r]); return m; }, new Map<string, RigaVista[]>()).values()].sort((a, b) => (a[0].anno - b[0].anno) || (a[0].mese - b[0].mese) || a[0].owner.localeCompare(b[0].owner));
  const richieste = gruppi(righe.filter((r) => r.stato === "DA_RICHIEDERE")), solleciti = gruppi(righe.filter((r) => r.stato === "RICHIESTO" && r.scadenzaInterna && giorniA(r.scadenzaInterna, oggi) <= 3));
  const saluto = (owner: string) => (owner.includes("/") ? "a tutti" : owner.split(" ")[0]);
  const rm = (r: RigaVista) => ({ folder: r.folder, area: r.area, documento: r.documento, formato: r.formato, nomeFileStandard: r.nomeFileStandard, scadenzaInterna: r.scadenzaInterna, scadenzaPortale: r.scadenzaPortale, dataRichiesta: r.dataRichiesta });
  const Blocco = ({ g, tipo }: { g: RigaVista[]; tipo: "R" | "S" }) => {
    const p = { nome: saluto(g[0].owner), entita: g[0].entita, anno: g[0].anno, mese: g[0].mese, righe: g.map(rm) };
    const m = tipo === "R" ? mailRichiesta({ ...p, link: `${typeof window === "undefined" ? "" : window.location.origin}/compliance` }) : mailSollecito(p);
    return (
      <section className="card flex flex-col gap-2 p-3 md:p-4">
        <div><h3 className="font-semibold">{g[0].owner} · {nomeEntita(g[0].entita)} · {nomeMese(g[0].anno, g[0].mese)}</h3><p className="text-xs text-ink-muted">{g.length} {g.length === 1 ? "documento" : "documenti"}: {g.map((r) => r.folder).join(", ")}</p></div>
        {!g[0].ownerEmail && <p className="text-xs text-orange-700">Manca l&apos;email di {g[0].owner}: mettila in Gestione → Anagrafica, oppure scrivi il destinatario a mano nella mail.</p>}
        <div className="flex flex-wrap gap-2">
          <a className="btn-primary" href={mailto(g[0].ownerEmail, m)}>{tipo === "R" ? "Apri la mail di richiesta" : "Apri il sollecito"}</a>
          {tipo === "R" && <button type="button" className="btn-secondary" disabled={attesa} onClick={() => { if (window.confirm(`Segno come "Richiesto" ${g.length} righe di ${g[0].owner}?`)) fai(() => segnaRichiesti(g.map((r) => r.id))); }}>Mail inviata: segna Richiesto</button>}
        </div>
      </section>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Il sito non invia mail: il pulsante apre il tuo programma di posta con il testo già scritto. Dopo averla inviata, premi &quot;segna Richiesto&quot;.</p>
      <div><h2 className="mb-2 text-[17px] font-semibold">Da richiedere ({richieste.length})</h2>{richieste.length ? <div className="grid gap-2 md:grid-cols-2">{richieste.map((g) => <Blocco key={g[0].id} g={g} tipo="R" />)}</div> : <p className="text-sm text-ink-muted">Niente da richiedere.</p>}</div>
      <div><h2 className="mb-2 text-[17px] font-semibold">Da sollecitare ({solleciti.length})</h2><p className="mb-2 text-xs text-ink-muted">Richieste ancora senza documento a 3 giorni o meno dalla scadenza interna.</p>{solleciti.length ? <div className="grid gap-2 md:grid-cols-2">{solleciti.map((g) => <Blocco key={g[0].id} g={g} tipo="S" />)}</div> : <p className="text-sm text-ink-muted">Niente da sollecitare.</p>}</div>
    </div>
  );
}

function Gestione({ template, attesa, fai, oggi, daPortale }: { template: Tpl[]; attesa: boolean; fai: (f: () => Promise<unknown>) => void; oggi: string; daPortale: string | null }) {
  const [mese, setMese] = useState(oggi.slice(0, 7));
  const [esito, setEsito] = useState<string | null>(null);
  const [json, setJson] = useState(daPortale ?? "");
  const [ante, setAnte] = useState<{ diff: Differenza[]; nonTrovati: string[]; lettoIl: string } | null>(null);
  const [errJson, setErrJson] = useState<string | null>(null);
  const [mod, setMod] = useState<Tpl | null>(null);
  const vedi = (testo: string) => fai(async () => { setErrJson(null); const r = await anteprimaImport(testo); if ("errore" in r) { setErrJson(r.errore); setAnte(null); } else setAnte(r); });
  // dati arrivati dal segnalibro: mostro subito le differenze, senza incollare nulla. Applicare resta una scelta
  useEffect(() => { if (daPortale) vedi(daPortale); }, [daPortale]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-2 p-3 md:p-4">
        <h2 className="text-base font-semibold">Genera mese</h2>
        <p className="text-sm text-ink-muted">Crea le righe di un mese di competenza dall&apos;anagrafica. Si può rilanciare: non crea doppioni e non tocca le righe che ci sono già.</p>
        <div className="flex flex-wrap items-center gap-2"><input type="month" className="input h-10 w-auto" value={mese} onChange={(e) => setMese(e.target.value)} aria-label="Mese di competenza" /><button type="button" className="btn-primary" disabled={attesa || !mese} onClick={() => fai(async () => { const r = await generaMeseAzione(Number(mese.slice(0, 4)), Number(mese.slice(5))); setEsito(r.create ? `Create ${r.create} righe.` : "Il mese c'era già: nessuna riga nuova."); })}>Genera</button>{esito && <span className="text-sm text-ok">{esito}</span>}</div>
      </section>
      <section className="card flex flex-col gap-2 p-3 md:p-4">
        <h2 className="text-base font-semibold">Import dello stato dal portale</h2>
        <p className="text-sm text-ink-muted">Con il segnalibro del portale i dati arrivano qui da soli; altrimenti incolla il JSON della lettura. Prima vedi le differenze, poi decidi se applicarle. Non crea righe, non cancella niente e non tocca chi ha caricato e quando.</p>
        {daPortale && <p className="rounded-control bg-brand-light px-3 py-2 text-sm text-brand">Dati arrivati dal portale con il segnalibro: controlla le differenze qui sotto e premi Applica.</p>}
        <textarea className="input min-h-[120px] font-mono text-xs" value={json} onChange={(e) => { setJson(e.target.value); setAnte(null); }} placeholder='{"letto_il": "2026-11-27T16:10:00", "righe": [ … ]}' aria-label="JSON letto dal portale" />
        <div><button type="button" className="btn-secondary" disabled={attesa || !json.trim()} onClick={() => vedi(json)}>Vedi le differenze</button></div>
        {errJson && <p role="alert" className="text-sm text-red-700">{errJson}</p>}
        {ante && (
          <div className="flex flex-col gap-2 text-sm">
            <p>Lettura del {ante.lettoIl.replace("T", " ")}: <b>{ante.diff.length}</b> differenze.</p>
            {ante.nonTrovati.length > 0 && <p className="rounded-control bg-orange-50 px-2 py-1 text-orange-800">Folder non trovati nel registro (non li creo): {ante.nonTrovati.join("; ")}</p>}
            <ul className="flex flex-col gap-1">{ante.diff.map((d) => <li key={d.id} className="border-t border-line pt-1"><b>{d.chi}</b>{d.statoDopo && <>: {NOME_STATO[d.statoPrima]} → <b>{NOME_STATO[d.statoDopo]}</b>{d.motivo ? ` (${d.motivo})` : ""}</>}{d.scadenzaDopo && <> · scadenza {it(d.scadenzaPrima) || "—"} → <b>{it(d.scadenzaDopo)}</b></>}{d.avviso && <div className="text-orange-800">{d.avviso}</div>}</li>)}</ul>
            {ante.diff.some((d) => d.statoDopo || d.scadenzaDopo) && <div><button type="button" className="btn-primary" disabled={attesa} onClick={() => fai(async () => { const r = await applicaImport(json); setAnte(null); setJson(""); setErrJson(`Applicate ${r.applicate} modifiche.`); })}>Applica</button></div>}
          </div>
        )}
      </section>
      <section className="card flex flex-col gap-2 p-3 md:p-4">
        <h2 className="text-base font-semibold">Anagrafica dei folder</h2>
        <p className="text-sm text-ink-muted">Il nome del folder è quello del portale e non si cambia. Le modifiche valgono per i mesi generati da adesso in poi.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1 pr-3 font-normal">Folder</th><th className="py-1 pr-3 font-normal">Chi</th><th className="py-1 pr-3 font-normal">Email</th><th className="py-1 pr-3 font-normal">Scadenza</th><th className="py-1 pr-3 font-normal">Usato</th><th /></tr></thead>
            <tbody>{template.map((t) => <tr key={t.id} className="border-t border-line"><td className="py-1 pr-3">{t.folder}<div className="text-xs text-ink-muted">{t.entita} · {t.area}</div></td><td className="py-1 pr-3">{t.owner}</td><td className="py-1 pr-3 break-all">{t.ownerEmail || <span className="text-orange-700">manca</span>}</td><td className="py-1 pr-3">{NOME_REGOLA[t.regolaScadenza as Regola] ?? t.regolaScadenza}{t.mesiAttivi && <div className="text-xs text-ink-muted">mesi {t.mesiAttivi}</div>}</td><td className="py-1 pr-3">{t.usato ? "sì" : "no"}</td><td className="py-1"><button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setMod(t)}>Modifica</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      {mod && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label={`Modifica ${mod.folder}`}>
          <form className="flex max-h-[90vh] w-full max-w-lg flex-col gap-2 overflow-y-auto rounded-t-2xl bg-surface-raised p-4 md:rounded-2xl" onSubmit={(e) => { e.preventDefault(); const m = mod; fai(async () => { await salvaTemplate(m); setMod(null); }); }}>
            <h3 className="font-semibold">{mod.folder} <span className="text-xs font-normal text-ink-muted">{mod.entita} · {mod.area}</span></h3>
            {([["documento", "Cosa caricare"], ["formato", "Formato"], ["nomeFileStandard", "Nome file standard"], ["owner", "Chi lo fornisce"], ["ownerEmail", "Email"], ["mesiAttivi", "Mesi attivi (es. 1,4,7,10; vuoto = tutti)"]] as [keyof Tpl, string][]).map(([k, n]) => <label key={k} className="flex flex-col gap-1 text-sm">{n}<input className="input h-10" value={String(mod[k])} onChange={(e) => setMod({ ...mod, [k]: e.target.value })} /></label>)}
            <label className="flex flex-col gap-1 text-sm">Regola della scadenza<select className="input h-10" value={mod.regolaScadenza} onChange={(e) => setMod({ ...mod, regolaScadenza: e.target.value })}>{REGOLE.map((r) => <option key={r} value={r}>{NOME_REGOLA[r]}</option>)}</select></label>
            <label className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={mod.usato} onChange={(e) => setMod({ ...mod, usato: e.target.checked })} />Folder usato (se no, nasce &quot;Non applicabile&quot;)</label>
            <div className="mt-1 flex gap-2"><button className="btn-primary" disabled={attesa}>Salva</button><button type="button" className="btn-secondary" onClick={() => setMod(null)}>Annulla</button></div>
          </form>
        </div>
      )}
      <p className="text-xs text-ink-muted">La scadenza di una singola riga si corregge dalla sua scheda (clic sul nome del folder).</p>
    </div>
  );
}

