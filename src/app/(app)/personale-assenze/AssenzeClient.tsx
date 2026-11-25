"use client";

import { useMemo, useState } from "react";
import { analisi, ETICHETTA_LIVELLO, indicatori, mesiValidi, PESI_PRIORITA, PESI_RISCHIO, riepilogo, serieMensile, somma, tabellaTassi, piuAssenti, type Assente, type OrdineAssenti, type RigaPersona, type Tasso, type Livello, type RigaMese, type SchedaStation, type Vista } from "@/domain/personale/analisi";

// stato: sempre con l'etichetta scritta accanto, mai solo il colore
const STATO: Record<Livello, { colore: string; chiaro: string; segno: string }> = {
  OK: { colore: "#16A34A", chiaro: "#DCFCE7", segno: "●" }, ATTENZIONE: { colore: "#CA8A04", chiaro: "#FEF9C3", segno: "▲" },
  CRITICA: { colore: "#EA580C", chiaro: "#FFEDD5", segno: "◆" }, PRIORITARIA: { colore: "#DC2626", chiaro: "#FEE2E2", segno: "■" },
};
// identità dei due gruppi: sempre gli stessi colori, con il nome scritto
const SERIE = { SIC: "#257de0", STD: "#00b894" } as const;
const INK = "#191919", INK2 = "#666666", GRIGLIA = "#e7e7e7", ASSE = "#c2c2c2";
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const mb = (m: string) => MESI[Number(m.slice(5)) - 1];
const n1 = (x: number) => x.toLocaleString("it-IT", { maximumFractionDigits: 1 });
type Periodo = "ANNO" | "6" | "3";

function Chip({ l }: { l: Livello }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: STATO[l].chiaro, color: "#111827" }}><span style={{ color: STATO[l].colore }} aria-hidden>{STATO[l].segno}</span>{ETICHETTA_LIVELLO[l]}</span>;
}
function Riquadro({ titolo, sotto, children }: { titolo: string; sotto?: string; children: React.ReactNode }) {
  return <section className="card flex flex-col gap-2 p-4"><div><h2 className="text-base font-semibold">{titolo}</h2>{sotto && <p className="text-xs text-slate-500">{sotto}</p>}</div>{children}</section>;
}

export function AssenzeClient({ righe, persone, gls = false }: { righe: RigaMese[]; persone: RigaPersona[]; gls?: boolean }) {
  const [vista, setVista] = useState<Vista>(gls ? "SIC" : "TOTALE");
  const [periodo, setPeriodo] = useState<Periodo>("ANNO");
  const [station, setStation] = useState<string>("NETWORK");

  const tuttiMesi = useMemo(() => mesiValidi(righe, vista), [righe, vista]);
  const mesi = useMemo(() => (periodo === "ANNO" ? tuttiMesi : tuttiMesi.slice(-Number(periodo))), [tuttiMesi, periodo]);
  const a = useMemo(() => analisi(righe, vista, mesi, persone), [righe, vista, mesi, persone]);
  const frasi = useMemo(() => riepilogo(a, righe, vista, mesi), [a, righe, vista, mesi]);
  const ultimo = mesi[mesi.length - 1], penultimo = mesi[mesi.length - 2];
  const delMese = (m?: string) => (m ? indicatori(somma((vista === "TOTALE" ? righe : righe.filter((r) => r.gruppo === vista)).filter((r) => r.mese === m))) : null);
  const iu = delMese(ultimo), ip = delMese(penultimo);
  const tn = useMemo(() => tabellaTassi(righe.filter((r) => mesi.includes(r.mese)), vista).network.ytd, [righe, vista, mesi]);
  const critiche = a.stations.filter((s) => s.livello === "CRITICA" || s.livello === "PRIORITARIA");
  const migliore = [...a.stations].sort((x, y) => x.rischio - y.rischio)[0];

  const Tessera = ({ titolo, valore, nota, ora, prima, unita = "" }: { titolo: string; valore: string; nota?: string; ora?: number; prima?: number; unita?: string }) => {
    const d = ora !== undefined && prima !== undefined ? ora - prima : null;
    return (
      <div className="card p-3">
        <div className="text-xs text-slate-500">{titolo}</div>
        <div className="text-2xl font-semibold" style={{ color: INK }}>{valore}</div>
        {d !== null && <div className="text-xs text-slate-600">{mb(ultimo)}: {n1(ora!)}{unita} <span style={{ color: Math.abs(d) < 0.05 ? INK2 : d > 0 ? "#B91C1C" : "#15803D" }}>{Math.abs(d) < 0.05 ? "= uguale" : d > 0 ? `▲ +${n1(d)}` : `▼ ${n1(d)}`}</span> su {mb(penultimo)}</div>}
        {nota && <div className="text-xs text-slate-500">{nota}</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!gls && (["TOTALE", "SIC", "STD"] as Vista[]).map((v) => <button key={v} className={vista === v ? "btn-primary" : "btn-secondary"} onClick={() => setVista(v)}>{v === "TOTALE" ? "SIC + STD" : v}</button>)}
        {!gls && <span className="mx-1 h-6 w-px bg-slate-200" />}
        {([["ANNO", "Da inizio anno"], ["6", "Ultimi 6 mesi"], ["3", "Ultimi 3 mesi"]] as [Periodo, string][]).map(([k, nome]) => <button key={k} className={periodo === k ? "btn-primary" : "btn-secondary"} onClick={() => setPeriodo(k)}>{nome}</button>)}
        <span className="text-slate-500">{mesi.length ? `${mb(mesi[0])} – ${mb(ultimo)} ${ultimo.slice(0, 4)} · ${mesi.length} mesi` : "nessun mese"}</span>
        <a className="btn-secondary ml-auto" href={gls ? "/api/personale/assenze?cliente=gls" : "/api/personale/assenze"} title="Excel con il recap, l'assenteismo, i fogli di dettaglio e i nomi delle persone più assenti (dati riservati). Scarica sempre tutto il periodo, non segue i filtri.">Scarica Excel</a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Tessera titolo="Assenteismo" valore={tn.pct === null ? "—" : `${n1(tn.pct)}%`} nota={`malattia ${n1(tn.malattiaPct ?? 0)}% · infortunio ${n1(tn.infortunioPct ?? 0)}% · altre ${n1(tn.altrePct ?? 0)}%`} />
        <Tessera titolo="Persone assenti" valore={`${n1(a.network.assentiPct)}%`} ora={iu?.assentiPct} prima={ip?.assentiPct} unita="%" />
        <Tessera titolo="Giorni di malattia ogni 100" valore={n1(a.network.malattia100)} ora={iu?.malattia100} prima={ip?.malattia100} />
        <Tessera titolo="Giorni di infortunio ogni 100" valore={n1(a.network.infortunio100)} ora={iu?.infortunio100} prima={ip?.infortunio100} />
        {gls ? <Tessera titolo="Persone infortunate" valore={String(a.misNetwork.infortunati)} nota={`${n1(a.misNetwork.gravita)} giorni per infortunato`} /> : <Tessera titolo="Station critiche" valore={String(critiche.length)} nota={critiche.map((s) => s.station).join(", ") || "nessuna"} />}
        {gls ? <Tessera titolo="Autisti (media al mese)" valore={String(a.network.headcount)} nota={`${a.sommaNetwork.ggLavorati.toLocaleString("it-IT")} giorni lavorati`} /> : <Tessera titolo="Station migliore" valore={migliore?.station ?? "—"} nota={migliore ? `rischio ${migliore.rischio} su 100` : undefined} />}
      </div>

      {gls ? <TassiUnici righe={righe} /> : <Tassi righe={righe} vista={vista} />}

      <Assenti persone={persone} vista={vista} fissa={gls ? "GLS" : undefined} />

      {!gls && <>
      <Riquadro titolo="In breve" sotto="Le cose da sapere, in ordine di importanza">
        <ul className="flex flex-col gap-1.5 text-sm">
          {frasi.map((f, i) => <li key={i} className="flex gap-2"><span aria-hidden style={{ color: f.tono === "INFO" ? "#2563EB" : STATO[f.tono].colore }}>{f.tono === "INFO" ? "ℹ" : STATO[f.tono].segno}</span><span>{f.testo.replace(/(\d)\.(\d)(?!\d)/g, "$1,$2")}</span></li>)}
        </ul>
      </Riquadro>

      <Riquadro titolo="Dove intervenire: classifica per priorità" sotto={`Priorità = rischio × ${PESI_PRIORITA.rischio} + peso sul network × ${PESI_PRIORITA.peso}. Rischio 50 = come la media del network.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Station</th><th className="py-1 pr-3">Priorità</th><th className="py-1 pr-3 text-right">Rischio</th><th className="py-1 pr-3 text-right">Peso</th><th className="py-1 pr-3 text-right">Persone</th><th className="py-1 pr-3 text-right">Malattia</th><th className="py-1 pr-3 text-right">Persone infortunate</th><th className="py-1 pr-3 text-right">ogni 1.000 rotte</th><th className="py-1 pr-3 text-right">Giorni per infortunato</th><th className="py-1 pr-3">Ultimi 3 mesi</th><th className="py-1">Stato</th></tr></thead>
            <tbody>
              {a.stations.map((s) => (
                <tr key={s.station} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 font-semibold">{s.station}</td>
                  <td className="py-1.5 pr-3"><div className="flex items-center gap-2"><div className="h-3 w-28 rounded-sm bg-slate-100"><div className="h-3 rounded-r" style={{ width: `${s.priorita}%`, background: STATO[s.livello].colore }} /></div><span className="tabular-nums font-medium">{s.priorita}</span></div></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" title={`malattia ${s.parti.malattia}, numero di infortuni ${s.parti.frequenza}, durata degli infortuni ${s.parti.gravita} (50 = come il network)`}>{s.rischio}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" title={`${s.quotaGiorni}% dei giorni persi con il ${s.quotaPersone}% delle persone`}>{s.peso}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.ind.headcount}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{n1(s.mis.malattiaPct)}%</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.mis.infortunati}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.mis.frequenza.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{n1(s.mis.gravita)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{s.tendenza ? <span style={{ color: s.tendenza.verso === "PEGGIORA" ? "#B91C1C" : s.tendenza.verso === "MIGLIORA" ? "#15803D" : INK2 }}>{s.tendenza.verso === "PEGGIORA" ? "▲ peggiora" : s.tendenza.verso === "MIGLIORA" ? "▼ migliora" : "= stabile"} {s.tendenza.variazione > 0 ? "+" : ""}{s.tendenza.variazione}%</span> : <span className="text-slate-400">—</span>}</td>
                  <td className="py-1.5"><Chip l={s.livello} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Riquadro>

      <div className="grid gap-5 lg:grid-cols-2">
        <Riquadro titolo="Rischio e peso sul network" sotto="In alto a destra: priorità assoluta. La grandezza del cerchio è il numero di persone."><Matrice s={a.stations} /></Riquadro>
        <Riquadro titolo="Chi pesa di più" sotto="Quota dei giorni persi del network contro quota delle persone: sopra la sua quota di persone, la station pesa più di quanto dovrebbe."><Quote s={a.stations} /></Riquadro>
      </div>

      </>}

      <Riquadro titolo={gls ? "Andamento mese per mese" : "Andamento mese per mese: SIC e STD"} sotto="Tre misure, ognuna con la sua scala">
        <div className={gls ? "hidden" : "flex flex-wrap items-center gap-2 text-sm"}>
          <select className="input w-auto" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station"><option value="NETWORK">Tutto il network</option>{a.stations.map((s) => s.station).sort().map((s) => <option key={s}>{s}</option>)}</select>
          <span className="flex items-center gap-1 text-xs"><span className="inline-block h-0.5 w-5" style={{ background: SERIE.SIC }} />SIC</span>
          <span className="flex items-center gap-1 text-xs"><span className="inline-block h-0.5 w-5" style={{ background: SERIE.STD }} />STD</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {([["assentiPct", "Persone assenti (%)"], ["malattia100", "Giorni di malattia ogni 100 lavoratori"], ["infortunio100", "Giorni di infortunio ogni 100 lavoratori"]] as const).map(([k, titolo]) => <Linee key={k} titolo={titolo} chiave={k} righe={righe} mesi={mesiValidi(righe, "SIC").concat(mesiValidi(righe, "STD")).filter((m, i, x) => x.indexOf(m) === i).sort().filter((m) => periodo === "ANNO" || mesi.includes(m))} station={station === "NETWORK" ? undefined : station} nomeSic={gls ? "" : "SIC"} />)}
        </div>
      </Riquadro>

      {!gls && <div className="grid gap-5 lg:grid-cols-2">
        <Riquadro titolo="SIC contro STD per station" sotto="Giorni persi (malattia + infortunio) ogni 100 lavoratori al mese"><Gruppi s={a.stations} /></Riquadro>
        <Riquadro titolo="Station per mese" sotto="Giorni persi ogni 100 lavoratori: più scuro = più giorni persi"><Calore righe={righe} vista={vista} mesi={mesi} stations={a.stations.map((s) => s.station).sort()} /></Riquadro>
      </div>}

      <details className="card p-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold">Come sono fatti i conti</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li><b>Fonte:</b> le buste paga (LUL) di SIC e STD. Sul sito ci sono solo i totali per station, mese e gruppo: nessun nome, nessun importo.</li>
          <li><b>Giorni, non ore:</b> le ore in busta non sono confrontabili (una giornata di un somministrato part time vale 3–4 ore, quella di un SIC quasi 8).</li>
          <li><b>Assenteismo %:</b> giorni di assenza diviso i giorni in cui si doveva lavorare (lavorati + assenze). Le assenze sono malattia, infortunio e altre assenze (non retribuite, ingiustificate, malattia figlio). Ferie, ROL, ex festività e permessi retribuiti non contano. Un giorno lavorato è un giorno del calendario della busta con più di 4 ore.</li>
          <li><b>Persone assenti:</b> persone con almeno un giorno di malattia o infortunio nel mese, in percentuale delle persone in busta.</li>
          <li><b>Rischio (0–100):</b> ogni misura si confronta con il network: uguale = 50, il doppio o più = 100. Pesi: malattia (% dei giorni dovuti) {PESI_RISCHIO.malattia * 100}%, numero di infortuni (persone infortunate ogni 1.000 rotte) {PESI_RISCHIO.frequenza * 100}%, durata degli infortuni (giorni per infortunato) {PESI_RISCHIO.gravita * 100}%.</li>
          <li><b>Peso (0–100):</b> quota dei giorni persi del network; la station che pesa di più vale 100.</li>
          <li><b>Stato:</b> 0–30 sotto controllo, 31–60 attenzione, 61–80 criticità, 81–100 intervento prioritario.</li>
          <li><b>Tendenza:</b> giorni persi ogni 100 lavoratori negli ultimi 3 mesi contro i 3 prima; oltre ±15% è peggioramento o miglioramento.</li>
          <li><b>SIC + STD</b> usa solo i mesi in cui ci sono tutti e due i gruppi. Gli STD partono da febbraio (a gennaio la busta non ha il calendario); i SIC arrivano al mese prima dell&apos;ultima busta.</li>
          <li><b>Limite:</b> un somministrato a cui non viene rinnovata la missione dopo un infortunio esce dalle buste, quindi i giorni degli STD possono essere sottostimati.</li>
        </ul>
      </details>
    </div>
  );
}

/** Rischio (verticale) contro peso (orizzontale): un cerchio per station, sempre con il nome scritto. */
function Matrice({ s }: { s: SchedaStation[] }) {
  const W = 520, H = 340, L = 44, B = 36, T = 22, R = 30, x = (v: number) => L + (v / 100) * (W - L - R), y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const maxTeste = Math.max(1, ...s.map((z) => z.ind.headcount));
  // il nome sta sopra il cerchio; se finirebbe addosso a un altro nome, va sotto
  const posti: { z: SchedaStation; r: number; ly: number }[] = [];
  for (const z of [...s].sort((a, b) => b.rischio - a.rischio)) {
    const r = 7 + 13 * Math.sqrt(z.ind.headcount / maxTeste), cx = x(z.peso), sopra = y(z.rischio) - r - 4, sotto = y(z.rischio) + r + 13;
    const urta = (ly: number) => posti.some((p) => Math.abs(x(p.z.peso) - cx) < 40 && Math.abs(p.ly - ly) < 13);
    posti.push({ z, r, ly: urta(sopra) && !urta(sotto) ? sotto : sopra });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rischio e peso sul network per station">
      <rect x={x(50)} y={y(100)} width={x(100) - x(50)} height={y(50) - y(100)} fill="#FEF2F2" />
      {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={x(v)} y1={y(0)} x2={x(v)} y2={y(100)} stroke={v === 50 ? ASSE : GRIGLIA} /><line x1={x(0)} y1={y(v)} x2={x(100)} y2={y(v)} stroke={v === 50 ? ASSE : GRIGLIA} /><text x={x(v)} y={H - 20} textAnchor="middle" fontSize="11" fill={INK2}>{v}</text><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK2}>{v}</text></g>)}
      <text x={x(75)} y={y(100) + 14} textAnchor="middle" fontSize="11" fill={INK2}>Priorità assoluta</text><text x={x(25)} y={y(100) + 14} textAnchor="middle" fontSize="11" fill={INK2}>Problema locale</text>
      <text x={x(75)} y={y(0) - 6} textAnchor="middle" fontSize="11" fill={INK2}>Da monitorare</text><text x={x(25)} y={y(0) - 6} textAnchor="middle" fontSize="11" fill={INK2}>Stabile</text>
      <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill={INK2}>Peso sul network →</text>
      <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize="11" fill={INK2} transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Rischio →</text>
      {posti.map(({ z, r, ly }) => { return (
        <g key={z.station}><circle cx={x(z.peso)} cy={y(z.rischio)} r={r} fill={STATO[z.livello].colore} fillOpacity="0.85" stroke="#fff" strokeWidth="2"><title>{`${z.station}: rischio ${z.rischio}, peso ${z.peso}, priorità ${z.priorita}, ${z.ind.headcount} persone`}</title></circle>
          <text x={x(z.peso)} y={ly} textAnchor="middle" fontSize="12" fontWeight="600" fill={INK}>{z.station}</text></g>); })}
    </svg>
  );
}

/** Quota dei giorni persi contro quota delle persone. */
function Quote({ s }: { s: SchedaStation[] }) {
  const ord = [...s].sort((a, b) => b.quotaGiorni - a.quotaGiorni), max = Math.max(...ord.flatMap((z) => [z.quotaGiorni, z.quotaPersone]), 1);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-4 text-xs text-slate-600"><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "#2563EB" }} />quota dei giorni persi</span><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "#9CA3AF" }} />quota delle persone</span></div>
      {ord.map((z) => (
        <div key={z.station} className="grid grid-cols-[3.2rem_1fr] items-center gap-2">
          <span className="font-semibold">{z.station}</span>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2"><div className="h-3 rounded-r" style={{ width: `${(z.quotaGiorni / max) * 80}%`, background: "#2563EB" }} title={`malattia ${z.quotaMalattia}% · infortuni ${z.quotaInfortunio}% del network`} /><span className="tabular-nums text-xs">{n1(z.quotaGiorni)}%</span></div>
            <div className="flex items-center gap-2"><div className="h-3 rounded-r" style={{ width: `${(z.quotaPersone / max) * 80}%`, background: "#9CA3AF" }} /><span className="tabular-nums text-xs text-slate-600">{n1(z.quotaPersone)}%</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Una misura nel tempo, SIC e STD, con la sua scala (mai due scale nello stesso grafico). */
function Linee({ titolo, chiave, righe, mesi, station, nomeSic = "SIC" }: { titolo: string; chiave: "assentiPct" | "malattia100" | "infortunio100"; righe: RigaMese[]; mesi: string[]; station?: string; nomeSic?: string }) {
  const W = 320, H = 190, L = 34, B = 24, T = 16, R = 34;
  const serie = (g: "SIC" | "STD") => { const validi = new Set(mesiValidi(righe, g)); return serieMensile(righe, g, mesi.filter((m) => validi.has(m)), station).map((p) => ({ mese: p.mese, v: p[chiave] })); };
  const sic = serie("SIC"), std = serie("STD"), max = Math.max(1, ...sic.map((p) => p.v), ...std.map((p) => p.v)) * 1.1;
  const x = (m: string) => L + (mesi.length > 1 ? (mesi.indexOf(m) / (mesi.length - 1)) * (W - L - R) : 0), y = (v: number) => T + (1 - v / max) * (H - T - B);
  const passo = max > 80 ? 40 : max > 40 ? 20 : max > 16 ? 10 : max > 8 ? 5 : 2;
  const tacche = Array.from({ length: Math.floor(max / passo) + 1 }, (_, i) => i * passo);
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-medium text-slate-700">{titolo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={titolo}>
        {tacche.map((v) => <g key={v}><line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={v === 0 ? ASSE : GRIGLIA} /><text x={L - 5} y={y(v) + 4} textAnchor="end" fontSize="10" fill={INK2}>{v}</text></g>)}
        {mesi.map((m) => <text key={m} x={x(m)} y={H - 7} textAnchor="middle" fontSize="10" fill={INK2}>{mb(m)}</text>)}
        {([["SIC", sic], ["STD", std]] as const).map(([g, pp]) => pp.length > 0 && (
          <g key={g}>
            <polyline fill="none" stroke={SERIE[g]} strokeWidth="2" strokeLinejoin="round" points={pp.map((p) => `${x(p.mese)},${y(p.v)}`).join(" ")} />
            {pp.map((p) => <circle key={p.mese} cx={x(p.mese)} cy={y(p.v)} r="4" fill={SERIE[g]} stroke="#fff" strokeWidth="1.5"><title>{`${g} ${mb(p.mese)}: ${n1(p.v)}`}</title></circle>)}
            <text x={x(pp[pp.length - 1].mese) + 7} y={y(pp[pp.length - 1].v) + 4} fontSize="11" fontWeight="600" fill={INK}>{g === "SIC" ? nomeSic : g}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** SIC e STD affiancati per station. */
function Gruppi({ s }: { s: SchedaStation[] }) {
  const ord = [...s].sort((a, b) => a.station.localeCompare(b.station));
  const v = (i: SchedaStation["sic"]) => (i ? i.malattia100 + i.infortunio100 : 0), max = Math.max(1, ...ord.flatMap((z) => [v(z.sic), v(z.std)]));
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-4 text-xs text-slate-600"><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: SERIE.SIC }} />SIC</span><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: SERIE.STD }} />STD</span></div>
      {ord.map((z) => (
        <div key={z.station} className="grid grid-cols-[3.2rem_1fr] items-center gap-2">
          <span className="font-semibold">{z.station}</span>
          <div className="flex flex-col gap-0.5">
            {(["SIC", "STD"] as const).map((g) => { const i = g === "SIC" ? z.sic : z.std; return (
              <div key={g} className="flex items-center gap-2"><div className="h-3 rounded-r" style={{ width: `${(v(i) / max) * 78}%`, minWidth: i ? 2 : 0, background: SERIE[g] }} title={i ? `${g}: malattia ${n1(i.malattia100)}, infortunio ${n1(i.infortunio100)} ogni 100 lavoratori` : `${g}: nessun dato`} /><span className="tabular-nums text-xs">{i ? n1(v(i)) : "—"}</span></div>); })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Station per mese: un solo colore, dal chiaro allo scuro, con il numero scritto in ogni cella. */
function Calore({ righe, vista, mesi, stations }: { righe: RigaMese[]; vista: Vista; mesi: string[]; stations: string[] }) {
  const RAMPA = ["#cce3fd", "#9dc8f7", "#6aabf1", "#338ced", "#2370cd", "#0f4a96"];
  const dati = stations.map((st) => ({ st, v: serieMensile(righe, vista, mesi, st).map((p) => p.persi100) }));
  const max = Math.max(1, ...dati.flatMap((d) => d.v));
  const passo = (v: number) => Math.min(RAMPA.length - 1, Math.floor((v / max) * RAMPA.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
        <thead><tr><th />{mesi.map((m) => <th key={m} className="px-1 py-1 font-normal text-slate-500">{mb(m)}</th>)}</tr></thead>
        <tbody>
          {dati.map((d) => (
            <tr key={d.st}><th className="pr-2 text-left text-sm font-semibold">{d.st}</th>
              {d.v.map((v, i) => <td key={i} className="rounded px-1 py-1.5 text-center tabular-nums" style={{ background: RAMPA[passo(v)], color: passo(v) >= 3 ? "#fff" : INK }} title={`${d.st} ${mb(mesi[i])}: ${n1(v)} giorni persi ogni 100 lavoratori`}>{Math.round(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Assenteismo %: station per mese e da inizio anno, con la scelta totale / malattia / infortunio. */
function Tassi({ righe, vista }: { righe: RigaMese[]; vista: Vista }) {
  const [misura, setMisura] = useState<"pct" | "malattiaPct" | "infortunioPct" | "altrePct">("pct");
  const t = useMemo(() => tabellaTassi(righe, vista), [righe, vista]);
  const comuni = useMemo(() => new Set(tabellaTassi(righe, "TOTALE").mesi), [righe]);
  const gruppi = useMemo(() => (["TOTALE", "SIC", "STD"] as Vista[]).map((v) => tabellaTassi(righe.filter((r) => comuni.has(r.mese)), v)), [righe, comuni]);
  const max = Math.max(1, ...t.stations.flatMap((s) => s.perMese.map((x) => x[misura] ?? 0)));
  const fondo = (v: number | null) => (v === null ? "transparent" : `rgba(220, 38, 38, ${Math.min(0.55, (v / max) * 0.55).toFixed(2)})`);
  const p = (v: number | null) => (v === null ? "—" : `${n1(v)}%`);
  const nomeVista = vista === "TOTALE" ? "SIC + STD" : vista;
  return (
    <Riquadro titolo={`Assenteismo ${nomeVista}: station per mese e da inizio anno`} sotto="Giorni di assenza sui giorni in cui si doveva lavorare. Malattia + infortunio + altre assenze (non retribuite, ingiustificate, malattia figlio) = assenteismo. Più rosso = più alto.">
      <div className="flex flex-wrap gap-2 text-sm">
        {([["pct", "Assenteismo"], ["malattiaPct", "di cui malattia"], ["infortunioPct", "di cui infortunio"], ["altrePct", "di cui altre assenze"]] as const).map(([k, nome]) => <button key={k} className={misura === k ? "btn-primary" : "btn-secondary"} onClick={() => setMisura(k)}>{nome}</button>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-sm" style={{ borderSpacing: 2 }}>
          <thead><tr className="text-slate-500"><th className="text-left font-normal">Station</th>{t.mesi.map((m) => <th key={m} className="px-1 font-normal">{mb(m)}</th>)}<th className="px-2 font-semibold text-slate-700">Da inizio anno</th></tr></thead>
          <tbody>
            {[...t.stations, t.network].map((s) => (
              <tr key={s.station} className={s.station === "Network" ? "font-semibold" : ""}>
                <th className="whitespace-nowrap pr-2 text-left font-semibold">{s.station}</th>
                {s.perMese.map((x, i) => <td key={i} className="rounded px-1 py-1.5 text-center tabular-nums" style={{ background: s.station === "Network" ? "#F1F5F9" : fondo(x[misura]) }} title={`${s.station} ${mb(t.mesi[i])}: ${x.malattia} giorni di malattia, ${x.infortunio} di infortunio e ${x.altre} di altre assenze su ${x.lavorati + x.malattia + x.infortunio + x.altre} giorni dovuti`}>{p(x[misura])}</td>)}
                <td className="rounded px-2 py-1.5 text-center font-semibold tabular-nums" style={{ background: "#E2E8F0" }} title={`${s.ytd.malattia} giorni di malattia, ${s.ytd.infortunio} di infortunio e ${s.ytd.altre} di altre assenze su ${s.ytd.lavorati + s.ytd.malattia + s.ytd.infortunio + s.ytd.altre} giorni dovuti`}>{p(s.ytd[misura])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-2 text-sm font-semibold">Da inizio anno: SIC + STD, SIC e STD a confronto <span className="font-normal text-slate-500">(stessi mesi per tutti: {comuni.size ? `${mb([...comuni][0])} – ${mb([...comuni][comuni.size - 1])}` : "—"})</span></h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr><th />{["SIC + STD", "SIC", "STD"].map((g) => <th key={g} colSpan={4} className="border-b border-slate-200 px-2 py-1 text-center">{g === "SIC + STD" ? g : <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIE[g as "SIC" | "STD"] }} />{g}</span>}</th>)}</tr>
            <tr className="text-slate-500"><th className="py-1 text-left font-normal">Station</th>{[0, 1, 2].flatMap((g) => ["Assenteismo", "Malattia", "Infortunio", "Altre"].map((n) => <th key={`${g}${n}`} className={`px-2 py-1 text-right font-normal ${n === "Assenteismo" ? "border-l border-slate-200" : ""}`}>{n}</th>))}</tr>
          </thead>
          <tbody>
            {[...gruppi[0].stations.map((s) => s.station), "Network"].map((st) => (
              <tr key={st} className={`border-t border-slate-100 ${st === "Network" ? "bg-slate-50 font-semibold" : ""}`}>
                <td className="py-1.5 font-semibold">{st}</td>
                {gruppi.flatMap((g, gi) => { const y: Tasso | undefined = st === "Network" ? g.network.ytd : g.stations.find((s) => s.station === st)?.ytd; return [<td key={`${gi}a`} className="border-l border-slate-200 px-2 text-right font-semibold tabular-nums">{p(y?.pct ?? null)}</td>, <td key={`${gi}m`} className="px-2 text-right tabular-nums">{p(y?.malattiaPct ?? null)}</td>, <td key={`${gi}i`} className="px-2 text-right tabular-nums">{p(y?.infortunioPct ?? null)}</td>, <td key={`${gi}x`} className="px-2 text-right tabular-nums">{p(y?.altrePct ?? null)}</td>]; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Riquadro>
  );
}

/** Chi è stato più assente: un colpo d'occhio per station, oppure l'elenco di una station; in un mese o da inizio anno. */
function Assenti({ persone, vista, fissa }: { persone: RigaPersona[]; vista: Vista; fissa?: string }) {
  const [station, setStation] = useState(fissa ?? ""), [mese, setMese] = useState(""), [ordine, setOrdine] = useState<OrdineAssenti>("giorni"), [tutti, setTutti] = useState(false);
  const stations = useMemo(() => [...new Set(persone.map((p) => p.station))].sort(), [persone]);
  const mesi = useMemo(() => [...new Set(persone.filter((p) => vista === "TOTALE" || p.gruppo === vista).map((p) => p.mese))].sort(), [persone, vista]);
  const meseOk = mesi.includes(mese) ? mese : "";
  const elenco = (st?: string) => piuAssenti(persone, { vista, station: st, mese: meseOk || undefined, ordine });
  const Gr = ({ g }: { g: "SIC" | "STD" }) => <span className="inline-flex items-center gap-1 text-xs text-slate-600"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: SERIE[g] }} />{g}</span>;
  const valore = (a: Assente) => a[ordine];
  const righeStation = station ? elenco(station) : [];
  return (
    <Riquadro titolo="Chi è stato più assente" sotto={`Persone con più giorni di ${ordine === "giorni" ? "assenza (malattia, infortunio, altre)" : ordine === "altre" ? "altre assenze (non retribuite, ingiustificate, malattia figlio)" : ordine} ${meseOk ? `a ${mb(meseOk)}` : "da inizio anno"}. Dati personali: li vedi solo tu.`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className={fissa ? "hidden" : "input w-auto"} value={station} onChange={(e) => { setStation(e.target.value); setTutti(false); }} aria-label="Station"><option value="">Tutte le station (primi 5)</option>{stations.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input w-auto" value={meseOk} onChange={(e) => setMese(e.target.value)} aria-label="Periodo"><option value="">Da inizio anno</option>{mesi.map((m) => <option key={m} value={m}>{MESI[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}</select>
        {([["giorni", "Tutte le assenze"], ["malattia", "Malattia"], ["infortunio", "Infortunio"], ["altre", "Altre assenze"]] as [OrdineAssenti, string][]).map(([k, nome]) => <button key={k} className={ordine === k ? "btn-primary" : "btn-secondary"} onClick={() => setOrdine(k)}>{nome}</button>)}
      </div>
      {!station ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stations.map((st) => { const e = elenco(st); return (
            <div key={st} className="rounded-lg border border-slate-200 p-2.5">
              <button className="mb-1 flex w-full items-baseline justify-between text-left" onClick={() => setStation(st)} title="Apri l'elenco completo della station"><span className="font-semibold">{st}</span><span className="text-xs text-slate-500">{e.length} persone ›</span></button>
              {e.length === 0 ? <p className="text-xs text-slate-500">Nessuna assenza.</p> : (
                <ol className="flex flex-col gap-1 text-sm">
                  {e.slice(0, 5).map((a) => <li key={a.chiave} className="flex items-baseline justify-between gap-2" title={`${a.malattia} giorni di malattia, ${a.infortunio} di infortunio, ${a.altre} di altre assenze, ${a.lavorati} lavorati${a.pct === null ? "" : ` · ${n1(a.pct)}% di assenteismo`}`}><span className="min-w-0 truncate">{a.nome} <Gr g={a.gruppo} /></span><span className="shrink-0 font-semibold tabular-nums">{valore(a)} gg</span></li>)}
                </ol>
              )}
            </div>); })}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2 font-normal">#</th><th className="py-1 pr-3 font-normal">Persona</th><th className="py-1 pr-3 font-normal">Gruppo</th><th className="py-1 pr-3 text-right font-normal">Malattia</th><th className="py-1 pr-3 text-right font-normal">Infortunio</th><th className="py-1 pr-3 text-right font-normal">Altre</th><th className="py-1 pr-3 text-right font-normal">Totale giorni</th><th className="py-1 pr-3 text-right font-normal">Giorni lavorati</th><th className="py-1 pr-3 text-right font-normal">Assenteismo</th>{!meseOk && <th className="py-1 text-right font-normal">Mesi con assenze</th>}</tr></thead>
              <tbody>
                {righeStation.slice(0, tutti ? undefined : 10).map((a, i) => (
                  <tr key={a.chiave} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 tabular-nums text-slate-500">{i + 1}</td><td className="py-1.5 pr-3 font-medium">{a.nome}</td><td className="py-1.5 pr-3">{fissa ? "Autista" : <Gr g={a.gruppo} />}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a.malattia}</td><td className="py-1.5 pr-3 text-right tabular-nums">{a.infortunio}</td><td className="py-1.5 pr-3 text-right tabular-nums">{a.altre}</td><td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{a.giorni}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a.lavorati}</td><td className="py-1.5 pr-3 text-right tabular-nums">{a.pct === null ? "—" : `${n1(a.pct)}%`}</td>{!meseOk && <td className="py-1.5 text-right tabular-nums">{a.mesi}</td>}
                  </tr>
                ))}
                {righeStation.length === 0 && <tr><td colSpan={10} className="py-2 text-slate-500">Nessuna assenza nel periodo.</td></tr>}
              </tbody>
            </table>
          </div>
          {righeStation.length > 10 && <button className="btn-secondary self-start text-sm" onClick={() => setTutti(!tutti)}>{tutti ? "Mostra solo i primi 10" : `Mostra tutti (${righeStation.length})`}</button>}
        </>
      )}
    </Riquadro>
  );
}

/** Assenteismo di un solo gruppo (autisti GLS): le quattro voci per mese e da inizio anno. */
function TassiUnici({ righe }: { righe: RigaMese[] }) {
  const t = useMemo(() => tabellaTassi(righe, "SIC"), [righe]), n = t.network;
  const p = (v: number | null) => (v === null ? "—" : `${n1(v)}%`);
  const max = Math.max(1, ...n.perMese.map((x) => x.pct ?? 0));
  const voci = [["Assenteismo", "pct"], ["di cui malattia", "malattiaPct"], ["di cui infortunio", "infortunioPct"], ["di cui altre assenze", "altrePct"]] as const;
  return (
    <Riquadro titolo="Assenteismo degli autisti: mese per mese e da inizio anno" sotto="Giorni di assenza sui giorni in cui si doveva lavorare. Malattia + infortunio + altre assenze (non retribuite, ingiustificate, malattia figlio) = assenteismo. Scioperi, ferie e permessi retribuiti non contano.">
      <div className="overflow-x-auto">
        <table className="w-full border-separate text-sm" style={{ borderSpacing: 2 }}>
          <thead><tr className="text-slate-500"><th />{t.mesi.map((m) => <th key={m} className="px-1 font-normal">{mb(m)}</th>)}<th className="px-2 font-semibold text-slate-700">Da inizio anno</th></tr></thead>
          <tbody>
            {voci.map(([nome, k], i) => (
              <tr key={k} className={i === 0 ? "font-semibold" : ""}>
                <th className="whitespace-nowrap pr-2 text-left font-semibold">{nome}</th>
                {n.perMese.map((x, j) => <td key={j} className="rounded px-1 py-1.5 text-center tabular-nums" style={{ background: `rgba(220, 38, 38, ${(((x[k] ?? 0) / max) * 0.5).toFixed(2)})` }} title={`${mb(t.mesi[j])}: ${x.malattia} giorni di malattia, ${x.infortunio} di infortunio, ${x.altre} di altre assenze, ${x.lavorati} lavorati`}>{p(x[k])}</td>)}
                <td className="rounded px-2 py-1.5 text-center font-semibold tabular-nums" style={{ background: "#E2E8F0" }}>{p(n.ytd[k])}</td>
              </tr>
            ))}
            <tr className="text-slate-600"><th className="pr-2 text-left font-normal">Giorni lavorati</th>{n.perMese.map((x, j) => <td key={j} className="px-1 py-1 text-center tabular-nums">{x.lavorati.toLocaleString("it-IT")}</td>)}<td className="px-2 py-1 text-center tabular-nums">{n.ytd.lavorati.toLocaleString("it-IT")}</td></tr>
          </tbody>
        </table>
      </div>
    </Riquadro>
  );
}
