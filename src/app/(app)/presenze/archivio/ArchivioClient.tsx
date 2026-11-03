"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATIONS } from "@/domain/presenze/regole";
import { riconosci, type FileLocale } from "@/lib/presenze/riconosci";
import { eliminaFile, elencoFile, salvaFile } from "@/lib/presenze/archivioLocale";
import { registraFile, type FileMeta } from "../actions";
import { Aiuto, DoveFinisce } from "@/components/Aiuto";

export type Registrato = { tipo: string; station: string; giorno: number; nomeFile: string; caricatoDa: string; caricatoIl: string };
type Meta = Omit<FileLocale, "buffer" | "flexRows">;
type Stato = { nome: string; esito: "attesa" | "ok" | "errore"; msg: string };

const KIND_LABEL: Record<string, string> = { TRACKING: "Tracking", FLEX: "CSV Amazon", ZUCCHETTI: "Zucchetti" };

function metasDi(f: FileLocale): FileMeta[] {
  const base = { nomeFile: f.nome, hashSha256: f.hash };
  if (f.kind === "FLEX") {
    return (f.giorniFlex ?? []).map((g) => ({ ...base, tipo: "FLEX_CSV", station: g.station, anno: Number(g.data.slice(0, 4)), mese: Number(g.data.slice(5, 7)), giorno: Number(g.data.slice(8, 10)), righe: g.righe }));
  }
  return f.mesi.map((m) => ({
    ...base, tipo: f.kind === "ZUCCHETTI" ? "ZUCCHETTI" : f.tipo === "SIC" ? "TRACKING_SIC" : "TRACKING_STD",
    station: f.station!, anno: Number(m.slice(0, 4)), mese: Number(m.slice(5, 7)), giorno: 0, righe: f.righe,
  }));
}

const dt = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ArchivioClient({ mese, registrati, canRun }: { mese: string; registrati: Registrato[]; canRun: boolean }) {
  const router = useRouter();
  const [locali, setLocali] = useState<Meta[]>([]);
  const [stati, setStati] = useState<Stato[]>([]);
  const [lavoro, setLavoro] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const ricarica = useCallback(async () => {
    try { setLocali(await elencoFile()); } catch { setLocali([]); }
  }, []);
  useEffect(() => { ricarica(); }, [ricarica]);

  const carica = async (files: File[]) => {
    if (!files.length || lavoro) return;
    setLavoro(true);
    setStati(files.map((f) => ({ nome: f.name, esito: "attesa", msg: "in lettura…" })));
    const metas: FileMeta[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const r = await riconosci(f);
        await salvaFile(r);
        metas.push(...metasDi(r));
        const cosa = r.kind === "FLEX"
          ? `CSV Amazon: ${new Set(r.giorniFlex!.map((g) => g.station)).size} station, ${new Set(r.giorniFlex!.map((g) => g.data)).size} giorni, ${r.righe} righe`
          : `${KIND_LABEL[r.kind]}${r.tipo ? " " + r.tipo : ""} ${r.station} · mesi ${r.mesi.join(", ")}`;
        setStati((s) => s.map((x, j) => (j === i ? { ...x, esito: "ok", msg: cosa } : x)));
      } catch (e) {
        setStati((s) => s.map((x, j) => (j === i ? { ...x, esito: "errore", msg: e instanceof Error ? e.message : "non leggibile" } : x)));
      }
    }
    if (metas.length && canRun) {
      try { await registraFile(metas); } catch { /* il registro sul server è facoltativo: i file restano locali */ }
    }
    await ricarica();
    setLavoro(false);
    router.refresh();
  };

  const rimuovi = async (hash: string) => {
    await eliminaFile(hash);
    await ricarica();
  };

  // griglia del mese: CSV Amazon per station e giorno (server + locali), badge tracking/Zucchetti
  const [anno, m] = mese.split("-").map(Number);
  const nGiorni = new Date(Date.UTC(anno, m, 0)).getUTCDate();
  const griglia = useMemo(() => {
    const flex = new Set<string>();
    for (const r of registrati) if (r.tipo === "FLEX_CSV") flex.add(`${r.station}|${r.giorno}`);
    for (const f of locali) for (const g of f.giorniFlex ?? []) if (g.data.startsWith(mese)) flex.add(`${g.station}|${Number(g.data.slice(8))}`);
    const badge = (st: string, tipo: string) => {
      const loc = locali.find((f) => f.station === st && f.mesi.includes(mese) && (tipo === "ZUCCHETTI" ? f.kind === "ZUCCHETTI" : f.kind === "TRACKING" && `TRACKING_${f.tipo}` === tipo));
      const srv = registrati.find((r) => r.station === st && r.tipo === tipo);
      return loc ? { ok: true, quando: dt(loc.caricatoIl), locale: true } : srv ? { ok: true, quando: dt(srv.caricatoIl), locale: false } : { ok: false, quando: "", locale: false };
    };
    return STATIONS.map((st) => ({
      st,
      giorni: Array.from({ length: nGiorni }, (_, i) => flex.has(`${st}|${i + 1}`)),
      sic: badge(st, "TRACKING_SIC"), std: badge(st, "TRACKING_STD"), zuc: badge(st, "ZUCCHETTI"),
    }));
  }, [registrati, locali, mese, nGiorni]);

  const oggi = new Date();
  const ultimoGiorno = oggi.getFullYear() === anno && oggi.getMonth() + 1 === m ? oggi.getDate() - 1 : nGiorni;

  return (
    <div className="flex flex-col gap-6">
      {canRun && (
        <section
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); carica([...e.dataTransfer.files]); }}
          className={`card flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-brand bg-brand-light" : "border-[#c4ccd6]"}`}
        >
          <p className="text-lg font-semibold">Trascina qui i file</p>
        <DoveFinisce tipo="PC" />
          <p className="max-w-xl text-sm text-ink-muted">.csv Amazon (singoli o uniti), tracking .xlsx/.xlsm SIC e STD, export Zucchetti <code>Amazon_AAAA_MM_Città_*.xlsm</code>. Puoi trascinarne quanti vuoi insieme.</p>
          <input ref={input} type="file" multiple accept=".csv,.xlsx,.xlsm" className="hidden" onChange={(e) => carica([...(e.target.files ?? [])])} />
          <button type="button" className="btn-primary" disabled={lavoro} onClick={() => input.current?.click()}>
            {lavoro ? "Lettura in corso…" : "Oppure scegli i file"}
          </button> <Aiuto k="presenze.archivio" />
        </section>
      )}

      {stati.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.06em] text-ink-muted">Ultimo caricamento</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {stati.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className={s.esito === "ok" ? "badge-ok" : s.esito === "errore" ? "badge-danger" : "badge-neutral"}>{s.esito === "ok" ? "OK" : s.esito === "errore" ? "Non riconosciuto" : "…"}</span>
                <span className="font-medium">{s.nome}</span>
                <span className="text-ink-muted">— {s.msg}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-semibold">Cosa c&apos;è e cosa manca</h2>
            <p className="text-sm text-ink-muted">Verde = CSV Amazon del giorno presente. A destra i tracking e Zucchetti del mese.</p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
            Mese
            <input type="month" className="input h-10 w-44" value={mese} onChange={(e) => e.target.value && router.push(`/presenze/archivio?mese=${e.target.value}`)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface-raised px-2 py-1 text-left">Station</th>
                {Array.from({ length: nGiorni }, (_, i) => <th key={i} className="w-6 px-0 py-1 text-center font-semibold text-ink-muted">{i + 1}</th>)}
                <th className="px-2 py-1 text-left">Tracking SIC</th>
                <th className="px-2 py-1 text-left">Tracking STD</th>
                <th className="px-2 py-1 text-left">Zucchetti</th>
              </tr>
            </thead>
            <tbody>
              {griglia.map((r) => (
                <tr key={r.st} className="border-t border-[#eef1f4]">
                  <td className="sticky left-0 bg-surface-raised px-2 py-1.5 font-mono font-semibold">{r.st}</td>
                  {r.giorni.map((ok, i) => (
                    <td key={i} className="px-0.5 py-1.5" title={`${r.st} ${i + 1}/${m}: ${ok ? "CSV presente" : "CSV mancante"}`}>
                      <span className={`mx-auto block h-5 w-5 rounded ${ok ? "bg-[#17663f]" : i + 1 <= ultimoGiorno ? "bg-danger-soft" : "bg-surface-sunken"}`} />
                    </td>
                  ))}
                  {[r.sic, r.std, r.zuc].map((b, i) => (
                    <td key={i} className="whitespace-nowrap px-2 py-1.5">
                      {b.ok ? <span className="badge-ok" title={b.locale ? "su questo PC" : "caricato da un altro PC"}>✔ {b.quando}</span> : <span className="badge-danger">✘ manca</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">Rosso = giorno già passato senza CSV. I file &quot;caricati da un altro PC&quot; vanno ricaricati qui per poterli usare nei controlli.</p>
      </section>

      <section className="card p-4 md:p-6">
        <h2 className="mb-3 text-[19px] font-semibold">File su questo PC ({locali.length})</h2>
        {locali.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessun file. Trascinali nel riquadro in alto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base text-sm">
              <thead><tr><th>File</th><th>Tipo</th><th>Station</th><th>Mesi</th><th>Righe</th><th>Caricato</th><th></th></tr></thead>
              <tbody>
                {locali.map((f) => (
                  <tr key={f.hash}>
                    <td className="max-w-[320px] truncate" title={f.nome}>{f.nome}</td>
                    <td>{KIND_LABEL[f.kind]}{f.tipo ? ` ${f.tipo}` : ""}</td>
                    <td className="font-mono">{f.station ?? (f.giorniFlex ? [...new Set(f.giorniFlex.map((g) => g.station))].join(" ") : "—")}</td>
                    <td>{f.mesi.join(", ")}</td>
                    <td className="tabular-nums">{f.righe}</td>
                    <td className="whitespace-nowrap">{dt(f.caricatoIl)}</td>
                    <td><button type="button" className="text-xs font-semibold text-danger hover:underline" onClick={() => rimuovi(f.hash)}>Rimuovi</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
