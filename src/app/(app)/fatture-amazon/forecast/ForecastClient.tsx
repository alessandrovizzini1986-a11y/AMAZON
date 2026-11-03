"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { Dropzone } from "@/components/Dropzone";
import { text, type SheetGrid } from "@/domain/presenze/grid";
import { classeForecast, lineaDaNome, type RegolaMappa } from "@/domain/forecast/mappa";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { sha256 } from "@/lib/presenze/riconosci";
import { scarica } from "@/lib/presenze/excelUtil";
import { aggiungiRigheForecast, concludiForecast, creaForecastFile } from "./actions";

const COLONNE = ["week", "ofd_date", "station", "cycle", "service_type_scheduling", "routes_output"];
type Riga = { week: number; data: string; station: string; cycle: string; serviceType: string; routes: number; classe: string };

function leggiProf(sheets: SheetGrid[]): Riga[] {
  const ws = sheets.find((s) => s.name.trim().toUpperCase() === "PROF");
  if (!ws) throw new Error('foglio "PROF" non trovato');
  const hdr = (ws.rows[0] ?? []).map((v) => text(v).trim());
  const i = Object.fromEntries(COLONNE.map((c) => [c, hdr.indexOf(c)]));
  const manca = COLONNE.filter((c) => i[c] < 0);
  if (manca.length) throw new Error(`nel foglio PROF mancano le colonne ${manca.join(", ")}`);
  const out: Riga[] = [];
  for (const r of ws.rows.slice(1)) {
    const d = r[i.ofd_date];
    const data = d instanceof Date ? d.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.exec(text(d))?.[0];
    if (!data || !text(r[i.station])) continue;
    out.push({ week: Number(r[i.week]) || 0, data, station: text(r[i.station]).trim(), cycle: text(r[i.cycle]).trim(), serviceType: text(r[i.service_type_scheduling]).trim(), routes: Math.round(Number(r[i.routes_output]) || 0), classe: "" });
  }
  return out;
}

export function ForecastUpload({ regole }: { regole: RegolaMappa[] }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const [chiedi, setChiedi] = useState<File | null>(null);

  const carica = async (file: File, lineaScelta?: "ND" | "SD") => {
    const linea = lineaScelta ?? lineaDaNome(file.name);
    if (!linea) { setChiedi(file); return; }
    const buf = await file.arrayBuffer();
    const righe = leggiProf(await workbookToGrids(buf)).map((r) => ({ ...r, classe: classeForecast(r.serviceType, r.cycle, r.station, regole) }));
    const f = await creaForecastFile({ nome: file.name, sha256: await sha256(buf), linea });
    if ("errore" in f) { setMsg((m) => [...m, `${file.name}: ${f.errore}`]); return; }
    for (let i = 0; i < righe.length; i += 500) await aggiungiRigheForecast(f.id, righe.slice(i, i + 500));
    const nm = righe.filter((r) => r.classe === "NON_MAPPATO");
    const settimane = [...new Set(righe.map((r) => r.week))].sort((a, b) => a - b);
    await concludiForecast(f.id, { righe: righe.length, nonMappate: nm.length, settimane });
    setMsg((m) => [...m, `${file.name} (${linea}): ${righe.length} righe, settimane ${settimane.join(", ")}${nm.length ? ` · ${nm.length} righe NON_MAPPATO (${[...new Set(nm.map((x) => x.serviceType))].join(", ")}): aggiungi la regola nella mappa` : " · nessuna riga NON_MAPPATO"}`]);
  };

  const onFiles = async (files: File[]) => {
    setLavoro(true); setMsg([]);
    try {
      for (const f of files) {
        try { await carica(f); } catch (e) { setMsg((m) => [...m, `${f.name}: ${e instanceof Error ? e.message : String(e)}`]); }
      }
      router.refresh();
    } finally {
      setLavoro(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Dropzone titolo="Trascina qui i forecast Amazon" accept=".xlsx" multiple lavoro={lavoro} onFiles={onFiles}
        testo={<><code>PROF_&lt;settimana&gt;_next.xlsx</code> (ND) e <code>PROF_&lt;settimana&gt;_same.xlsx</code> (SD), foglio PROF. Ogni nuovo file sostituisce il precedente per le stesse date; i vecchi restano in elenco.</>} />
      {chiedi && (
        <div className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">
          Dal nome di <b>{chiedi.name}</b> non si capisce la linea. È un forecast
          <button type="button" className="btn-secondary mx-2 px-2 py-1 text-xs" onClick={async () => { const f = chiedi; setChiedi(null); setLavoro(true); try { await carica(f, "ND"); router.refresh(); } finally { setLavoro(false); } }}>ND (next day)</button>
          o
          <button type="button" className="btn-secondary mx-2 px-2 py-1 text-xs" onClick={async () => { const f = chiedi; setChiedi(null); setLavoro(true); try { await carica(f, "SD"); router.refresh(); } finally { setLavoro(false); } }}>SD (same day)</button>?
        </div>
      )}
      {msg.length > 0 && <ul className="rounded-control bg-ok-soft px-4 py-3 text-sm">{msg.map((m, i) => <li key={i}>• {m}</li>)}</ul>}
    </div>
  );
}

type Tab = { foglio: string; colonne: string[]; righe: (string | number | null)[][] };

/** Export delle viste del forecast: una tabella nativa per foglio. */
export function ExportForecast({ tabelle, nome }: { tabelle: Tab[]; nome: string }) {
  const go = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "FleetDSP";
    for (const [k, t] of tabelle.entries()) {
      const ws = wb.addWorksheet(t.foglio.slice(0, 31));
      ws.addTable({ name: `t${k}`, ref: "A1", headerRow: true, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: t.colonne.map((name) => ({ name, filterButton: true })), rows: t.righe.length ? t.righe : [t.colonne.map(() => null)] });
      t.colonne.forEach((_, i) => { ws.getColumn(i + 1).width = 14; });
    }
    await scarica(wb, nome);
  };
  return <button type="button" className="btn-secondary h-10" onClick={go}>Scarica Excel</button>;
}
