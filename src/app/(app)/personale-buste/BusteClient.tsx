"use client";

import { Fragment, useMemo, useState } from "react";
import { addebitiPerPersona, NOME_ADDEBITO, type Addebito, type TipoAddebito, CATEGORIE, COEFF_COSTO_AZIENDA, COEFF_FONTE, costo, piuStraordinari, SOGLIA_FERIE, type Gruppo, type OrePersona, type RateiPersona, type TotaleMese, type VoceMese } from "@/domain/personale/buste";

type OreStation = { mese: string; station: string; gruppo: Gruppo; persone: number; oreLav: number; oreStr: number; oreMagg: number; conStr: number };
type FerieStation = { mese: string; station: string; gruppo: Gruppo; unita: "GG" | "ORE"; persone: number; ferie: number; rol: number; exfest: number; oltre: number; negativi: number };
export type DatiBuste = {
  totali: TotaleMese[]; voci: VoceMese[]; oreStation: OreStation[];
  oreStr: Pick<OrePersona, "mese" | "station" | "gruppo" | "codice" | "nome" | "oreLav" | "oreStr">[];
  ferieStation: FerieStation[]; addebiti: Addebito[]; ferieUltime: RateiPersona[]; stime: Record<string, { mese: string; ferie: number | null; rol: number | null; exfest: number | null }>; rotte: { mese: string; station: string; gruppo: Gruppo; rotte: number }[];
};
type Scheda = "COSTO" | "VOCI" | "ORE" | "FERIE" | "MULTE";
type Misura = "STIMATO" | "LORDO" | "TESTA" | "ROTTA" | "TESTE";

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const mb = (m: string) => `${MESI[Number(m.slice(5)) - 1]}`;
const eur = (x: number) => x.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const n0 = (x: number) => Math.round(x).toLocaleString("it-IT");
const n1 = (x: number) => x.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const unita = (u: "GG" | "ORE") => (u === "GG" ? "gg" : "h");

function Riquadro({ titolo, sotto, children }: { titolo: string; sotto?: React.ReactNode; children: React.ReactNode }) {
  return <section className="card flex flex-col gap-2 p-4"><div><h2 className="text-base font-semibold">{titolo}</h2>{sotto && <p className="text-xs text-slate-500">{sotto}</p>}</div>{children}</section>;
}
function Tessera({ titolo, valore, nota }: { titolo: string; valore: string; nota?: string }) {
  return <div className="card p-3"><div className="text-xs text-slate-500">{titolo}</div><div className="text-2xl font-semibold text-slate-900">{valore}</div>{nota && <div className="text-xs text-slate-500">{nota}</div>}</div>;
}
const Tab = ({ children }: { children: React.ReactNode }) => <div className="overflow-x-auto"><table className="w-full text-sm">{children}</table></div>;
const th = "px-2 py-1.5 text-left text-xs font-semibold text-slate-600 border-b border-slate-300 whitespace-nowrap";
const thn = th + " text-right";
const td = "px-2 py-1.5 border-b border-slate-100 whitespace-nowrap";
const tdn = td + " text-right tabular-nums";

export function BusteClient({ dati, gls }: { dati: DatiBuste; gls: boolean }) {
  const [scheda, setScheda] = useState<Scheda>("COSTO");
  const [gruppo, setGruppo] = useState<Gruppo>("SIC");
  const [station, setStation] = useState<string>("TUTTE");
  const [misura, setMisura] = useState<Misura>("STIMATO");
  const [aperta, setAperta] = useState<string | null>(null);
  const [periodoStr, setPeriodoStr] = useState<string>("ANNO");
  const [tuttiFerie, setTuttiFerie] = useState(false);
  const [persAperta, setPersAperta] = useState<string | null>(null);
  const [meseMulte, setMeseMulte] = useState<string>("ANNO");

  const g = gls ? "SIC" : gruppo;
  const stations = useMemo(() => [...new Set(dati.totali.map((t) => t.station))].sort(), [dati.totali]);
  const mesi = useMemo(() => [...new Set(dati.totali.filter((t) => t.gruppo === g).map((t) => t.mese))].sort(), [dati.totali, g]);
  const nelFiltro = <T extends { station: string; gruppo: Gruppo }>(x: T) => x.gruppo === g && (station === "TUTTE" || x.station === station);
  const tot = dati.totali.filter(nelFiltro), voci = dati.voci.filter(nelFiltro);
  const ultimo = mesi[mesi.length - 1];
  const misure: [Misura, string][] = g === "SIC" ? [["STIMATO", "Costo azienda stimato"], ["LORDO", "Lordo in busta"], ["TESTA", "Costo per persona"], ["ROTTA", "Costo per rotta"], ["TESTE", "Persone in busta"]] : [["LORDO", "Lordo in busta"], ["TESTA", "Lordo per persona"], ["TESTE", "Persone in busta"]];
  const mis = misure.some(([k]) => k === misura) ? misura : misure[0][0];

  const valore = (righe: TotaleMese[], m: Misura) => {
    if (!righe.length) return null;
    const c = costo(righe, dati.voci);
    const base = g === "SIC" ? c.stimato ?? 0 : c.lordo;
    if (m === "STIMATO") return c.stimato;
    if (m === "LORDO") return c.lordo;
    if (m === "TESTE") return righe.length > 1 && new Set(righe.map((r) => r.mese)).size > 1 ? c.teste / new Set(righe.map((r) => r.mese)).size : c.teste;
    if (m === "TESTA") return c.teste ? base / c.teste : null;
    const rotte = dati.rotte.filter((r) => r.gruppo === "SIC" && righe.some((t) => t.mese === r.mese && t.station === r.station)).reduce((a, r) => a + r.rotte, 0);
    return rotte ? base / rotte : null;
  };
  const fmt = (x: number | null, m: Misura) => (x === null ? "—" : m === "TESTE" ? n0(x) : m === "ROTTA" || m === "TESTA" ? eur(x) : eur(x));

  const costoUltimo = costo(tot.filter((t) => t.mese === ultimo), dati.voci), costoAnno = costo(tot, dati.voci);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["COSTO", "VOCI", "ORE", "FERIE", "MULTE"] as Scheda[]).map((s) => <button key={s} className={scheda === s ? "btn-primary" : "btn-secondary"} onClick={() => setScheda(s)}>{{ COSTO: "Costo", VOCI: "Voci variabili", ORE: "Ore e straordinari", FERIE: "Ferie residue", MULTE: "Multe e danni" }[s]}</button>)}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {!gls && (["SIC", "STD"] as Gruppo[]).map((x) => <button key={x} className={gruppo === x ? "btn-primary" : "btn-secondary"} onClick={() => setGruppo(x)}>{x}</button>)}
        {!gls && <select className="input w-auto" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station"><option value="TUTTE">Tutte le station</option>{stations.map((s) => <option key={s}>{s}</option>)}</select>}
      </div>

      {scheda === "COSTO" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tessera titolo={`${g === "SIC" ? "Costo azienda stimato" : "Lordo in busta"} · ${mb(ultimo)}`} valore={eur(g === "SIC" ? costoUltimo.stimato ?? 0 : costoUltimo.lordo)} nota={`${n0(costoUltimo.teste)} persone in busta`} />
            <Tessera titolo={`Da inizio anno (${mesi.length} buste)`} valore={eur(g === "SIC" ? costoAnno.stimato ?? 0 : costoAnno.lordo)} />
            <Tessera titolo="Lordo in busta · ultimo mese" valore={eur(costoUltimo.lordo)} nota={`di cui di competenza ${eur(costoUltimo.competenza)}`} />
            <Tessera titolo={g === "SIC" ? "Quota TFR · ultimo mese" : "Costo vero degli STD"} valore={g === "SIC" ? eur(costoUltimo.tfr) : "fattura agenzia"} nota={g === "SIC" ? undefined : "vedi Costi del personale"} />
          </div>
          <Riquadro titolo="Per station e mese della busta" sotto={g === "SIC"
            ? <>Costo azienda stimato = (lordo di competenza + quota TFR) × {COEFF_COSTO_AZIENDA.toLocaleString("it-IT")}: il coefficiente aggiunge contributi, INAIL e ratei di 13ª, 14ª e ferie ed è ricavato dal {COEFF_FONTE}. Il lordo di competenza toglie le voci pagate una volta (13ª/14ª, ferie liquidate, TFR a chi esce) e gli anticipi per conto INPS. Il costo vero è in Costi del personale → Consuntivo, nei mesi in cui c'è il report paghe.</>
            : <>Per gli STD la busta è dell&apos;agenzia: il lordo serve a capire le voci, il costo per noi è la fattura (Costi del personale).</>}>
            <div className="flex flex-wrap gap-2 text-sm">{misure.map(([k, nome]) => <button key={k} className={mis === k ? "btn-primary" : "btn-secondary"} onClick={() => setMisura(k)}>{nome}</button>)}</div>
            <Tab>
              <thead><tr><th className={th}>Station</th>{mesi.map((m) => <th key={m} className={thn}>{mb(m)}</th>)}<th className={thn}>Anno</th></tr></thead>
              <tbody>
                {[...stations.filter((s) => station === "TUTTE" || s === station), ...(station === "TUTTE" && stations.length > 1 ? ["NETWORK"] : [])].map((s) => {
                  const righe = dati.totali.filter((t) => t.gruppo === g && (s === "NETWORK" || t.station === s));
                  return <tr key={s} className={s === "NETWORK" ? "font-semibold" : ""}><td className={td}>{s === "NETWORK" ? "Totale" : s}</td>{mesi.map((m) => <td key={m} className={tdn}>{fmt(valore(righe.filter((t) => t.mese === m), mis), mis)}</td>)}<td className={tdn}>{fmt(valore(righe, mis), mis)}</td></tr>;
                })}
              </tbody>
            </Tab>
            {mis === "ROTTA" && <p className="text-xs text-slate-500">Rotte dei SIC dello stesso mese, dalle buste. Le buste di gennaio–ottobre pagano la paga base del mese e le voci variabili del mese prima.</p>}
          </Riquadro>
        </>
      )}

      {scheda === "VOCI" && (
        <Riquadro titolo={`Voci della busta · ${g}${station === "TUTTE" ? "" : ` · ${station}`}`} sotto="Importi lordi per mese della busta. Clicca una voce per vedere il dettaglio. Le trattenute sono soldi tolti dalla busta della persona (non sono costi in meno, tranne le assenze non pagate).">
          <Tab>
            <thead><tr><th className={th}>Voce</th>{mesi.map((m) => <th key={m} className={thn}>{mb(m)}</th>)}<th className={thn}>Anno</th><th className={thn}>Persone (ult. mese)</th></tr></thead>
            <tbody>
              {(["COMPETENZA", "TRATTENUTA", "INFO"] as const).map((tipo) => (
                <Fragment key={tipo}>
                  <tr><td colSpan={mesi.length + 3} className="bg-slate-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{{ COMPETENZA: "Pagato in busta", TRATTENUTA: "Tolto dalla busta", INFO: "Per informazione" }[tipo]}</td></tr>
                  {CATEGORIE.filter((c) => c.tipo === tipo).map((c) => {
                    const righe = voci.filter((v) => v.categoria === c.id && v.voce === "");
                    if (!righe.length) return null;
                    const imp = (m?: string) => righe.filter((v) => !m || v.mese === m).reduce((a, v) => a + v.importo, 0);
                    const dett = voci.filter((v) => v.categoria === c.id && v.voce !== "");
                    const nomiDett = [...new Set(dett.map((v) => v.voce))].sort((a, b) => dett.filter((v) => v.voce === b).reduce((s, v) => s + Math.abs(v.importo), 0) - dett.filter((v) => v.voce === a).reduce((s, v) => s + Math.abs(v.importo), 0));
                    const ap = aperta === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className={nomiDett.length ? "cursor-pointer hover:bg-slate-50" : ""} onClick={() => nomiDett.length && setAperta(ap ? null : c.id)}>
                          <td className={td}><span className="font-medium">{nomiDett.length ? (ap ? "▾ " : "▸ ") : ""}{c.nome}</span>{c.spiegazione && <span className="block text-xs text-slate-500">{c.spiegazione}</span>}</td>
                          {mesi.map((m) => <td key={m} className={tdn}>{imp(m) ? eur(imp(m)) : "—"}</td>)}
                          <td className={tdn + " font-semibold"}>{eur(imp())}</td>
                          <td className={tdn}>{n0(righe.filter((v) => v.mese === ultimo).reduce((a, v) => a + v.persone, 0)) || "—"}</td>
                        </tr>
                        {ap && nomiDett.map((nv) => { const r = dett.filter((v) => v.voce === nv); const im = (m?: string) => r.filter((v) => !m || v.mese === m).reduce((a, v) => a + v.importo, 0); return <tr key={nv} className="text-xs text-slate-600"><td className={td + " pl-6"}>{nv}</td>{mesi.map((m) => <td key={m} className={tdn}>{im(m) ? eur(im(m)) : ""}</td>)}<td className={tdn}>{eur(im())}</td><td className={tdn}>{n0(r.filter((v) => v.mese === ultimo).reduce((a, v) => a + v.persone, 0)) || ""}</td></tr>; })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </Tab>
        </Riquadro>
      )}

      {scheda === "ORE" && (() => {
        const os = dati.oreStation.filter(nelFiltro);
        const str = dati.voci.filter((v) => nelFiltro(v) && v.voce === "" && (v.categoria === "STRAORDINARI" || v.categoria === "MAGGIORAZIONI"));
        const cella = (s: string, m?: string) => { const r = os.filter((x) => (s === "NETWORK" || x.station === s) && (!m || x.mese === m)); const lav = r.reduce((a, x) => a + x.oreLav, 0), st = r.reduce((a, x) => a + x.oreStr, 0); return { lav, st, pct: lav ? (st / lav) * 100 : null }; };
        const persone = piuStraordinari(dati.oreStr.filter((x) => nelFiltro(x) && (periodoStr === "ANNO" || x.mese === periodoStr)).map((x) => ({ ...x, qualifica: "", ggLav: null, oreMagg: 0 })), 30);
        const totStr = cella("NETWORK"), euro = str.filter((v) => v.categoria === "STRAORDINARI").reduce((a, v) => a + v.importo, 0);
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tessera titolo="Ore straordinarie e supplementari · anno" valore={n0(totStr.st)} nota={totStr.pct !== null ? `${n1(totStr.pct)}% delle ore lavorate` : undefined} />
              <Tessera titolo="Pagato per straordinari · anno" valore={eur(euro)} nota="lordo, maggiorazioni festive/notturne escluse" />
              <Tessera titolo="Maggiorazioni festive e notturne · anno" valore={eur(str.filter((v) => v.categoria === "MAGGIORAZIONI").reduce((a, v) => a + v.importo, 0))} />
              <Tessera titolo={`Persone con straordinari · ${mb(ultimo)}`} valore={n0(os.filter((x) => x.mese === ultimo).reduce((a, x) => a + x.conStr, 0))} nota={`su ${n0(os.filter((x) => x.mese === ultimo).reduce((a, x) => a + x.persone, 0))} in busta`} />
            </div>
            <Riquadro titolo="Ore straordinarie per station" sotto="Ore in più pagate in busta (straordinari e supplementari dei part-time) e, tra parentesi, la quota sulle ore lavorate del calendario della stessa busta.">
              <Tab>
                <thead><tr><th className={th}>Station</th>{mesi.map((m) => <th key={m} className={thn}>{mb(m)}</th>)}<th className={thn}>Anno</th></tr></thead>
                <tbody>{[...stations.filter((s) => station === "TUTTE" || s === station), ...(station === "TUTTE" && stations.length > 1 ? ["NETWORK"] : [])].map((s) => <tr key={s} className={s === "NETWORK" ? "font-semibold" : ""}><td className={td}>{s === "NETWORK" ? "Totale" : s}</td>{[...mesi, undefined].map((m) => { const c = cella(s, m); return <td key={m ?? "a"} className={tdn}>{c.st ? <>{n0(c.st)} <span className="text-xs text-slate-500">({c.pct !== null ? n1(c.pct) : "—"}%)</span></> : "—"}</td>; })}</tr>)}</tbody>
              </Tab>
            </Riquadro>
            <Riquadro titolo="Chi fa più straordinari" sotto="Ore in più pagate in busta. Mesi = buste in cui ne ha fatte.">
              <div className="flex flex-wrap gap-2 text-sm"><button className={periodoStr === "ANNO" ? "btn-primary" : "btn-secondary"} onClick={() => setPeriodoStr("ANNO")}>Da inizio anno</button><select className="input w-auto" value={periodoStr === "ANNO" ? "" : periodoStr} onChange={(e) => setPeriodoStr(e.target.value || "ANNO")} aria-label="Mese"><option value="">Un mese…</option>{mesi.map((m) => <option key={m} value={m}>{mb(m)} {m.slice(0, 4)}</option>)}</select></div>
              <Tab>
                <thead><tr><th className={th}>#</th><th className={th}>Persona</th><th className={th}>Station</th><th className={thn}>Ore in più</th><th className={thn}>% sulle ore lavorate</th><th className={thn}>Mesi</th><th className={thn}>Mese più alto</th></tr></thead>
                <tbody>{persone.map((p, i) => <tr key={p.gruppo + p.codice}><td className={td}>{i + 1}</td><td className={td}>{p.nome}</td><td className={td}>{p.station}</td><td className={tdn + " font-semibold"}>{n1(p.oreStr)}</td><td className={tdn}>{p.oreLav ? `${n1((p.oreStr / p.oreLav) * 100)}%` : "—"}</td><td className={tdn}>{p.mesiCon}/{p.mesi}</td><td className={tdn}>{n1(p.max)} h · {mb(p.meseMax)}</td></tr>)}</tbody>
              </Tab>
            </Riquadro>
          </>
        );
      })()}

      {scheda === "FERIE" && (() => {
        const ult = dati.ferieUltime.filter(nelFiltro);
        const meseF = ult[0]?.mese;
        const u = (ult[0]?.ferieUnita ?? (g === "STD" ? "ORE" : "GG")) as "GG" | "ORE";
        const fs = dati.ferieStation.filter(nelFiltro);
        const mesiF = [...new Set(fs.map((x) => x.mese))].sort();
        const oltre = ult.filter((x) => (x.ferieSaldo ?? 0) > SOGLIA_FERIE[u]);
        const conStime = ult.some((x) => dati.stime[`${x.station}|${x.gruppo}|${x.codice}`]);
        const ordinati = [...ult].sort((a, b) => (b.ferieSaldo ?? 0) - (a.ferieSaldo ?? 0));
        const tot = (k: "ferieSaldo" | "rolSaldo" | "exfestSaldo") => ult.reduce((a, x) => a + Math.max(0, x[k] ?? 0), 0);
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tessera titolo={`Ferie residue · busta di ${meseF ? mb(meseF) : "—"}`} valore={`${n0(tot("ferieSaldo"))} ${unita(u)}`} nota={`${ult.length} persone, saldi positivi`} />
              <Tessera titolo={`Oltre ${SOGLIA_FERIE[u]} ${unita(u)} di ferie`} valore={n0(oltre.length)} nota="da far smaltire" />
              <Tessera titolo="ROL residui" valore={`${n0(tot("rolSaldo"))} h`} />
              <Tessera titolo="Ex festività residue" valore={`${n0(tot("exfestSaldo"))} h`} />
            </div>
            <Riquadro titolo="Ferie residue per station" sotto={`Saldo a fine busta: residuo dell'anno prima + maturato − goduto. Ferie in ${u === "GG" ? "giorni" : "ore"}, ROL ed ex festività in ore, come in busta.${g === "STD" ? " Per gli STD l'agenzia paga ogni mese 13ª, 14ª, ROL ed ex festività: le ferie non godute le fattura a fine missione." : ""}`}>
              <Tab>
                <thead><tr><th className={th}>Station</th>{mesiF.map((m) => <th key={m} className={thn}>{mb(m)}</th>)}<th className={thn}>Persone</th><th className={thn}>Media</th><th className={thn}>Oltre soglia</th><th className={thn}>Saldo negativo</th></tr></thead>
                <tbody>{stations.filter((s) => station === "TUTTE" || s === station).map((s) => { const r = fs.filter((x) => x.station === s); const l = r.find((x) => x.mese === meseF); return <tr key={s}><td className={td}>{s}</td>{mesiF.map((m) => { const x = r.find((y) => y.mese === m); return <td key={m} className={tdn}>{x ? n0(x.ferie) : "—"}</td>; })}<td className={tdn}>{l?.persone ?? "—"}</td><td className={tdn}>{l ? `${n1(l.ferie / l.persone)} ${unita(u)}` : "—"}</td><td className={tdn}>{l?.oltre ?? "—"}</td><td className={tdn}>{l?.negativi ?? "—"}</td></tr>; })}</tbody>
              </Tab>
            </Riquadro>
            <Riquadro titolo="Persone, dalla più carica di ferie" sotto={`Ultima busta disponibile (${meseF ? `${mb(meseF)} ${meseF.slice(0, 4)}` : "—"}). Chi è uscito prima non compare.${conStime ? " La colonna azzurra è la stima a fine mese: saldo della busta meno ferie e permessi che la station ha scritto nel tracking dello stesso mese. Quando arriva la busta dopo, vale la busta." : ""}`}>
              <Tab>
                <thead><tr><th className={th}>Persona</th><th className={th}>Station</th><th className={th}>Qualifica</th><th className={thn}>Ferie residue</th><th className={thn}>Maturate nell&apos;anno</th><th className={thn}>Godute nell&apos;anno</th><th className={thn}>ROL (h)</th><th className={thn}>Ex fest. (h)</th>{conStime && <th className={thn + " bg-sky-50"}>Stima a fine {meseF ? mb(meseF) : ""}<br /><span className="font-normal">ferie · ROL · ex fest.</span></th>}</tr></thead>
                <tbody>{(tuttiFerie ? ordinati : ordinati.slice(0, 40)).map((x) => <tr key={x.station + x.codice} className={(x.ferieSaldo ?? 0) > SOGLIA_FERIE[x.ferieUnita] ? "bg-amber-50" : ""}><td className={td}>{x.nome}</td><td className={td}>{x.station}</td><td className={td}>{x.qualifica}</td><td className={tdn + " font-semibold"}>{x.ferieSaldo !== null ? `${n1(x.ferieSaldo)} ${unita(x.ferieUnita)}` : "—"}{(x.ferieSaldo ?? 0) > SOGLIA_FERIE[x.ferieUnita] && <span className="ml-1 text-xs text-amber-700">▲ alta</span>}</td><td className={tdn}>{x.ferieMatur !== null ? n1(x.ferieMatur) : "—"}</td><td className={tdn}>{x.ferieGoduto !== null ? n1(x.ferieGoduto) : "—"}</td><td className={tdn}>{x.rolSaldo !== null ? n1(x.rolSaldo) : "—"}</td><td className={tdn}>{x.exfestSaldo !== null ? n1(x.exfestSaldo) : "—"}</td>{conStime && (() => { const e = dati.stime[`${x.station}|${x.gruppo}|${x.codice}`]; const f = (v: number | null) => (v === null ? "—" : n1(v)); return <td className={tdn + " bg-sky-50"}>{e ? `${f(e.ferie)} ${unita(x.ferieUnita)} · ${f(e.rol)} · ${f(e.exfest)}` : <span className="text-slate-400">senza tracking</span>}</td>; })()}</tr>)}</tbody>
              </Tab>
              {ordinati.length > 40 && <button className="btn-secondary self-start text-sm" onClick={() => setTuttiFerie(!tuttiFerie)}>{tuttiFerie ? "Mostra le prime 40" : `Mostra tutte (${ordinati.length})`}</button>}
            </Riquadro>
          </>
        );
      })()}

      {scheda === "MULTE" && (() => {
        const TIPI: TipoAddebito[] = ["MULTA", "DANNO", "DISCIPLINARE"];
        const tutti = dati.addebiti.filter(nelFiltro);
        const mesiA = [...new Set(dati.totali.filter((t) => t.gruppo === g).map((t) => t.mese))].sort();
        const sel = tutti.filter((x) => meseMulte === "ANNO" || x.mese === meseMulte);
        const somma = (r: Addebito[], t?: TipoAddebito) => r.filter((x) => !t || x.tipo === t).reduce((a, x) => a + x.importo, 0);
        const persone = addebitiPerPersona(sel);
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {TIPI.map((t) => <Tessera key={t} titolo={`${NOME_ADDEBITO[t]} · ${meseMulte === "ANNO" ? "anno" : mb(meseMulte)}`} valore={eur(somma(sel, t))} nota={`${sel.filter((x) => x.tipo === t).length} addebiti, ${new Set(sel.filter((x) => x.tipo === t).map((x) => x.codice)).size} persone`} />)}
              <Tessera titolo="Totale trattenuto" valore={eur(somma(sel))} nota={`${persone.length} persone`} />
            </div>
            <Riquadro titolo="Per station e mese della busta" sotto="Importi trattenuti in busta alle persone. Danni = danni provocati, risarcimenti e contestazioni di addebito. Negativo = multa restituita.">
              <Tab>
                <thead><tr><th className={th}>Station</th><th className={th}>Tipo</th>{mesiA.map((m) => <th key={m} className={thn}>{mb(m)}</th>)}<th className={thn}>Anno</th></tr></thead>
                <tbody>{[...stations.filter((s) => station === "TUTTE" || s === station), ...(station === "TUTTE" && stations.length > 1 ? ["NETWORK"] : [])].flatMap((s) => TIPI.map((t, i) => { const r = tutti.filter((x) => (s === "NETWORK" || x.station === s) && x.tipo === t); return <tr key={s + t} className={s === "NETWORK" ? "font-semibold" : ""}><td className={td}>{i === 0 ? (s === "NETWORK" ? "Totale" : s) : ""}</td><td className={td + " text-xs text-slate-600"}>{NOME_ADDEBITO[t]}</td>{mesiA.map((m) => { const v = somma(r.filter((x) => x.mese === m)); return <td key={m} className={tdn}>{v ? eur(v) : "—"}</td>; })}<td className={tdn + " font-semibold"}>{somma(r) ? eur(somma(r)) : "—"}</td></tr>; }))}</tbody>
              </Tab>
            </Riquadro>
            <Riquadro titolo="Persone, dalla più addebitata" sotto="Clicca una persona per vedere ogni addebito, mese per mese.">
              <div className="flex flex-wrap gap-2 text-sm"><button className={meseMulte === "ANNO" ? "btn-primary" : "btn-secondary"} onClick={() => setMeseMulte("ANNO")}>Da inizio anno</button><select className="input w-auto" value={meseMulte === "ANNO" ? "" : meseMulte} onChange={(e) => setMeseMulte(e.target.value || "ANNO")} aria-label="Mese"><option value="">Un mese…</option>{mesiA.map((m) => <option key={m} value={m}>{mb(m)} {m.slice(0, 4)}</option>)}</select></div>
              <Tab>
                <thead><tr><th className={th}>Persona</th><th className={th}>Station</th><th className={thn}>Multe stradali</th><th className={thn}>Danni</th><th className={thn}>Disciplinari</th><th className={thn}>Totale</th><th className={thn}>Addebiti</th><th className={th}>Mesi</th></tr></thead>
                <tbody>{persone.map((p) => { const k = p.gruppo + p.station + p.codice, ap = persAperta === k; return (
                  <Fragment key={k}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setPersAperta(ap ? null : k)}><td className={td}>{ap ? "▾ " : "▸ "}{p.nome}</td><td className={td}>{p.station}</td><td className={tdn}>{p.MULTA ? eur(p.MULTA) : "—"}</td><td className={tdn}>{p.DANNO ? eur(p.DANNO) : "—"}</td><td className={tdn}>{p.DISCIPLINARE ? eur(p.DISCIPLINARE) : "—"}</td><td className={tdn + " font-semibold"}>{eur(p.totale)}</td><td className={tdn}>{p.volte}</td><td className={td}>{p.mesi.map(mb).join(", ")}</td></tr>
                    {ap && p.righe.map((x, i) => <tr key={i} className="text-xs text-slate-600"><td className={td + " pl-6"}>{mb(x.mese)} {x.mese.slice(0, 4)}</td><td className={td} colSpan={4}>{NOME_ADDEBITO[x.tipo]} · {x.voce}</td><td className={tdn}>{eur(x.importo)}</td><td className={td} colSpan={2}></td></tr>)}
                  </Fragment>); })}</tbody>
              </Tab>
              {!persone.length && <p className="text-sm text-slate-500">Nessun addebito nel periodo.</p>}
            </Riquadro>
          </>
        );
      })()}
    </div>
  );
}
