"use client";

import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { scarica, tabella } from "@/lib/presenze/excelUtil";
import { addGiorni, numeroSettimana } from "@/domain/forecast/settimane";
import type { PuntoVersione, Precisione } from "@/domain/forecast/storico";
import type { DatiStorico } from "./dati";
import { Spiega } from "@/components/Spiega";
import { Aiuto } from "@/components/Aiuto";

type Props = Omit<DatiStorico, "oggi"> & { oggi: string };
type Misura = "eur" | "rotte" | "picco";
type Periodo = "12" | "26" | "ytd";
type Linea = "TUTTE" | "ND" | "SD";

// colori validati (dataviz): serie 1 blu, serie 2 arancio; sequenziale per l'anticipo
const BLU = "#2a78d6", ARANCIO = "#eb6834", SEQ = ["#2a78d6", "#7fb0ea", "#b5d0f3", "#dde9fa"];
const it = (x: number, d = 0) => x.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (x: number, m: Misura) => (m === "eur" ? `${it(x / 1000, 1)} k€` : m === "picco" ? `${it(x)} rotte in un giorno` : `${it(x)} rotte`);
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
/** giorno più alto della settimana: "mer 25/11" */
const giornoDi = (w: string, i: number) => { const d = addGiorni(w, i); return `${GIORNI[i]} ${d.slice(8)}/${d.slice(5, 7)}`; };
const iMax = (g: number[]) => g.reduce((b, x, i) => (x > g[b] ? i : b), 0);
const wk = (s: string) => `wk ${numeroSettimana(s)}`;
const colDelta = (p: number | null) => (p === null ? "" : Math.abs(p) <= 5 ? "" : Math.abs(p) <= 15 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger");

type Agg = { settimana: string; versione: string; anticipo: number; v: number; parziale: boolean; swa: number; g: number[] };

export function StoricoClient(p: Props) {
  const [ds, setDs] = useState("TUTTE");
  const [linea, setLinea] = useState<Linea>("TUTTE");
  const [misura, setMisura] = useState<Misura>("eur");
  const S = p.settimanaCorrente;
  const [periodo, setPeriodo] = useState<Periodo>("12");
  const [sposta, setSposta] = useState(0); // settimane di spostamento all'indietro (solo 12 e 26 settimane)
  const primaSett = useMemo(() => p.punti.reduce((m, x) => (x.settimana < m ? x.settimana : m), S), [p.punti, S]);
  const finestra = useMemo(() => {
    if (periodo === "ytd") { let w = S; for (let i = 0; i < 60 && numeroSettimana(w) !== 1; i++) w = addGiorni(w, -7); const n = Math.round((Date.parse(S) - Date.parse(w)) / (7 * 864e5)) + 3; return Array.from({ length: n }, (_, i) => addGiorni(w, 7 * i)); }
    const n = Number(periodo);
    return Array.from({ length: n }, (_, i) => addGiorni(S, 7 * (i - (n - 3) - sposta)));
  }, [S, periodo, sposta]);
  const fitta = finestra.length > 16;
  // settimana iniziale per l'evoluzione: quella della finestra con più versioni (a parità la più recente)
  const [sel, setSel] = useState<string>(() => {
    const n = (w: string) => new Set(p.punti.filter((x) => x.settimana === w).map((x) => x.versione)).size;
    const f = Array.from({ length: 12 }, (_, i) => addGiorni(S, 7 * (i - 9)));
    return [...f].reverse().reduce((b, w) => (n(w) > n(b) ? w : b), f[f.length - 1]);
  });

  const gLinea = (nd: number[], sd: number[]) => nd.map((x, i) => (linea === "SD" ? 0 : x) + (linea === "ND" ? 0 : sd[i]));
  const valore = (x: PuntoVersione) => (misura === "eur" ? (linea === "ND" ? x.eurND : linea === "SD" ? x.eurSD : x.eur) : linea === "ND" ? x.rotteND : linea === "SD" ? x.rotteSD : x.rotte);
  const agg: Agg[] = useMemo(() => {
    const m = new Map<string, Agg>(), rotteLinea = new Map<string, number>();
    for (const x of p.punti) {
      if (ds !== "TUTTE" && x.station !== ds) continue;
      const k = `${x.settimana}|${x.versione}`;
      const a = m.get(k) ?? { settimana: x.settimana, versione: x.versione, anticipo: x.anticipo, v: 0, parziale: false, swa: 0, g: Array<number>(7).fill(0) };
      const gg = gLinea(x.giorniND, x.giorniSD); a.g = a.g.map((y, i) => y + gg[i]);
      a.v += valore(x); a.parziale ||= x.parziale; a.swa += x.swaSimulate;
      rotteLinea.set(k, (rotteLinea.get(k) ?? 0) + (linea === "ND" ? x.rotteND : linea === "SD" ? x.rotteSD : x.rotte));
      m.set(k, a);
    }
    // con una sola linea scelta: se in quella versione la linea non ha forecast per la settimana (nessun file la copre)
    // il punto manca, non vale zero
    return [...m.entries()].filter(([k]) => linea === "TUTTE" || (rotteLinea.get(k) ?? 0) > 0).map(([, a]) => (misura === "picco" ? { ...a, v: Math.max(...a.g) } : a));
  }, [p.punti, ds, linea, misura]); // eslint-disable-line react-hooks/exhaustive-deps
  const perSett = (w: string) => agg.filter((a) => a.settimana === w).sort((a, b) => a.versione.localeCompare(b.versione));
  const ultimo = (w: string) => perSett(w).at(-1) ?? null;
  /** rotte fatturate per giorno (domenica–sabato) sommate sulle DS scelte: la rotta massima è il giorno più alto del totale */
  const realeG = (w: string): number[] | null => {
    const xs = (ds === "TUTTE" ? p.stations : [ds]).map((s) => p.reale[`${s}|${w}`]).filter(Boolean);
    return xs.length ? xs.reduce((t, r) => { const g = gLinea(r.giorniND, r.giorniSD); return t.map((y, i) => y + g[i]); }, Array<number>(7).fill(0)) : null;
  };
  const reale = (w: string): number | null => {
    const st = ds === "TUTTE" ? p.stations : [ds];
    const xs = st.map((s) => p.reale[`${s}|${w}`]).filter(Boolean);
    if (!xs.length) return null;
    if (misura === "picco") return Math.max(...realeG(w)!);
    // stessa linea e stessa logica di conteggio del forecast (same day: A + max(B, C) al giorno)
    return xs.reduce((t, r) => t + (misura === "eur" ? (linea === "ND" ? r.eurND : linea === "SD" ? r.eurSD : r.eur) : linea === "ND" ? r.rotteND : linea === "SD" ? r.rotteSD : r.rotte), 0);
  };

  // KPI
  const prossime = [S, addGiorni(S, 7), addGiorni(S, 14)];
  const unisci = (t: number, x: number) => (misura === "picco" ? Math.max(t, x) : t + x);
  const totUltimo = prossime.reduce((t, w) => unisci(t, ultimo(w)?.v ?? 0), 0);
  const totPrima = prossime.reduce((t, w) => { const xs = perSett(w); return unisci(t, xs.length > 1 ? xs[xs.length - 2].v : xs[0]?.v ?? 0); }, 0);
  // riepilogo del periodo scelto: solo settimane che hanno sia forecast sia fatturato
  const conf = finestra.map((w) => ({ w, u: ultimo(w), r: reale(w) })).filter((x) => x.u && x.r !== null) as { w: string; u: Agg; r: number }[];
  const sPrev = conf.reduce((t, x) => unisci(t, x.u.v), 0), sReal = conf.reduce((t, x) => unisci(t, x.r), 0);
  const piccoPrev = finestra.map((w) => ultimo(w)).filter(Boolean).reduce<Agg | null>((b, a) => (!b || a!.v > b.v ? a! : b), null);
  const prec = (a: number) => p.precisione.find((x) => x.station === ds && x.anticipo === a) ?? null;

  // grafico tendenza
  const W = 1280, H = 340, L = 64, R = 1256, T = 16, B = 304;
  const tutti = finestra.flatMap((w) => [...perSett(w).map((a) => a.v), ...(reale(w) !== null ? [reale(w)!] : [])]);
  const valori = tutti.filter((x) => x > 0);
  const maxV = valori.length ? Math.max(...valori) : 1, minV = valori.length ? Math.min(...valori) : 0;
  // con valori a zero la scala parte da 0 (niente punti sotto l'asse); con un solo valore, ±10 %
  let lo = tutti.some((x) => x <= 0) ? 0 : Math.max(0, minV - (maxV - minV) * 0.15), hi = maxV + (maxV - minV) * 0.1;
  if (hi - lo < 1e-9) { lo = Math.max(0, maxV * 0.9); hi = maxV * 1.1 || 1; }
  const step = (R - L) / finestra.length;
  const X = (i: number) => L + step * (i + 0.5);
  const Y = (v: number) => B - ((B - T) * (v - lo)) / (hi - lo || 1);
  const tick = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const lastPath = finestra.map((w, i) => (ultimo(w) ? `${X(i)},${Y(ultimo(w)!.v)}` : null)).filter(Boolean).map((s, i) => `${i ? "L" : "M"}${s}`).join(" ");
  const realPath = finestra.map((w, i) => (reale(w) !== null ? `${X(i)},${Y(reale(w)!)}` : null)).filter(Boolean).map((s, i) => `${i ? "L" : "M"}${s}`).join(" ");
  const iCorr = finestra.indexOf(S);

  // evoluzione settimana selezionata
  const evo = perSett(sel);
  const evoMax = Math.max(1, ...evo.map((a) => a.v), reale(sel) ?? 0), evoMin = Math.min(...evo.map((a) => a.v), reale(sel) ?? Infinity);
  const elo = Math.max(0, evoMin - (evoMax - evoMin) * 0.3 - 1), ehi = evoMax + (evoMax - evoMin) * 0.2 + 1;
  const ey = (v: number) => 240 - (220 * (v - elo)) / (ehi - elo || 1);
  const ex = (i: number) => (evo.length <= 1 ? 330 : 84 + (i * 512) / (evo.length - 1));
  const ogniEvo = Math.ceil(evo.length / 14);

  // pivot settimana × versione (ultime 5 versioni che riguardano il periodo scelto)
  const versioni = [...new Set(agg.filter((a) => finestra.includes(a.settimana)).map((a) => a.versione))].sort().slice(-5);

  // furgoni: prossime settimane (ultima versione per station)
  const ult = useMemo(() => {
    const m = new Map<string, PuntoVersione>();
    for (const x of p.punti) { const k = `${x.station}|${x.settimana}`; const y = m.get(k); if (!y || x.versione > y.versione) m.set(k, x); }
    return m;
  }, [p.punti]);
  const settFut = [...new Set([...ult.values()].map((x) => x.settimana).filter((w) => w >= S))].sort().slice(0, 13);
  const flottaDisp = (s: string) => (p.flotta[s]?.attivi ?? 0) + (p.flotta[s]?.sostitutivi ?? 0);

  const excel = async () => {
    const wb = new ExcelJS.Workbook(); wb.creator = "FleetDSP";
    tabella(wb.addWorksheet("Tendenza"), "Tendenza", [{ name: "Settimana" }, { name: "Week" }, { name: "Versione" }, { name: "Versione wk" }, { name: "Anticipo" }, { name: "DS" }, { name: "Rotte" }, { name: "Rotte ND" }, { name: "Rotte SD" }, { name: "€ previsti", numFmt: "#,##0.00" }, { name: "€ ND", numFmt: "#,##0.00" }, { name: "€ SD", numFmt: "#,##0.00" }, { name: "Rotta max in un giorno" }, { name: "Furgoni" }, { name: "SWA simulate" }, { name: "Parziale" }, { name: "Fatturato €", numFmt: "#,##0.00" }],
      p.punti.map((x) => [x.settimana, x.week, x.versione, x.versioneWeek, x.anticipo, x.station, x.rotte, x.rotteND, x.rotteSD, x.eur, x.eurND, x.eurSD, Math.max(...x.giorniND.map((y, i) => y + x.giorniSD[i])), x.furgoni, x.swaSimulate, x.parziale ? "sì" : "", p.reale[`${x.station}|${x.settimana}`]?.eur ?? null]));
    tabella(wb.addWorksheet("Precisione"), "Precisione", [{ name: "DS" }, { name: "Anticipo (settimane)" }, { name: "Errore medio %" }, { name: "Settimane" }], p.precisione.map((x) => [x.station, x.anticipo === 3 ? "3+" : x.anticipo, x.errore, x.settimane]));
    tabella(wb.addWorksheet("Furgoni"), "Furgoni", [{ name: "DS" }, { name: "Settimana" }, { name: "Week" }, { name: "Picco next" }, { name: "Picco same A/B/C" }, { name: "Furgoni necessari" }, { name: "Picco stesso giorno" }, { name: "Flotta disponibile" }, { name: "In officina" }, { name: "Delta" }, { name: "Parziale" }],
      p.stations.flatMap((s) => settFut.map((w) => { const x = ult.get(`${s}|${w}`); return [s, w, numeroSettimana(w), x?.piccoND ?? null, x?.piccoSD ?? null, x?.furgoni ?? null, x?.piccoStessoGiorno ?? null, flottaDisp(s), p.flotta[s]?.officina ?? 0, x ? flottaDisp(s) - x.furgoni : null, x?.parziale ? "sì" : ""]; })));
    await scarica(wb, `storico_forecast_${p.oggi}.xlsx`);
  };

  const seg = <T extends string>(val: T, set: (v: T) => void, opts: [T, string][], label: string) => (
    <div className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">{label}
      <div role="group" aria-label={label} className="flex flex-wrap overflow-hidden rounded-control border border-[#d5dbe3]">
        {opts.map(([v, l], i) => <button key={v} type="button" aria-pressed={val === v} onClick={() => set(v)} className={`h-10 px-4 text-sm ${i ? "border-l border-[#d5dbe3]" : ""} ${val === v ? "bg-brand font-semibold text-white" : "bg-surface-raised text-ink"}`}>{l}</button>)}
      </div>
    </div>
  );
  const kpi = (l: string, v: string, s: string, k: string) => <div className="card flex flex-col gap-1 p-4"><div className="text-sm font-medium text-ink-muted">{l}<Spiega k={k} /></div><div className="font-mono text-2xl font-bold">{v}</div><div className="text-sm text-ink-muted">{s}</div></div>;
  const d = totPrima ? ((totUltimo - totPrima) / totPrima) * 100 : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-wrap items-end gap-4 p-4" aria-label="Filtri">
        {seg(ds, setDs, [["TUTTE", "Tutte"], ...p.stations.map((s) => [s, s] as [string, string])], "DS")}
        {seg(linea, setLinea, [["TUTTE", "ND + SD"], ["ND", "ND"], ["SD", "SD"]], "Linea")}
        {seg(misura, setMisura, [["eur", "€ previsti"], ["rotte", "Rotte"], ["picco", "Rotta massima"]], "Misura")}
        {seg(periodo, (v: Periodo) => { setPeriodo(v); setSposta(0); }, [["12", "12 settimane"], ["26", "6 mesi"], ["ytd", "Da inizio anno"]], "Periodo")}
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-secondary h-10 px-3" aria-label="Periodo precedente" disabled={periodo === "ytd" || finestra[0] <= primaSett} onClick={() => setSposta((x) => x + (periodo === "26" ? 13 : 4))}>‹</button>
          <span className="min-w-28 text-center text-sm text-ink-muted">{wk(finestra[0])} – {wk(finestra.at(-1)!)}</span>
          <button type="button" className="btn-secondary h-10 px-3" aria-label="Periodo successivo" disabled={periodo === "ytd" || sposta === 0} onClick={() => setSposta((x) => Math.max(0, x - (periodo === "26" ? 13 : 4)))}>›</button>
        </div>
        <button type="button" className="btn-secondary ml-auto h-10" onClick={excel}>Scarica Excel</button> <Aiuto k="forecast.storico.excel" />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4" aria-label="Sintesi">
        {kpi("Versione in uso", p.versioneInUso.nd?.split(" · ")[0] ?? "—", `ND ${p.versioneInUso.nd?.split(" · ")[1] ?? "—"} · SD ${p.versioneInUso.sd?.split(" · ")[1] ?? "—"}`, "forecast.versione")}
        {kpi(`${misura === "picco" ? "Rotta massima" : "Previsto"} ${wk(S)}–${wk(addGiorni(S, 14))}`, misura === "picco" ? `${it(totUltimo)} rotte` : fmtM(totUltimo, misura), d === null ? "—" : `${d >= 0 ? "+" : ""}${it(d, 1)} % sulla versione precedente`, "forecast.previsto")}
        {kpi("Errore medio, forecast della settimana", prec(0) ? `${it(prec(0)!.errore, 1)} %` : "—", prec(0) ? `${prec(0)!.settimane} settimane chiuse · ${ds === "TUTTE" ? "tutte le DS" : ds}` : "servono settimane chiuse con forecast", "forecast.errore0")}
        {kpi("Errore medio, forecast 2 settimane prima", prec(2) ? `${it(prec(2)!.errore, 1)} %` : "—", prec(2) ? `${prec(2)!.settimane} settimane chiuse` : "servono più versioni", "forecast.errore2")}
      </section>

      <section className="card flex flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[19px] font-semibold">Tendenza: ultima versione, versioni precedenti e fatturato</h2>
          <span className="text-xs text-ink-muted">{ds === "TUTTE" ? "Tutte le DS" : ds} · {linea === "TUTTE" ? "ND + SD" : linea} · {misura === "eur" ? "k€" : misura === "picco" ? "rotte nel giorno più alto" : "rotte"} · scegli una settimana per l&apos;evoluzione{misura === "picco" && <Spiega k="forecast.picco" />}</span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: BLU }} />Ultima versione</span>
          <span className="flex items-center gap-1"><span className="rounded-full bg-ok-soft px-1.5 text-xs font-semibold text-ok">± %</span>fatto rispetto al previsto<Spiega k="forecast.scarto" /></span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: ARANCIO }} />Fatturato{linea === "ND" ? " next" : linea === "SD" ? " same day" : ""} (settimane fatturate)</span>
          {["1 sett. prima", "2 sett. prima", "3+ sett. prima"].map((l, i) => <span key={l} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border" style={{ background: SEQ[i + 1], borderColor: BLU }} />{l}</span>)}
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[760px]" role="img" aria-label={`Tendenza del forecast ${wk(finestra[0])}–${wk(finestra.at(-1)!)}`}>
            {tick.map((t, i) => <g key={i}><line x1={L} x2={R} y1={Y(t)} y2={Y(t)} stroke="#e7e9ee" /><text x={L - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#5b6778">{misura === "eur" ? `${it(t / 1000)} k€` : it(t)}</text></g>)}
            {iCorr >= 0 && <><rect x={X(iCorr) - step / 2} y={T} width={R - (X(iCorr) - step / 2)} height={B - T} fill="#f0f2f5" /><text x={X(iCorr) - step / 2 + 8} y={T + 14} fontSize="11" fill="#5b6778">settimana in corso e prossime</text></>}
            {finestra.map((w, i) => <rect key={`c-${w}`} x={X(i) - step / 2} y={T} width={step} height={B - T + 30} fill="transparent" style={{ cursor: "pointer" }} onClick={() => setSel(w)}><title>{`${wk(w)}: clicca per vedere l'evoluzione`}</title></rect>)}
            {finestra.map((w, i) => { const xs = perSett(w).map((a) => a.v); return xs.length > 1 ? <rect key={w} x={X(i) - (fitta ? 3 : 6)} y={Y(Math.max(...xs))} width={fitta ? 6 : 12} pointerEvents="none" height={Math.max(1, Y(Math.min(...xs)) - Y(Math.max(...xs)))} fill={BLU} fillOpacity={0.1} rx={6} /> : null; })}
            {realPath && <path d={realPath} fill="none" stroke={ARANCIO} strokeWidth={2.5} strokeLinejoin="round" />}
            {lastPath && <path d={lastPath} fill="none" stroke={BLU} strokeWidth={2.5} strokeLinejoin="round" />}
            {finestra.map((w, i) => perSett(w).map((a, j, arr) => {
              const last = j === arr.length - 1;
              return <circle key={a.versione} cx={X(i)} cy={Y(a.v)} r={fitta ? (last ? 3.5 : 2.5) : last ? 4.5 : 4} fill={last ? BLU : SEQ[Math.min(3, Math.max(1, a.anticipo))]} stroke={BLU} style={{ cursor: "pointer" }} onClick={() => setSel(w)}><title>{`${wk(w)} · versione ${wk(a.versione)} · anticipo ${a.anticipo} sett. · ${fmtM(a.v, misura)}${misura === "eur" ? "" : ` · giorno più alto ${giornoDi(w, iMax(a.g))}: ${it(Math.max(...a.g))} rotte`}${a.parziale ? " · parziale (senza next)" : ""}${a.swa ? ` · ${it(a.swa)} rotte SWA simulate` : ""}`}</title></circle>;
            }))}
            {finestra.map((w, i) => reale(w) !== null && <circle key={w} cx={X(i)} cy={Y(reale(w)!)} r={fitta ? 3 : 4} fill={ARANCIO} style={{ cursor: "pointer" }} onClick={() => setSel(w)}><title>{`${wk(w)} · fatturato ${fmtM(reale(w)!, misura)}${misura === "eur" ? "" : ` · giorno più alto ${giornoDi(w, iMax(realeG(w)!))}: ${it(Math.max(...realeG(w)!))} rotte`}${ultimo(w)?.v ? ` · ${reale(w)! >= ultimo(w)!.v ? "+" : "−"}${it(Math.abs((reale(w)! - ultimo(w)!.v) / ultimo(w)!.v) * 100, 1)} % sul previsto` : ""}`}</title></circle>)}
            {finestra.map((w, i) => {
              // fatturato contro ultima versione del forecast: + = fatto più del previsto
              const r = reale(w), u = ultimo(w)?.v;
              if (fitta || r === null || !u) return null;
              const pct = ((r - u) / u) * 100;
              const sopra = Math.max(T + 18, Math.min(Y(r), Y(u)) - 10);
              return (
                <g key={`pct-${w}`}>
                  <rect x={X(i) - 30} y={sopra - 15} width={60} height={20} rx={10} fill={pct >= 0 ? "#e6f4ea" : "#fdecea"} />
                  <text x={X(i)} y={sopra} textAnchor="middle" fontSize="12" fontWeight={700} fill={pct >= 0 ? "#1e7b3c" : "#b42318"}>
                    {`${pct >= 0 ? "+" : "−"}${it(Math.abs(pct), 1)} %`}
                    <title>{`${wk(w)}: fatturato ${fmtM(r, misura)} contro ultimo forecast ${fmtM(u, misura)}`}</title>
                  </text>
                </g>
              );
            })}
            {finestra.map((w, i) => (!fitta || w === sel || (i % Math.ceil(finestra.length / 14) === 0 && Math.abs(i - finestra.indexOf(sel)) > 1)) && <text key={w} x={X(i)} y={326} textAnchor="middle" fontSize="11" fontWeight={w === sel ? 700 : 400} fill="#5b6778" pointerEvents="none">{fitta && w !== sel ? numeroSettimana(w) : wk(w)}</text>)}
            {finestra.includes(sel) && <rect pointerEvents="none" x={X(finestra.indexOf(sel)) - step / 2 + (fitta ? 1 : 6)} y={T} width={step - (fitta ? 2 : 12)} height={B - T} fill="none" stroke="#123e73" strokeWidth={1.5} strokeDasharray="4 3" rx={4} />}
          </svg>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-control bg-surface-sunken px-3 py-2 text-sm">
          <span className="font-semibold">Nel periodo {wk(finestra[0])} – {wk(finestra.at(-1)!)}</span>
          {misura === "picco" ? (
            <>
              {piccoPrev && <span>Giorno più alto previsto: <b className="font-mono">{it(piccoPrev.v)}</b> rotte ({giornoDi(piccoPrev.settimana, iMax(piccoPrev.g))}, {wk(piccoPrev.settimana)})</span>}
              {conf.length > 0 && <span>Giorno più alto fatturato: <b className="font-mono">{it(sReal)}</b> rotte</span>}
            </>
          ) : conf.length === 0 ? <span className="text-ink-muted">nessuna settimana con forecast e fatturato insieme</span> : (
            <>
              <span>Previsto: <b className="font-mono">{fmtM(sPrev, misura)}</b></span>
              <span>Fatturato: <b className="font-mono">{fmtM(sReal, misura)}</b></span>
              <span>Scarto: <b className={`font-mono ${sReal >= sPrev ? "text-ok" : "text-danger"}`}>{sReal >= sPrev ? "+" : "−"}{it(Math.abs((sReal - sPrev) / sPrev) * 100, 1)} %</b></span>
              <span className="text-ink-muted">su {conf.length} settimane con forecast e fatturato</span>
            </>
          )}
        </div>
        {fitta ? <p className="text-xs font-semibold text-ink-muted">Clicca una settimana sul grafico per vederne l&apos;evoluzione qui sotto. Passa il mouse sui punti per i valori.</p> : (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Settimana per l'evoluzione">
            {finestra.map((w) => <button key={w} type="button" aria-pressed={w === sel} onClick={() => setSel(w)} className={`h-9 rounded-full border px-3 text-xs ${w === sel ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised"}`}>{wk(w)}</button>)}
          </div>
        )}
        <p className="text-xs text-ink-muted">I punti chiari sono i forecast fatti 1, 2, 3 settimane prima: se stanno sotto la linea blu il forecast è cresciuto avvicinandosi alla settimana; la distanza dalla linea arancione è l&apos;errore finale: la percentuale sopra il punto arancione è il fatturato contro l&apos;ultimo forecast (+ = abbiamo fatto più del previsto). Le rotte SWA/MFN pickup oltre le 3 settimane del next sono simulate. Le rotte fatturate si contano come nel forecast: next tutte (SWA/MFN comprese), same day ogni giorno A + il maggiore tra B e C. Con <b>Rotta massima</b> vedi, per ogni settimana, il giorno più carico: rotte next di quel giorno più il giro same day più grande (il maggiore tra A, B e C, non la somma).</p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card flex flex-col gap-3 p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">Evoluzione della {wk(sel)}</h2>
          {evo.length === 0 ? <p className="text-sm text-ink-muted">Nessuna versione di forecast per questa settimana.</p> : (
            <svg viewBox="0 0 640 296" className="block w-full" role="img" aria-label={`${wk(sel)}: da ${fmtM(evo[0].v, misura)} a ${fmtM(evo.at(-1)!.v, misura)}`}>
              {[0, 1, 2, 3].map((i) => { const t = elo + ((ehi - elo) * i) / 3; return <g key={i}><line x1={56} x2={620} y1={ey(t)} y2={ey(t)} stroke="#e7e9ee" /><text x={48} y={ey(t) + 4} textAnchor="end" fontSize="11" fill="#5b6778">{misura === "eur" ? it(t / 1000) : it(t)}</text></g>; })}
              {reale(sel) !== null && <><line x1={56} x2={620} y1={ey(reale(sel)!)} y2={ey(reale(sel)!)} stroke={ARANCIO} strokeWidth={2} strokeDasharray="5 3" /><text x={618} y={ey(reale(sel)!) - 6} textAnchor="end" fontSize="11" fill="#a8481a">fatturato {fmtM(reale(sel)!, misura)}</text></>}
              <path d={evo.map((a, i) => `${i ? "L" : "M"}${ex(i)},${ey(a.v)}`).join(" ")} fill="none" stroke={BLU} strokeWidth={2.5} />
              {evo.map((a, i) => <g key={a.versione}><circle cx={ex(i)} cy={ey(a.v)} r={5} fill={BLU}><title>{`versione ${wk(a.versione)}: ${fmtM(a.v, misura)}`}</title></circle>
                {(i === evo.length - 1 || (i % ogniEvo === 0 && evo.length - 1 - i >= ogniEvo)) && <>
                  <text x={ex(i)} y={ey(a.v) - 12} textAnchor="middle" fontSize="12" fontWeight={600} fill="#10213a">{misura === "eur" ? it(a.v / 1000, 1) : it(a.v)}</text>
                  <text x={ex(i)} y={264} textAnchor="middle" fontSize="12" fontWeight={i === evo.length - 1 ? 700 : 400} fill={i === evo.length - 1 ? "#10213a" : "#5b6778"}>{`wk ${numeroSettimana(a.versione)}`}</text>
                  {i === evo.length - 1 && <text x={ex(i)} y={280} textAnchor="middle" fontSize="11" fontWeight={700} fill="#10213a">in uso</text>}
                </>}</g>)}
            </svg>
          )}
          {evo.length > 0 && <p className="text-xs text-ink-muted">Sotto ogni punto c&apos;è la settimana in cui Amazon ha emesso quel forecast. {misura === "eur" ? "Valori in k€." : misura === "picco" ? `Valori: rotte del giorno più carico. Nell'ultimo forecast è ${giornoDi(sel, iMax(evo.at(-1)!.g))}.` : "Valori in rotte."}</p>}
        </section>

        <section className="card flex flex-col gap-3 p-4 md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[19px] font-semibold">Precisione per anticipo</h2>
            <span className="text-xs text-ink-muted">errore medio |previsto − fatturato| / fatturato, € · settimane chiuse</span>
          </div>
          <TabellaPrecisione prec={p.precisione} stations={p.stations} />
        </section>
      </div>

      <section className="card flex flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[19px] font-semibold">Settimana × versione</h2>
          <span className="text-xs text-ink-muted">{misura === "eur" ? "k€ previsti" : misura === "picco" ? "rotte nel giorno più alto" : "rotte"} · in grassetto la versione in uso · tra parentesi la variazione sulla versione prima</span>
        </div>
        <div className="overflow-x-auto"><table className="table-base min-w-[820px] text-sm">
          <thead><tr><th>Settimana target</th>{versioni.map((v) => <th key={v} className="text-right">versione {numeroSettimana(v)}</th>)}{<><th className="text-right">Fatturato</th><th className="text-right">Errore</th></>}</tr></thead>
          <tbody>{finestra.map((w) => {
            const xs = perSett(w); const u = xs.at(-1); const r = reale(w); let prev: number | null = null;
            const err = u && r ? ((u.v - r) / r) * 100 : null;
            return <tr key={w}><td className="font-semibold">{wk(w)}{w >= S ? " (aperta)" : ""}</td>
              {versioni.map((v) => { const a = xs.find((x) => x.versione === v); if (!a) return <td key={v} />; const dd = prev ? ((a.v - prev) / prev) * 100 : null; prev = a.v;
                return <td key={v} className={`text-right font-mono ${a === u ? "font-bold" : ""} ${colDelta(dd)}`}>{misura === "eur" ? it(a.v / 1000, 1) : it(a.v)}{dd === null ? "" : ` (${dd >= 0 ? "+" : ""}${it(dd, 1)} %)`}{a.parziale ? "*" : ""}</td>; })}
              {<><td className="text-right font-mono text-[#a8481a]">{r === null ? "—" : misura === "eur" ? it(r / 1000, 1) : it(r)}</td><td className={`text-right font-mono ${colDelta(err)}`}>{err === null ? "—" : `${err >= 0 ? "+" : ""}${it(err, 1)} %`}</td></>}</tr>;
          })}</tbody>
        </table></div>
        <p className="text-xs text-ink-muted">* parziale: settimana oltre l&apos;orizzonte del next (solo same day e SWA simulate). Variazione entro ±5 % neutra, fino a 15 % gialla, oltre rossa. Il fatturato compare appena le fatture coprono tutti e 7 i giorni della settimana (al più tardi 14 giorni dopo il sabato).</p>
      </section>

      <section className="card flex flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[19px] font-semibold">Furgoni necessari nelle prossime settimane</h2>
          <span className="text-xs text-ink-muted">picco giornaliero del next (senza cargo bike) + picco tra same day A, B e C · flotta = mezzi ATTIVI e SOSTITUTIVI della station</span>
        </div>
        <div className="overflow-x-auto"><table className="table-base text-sm">
          <thead><tr><th>DS</th><th className="text-right">Flotta</th><th className="text-right">In officina</th>{settFut.map((w) => <th key={w} className="text-right">{wk(w)}</th>)}<th className="text-right">Max</th><th className="text-right">Delta al max</th></tr></thead>
          <tbody>
            {p.stations.map((s) => {
              const xs = settFut.map((w) => ult.get(`${s}|${w}`) ?? null);
              const max = Math.max(0, ...xs.map((x) => (x && !x.parziale ? x.furgoni : 0)));
              const fl = flottaDisp(s), dmax = fl - max;
              return <tr key={s}><td className="font-semibold">{s}</td><td className="text-right font-mono">{fl}</td><td className="text-right font-mono text-ink-muted">{p.flotta[s]?.officina ?? 0}</td>
                {xs.map((x, i) => { if (!x) return <td key={i} className="text-right text-ink-faint">—</td>; const dl = fl - x.furgoni;
                  return <td key={i} className={`text-right font-mono ${x.parziale ? "text-ink-muted" : dl < 0 ? "bg-danger-soft text-danger" : ""}`} title={`next ${x.piccoND} + same ${x.piccoSD} = ${x.furgoni} (picco nello stesso giorno ${x.piccoStessoGiorno})${x.swaSimulate ? ` · SWA simulate ${x.swaSimulate}` : ""}${x.parziale ? " · parziale: next non ancora in forecast" : ""} · delta ${dl >= 0 ? "+" : ""}${dl}`}>{x.furgoni}{x.parziale ? "*" : ""}</td>; })}
                <td className="text-right font-mono font-semibold">{max || "—"}</td>
                <td className={`text-right font-mono font-semibold ${max && dmax < 0 ? "bg-danger-soft text-danger" : max ? "bg-ok-soft text-ok" : ""}`}>{max ? `${dmax >= 0 ? "+" : ""}${dmax}` : "—"}</td></tr>;
            })}
            <tr className="font-semibold"><td>Totale</td><td className="text-right font-mono">{p.stations.reduce((t, s) => t + flottaDisp(s), 0)}</td><td className="text-right font-mono">{p.stations.reduce((t, s) => t + (p.flotta[s]?.officina ?? 0), 0)}</td>
              {settFut.map((w) => { const xs = p.stations.map((s) => ult.get(`${s}|${w}`)).filter(Boolean) as PuntoVersione[]; return <td key={w} className="text-right font-mono">{xs.length ? xs.reduce((t, x) => t + x.furgoni, 0) : "—"}{xs.some((x) => x.parziale) ? "*" : ""}</td>; })}<td /><td /></tr>
          </tbody>
        </table></div>
        <p className="text-xs text-ink-muted">Rosso: mancano furgoni rispetto alla flotta della station. * parziale: settimana senza next nel forecast (solo same day e SWA simulate), esclusa dal massimo. Passa il mouse su una cella per il dettaglio next + same.</p>
      </section>
    </div>
  );
}

function TabellaPrecisione({ prec, stations }: { prec: Precisione[]; stations: string[] }) {
  const tot = [0, 1, 2, 3].map((a) => prec.find((x) => x.station === "TUTTE" && x.anticipo === a) ?? null);
  const max = Math.max(5, ...tot.map((x) => x?.errore ?? 0)) * 1.2;
  const y = (v: number) => 220 - (200 * v) / max;
  const lab = ["stessa settimana", "1 sett. prima", "2 sett. prima", "3+ sett. prima"];
  const c = (e: number | undefined) => (e === undefined ? "" : e <= 5 ? "" : e <= 15 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger");
  return (
    <>
      {tot.some(Boolean) ? (
        <svg viewBox="0 0 640 260" className="block w-full" role="img" aria-label={`Errore medio sul totale: ${tot.map((x, i) => `${lab[i]} ${x ? `${x.errore} %` : "n.d."}`).join(", ")}`}>
          {[0, 0.5, 1].map((f) => <g key={f}><line x1={56} x2={620} y1={y(max * f)} y2={y(max * f)} stroke="#e7e9ee" /><text x={48} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#5b6778">{(max * f).toLocaleString("it-IT", { maximumFractionDigits: 0 })} %</text></g>)}
          {tot.map((x, i) => { const cx = 130 + i * 140; if (!x) return <text key={i} x={cx} y={y(0) - 6} textAnchor="middle" fontSize="11" fill="#8a95a5">n.d.</text>; const top = y(x.errore);
            return <g key={i}><path d={`M${cx - 32},${y(0)} V${top + 4} q0,-4 4,-4 h56 q4,0 4,4 V${y(0)} Z`} fill="#2a78d6"><title>{`${lab[i]}: ${x.errore} % su ${x.settimane} settimane`}</title></path><text x={cx} y={top - 8} textAnchor="middle" fontSize="13" fontWeight={600} fill="#10213a">{x.errore.toLocaleString("it-IT")} %</text></g>; })}
          {lab.map((l, i) => <text key={l} x={130 + i * 140} y={246} textAnchor="middle" fontSize="12" fill="#5b6778">{l}</text>)}
        </svg>
      ) : <p className="text-sm text-ink-muted">Servono settimane chiuse con forecast e fatture caricate.</p>}
      <div className="overflow-x-auto"><table className="table-base text-sm">
        <thead><tr><th>DS</th>{lab.map((l) => <th key={l} className="text-right">{l}</th>)}</tr></thead>
        <tbody>{stations.map((s) => <tr key={s}><td className="font-semibold">{s}</td>{[0, 1, 2, 3].map((a) => { const x = prec.find((p) => p.station === s && p.anticipo === a); return <td key={a} className={`text-right font-mono ${c(x?.errore)}`} title={x ? `${x.settimane} settimane` : ""}>{x ? `${x.errore.toLocaleString("it-IT")} %` : "—"}</td>; })}</tr>)}</tbody>
      </table></div>
    </>
  );
}
