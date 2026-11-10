"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { fogliDelFile, matriceFoglio } from "@/lib/fatture/xlsxStream";
import { scarica } from "@/lib/presenze/excelUtil";
import { abbina, leggiWind, rangoFoglio, righeLocali, type RigaLocale, type Sim, type Telefono } from "@/domain/telefoni/censimento";
import { mostraCodici, salvaCensimento } from "./actions";

export type SimVista = Omit<Sim, "pin" | "puk" | "fonti"> & { haPin: boolean; haPuk: boolean; fonti: string };
export type TelVista = Omit<Telefono, "fonti"> & { fonti: string };

const STATIONS = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1", "GLS"];
const PROV = { tutte: "Tutte", abbinate: "Wind e censimento", soloWind: "Solo Wind: paghiamo, non censite", soloCens: "Solo censimento: non a canone Wind" } as const;
type Prov = keyof typeof PROV;
const it = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Kpi({ titolo, valore, nota, tono = "" }: { titolo: string; valore: number | string; nota: string; tono?: string }) {
  return <div className="card flex flex-col gap-0.5 p-4"><span className="text-sm font-semibold text-ink-muted">{titolo}</span><span className={`text-[26px] font-bold ${tono}`}>{typeof valore === "number" ? valore.toLocaleString("it-IT") : valore}</span><span className="text-xs text-ink-muted">{nota}</span></div>;
}

function Codici({ numero }: { numero: string }) {
  const [c, setC] = useState<{ pin: string | null; puk: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (c) return <span className="whitespace-nowrap font-mono text-xs">PIN {c.pin ?? "—"} · PUK {c.puk ?? "—"}</span>;
  return <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={async () => { setBusy(true); try { setC(await mostraCodici(numero)); } finally { setBusy(false); } }}>Mostra</button>;
}

export function TelefoniClient({ sim, telefoni, aggiornatoIl, puoCaricare, puoCodici }: { sim: SimVista[]; telefoni: TelVista[]; aggiornatoIl: string | null; puoCaricare: boolean; puoCodici: boolean }) {
  const router = useRouter();
  const [scheda, setScheda] = useState<"sim" | "tel" | "carica">(sim.length ? "sim" : "carica");
  const [st, setSt] = useState(""); const [prov, setProv] = useState<Prov>("tutte"); const [stato, setStato] = useState(""); const [q, setQ] = useState(""); const [n, setN] = useState(200);
  const prov_ = (inWind: boolean, censita: boolean) => prov === "tutte" || (prov === "abbinate" && inWind && censita) || (prov === "soloWind" && inWind && !censita) || (prov === "soloCens" && !inWind);
  const cerca = (xs: (string | null)[]) => !q.trim() || xs.some((v) => v?.toLowerCase().includes(q.trim().toLowerCase()));
  const simF = useMemo(() => sim.filter((x) => (!st || (st === "?" ? !x.station : x.station === st)) && prov_(x.inWind, !!x.fonti) && (!stato || (x.stato ?? "—") === stato) && cerca([x.numero, x.iccid, x.tag, x.assegnatario, x.imei, x.note])), [sim, st, prov, stato, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const telF = useMemo(() => telefoni.filter((x) => (!st || (st === "?" ? !x.station : x.station === st)) && prov_(x.inWind, !!x.fonti) && (!stato || (x.stato ?? "—") === stato) && cerca([x.imei, x.tag, x.modello, x.assegnatario, x.numero, x.note])), [telefoni, st, prov, stato, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const stati = [...new Set((scheda === "tel" ? telefoni : sim).map((x) => x.stato ?? "—"))].sort();
  const simW = sim.filter((x) => x.inWind), telW = telefoni.filter((x) => x.inWind);

  // ── carica file
  const [lavoro, setLavoro] = useState(false); const [msg, setMsg] = useState<string[]>([]); const [err, setErr] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<{ file: string[]; esito: ReturnType<typeof abbina> } | null>(null);
  const leggi = async (files: File[]) => {
    setLavoro(true); setErr(null); setAnteprima(null);
    const out: string[] = []; let wind: ReturnType<typeof leggiWind> | null = null; const locali: (RigaLocale & { rango: number })[] = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer(); const fogli = await fogliDelFile(buf);
        const fs = fogli.map((x) => x.trim().toLowerCase());
        if (fs.includes("mobile ricaricabile") && fs.includes("terminali")) {
          wind = leggiWind((await matriceFoglio(buf, "Mobile Ricaricabile")) as never, (await matriceFoglio(buf, "terminali")) as never);
          out.push(`${f.name}: file Wind, ${wind.sim.length} SIM e ${wind.terminali.length} telefoni`);
          continue;
        }
        let tot = 0;
        for (const s of fogli) { const r = righeLocali(f.name, s, (await matriceFoglio(buf, s)) as never); tot += r.length; locali.push(...r.map((x) => ({ ...x, rango: rangoFoglio(f.name, s) }))); }
        out.push(tot ? `${f.name}: censimento, ${tot} righe` : `${f.name}: nessuna riga con IMEI, ICCID o numero`);
      } catch (e) { out.push(`${f.name}: ${(e as Error).message}`); }
    }
    setMsg(out);
    if (!wind) setErr("Manca il file Wind ufficiale (fogli \"Mobile Ricaricabile\" e \"terminali\"): è quello che dice cosa paghiamo.");
    else setAnteprima({ file: files.map((f) => f.name), esito: abbina(wind, locali.sort((a, b) => a.rango - b.rango)) });
    setLavoro(false);
  };
  const salva = async () => {
    if (!anteprima) return;
    setLavoro(true); setErr(null);
    try {
      const r = await salvaCensimento({ file: anteprima.file, sim: anteprima.esito.sim.map((x) => ({ ...x, fonti: x.fonti.slice(0, 40) })), telefoni: anteprima.esito.telefoni.map((x) => ({ ...x, fonti: x.fonti.slice(0, 40) })) });
      setMsg([`Salvati ${r.sim} SIM e ${r.telefoni} telefoni.`]); setAnteprima(null); router.refresh(); setScheda("sim");
    } catch (e) { setErr((e as Error).message); } finally { setLavoro(false); }
  };

  const esporta = async () => {
    const wb = new ExcelJS.Workbook();
    const foglio = (nome: string, col: string[], rows: (string | number | null)[][]) => {
      const ws = wb.addWorksheet(nome); ws.addRow(col).font = { bold: true }; rows.forEach((r) => ws.addRow(r)); ws.columns.forEach((c) => { c.width = 18; }); ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: "A1", to: { row: 1, column: col.length } };
    };
    foglio("SIM", ["Numero", "ICCID", "Wind", "Stato Wind", "Attivazione", "Piano", "Contratto", "Station", "TAG", "Assegnatario", "Stato", "IMEI", "PIN presente", "PUK presente", "Note", "Fonti"],
      simF.map((x) => [x.numero, x.iccid, x.inWind ? "sì" : "no", x.statoWind, x.attivazione, x.piano, x.contratto, x.station, x.tag, x.assegnatario, x.stato, x.imei, x.haPin ? "sì" : "no", x.haPuk ? "sì" : "no", x.note, x.fonti]));
    foglio("Telefoni", ["IMEI", "Wind", "Stato Wind", "Attivazione", "Contratto", "Station", "TAG", "Modello", "Assegnatario", "Stato", "Numero SIM", "Note", "Fonti"],
      telF.map((x) => [x.imei, x.inWind ? "sì" : "no", x.statoWind, x.attivazione, x.contratto, x.station, x.tag, x.modello, x.assegnatario, x.stato, x.numero, x.note, x.fonti]));
    await scarica(wb, `Telefoni_e_SIM_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filtri = (
    <div className="card flex flex-wrap items-end gap-3 p-4 text-sm">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Station<select className="input h-10 w-32" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Tutte</option>{STATIONS.map((s) => <option key={s}>{s}</option>)}<option value="?">senza station</option></select></label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Provenienza<select className="input h-10 w-72" value={prov} onChange={(e) => setProv(e.target.value as Prov)}>{Object.entries(PROV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Stato<select className="input h-10 w-56" value={stato} onChange={(e) => setStato(e.target.value)}><option value="">Tutti</option>{stati.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Cerca<input className="input h-10 w-64" placeholder="numero, IMEI, TAG, nome…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <button type="button" className="btn-secondary h-10" onClick={esporta}>Scarica Excel (filtrato)</button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi titolo="SIM Wind a canone" valore={simW.length} nota={`${simW.filter((x) => x.fonti).length} trovate nei file delle station`} />
        <Kpi titolo="SIM Wind non censite" valore={simW.filter((x) => !x.fonti).length} nota="paghiamo ma non sappiamo dove sono: da cercare o cessare" tono={simW.some((x) => !x.fonti) ? "text-warn" : ""} />
        <Kpi titolo="Telefoni Wind a noleggio" valore={telW.length} nota={`${telW.filter((x) => x.fonti).length} trovati, ${telW.filter((x) => !x.fonti).length} non censiti`} />
        <Kpi titolo="PIN / PUK noti" valore={`${sim.filter((x) => x.haPin).length} / ${sim.filter((x) => x.haPuk).length}`} nota={`su ${sim.length} SIM; si leggono con "Mostra"`} />
      </div>
      <p className="text-xs text-ink-muted">Ultimo caricamento: {aggiornatoIl ? new Date(aggiornatoIl).toLocaleString("it-IT") : "mai"}.</p>
      <div className="flex flex-wrap gap-2">
        {[["sim", `SIM (${sim.length})`], ["tel", `Telefoni (${telefoni.length})`], ...(puoCaricare ? [["carica", "Carica i file"]] : [])].map(([k, l]) => (
          <button key={k} type="button" className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${scheda === k ? "border-brand bg-brand text-white" : "border-line bg-surface-raised"}`} onClick={() => { setScheda(k as typeof scheda); setStato(""); setN(200); }}>{l}</button>
        ))}
      </div>

      {scheda === "sim" && <>
        {filtri}
        <section className="card overflow-x-auto p-4 md:p-5">
          <h2 className="mb-2 text-[19px] font-semibold">{simF.length.toLocaleString("it-IT")} SIM</h2>
          <table className="table-base text-sm">
            <thead><tr><th>Numero</th><th>Wind</th><th>Station</th><th>TAG</th><th>Assegnatario</th><th>Stato</th><th>ICCID</th><th>Piano / attivazione</th><th>PIN / PUK</th><th>Note</th></tr></thead>
            <tbody>{simF.slice(0, n).map((x) => (
              <tr key={x.numero} className={x.inWind && !x.fonti ? "bg-warn-soft" : ""}>
                <td className="font-mono">{x.numero}</td>
                <td>{x.inWind ? <span className={x.statoWind === "Attivo" ? "badge-ok" : "badge-warn"}>{x.statoWind}</span> : <span className="badge-neutral">no</span>}</td>
                <td>{x.station ?? "—"}</td><td className="font-mono text-xs">{x.tag ?? ""}</td><td>{x.assegnatario ?? ""}</td><td className="text-xs">{x.stato ?? ""}</td>
                <td className="font-mono text-xs">{x.iccid ?? ""}</td><td className="text-xs">{x.piano ?? ""}{x.attivazione ? ` · ${it(x.attivazione)}` : ""}</td>
                <td>{x.haPin || x.haPuk ? (puoCodici ? <Codici numero={x.numero} /> : <span className="text-xs">presenti</span>) : <span className="text-xs text-ink-muted">—</span>}</td>
                <td className="max-w-[260px] text-xs" title={x.fonti}>{x.note ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
          {simF.length > n && <button type="button" className="btn-secondary mt-3" onClick={() => setN(n + 500)}>Mostra altre {Math.min(500, simF.length - n)}</button>}
        </section>
      </>}

      {scheda === "tel" && <>
        {filtri}
        <section className="card overflow-x-auto p-4 md:p-5">
          <h2 className="mb-2 text-[19px] font-semibold">{telF.length.toLocaleString("it-IT")} telefoni</h2>
          <table className="table-base text-sm">
            <thead><tr><th>IMEI</th><th>Wind</th><th>Station</th><th>TAG</th><th>Modello</th><th>Assegnatario</th><th>Stato</th><th>SIM</th><th>Note</th></tr></thead>
            <tbody>{telF.slice(0, n).map((x) => (
              <tr key={x.imei} className={x.inWind && !x.fonti ? "bg-warn-soft" : ""}>
                <td className="font-mono text-xs">{x.imei}</td>
                <td>{x.inWind ? <span className={x.statoWind === "Attivo" ? "badge-ok" : "badge-warn"}>{x.statoWind}</span> : <span className="badge-neutral">no</span>}</td>
                <td>{x.station ?? "—"}</td><td className="font-mono text-xs">{x.tag ?? ""}</td><td>{x.modello ?? ""}</td><td>{x.assegnatario ?? ""}</td><td className="text-xs">{x.stato ?? ""}</td>
                <td className="font-mono text-xs">{x.numero ?? ""}</td><td className="max-w-[260px] text-xs" title={x.fonti}>{x.note ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
          {telF.length > n && <button type="button" className="btn-secondary mt-3" onClick={() => setN(n + 500)}>Mostra altri {Math.min(500, telF.length - n)}</button>}
        </section>
      </>}

      {scheda === "carica" && puoCaricare && <>
        <Dropzone titolo="File Wind e file delle station" multiple accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={leggi} aiuto="telefoni.file"
          testo={<>Trascina insieme il <b>file Wind ufficiale</b> del mese (fogli Mobile Ricaricabile e terminali) e i file locali: <b>&lt;DS&gt;_GESTIONE_BYOD</b>, QUERY_BYOD, planning_DEVICE. Se un file è protetto, aprilo e salvalo senza password prima di trascinarlo.</>} />
        {msg.length > 0 && <ul className="text-sm text-ink-muted">{msg.map((m) => <li key={m}>{m}</li>)}</ul>}
        {err && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{err}</p>}
        {anteprima && (
          <section className="card p-4 md:p-5">
            <h2 className="mb-2 text-[19px] font-semibold">Anteprima</h2>
            <table className="table-base text-sm"><tbody>
              <tr><td>SIM nel file Wind</td><td className="text-right font-mono">{anteprima.esito.riepilogo.simWind}</td><td className="text-xs text-ink-muted">{anteprima.esito.riepilogo.simWindTrovate} trovate nei file delle station, {anteprima.esito.riepilogo.simWindSenzaCensimento} non censite</td></tr>
              <tr><td>SIM solo nei file delle station</td><td className="text-right font-mono">{anteprima.esito.riepilogo.simSoloCensimento}</td><td className="text-xs text-ink-muted">non sono a canone Wind: cessate, restituite o di altri contratti</td></tr>
              <tr><td>Telefoni nel file Wind</td><td className="text-right font-mono">{anteprima.esito.riepilogo.telWind}</td><td className="text-xs text-ink-muted">{anteprima.esito.riepilogo.telWindTrovati} trovati, {anteprima.esito.riepilogo.telWindSenzaCensimento} non censiti</td></tr>
              <tr><td>Telefoni solo nei file delle station</td><td className="text-right font-mono">{anteprima.esito.riepilogo.telSoloCensimento}</td><td className="text-xs text-ink-muted">di proprietà, di altri noleggi o restituiti</td></tr>
              <tr><td>SIM con PIN / PUK</td><td className="text-right font-mono">{anteprima.esito.riepilogo.simConPin} / {anteprima.esito.riepilogo.simConPuk}</td><td /></tr>
            </tbody></table>
            <div className="mt-3 flex items-center gap-2"><button type="button" className="btn-primary" disabled={lavoro} onClick={salva}>Salva e sostituisci il censimento</button><Aiuto k="telefoni.salva" /></div>
          </section>
        )}
      </>}
    </div>
  );
}
