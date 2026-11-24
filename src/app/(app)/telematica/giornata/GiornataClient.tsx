"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { durataMin, oreMinuti, piuGiorni } from "@/domain/telematica";
import type { Giornata, RigaGiornata } from "@/lib/telematica/giornata";
import type { FlexRow } from "@/domain/presenze/flex";
import { tuttiIFile } from "@/lib/presenze/archivioLocale";
import { segnaLuogoTelematica } from "../actions";

const data = (g: string) => new Date(`${g}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const n0 = (x: number) => Math.round(x).toLocaleString("it-IT");
/** sopra questa soglia di pacchi il driver ha fatto una rotta (stessa regola del controllo presenze) */
const PACCHI_ROTTA = 20;
type Filtro = "TUTTI" | "AVVISI" | "USATI" | "FERMI";

export function GiornataClient({ dati, stations, oggi }: { dati: Giornata; stations: string[]; oggi: string }) {
  const router = useRouter();
  const [aperta, setAperta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("USATI");
  const [amazon, setAmazon] = useState<FlexRow[] | null>(null);
  const vai = (station: string, giorno: string) => router.push(`/telematica/giornata?station=${station}&giorno=${giorno}`);

  // le rotte Amazon stanno nell'archivio di questo PC (i CSV "Addetti alla consegna"): si leggono qui, non sul server
  useEffect(() => {
    let vivo = true;
    setAmazon(null);
    (async () => {
      try {
        const per = new Map<string, FlexRow>();
        for (const f of (await tuttiIFile()).filter((x) => x.kind === "FLEX").sort((a, b) => a.caricatoIl.localeCompare(b.caricatoIl))) for (const r of f.flexRows ?? []) if (r.station === dati.station && r.data === dati.giorno) per.set(r.driverId, r);
        if (vivo) setAmazon([...per.values()].sort((a, b) => b.pacchi - a.pacchi));
      } catch { if (vivo) setAmazon([]); }
    })();
    return () => { vivo = false; };
  }, [dati.station, dati.giorno]);

  const usati = dati.righe.filter((r) => r.km >= 1), conAvvisi = dati.righe.filter((r) => r.avvisi.some((a) => !a.info));
  const noti = new Set([...dati.basi, ...dati.luoghi.map((l) => l.luogo)]);
  const segna = async (luogo: string, tipo: "PARCHEGGIO" | "OFFICINA" | "CASA" | "NESSUNO") => {
    let nota: string | undefined;
    if (tipo === "CASA") { const n = window.prompt("Chi abita lì? (nome del driver, facoltativo)"); if (n === null) return; nota = n; }
    await segnaLuogoTelematica({ station: dati.station, luogo, tipo, nota }); router.refresh();
  };
  const righe = useMemo(() => {
    const f = filtro === "AVVISI" ? dati.righe.filter((r) => r.avvisi.some((a) => !a.info)) : filtro === "USATI" ? dati.righe.filter((r) => r.km >= 1) : filtro === "FERMI" ? dati.righe.filter((r) => r.km < 1) : dati.righe;
    const gravi = (r: RigaGiornata) => r.avvisi.filter((a) => !a.info).length;
    return [...f].sort((a, b) => gravi(b) - gravi(a) || (a.partenza ?? "99").localeCompare(b.partenza ?? "99") || a.targa.localeCompare(b.targa));
  }, [dati.righe, filtro]);
  const rotte = amazon?.filter((r) => r.pacchi > PACCHI_ROTTA) ?? [];
  const km = usati.reduce((a, r) => a + r.km, 0);

  const Dato = ({ titolo, valore, nota }: { titolo: string; valore: string; nota?: string }) => (
    <div className="card p-3"><div className="text-xs text-slate-500">{titolo}</div><div className="text-xl font-semibold tabular-nums">{valore}</div>{nota && <div className="text-xs text-slate-500">{nota}</div>}</div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="input w-auto" value={dati.station} onChange={(e) => vai(e.target.value, dati.giorno)} aria-label="Station">{stations.map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn-secondary" onClick={() => vai(dati.station, piuGiorni(dati.giorno, -1))} aria-label="Giorno prima">←</button>
        <input type="date" className="input w-auto" value={dati.giorno} max={oggi} onChange={(e) => e.target.value && vai(dati.station, e.target.value)} aria-label="Giorno" />
        <button className="btn-secondary" disabled={dati.giorno >= oggi} onClick={() => vai(dati.station, piuGiorni(dati.giorno, 1))} aria-label="Giorno dopo">→</button>
        <span className="font-medium capitalize">{data(dati.giorno)}</span>
      </div>

      {!dati.scaricato ? (
        <p className="card p-4 text-sm text-slate-700">Questo giorno non è ancora stato scaricato dai portali. Vai in <a className="underline" href={`/telematica/mese?mese=${dati.giorno.slice(0, 7)}`}>Furgoni: il mese</a> e premi «Scarica i giorni che mancano».</p>
      ) : (
        <>
          {!dati.definitivo && <p className="text-sm text-amber-700">Giorno scaricato prima che finisse: i dati possono essere parziali.</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Dato titolo="Furgoni usati" valore={`${usati.length} su ${dati.conTelematica}`} nota={`con telematica; in flotta ${dati.inFlotta}`} />
            <Dato titolo="Km del giorno" valore={n0(km)} nota={usati.length ? `${n0(km / usati.length)} a furgone` : undefined} />
            <Dato titolo="Rotte Amazon fatte" valore={amazon === null ? "…" : amazon.length ? String(rotte.length) : "—"} nota={amazon?.length === 0 ? "CSV del giorno non in archivio" : "driver con più di 20 pacchi"} />
            <Dato titolo="Rotte previste" valore={dati.rottePreviste === null ? "—" : String(dati.rottePreviste)} nota="dall'ultimo forecast" />
            <Dato titolo="Furgoni da guardare" valore={String(conAvvisi.length)} nota={`${conAvvisi.reduce((a, r) => a + r.avvisi.filter((x) => !x.info).length, 0)} segnalazioni`} />
          </div>
          {dati.conTelematica < dati.inFlotta && <p className="text-xs text-slate-500">Solo {dati.conTelematica} dei {dati.inFlotta} furgoni di {dati.station} hanno la telematica: i furgoni usati qui sotto non sono tutti quelli usciti, quindi il confronto con le rotte è indicativo.</p>}
          {dati.basi.length > 0 && <p className="text-xs text-slate-500">Base di {dati.station} (ricavata da dove partono i furgoni nel mese): {dati.basi.join(" · ")}.</p>}

          <div className="flex flex-wrap gap-2 text-sm">
            {([["USATI", `Usati (${usati.length})`], ["AVVISI", `Da guardare (${conAvvisi.length})`], ["FERMI", `Fermi (${dati.righe.length - usati.length})`], ["TUTTI", `Tutti (${dati.righe.length})`]] as [Filtro, string][]).map(([k, nome]) => (
              <button key={k} className={filtro === k ? "btn-primary" : "btn-secondary"} onClick={() => setFiltro(k)}>{nome}</button>
            ))}
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500">
                <th className="px-3 py-2">Targa</th><th className="px-2 py-2">Partenza</th><th className="px-2 py-2">Rientro</th><th className="px-2 py-2 text-right">Fuori</th><th className="px-2 py-2 text-right">Km</th><th className="px-2 py-2 text-right">Soste</th><th className="px-2 py-2">Sosta più lunga</th><th className="px-2 py-2 text-right">Vel. max</th><th className="px-2 py-2">Da guardare</th>
              </tr></thead>
              <tbody>
                {righe.map((r) => (
                  <Fragment key={r.targa}>
                    <tr className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => setAperta(aperta === r.targa ? null : r.targa)}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium">{aperta === r.targa ? "▾" : "▸"} {r.targa}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.partenza ?? "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.rientro ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{r.partenza ? oreMinuti(r.fuoriMin) : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.km >= 1 ? n0(r.km) : "0"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{r.soste ? `${r.soste} · ${oreMinuti(r.sosteMin)}` : "—"}</td>
                      <td className="px-2 py-1.5">{r.sostaLunga ? <>{oreMinuti(r.sostaLunga.min)} <span className="text-slate-500">alle {r.sostaLunga.da}</span></> : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.velMax ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.avvisi.length ? <ul className="flex flex-col gap-0.5">{r.avvisi.map((a) => <li key={a.codice} className={a.info ? "text-slate-600" : "text-amber-800"}>{a.testo}</li>)}</ul> : r.km >= 1 ? <span className="text-emerald-700">Niente</span> : <span className="text-slate-400">Fermo</span>}</td>
                    </tr>
                    {aperta === r.targa && <tr className="border-t border-slate-100 bg-slate-50"><td colSpan={9} className="px-3 py-3"><Dettaglio r={r} noti={noti} segna={segna} /></td></tr>}
                  </Fragment>
                ))}
                {righe.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-slate-500">Nessun furgone in questo elenco.</td></tr>}
              </tbody>
            </table>
          </div>

          {dati.luoghi.length > 0 && (
            <section className="card flex flex-col gap-2 p-4">
              <h2 className="text-base font-semibold">Posti conosciuti di {dati.station}</h2>
              <p className="text-sm text-slate-600">Un furgone fermo per la notte in un parcheggio non viene segnalato; in officina compare come «in officina»; a casa di un driver resta segnalato, con il nome.</p>
              <ul className="flex flex-col gap-1 text-sm">
                {dati.luoghi.map((l) => <li key={l.luogo} className="flex flex-wrap items-center gap-2"><span className="w-28 text-slate-500">{l.tipo === "OFFICINA" ? "Officina" : l.tipo === "CASA" ? "Casa di un driver" : "Parcheggio"}</span><span>{l.luogo}{l.nota ? ` · ${l.nota}` : ""}</span><button className="text-xs text-slate-500 underline" onClick={() => segna(l.luogo, "NESSUNO")}>togli</button></li>)}
              </ul>
            </section>
          )}

          <section className="card flex flex-col gap-2 p-4">
            <h2 className="text-base font-semibold">Rotte Amazon del giorno</h2>
            {amazon === null ? <p className="text-sm text-slate-500">Leggo l&apos;archivio di questo PC…</p> : amazon.length === 0 ? (
              <p className="text-sm text-slate-600">Nell&apos;archivio di questo PC non c&apos;è il CSV «Addetti alla consegna» di {dati.station} per questo giorno. Caricalo dalle Presenze e ricompare qui.</p>
            ) : (
              <>
                <p className="text-sm text-slate-600">{rotte.length} driver con una rotta, {amazon.length - rotte.length} con pochi pacchi (rescue o affiancamento). I portali di telematica non dicono chi guidava quale furgone: l&apos;elenco serve per confrontare i numeri.</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{amazon.map((d) => <span key={d.driverId} className={d.pacchi > PACCHI_ROTTA ? "" : "text-slate-500"}>{d.nome} · {d.pacchi} pacchi</span>)}</div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Dettaglio({ r, noti, segna }: { r: RigaGiornata; noti: Set<string>; segna: (luogo: string, tipo: "PARCHEGGIO" | "OFFICINA" | "CASA") => void }) {
  const ignoti = [...new Set([r.finisceA, r.parteDa].filter((l): l is string => !!l && !noti.has(l)))];
  if (!r.tappe.length) return <p className="text-sm text-slate-600">Per questo furgone il portale non dà il dettaglio di guide e soste{r.km >= 1 ? "" : ": è rimasto fermo"}.</p>;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-700">
        <span>Guida: <b>{oreMinuti(r.guidaMin)}</b></span><span>Fermo a motore acceso: <b>{oreMinuti(r.fermoAccesoMin)}</b></span>
        {r.rifornimenti > 0 && <span>Rifornimento: <b>{r.litri.toLocaleString("it-IT")} litri</b></span>}
        {r.parteDa && <span>Parte da: <b>{r.parteDa}</b></span>}{r.finisceA && <span>La sera è in: <b>{r.finisceA}</b></span>}
      </div>
      {ignoti.map((l) => (
        <div key={l} className="flex flex-wrap items-center gap-2 text-slate-700">
          <span>Conosci <b>{l}</b>?</span>
          <button className="btn-secondary py-0.5 px-2 text-xs" onClick={() => segna(l, "PARCHEGGIO")}>È un nostro parcheggio</button>
          <button className="btn-secondary py-0.5 px-2 text-xs" onClick={() => segna(l, "OFFICINA")}>È un&apos;officina</button>
          <button className="btn-secondary py-0.5 px-2 text-xs" onClick={() => segna(l, "CASA")}>È casa di un driver</button>
        </div>
      ))}
      <ol className="flex flex-col">
        {r.tappe.map((t, i) => (
          <li key={i} className="flex gap-3 border-l-2 py-0.5 pl-3" style={{ borderColor: t.t === "G" ? "#059669" : "#cbd5e1" }}>
            <span className="w-24 shrink-0 tabular-nums text-slate-600">{t.da}–{t.a}</span>
            <span className={t.t === "G" ? "font-medium" : "text-slate-600"}>{t.t === "G" ? `Guida, ${t.km.toLocaleString("it-IT")} km` : `Fermo ${oreMinuti(durataMin(t))}`}{t.dove ? <span className="font-normal text-slate-500"> · {t.t === "G" ? "arriva in " : ""}{t.dove}</span> : null}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
