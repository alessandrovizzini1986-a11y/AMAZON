"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { controlloSettimanale, righePerDriver, type Categoria, type EsitoSettimanale } from "@/domain/presenze/controlloSettimanale";
import { domenicheStation, messaggioSettimanale, riepilogoStation, risultatiDaSalvare, type DomenicaRigaSett } from "@/domain/presenze/vistaSettimanale";
import { daysBetween, GG, weekday } from "@/domain/presenze/grid";
import { entroGiorniLavorativi, ddmm } from "@/domain/presenze/messaggi";
import { STATIONS, type Station } from "@/domain/presenze/regole";
import { caricaDatiMese } from "@/lib/presenze/carica";
import { excelSettimanale } from "@/lib/presenze/excelSettimanale";
import { scarica } from "@/lib/presenze/excelUtil";
import { salvaEsecuzione } from "../actions";
import { CopiaMessaggio } from "../CopiaMessaggio";
import { Aiuto } from "@/components/Aiuto";

export type RunSalvata = { id: string; station: string | null; da: string; a: string; nAlert: number; eseguitoDa: string; eseguitoIl: string; aperti: number };

const SIMBOLO_CLASS: Record<string, string> = {
  "+1": "bg-[#fbe9e7] text-danger font-bold",
  "-1": "bg-[#fdf1dc] text-warn font-bold",
  H: "bg-[#e5f0f7] text-info font-bold",
  A: "bg-[#efe7f7] text-[#5b2a86] font-bold",
  ORE: "bg-[#fbe9e7] text-[#8a1c0a] font-bold ring-1 ring-inset ring-danger",
  ACC: "bg-[#fff4cc] text-[#7a5a00] font-bold",
  ok: "text-ok",
  "?": "bg-surface-sunken text-ink-muted",
  "": "",
};

const oggiIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function periodoDefault() {
  const oggi = oggiIso();
  const ieri = new Date(oggi + "T00:00:00Z");
  ieri.setUTCDate(ieri.getUTCDate() - 1);
  const a = ieri.toISOString().slice(0, 10);
  return { da: a.slice(0, 8) + "01", a };
}

export function SettimanaleClient({ utente, giustificativi, dispatcher, referenti, runs, canRun }: {
  utente: string; giustificativi: string[]; dispatcher: string[]; referenti: Record<string, string>; runs: RunSalvata[]; canRun: boolean;
}) {
  const router = useRouter();
  const [p, setP] = useState(periodoDefault);
  const [station, setStation] = useState<"TUTTE" | Station>("TUTTE");
  const [stato, setStato] = useState("");
  const [errori, setErrori] = useState<string[]>([]);
  const [esiti, setEsiti] = useState<EsitoSettimanale[]>([]);
  const [dom, setDom] = useState<DomenicaRigaSett[]>([]);
  const [lavoro, setLavoro] = useState(false);
  const [filtroSt, setFiltroSt] = useState("TUTTE");
  const [filtroEsito, setFiltroEsito] = useState("ALERT");
  const [vistaDom, setVistaDom] = useState<"" | "consec" | "6dom">("");
  const [salvata, setSalvata] = useState<string | null>(null);

  const esegui = async () => {
    if (p.da > p.a) { setErrori(["La data di inizio è dopo quella di fine."]); return; }
    if (p.da.slice(0, 7) !== p.a.slice(0, 7)) { setErrori(["Il periodo deve stare in un solo mese (i tracking sono mensili)."]); return; }
    setLavoro(true); setErrori([]); setEsiti([]); setDom([]); setSalvata(null);
    try {
      const dati = await caricaDatiMese(p.a.slice(0, 7), setStato);
      const err = [...dati.avvisi];
      if (!dati.flex.length) err.push("Nessun CSV Amazon nell'archivio: caricali nel passo 1.");
      const stations = station === "TUTTE" ? STATIONS.filter((s) => dati.tracking.some((t) => t.station === s) || dati.flex.some((f) => f.station === s)) : [station];
      const out: EsitoSettimanale[] = [];
      const doms: DomenicaRigaSett[] = [];
      for (const st of stations) {
        setStato(`Controllo ${st}…`);
        await new Promise((r) => setTimeout(r, 0));
        const mancano = (["SIC", "STD"] as const).filter((t) => !dati.tracking.some((x) => x.station === st && x.tipo === t));
        if (mancano.length) { err.push(`${st}: manca il tracking ${mancano.join(" e ")} del mese`); continue; }
        try {
          out.push(controlloSettimanale(dati.tracking.filter((t) => t.station === st), dati.flex, { station: st, da: p.da, a: p.a, giustificativi, dispatcher }, dati.tracking));
          doms.push(...domenicheStation(st, dati.tracking, p.da, p.a));
        } catch (e) {
          err.push(`${st}: ${e instanceof Error ? e.message : "errore"}`);
        }
      }
      setEsiti(out); setDom(doms); setErrori(err); setStato("");
    } catch (e) {
      setErrori([e instanceof Error ? e.message : "Errore nella lettura dei file"]);
    } finally {
      setLavoro(false);
    }
  };

  const giorni = useMemo(() => (esiti.length ? daysBetween(esiti[0].da, esiti[0].a) : []), [esiti]);
  const righe = useMemo(() => esiti.flatMap(righePerDriver), [esiti]);
  const visibili = righe.filter((r) =>
    (filtroSt === "TUTTE" || r.station === filtroSt) &&
    (filtroEsito === "TUTTI" || (filtroEsito === "ALERT" ? r.piu1 + r.meno1 + r.h + r.a + r.ore + r.acc > 0 : filtroEsito === "+1" ? r.piu1 > 0 : filtroEsito === "-1" ? r.meno1 > 0 : filtroEsito === "H" ? r.h > 0 : filtroEsito === "ORE" ? r.ore > 0 : filtroEsito === "ACC" ? r.acc > 0 : r.a > 0)));
  const riep = esiti.map(riepilogoStation);
  const nOre = riep.reduce((s, r) => s + r.ore, 0);
  const nAcc = riep.reduce((s, r) => s + r.acc, 0);
  const entro = entroGiorniLavorativi(oggiIso());
  const messaggi = esiti.map((e) => messaggioSettimanale(e, referenti[e.station] ?? null, entro)).filter((m) => m.nAnomalie > 0);
  const nConsec = dom.filter((d) => d.oltre6).length;
  const nSeiDom = dom.reduce((s, d) => s + d.seiPiuDom.length, 0);
  const domVisibili = dom.filter((d) => (vistaDom === "consec" ? d.oltre6 : vistaDom === "6dom" ? d.seiPiuDom.length > 0 : d.oltre6 || d.seiPiuDom.length > 0));

  const excel = async () => {
    await scarica(excelSettimanale(esiti, dom, { da: p.da, a: p.a, utente, giustificativi, dispatcher: dispatcher.length }), `Controllo_settimanale_${p.da}_${p.a}.xlsx`);
  };
  const salva = async () => {
    const risultati = esiti.flatMap(risultatiDaSalvare);
    const { id } = await salvaEsecuzione({
      tipo: "SETTIMANALE", station: station === "TUTTE" ? null : station, periodoDa: p.da, periodoA: p.a,
      riepilogo: { stations: esiti.map(riepilogoStation), consecutivi: nConsec, seiPiuDom: nSeiDom },
      risultati,
    });
    setSalvata(id);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-wrap items-end gap-3 p-4 md:p-5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Dal
          <input type="date" className="input h-11 w-44" value={p.da} onChange={(e) => setP({ ...p, da: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Al
          <input type="date" className="input h-11 w-44" value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Station
          <select className="input h-11 w-40" value={station} onChange={(e) => setStation(e.target.value as "TUTTE" | Station)}>
            <option value="TUTTE">Tutte</option>
            {STATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="text-xs text-ink-muted">Soglie: rotta Amazon &gt; 10 pacchi · trasferta se &gt; 4 h</div>
        <button type="button" className="btn-primary ml-auto h-11" onClick={esegui} disabled={lavoro}>{lavoro ? "Controllo in corso…" : "Esegui controllo"}</button> <Aiuto k="presenze.settimanale.esegui" />
        {stato && <p className="w-full text-sm text-ink-muted">{stato}</p>}
      </section>

      {errori.length > 0 && (
        <ul className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">
          {errori.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}

      {esiti.length > 0 && (
        <>
          {/* blocco alert sempre visibile */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" onClick={() => setVistaDom(vistaDom === "consec" ? "" : "consec")} className={`card p-4 text-left ${nConsec > 0 ? "border-danger bg-danger-soft" : ""}`}>
              <div className="text-sm font-medium text-ink-muted">Driver con più di 6 giorni consecutivi (mese)</div>
              <div className={`text-3xl font-bold ${nConsec > 0 ? "text-danger" : ""}`}>{nConsec}</div>
              <div className="text-xs text-brand">{nConsec ? "Mostra elenco ↓" : "Nessuna violazione"}</div>
            </button>
            <button type="button" onClick={() => setVistaDom(vistaDom === "6dom" ? "" : "6dom")} className="card p-4 text-left">
              <div className="text-sm font-medium text-ink-muted">Casi 6 giorni + domenica nel periodo</div>
              <div className="text-3xl font-bold">{nSeiDom}</div>
              <div className="text-xs text-brand">{nSeiDom ? "Mostra elenco ↓" : "Nessun caso"}</div>
            </button>
            <button type="button" onClick={() => setFiltroEsito(filtroEsito === "ORE" ? "ALERT" : "ORE")} className={`card p-4 text-left ${nOre > 0 ? "border-danger bg-danger-soft" : ""}`}>
              <div className="text-sm font-medium text-ink-muted">ORE: giornate oltre 10 h o valori anomali</div>
              <div className={`text-3xl font-bold ${nOre > 0 ? "text-danger" : ""}`}>{nOre}</div>
              <div className="text-xs text-brand">{nOre ? "Filtra i driver ↓" : "Nessun caso"}</div>
            </button>
            <button type="button" onClick={() => setFiltroEsito(filtroEsito === "ACC" ? "ALERT" : "ACC")} className={`card p-4 text-left ${nAcc > 0 ? "border-warn bg-warn-soft" : ""}`}>
              <div className="text-sm font-medium text-ink-muted">ACC: Accordo di domenica (STD)</div>
              <div className={`text-3xl font-bold ${nAcc > 0 ? "text-warn" : ""}`}>{nAcc}</div>
              <div className="text-xs text-brand">{nAcc ? "Filtra i driver ↓" : "Nessun caso"}</div>
            </button>
          </section>

          <section className="card overflow-x-auto p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-[19px] font-semibold">Riepilogo per station</h2>
              <button type="button" className="btn-secondary h-10" onClick={excel}>Excel per le Ops</button> <Aiuto k="presenze.settimanale.excel" />
              {canRun && <><button type="button" className="btn-primary h-10" onClick={salva} disabled={!!salvata}>{salvata ? "Salvata ✓" : "Salva esecuzione"}</button> <Aiuto k="presenze.salva" /></>}
              {salvata && <Link className="text-sm font-semibold text-brand hover:underline" href={`/presenze/esecuzioni/${salvata}`}>Apri per segnare gli esiti →</Link>}
            </div>
            <table className="table-base text-sm">
              <thead><tr><th>Station</th><th>Driver</th><th>Trasferte</th><th>Rotte Amazon</th><th>+1</th><th>−1</th><th>H</th><th>A</th><th>ORE</th><th>ACC</th><th>€ +1</th><th>Giorni senza CSV</th></tr></thead>
              <tbody>
                {riep.map((r) => (
                  <tr key={r.station}>
                    <td className="font-mono font-semibold">{r.station}</td><td>{r.driver}</td><td>{r.trasferte}</td><td>{r.rotte}</td>
                    <td className={r.piu1 ? "font-bold text-danger" : ""}>{r.piu1}</td><td className={r.meno1 ? "font-bold text-warn" : ""}>{r.meno1}</td>
                    <td className={r.h ? "font-bold text-info" : ""}>{r.h}</td><td className={r.a ? "font-bold text-[#5b2a86]" : ""}>{r.a}</td>
                    <td className={r.ore ? "font-bold text-danger" : ""}>{r.ore}</td><td className={r.acc ? "font-bold text-warn" : ""}>{r.acc}</td>
                    <td>{(r.eurPiu1).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</td><td>{r.giorniSenzaCsv || "—"}</td>
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

          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <h2 className="mr-auto text-[19px] font-semibold">Driver ({visibili.length})</h2>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Station
                <select className="input h-10 w-32" value={filtroSt} onChange={(e) => setFiltroSt(e.target.value)}>
                  <option value="TUTTE">Tutte</option>
                  {esiti.map((e) => <option key={e.station}>{e.station}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Esito
                <select className="input h-10 w-44" value={filtroEsito} onChange={(e) => setFiltroEsito(e.target.value)}>
                  <option value="ALERT">Solo da verificare</option><option value="+1">+1</option><option value="-1">−1</option><option value="H">H</option><option value="A">A</option><option value="ORE">ORE</option><option value="ACC">ACC</option><option value="TUTTI">Tutti</option>
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-ink-muted">
                    <th className="sticky left-0 z-[1] bg-surface-raised px-2 py-2">Driver</th><th className="px-2">Station</th><th className="px-2">Tipo</th><th className="px-2">ID</th><th className="px-2">Contratto</th>
                    <th className="px-1">gg</th><th className="px-1">Trasf.</th><th className="px-1">Rotte</th><th className="px-1">+1</th><th className="px-1">−1</th><th className="px-1">H</th><th className="px-1">A</th><th className="px-1">ORE</th><th className="px-1">ACC</th>
                    <th className="px-2">Giorni da verificare</th>
                    {giorni.map((d) => <th key={d} className="w-7 px-0 text-center font-semibold">{Number(d.slice(8))}<br />{GG[weekday(d)].slice(0, 1)}</th>)}
                    <th className="min-w-[280px] px-2">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {visibili.map((r, i) => (
                    <tr key={i} className="border-t border-[#eef1f4] hover:bg-[#f6f9fc]">
                      <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface-raised px-2 py-1.5 font-semibold">{r.driver}</td>
                      <td className="px-2 font-mono">{r.station}</td><td className="px-2">{r.tipo}</td><td className="px-2 font-mono text-[11px]">{r.driverId || <span className="text-warn">manca</span>}</td><td className="whitespace-nowrap px-2">{r.contratto}</td>
                      <td className="px-1 text-center">{r.giorniLavorati}</td><td className="px-1 text-center">{r.trasferte}</td><td className="px-1 text-center">{r.rotte}</td>
                      <td className="px-1 text-center">{r.piu1 || ""}</td><td className="px-1 text-center">{r.meno1 || ""}</td><td className="px-1 text-center">{r.h || ""}</td><td className="px-1 text-center">{r.a || ""}</td><td className="px-1 text-center">{r.ore || ""}</td><td className="px-1 text-center">{r.acc || ""}</td>
                      <td className="whitespace-nowrap px-2 font-semibold">{r.daVerificare}</td>
                      {giorni.map((d) => {
                        const s = (r.simboli[d] ?? "") as Categoria;
                        return <td key={d} className={`px-0 text-center ${SIMBOLO_CLASS[s]}`}>{s}</td>;
                      })}
                      <td className="px-2 text-ink-muted">{r.nota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">+1 trasferta senza rotta Amazon · −1 rotta Amazon senza ore nel tracking · H ore nel tracking, assente su Amazon, senza trasferta · A su Amazon ma in nessun tracking · ORE oltre 10 h lavorate o valore &gt; 24 in una cella · ACC ore nella riga Accordo di domenica (STD) · ok coincidono · ? CSV del giorno mancante</p>
          </section>

          <section className="card overflow-x-auto p-4 md:p-5">
            <h2 className="mb-1 text-[19px] font-semibold">Domeniche e giorni consecutivi</h2>
            <p className="mb-3 text-sm text-ink-muted">{vistaDom === "consec" ? "Driver oltre 6 giorni consecutivi nel mese." : vistaDom === "6dom" ? "Driver con 6 giorni lavorati nella settimana, domenica compresa." : "Driver con almeno un caso 6+domenica o oltre 6 giorni consecutivi."}</p>
            {domVisibili.length === 0 ? (
              <p className="text-sm text-ink-muted">Nessun caso.</p>
            ) : (
              <table className="table-base text-sm">
                <thead><tr><th>Station</th><th>Tipo</th><th>Lavoratore</th><th>gg lavorati (periodo)</th><th>6+dom</th><th>Max consecutivi (mese)</th><th>Dal–al</th><th>&gt;6</th></tr></thead>
                <tbody>
                  {domVisibili.map((d, i) => (
                    <tr key={i}>
                      <td className="font-mono">{d.station}</td><td>{d.tipo}</td><td className="font-semibold">{d.lavoratore}</td><td>{d.giorniLavorati}</td>
                      <td>{d.seiPiuDom.map(ddmm).join(", ")}</td><td>{d.maxConsecutivi}</td><td>{d.consecDal ? `${ddmm(d.consecDal)}–${ddmm(d.consecAl)}` : ""}</td>
                      <td>{d.oltre6 ? <span className="badge-danger">SI</span> : "NO"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <section className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Esecuzioni salvate</h2>
        {runs.length === 0 ? <p className="text-sm text-ink-muted">Nessuna esecuzione salvata.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>Periodo</th><th>Station</th><th>Righe</th><th>Ancora aperte</th><th>Eseguita da</th><th>Il</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{ddmm(r.da)}–{ddmm(r.a)}/{r.a.slice(0, 4)}</td><td>{r.station ?? "Tutte"}</td><td>{r.nAlert}</td>
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
