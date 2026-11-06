"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { scarica } from "@/lib/presenze/excelUtil";
import { isAnagraficaCDL, leggiAnagraficaCDL, type RigaCDL } from "@/domain/costi/anagrafica";
import { isPayroll, leggiPayroll, totalePayroll, type RigaPayroll } from "@/domain/costi/payroll";
import type { TariffeStd } from "@/domain/costi/adit";
import type { Festivo } from "@/domain/costi/festivi";
import { parametriAlla } from "@/domain/costi/parametri";
import type { ParametriSic } from "@/domain/costi/sic";
import { valoreAlla, type ValorePerData } from "@/domain/costi/tariffe";
import { isPresenzeGls, leggiPresenzeGls, mesePresenzeGls, testeAttive, attivoNel, type PresenzeGls } from "@/domain/gls/presenze";
import { controlloBadgebox, isBadgebox, leggiBadgebox, riepilogoBadgebox, type Badgebox } from "@/domain/gls/badgebox";
import { accantonamentiGls, bustaGls, CDC_GLS, festiviGls, mesePrecGls, oreGls, stimaStdGls, testeStdGls } from "@/domain/gls/costo";
import { excelFOGls, foglioFOGls, type CellaNoleggioGls } from "@/lib/costi/excelFOGls";
import { bloccoOre, foglioStimaPersonale } from "@/lib/costi/excelStimaPersonale";
import type { Bucket } from "@/domain/costi/sic";
import { trovaCDL } from "@/domain/costi/anagrafica";

type Props = {
  mese: string; fineMese: string; canRun: boolean; tariffe: ValorePerData[]; parametri: ValorePerData[]; festivi: Festivo[];
  tariffeStd: TariffeStd | null; meseTariffe: string | null;
  fo: { carburante: number | null; q8File: string | null; autostrade: number | null; telepassFile: string | null; noleggi: CellaNoleggioGls[] };
};

const FOGLIO_CDL_GLS = "SIC GLS BO";
const MESI3 = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const h1 = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const it = (m: string) => m.split("-").reverse().join("/");
const giorno = (d: string) => d.slice(8, 10);

function Semaforo({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const c = ok ? "bg-ok" : warn ? "bg-warn" : "bg-danger";
  return <li className="flex items-start gap-2"><span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c}`} aria-hidden /> <span>{children}</span></li>;
}

export function GlsClient(p: Props) {
  const router = useRouter();
  const mPrec = mesePrecGls(p.mese);
  const [pres, setPres] = useState<Record<string, { nome: string; dati: PresenzeGls }>>({});
  const [cdl, setCdl] = useState<{ nome: string; righe: RigaCDL[]; versione: string | null } | null>(null);
  const [bb, setBb] = useState<{ nome: string; dati: Badgebox } | null>(null);
  const [pay, setPay] = useState<{ nome: string; righe: RigaPayroll[]; dipendenti: number } | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [elettrico, setElettrico] = useState("1500");
  const [danni, setDanni] = useState("4050");
  const [wind, setWind] = useState("1000");
  const [elmec, setElmec] = useState("119,90");
  const n = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

  const aggiungi = async (files: File[]) => {
    setLavoro(true); setErrore(null);
    const out: string[] = [];
    for (const f of files) {
      try {
        const g = await workbookToGrids(await f.arrayBuffer());
        if (isPresenzeGls(g)) {
          const m = mesePresenzeGls(g);
          if (!m) throw new Error("mese del file presenze non riconosciuto");
          const dati = leggiPresenzeGls(g, m);
          setPres((x) => ({ ...x, [m]: { nome: f.name, dati } }));
          out.push(`${f.name}: presenze GLS di ${it(m)} (${dati.griglia.length} persone nella griglia, ${testeAttive(dati.anagrafica)} attive in anagrafica)`);
        } else if (g.some((w) => w.name.trim().toLowerCase() === FOGLIO_CDL_GLS.toLowerCase())) {
          const r = leggiAnagraficaCDL(g, FOGLIO_CDL_GLS);
          setCdl({ nome: f.name, righe: r.righe, versione: r.meseVersione });
          out.push(`${f.name}: CDL GLS (${r.righe.length} righe, ${eur(r.righe.reduce((a, x) => a + x.cdl, 0))} €)`);
        } else if (isBadgebox(g)) {
          const dati = leggiBadgebox(g, p.mese);
          setBb({ nome: f.name, dati });
          out.push(`${f.name}: Badgebox (${dati.persone.length} persone nel gruppo GLS; ${dati.altriGruppi} di altri gruppi ignorate)`);
        } else if (isPayroll(g)) {
          const r = leggiPayroll(g, CDC_GLS);
          setPay({ nome: f.name, righe: r.righe, dipendenti: r.dipendenti });
          out.push(`${f.name}: payroll, CDC ${CDC_GLS}: ${r.dipendenti} dipendenti, ${eur(totalePayroll(r.righe))} €`);
        } else if (isAnagraficaCDL(g)) throw new Error(`è un DB_CDL_base senza il foglio "${FOGLIO_CDL_GLS}"`);
        else throw new Error("file non riconosciuto (presenze GLS, DB_CDL_base, Badgebox o Costi del personale)");
      } catch (e) { out.push(`${f.name}: ${(e as Error).message}`); }
    }
    setMsg(out); setLavoro(false);
  };

  const presM = pres[p.mese]?.dati ?? null, presP = pres[mPrec]?.dati ?? null;
  const par = useMemo(() => parametriAlla(p.parametri.map((x) => ({ chiave: x.voce, validaDal: x.validaDal, valore: x.valore })), p.fineMese), [p.parametri, p.fineMese]);
  const parS: ParametriSic = { MOLT_ONERI: par.SIC_MOLT_ONERI ?? 1.434, STR_FT: par.SIC_STR_FT ?? 17.9, STR_PT: par.SIC_STR_PT ?? 16.1, SUPP: par.SIC_SUPP ?? 14.1, DOMFEST: par.SIC_DOMFEST ?? 4.6, MALATTIA_H: par.SIC_MALATTIA_H ?? -11.46, CARENZA_PCT: par.SIC_CARENZA_PCT ?? 0.635 };

  const ris = useMemo(() => {
    if (!presM) return null;
    const busta = presP && cdl ? bustaGls({ mese: p.mese, variabili: presP, anagMese: presM.anagrafica, cdl: cdl.righe, par: parS, tariffe: p.tariffe, festivi: p.festivi }) : null;
    const acc = cdl ? accantonamentiGls({ presenze: presM, cdl: cdl.righe, par: parS, festivi: p.festivi }) : null;
    const oreSic = oreGls(presM, "SIC", p.festivi, p.tariffe), oreStd = oreGls(presM, "STD", p.festivi, p.tariffe);
    const nFest = festiviGls(p.festivi, p.mese).length;
    const parStd = { CTRB_H: p.tariffeStd?.CTRB_H ?? par.STD_CTRB_H ?? 0.1, ALTRO_PCT: par.STD_ALTRO_PCT ?? 0.002, GG_MESE: par.STD_GG_MESE ?? 26, MOG: 0 };
    const std = p.tariffeStd ? stimaStdGls(oreStd, p.tariffeStd, parStd, nFest) : null;
    const esiti = bb ? controlloBadgebox(presM.griglia, presM.anagrafica, bb.dati) : null;
    return { busta, acc, oreSic, oreStd, std, esiti, testeFt: testeAttive(presM.anagrafica), testeStd: testeStdGls(presM.anagrafica, p.mese) };
  }, [presM, presP, cdl, bb, p.mese, p.tariffe, p.festivi, p.tariffeStd]); // eslint-disable-line react-hooks/exhaustive-deps

  const payTot = pay ? totalePayroll(pay.righe) : null;
  const bustaSic = payTot ?? ris?.busta?.totali.totale ?? null;

  const scaricaFO = async () => {
    if (!ris) return;
    const b = ris.busta?.totali;
    const voci = pay
      ? Object.entries(pay.righe.filter((r) => r.componente !== "RECLASS").reduce<Record<string, number>>((a, r) => ({ ...a, [r.componente]: (a[r.componente] ?? 0) + r.importo }), {})).map(([etichetta, importo]) => ({ etichetta, importo }))
      : b ? [["Base CDL", b.base], ["Trasferte", b.trasferta], ["Straordinari", b.straordinari], ["Festività non godute", b.festivita], ["Malattia (netta carenza)", b.malattia], ["Assenze non pagate (PNR, 104, altri giustificativi)", b.altreAssenze], ["Ferie, ROL ed ExF godute", b.ferieGodute]].map(([etichetta, importo]) => ({ etichetta: etichetta as string, importo: importo as number })) : null;
    // stima: P58 = somma delle voci arrotondate, così il controllo della tabellina è 0
    const p58 = pay ? payTot : voci ? Math.round(voci.reduce((a, v) => a + Math.round(v.importo * 100) / 100, 0) * 100) / 100 : null;
    const wb = excelFOGls({
      mese: p.mese, carburante: p.fo.carburante, elettrico: n(elettrico) || null, noleggi: p.fo.noleggi, danni: n(danni), autostrade: p.fo.autostrade, wind: n(wind), elmec: n(elmec),
      accStraord: ris.acc?.straord ?? null, accFerie: ris.acc?.ferie ?? null,
      bustaSic: p58, trasferta: pay ? pay.righe.filter((r) => r.componente === "TRASFERTA").reduce((a, r) => a + r.importo, 0) : b?.trasferta ?? null,
      bustaNota: pay ? `payroll ${it(p.mese)} CDC ${CDC_GLS} (${pay.dipendenti} dipendenti)` : b ? `stima: CDL GLS${cdl?.versione ? " " + it(cdl.versione) : ""} + variabili delle presenze di ${it(mPrec)} (${b.teste} SIC)` : "manca: carica le presenze del mese prima e il CDL GLS",
      bustaVoci: voci, costoStd: ris.std?.totale ?? null,
      stdNota: ris.std ? `stima STD di competenza: ore STD delle presenze di ${it(p.mese)} × tariffe ADIT ${p.meseTariffe ? it(p.meseTariffe) : ""} (Amazon, finché non arriva l'ADIT CDC 5565)` : "manca: tariffe ADIT non caricate",
      teste: ris.testeFt,
    });
    await scarica(wb, `${foglioFOGls(p.mese).trim()}_GLS_per_Costi_FO.xlsx`);
  };

  const scaricaPersonale = async () => {
    if (!ris || !presM || !cdl || !p.tariffeStd) return;
    const primo = `${p.mese}-01`;
    const idx = new Map(cdl.righe.map((r) => [r.cf, r]));
    const sic = presM.anagrafica.filter((a) => a.tipo === "SIC" && attivoNel(a, primo, p.fineMese));
    const bucket = (a: (typeof sic)[number], c: RigaCDL | null): Bucket => {
      if (/disp/i.test(a.mansione)) return "DISPATCHER";
      const pct = c?.pctPt ?? a.pct ?? 1;
      if ((pct >= 0.99 && pct <= 1) || pct === 100) return "CTI FT";
      return (c?.hSettim ?? a.hSettim) === 32 ? "CTI PT 32h" : "CTI PT";
    };
    const conCdl = sic.map((a) => ({ a, c: trovaCDL(a.cf, idx)?.riga ?? null })).filter((x) => x.c);
    const B: Bucket[] = ["CTI FT", "CTI PT", "CTI PT 32h", "DISPATCHER"];
    const teste = Object.fromEntries(B.map((k) => [k, conCdl.filter((x) => bucket(x.a, x.c) === k).length])) as Record<Bucket, number>;
    const costoMedio = Object.fromEntries(B.map((k) => { const g = conCdl.filter((x) => bucket(x.a, x.c) === k); return [k, g.length ? g.reduce((s, x) => s + x.c!.cdl, 0) / g.length : 0]; })) as Record<Bucket, number>;
    const tr = valoreAlla(p.tariffe, "TRASFERTA", primo) ?? 0, ex = valoreAlla(p.tariffe, "TRASFERTA_DOM_EXTRA", primo) ?? 0;
    const nome = `GLS_${MESI3[Number(p.mese.slice(5, 7)) - 1]}_${p.mese.slice(2, 4)}`;
    const wb = foglioStimaPersonale({
      mese: p.mese, nome, stazioni: [{ codice: "GLS", etichetta: "GLS-CASTELMAGGIORE (BO)" }],
      blocchi: [{ station: "GLS", sic: { ...bloccoOre(ris.oreSic), teste, costoMedio }, std: { ...bloccoOre(ris.oreStd), ...ris.testeStd, altre: ris.std?.nonTracking ?? 0 } }],
      cdlBase: conCdl.reduce((s, x) => s + x.c!.cdl, 0),
      tariffe: { trasf: tr, trasfDom: tr + ex, ...p.tariffeStd }, fonte: "",
      note: [
        `Compilato da FleetDSP (Costi GLS): presenze Castel Maggiore di ${it(p.mese)}, CDL GLS${cdl.versione ? " " + it(cdl.versione) : ""}, tariffe ADIT ${p.meseTariffe ? it(p.meseTariffe) : "—"}. Celle gialle = dati dal sito; le altre sono formule.`,
        "SIC: teste e costo medio per contratto dal CDL (foglio SIC GLS BO) per i SIC attivi nell'Anagrafica del file presenze; ore (Ordinarie, Straordinari) e trasferte (Indennità Trasferta) dalla griglia del mese. MAGG 50% e STR 65% = ore su domenica o festivo.",
        "STD: ore e trasferte degli STD della griglia; teste FT/PT dall'Anagrafica (MOG non è nel file presenze). Riga 32 ALTRE VOCI ADIT = festività, ferie godute, carenza, CTRB e altro stimati come per Amazon.",
        "Rotte (riga 6) non compilate.",
      ],
    });
    await scarica(wb, `${nome}_per_Stima_Costo_personale.xlsx`);
  };

  const scaricaBadgebox = async () => {
    if (!ris?.esiti) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Badgebox ${MESI3[Number(p.mese.slice(5, 7)) - 1]} ${p.mese.slice(0, 4)}`);
    ws.addRow(["Nome", "SIC/STD", "Ore file presenze", "Ore Badgebox", "Scarto (h)", "Mai timbrato", "Giorni lavorati senza timbratura", "Giorni con timbrature senza ore nel file", "Timbrature dispari (entrata senza uscita)", "Timbra ma non è nel file presenze (giorni)"]).font = { bold: true };
    for (const e of ris.esiti) ws.addRow([e.nome, e.tipo, e.oreFile, e.oreBadgebox, e.scarto, e.maiTimbra ? "SÌ" : "", e.giorniSenzaTimbratura.map(giorno).join(", "), e.giorniSenzaOre.map(giorno).join(", "), e.timbratureDispari.map(giorno).join(", "), e.nonNelFile || ""]);
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 32 : i >= 6 ? 34 : 14; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    await scarica(wb, `Controllo_Badgebox_GLS_${p.mese}.xlsx`);
  };

  const rb = ris?.esiti ? riepilogoBadgebox(ris.esiti) : null;
  const b = ris?.busta;
  return (
    <div className="flex flex-col gap-6">
      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Mese:</span>
          <input type="month" className="input w-auto" value={p.mese} onChange={(e) => e.target.value && router.push(`/costi/gls?mese=${e.target.value}`)} aria-label="Mese" />
          <span className="text-ink-muted">busta SIC pagata il 27/{p.mese.slice(5, 7)} con le variabili di {it(mPrec)}</span>
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          <Semaforo ok={!!presM}>Presenze di {it(p.mese)} {presM ? `— ${pres[p.mese].nome}` : "— servono per STD, accantonamenti, teste del foglio _ft e Badgebox"}</Semaforo>
          <Semaforo ok={!!presP}>Presenze di {it(mPrec)} {presP ? `— ${pres[mPrec].nome}` : "— servono per le variabili della busta del mese"}</Semaforo>
          <Semaforo ok={!!cdl}>CDL GLS (DB_CDL_base, foglio SIC GLS BO) {cdl ? `— ${cdl.nome}` : ""}</Semaforo>
          <Semaforo ok={!!p.tariffeStd} warn>Tariffe STD dall&apos;ADIT {p.meseTariffe ? it(p.meseTariffe) : "— non caricato"} (Amazon, finché non arriva l&apos;ADIT CDC 5565)</Semaforo>
          <Semaforo ok={p.fo.carburante !== null} warn>Q8 di {it(p.mese)} {p.fo.carburante !== null ? `— ${eur(p.fo.carburante)} €` : "non elaborato"}</Semaforo>
          <Semaforo ok={p.fo.autostrade !== null} warn>Telepass di {it(p.mese)} {p.fo.autostrade !== null ? `— ${eur(p.fo.autostrade)} €` : "non elaborato"}</Semaforo>
          <Semaforo ok={!!bb} warn>Badgebox {bb ? `— ${bb.nome}` : "(facoltativo: controllo di chi timbra)"}</Semaforo>
          <Semaforo ok={!!pay} warn>Payroll del mese {pay ? `— ${pay.nome}` : "(facoltativo: se c'è, la busta vera sostituisce la stima)"}</Semaforo>
        </ul>
      </section>

      <Dropzone titolo="File GLS del mese" aiuto="costi.gls.file" multiple accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={aggiungi}
        testo={<>Trascina qui insieme: <b>presenze Castel Maggiore</b> di {it(p.mese)} e {it(mPrec)}, il <b>DB_CDL_base</b>, l&apos;export <b>Badgebox</b> e (se c&apos;è) i <b>Costi del personale</b> del mese. Il tipo si riconosce dal contenuto.</>} />
      {msg.length > 0 && <ul className="text-sm text-ink-muted">{msg.map((m) => <li key={m}>{m}</li>)}</ul>}
      {errore && <p role="alert" className="text-sm text-danger">{errore}</p>}

      {b && (
        <section className="card p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">Busta SIC GLS pagata a {it(p.mese)} (stima)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="table-base text-sm">
              <thead><tr><th>Voce</th><th className="text-right">Quantità</th><th className="text-right">€</th></tr></thead>
              <tbody>
                <tr><td>Base CDL ({b.totali.teste} SIC attivi{b.totali.cdlStimati ? `, ${b.totali.cdlStimati} con CDL stimato` : ""})</td><td /><td className="text-right">{eur(b.totali.base)}</td></tr>
                <tr><td>Trasferte di {it(mPrec)}</td><td className="text-right">{b.totali.trasfGg} gg</td><td className="text-right">{eur(b.totali.trasferta)}</td></tr>
                <tr><td>Straordinari × €/h SIC × oneri</td><td className="text-right">{h1(b.totali.oreStraord)} h</td><td className="text-right">{eur(b.totali.straordinari)}</td></tr>
                <tr><td>Festività non godute</td><td className="text-right">{b.totali.festGg} gg</td><td className="text-right">{eur(b.totali.festivita)}</td></tr>
                <tr><td>Malattia {parS.MALATTIA_H} €/h, netta della carenza {Math.round(parS.CARENZA_PCT * 1000) / 10}%</td><td className="text-right">{h1(b.totali.oreMalattia)} h</td><td className="text-right">{eur(b.totali.malattia)}</td></tr>
                <tr><td>Assenze non pagate (PNR, 104, altri giustificativi)</td><td className="text-right">{h1(b.totali.oreAssenze)} h</td><td className="text-right">{eur(b.totali.altreAssenze)}</td></tr>
                <tr><td>Ferie, ROL ed ExF godute (saving CDL)</td><td /><td className="text-right">{eur(b.totali.ferieGodute)}</td></tr>
                <tr className="font-semibold"><td>Totale busta stimata</td><td /><td className="text-right">{eur(b.totali.totale)}</td></tr>
                {payTot !== null && <tr className="font-semibold"><td>Payroll {it(p.mese)} CDC 5565 ({pay!.dipendenti} dipendenti) — usato nel F.O.</td><td /><td className="text-right">{eur(payTot)} ({payTot ? `${((b.totali.totale / payTot - 1) * 100).toFixed(1)}%` : ""})</td></tr>}
              </tbody>
            </table>
          </div>
          {b.senzaCdl.length > 0 && <p className="mt-2 text-sm text-warn">Senza riga nel CDL: {b.senzaCdl.map((x) => `${x.nome} (dal ${x.inizio ? it(x.inizio) : "?"}, ${x.contato ? `stimato ${eur(x.cdl)} €` : "non contato: attivo da prima del mese, da verificare"})`).join("; ")}.</p>}
          {b.cessati.length > 0 && <p className="mt-1 text-sm text-ink-muted">Esclusi perché non più attivi a {it(p.mese)} (busta di chiusura già pagata): {b.cessati.length}.</p>}
        </section>
      )}

      {ris && (
        <section className="card p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">Mese di competenza {it(p.mese)}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            <li>Teste attive in anagrafica (foglio _ft, voci b e c): <b>{ris.testeFt}</b> → b {eur(ris.testeFt * 129.25)} €, c {eur(ris.testeFt * 37.42)} €</li>
            <li>SIC: {ris.oreSic.teste} persone, ordinarie {h1(ris.oreSic.standard)} h, straordinari {h1(ris.oreSic.straord)} h, trasferte {ris.oreSic.trasfGg} gg</li>
            {ris.acc && <li>Accantonamenti SIC del mese (F.O. righe 60–61): straordinari e festività {eur(ris.acc.straord)} €, ferie/ROL/ExF {eur(ris.acc.ferie)} €</li>}
            <li>STD: {ris.oreStd.teste} persone ({ris.testeStd.ft} FT, {ris.testeStd.pt} PT attivi), ordinarie {h1(ris.oreStd.standard)} h, straordinari {h1(ris.oreStd.straord)} h, trasferte {ris.oreStd.trasfGg} gg{ris.std ? <> → stima STD <b>{eur(ris.std.totale)} €</b></> : " — stima STD: mancano le tariffe ADIT"}</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1">Carburante elettrico € <input className="input w-28" inputMode="decimal" value={elettrico} onChange={(e) => setElettrico(e.target.value)} /></label>
            <label className="flex items-center gap-1">Danni forfait € <input className="input w-28" inputMode="decimal" value={danni} onChange={(e) => setDanni(e.target.value)} /></label>
            <label className="flex items-center gap-1">Wind € <input className="input w-24" inputMode="decimal" value={wind} onChange={(e) => setWind(e.target.value)} /></label>
            <label className="flex items-center gap-1">Elmec € <input className="input w-24" inputMode="decimal" value={elmec} onChange={(e) => setElmec(e.target.value)} /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" onClick={scaricaFO}>Fogli {foglioFOGls(p.mese).trim()} e {p.mese.slice(5, 7)}{p.mese.slice(2, 4)}_ft (Costi F.O. GLS)</button><Aiuto k="costi.gls.fo" />
            <button type="button" className="btn-secondary" disabled={!cdl || !p.tariffeStd} onClick={scaricaPersonale}>Foglio GLS_{MESI3[Number(p.mese.slice(5, 7)) - 1]}_{p.mese.slice(2, 4)} (Stima costo personale)</button><Aiuto k="costi.gls.personale" />
          </div>
        </section>
      )}

      {rb && ris?.esiti && (
        <section className="card p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">Controllo Badgebox: chi timbra</h2>
          <p className="text-sm text-ink-muted">È un controllo, non una correzione: il costo si calcola sempre dal file presenze. La tabella si manda al referente di sede.</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            <li>Lavorano nel file presenze ma non timbrano mai: <b>{rb.maiTimbra}</b> ({rb.maiTimbraStd} STD, {rb.maiTimbraSic} SIC)</li>
            <li>Giorni lavorati nel file senza ore Badgebox: <b>{rb.giorniSenzaTimbratura}</b> su {rb.personeSenzaTimbratura} persone</li>
            <li>Scarto ore file − Badgebox oltre 8 h nel mese: <b>{rb.oltreSoglia}</b> persone</li>
            <li>Giorni con timbrature e nessuna ora nel file: {rb.giorniSenzaOre}; timbrature dispari: {rb.dispari}; timbrano nel gruppo GLS ma non sono nel file presenze: {rb.nonNelFile}</li>
          </ul>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="table-base text-sm">
              <thead><tr><th>Nome</th><th>Tipo</th><th className="text-right">Ore file</th><th className="text-right">Ore Badgebox</th><th className="text-right">Scarto</th><th>Anomalie</th></tr></thead>
              <tbody>
                {ris.esiti.map((e) => (
                  <tr key={e.cf}>
                    <td>{e.nome}</td><td>{e.tipo}</td><td className="text-right">{h1(e.oreFile)}</td><td className="text-right">{h1(e.oreBadgebox)}</td><td className="text-right">{h1(e.scarto)}</td>
                    <td>{[e.maiTimbra && "mai timbrato", e.nonNelFile && `non nel file presenze (${e.nonNelFile} gg timbrati)`, e.giorniSenzaTimbratura.length && `senza timbratura il ${e.giorniSenzaTimbratura.map(giorno).join(", ")}`, e.giorniSenzaOre.length && `timbra senza ore il ${e.giorniSenzaOre.map(giorno).join(", ")}`, e.timbratureDispari.length && `dispari il ${e.timbratureDispari.map(giorno).join(", ")}`].filter(Boolean).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-secondary mt-3" onClick={scaricaBadgebox}>Scarica anomalie Badgebox (Excel)</button><Aiuto k="costi.gls.badgebox" />
        </section>
      )}
    </div>
  );
}
