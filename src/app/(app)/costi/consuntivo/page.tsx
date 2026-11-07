import Link from "next/link";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { coefficientiMese, mediaMobile, riconciliaSic, riconciliaStd, type Colore } from "@/domain/costi/riconciliazione";
import { parametriAlla, PARAMETRI } from "@/domain/costi/parametri";
import { aditConfronto, anagraficaRighe, mesePrec, meseSucc, mesiAdit, mesiPayroll, parametri, payrollEuro, payrollPerStation, stimaSalvata, utenteCosti, versioniCDL } from "../dati";
import { AggiornaParametri, ConsuntivoClient, SalvaRiconciliazione } from "./ConsuntivoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consuntivo costi del personale — FleetDSP" };

const eur = (v: number) => (Math.round(v) || 0).toLocaleString("it-IT");
const it = (m: string) => m.split("-").reverse().join("/");
const pct = (s: number, c: number) => (c ? `${(((s - c) / c) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, signDisplay: "always" })} %` : "—");
const BG: Record<Colore, string> = { verde: "bg-ok-soft text-ok", giallo: "bg-warn-soft text-warn", rosso: "bg-danger-soft text-danger", neutro: "" };

export default async function ConsuntivoPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await utenteCosti("costi.view");
  const [adit, pay, versioni, par] = await Promise.all([mesiAdit(), mesiPayroll(), versioniCDL(), parametri()]);
  const q = (await searchParams).mese;
  const mesi = [...new Set([...adit.map((a) => a.mese), ...pay.map((p) => mesePrec(p.mese))])].sort().reverse();
  const mese = q && /^\d{4}-\d{2}$/.test(q) ? q : mesi[0] ?? null;
  const righeCdl = versioni[0] ? (await anagraficaRighe(versioni[0].mese)).map((r) => ({ cognome: r.cognome, nome: r.nome, station: r.station, contratto: r.contratto })) : [];

  let std = null, sic = null, stimaStd = null, stimaSic = null, agg = null;
  if (mese) {
    const pagaM1 = meseSucc(mese);
    const [sS, sC, a, p] = await Promise.all([stimaSalvata(mese, "STD"), stimaSalvata(mese, "SIC"), aditConfronto(mese), payrollPerStation(pagaM1)]);
    stimaStd = sS; stimaSic = sC;
    if (sS && a.length) std = riconciliaStd(sS.righe, a);
    const molt = parametriAlla(par, `${mese}-28`).SIC_MOLT_ONERI ?? 1.434;
    if (sC && Object.keys(p).length) sic = riconciliaSic(sC.righe, p, molt);
    // "Aggiorna parametri": payroll degli ultimi 3 mesi fino a M+1, ore dalla stima SIC del mese prima di ciascuno
    const paghe = pay.map((x) => x.mese).filter((m) => m <= pagaM1).sort().slice(-3);
    if (paghe.length) {
      const perMese = await Promise.all(paghe.map(async (pm) => {
        const [e, s] = await Promise.all([payrollEuro(pm), stimaSalvata(mesePrec(pm), "SIC")]);
        const q = (v: string) => s ? s.righe.filter((r) => r.voce === v).reduce((t, r) => t + (r.quantita ?? 0), 0) : 0;
        const c = e.componenti, i = e.istituti;
        const imponibile = (c.BASE ?? 0) + (c.ASSENZE ?? 0) + (c.STR_SUPP_MAGG ?? 0) + (c.FESTIVITA ?? 0) + (c.CARENZA_INTEGR ?? 0) + (c.INDENNITA_FISSE ?? 0);
        const ore = s && s.righe.some((r) => r.voce === "ORE_SUPP") ? { strFt: q("ORE_STR_FT"), strPt: q("ORE_STR_PT"), supp: q("ORE_SUPP"), domFest: q("ORE_DOMFEST"), malattia: q("ORE_MALATTIA") } : null;
        return { pm, ore: !!ore, coeff: coefficientiMese({ strFt: i.STR_FT ?? 0, strPt: i.STR_PT ?? 0, supp: i.SUPP ?? 0, magg: i.MAGG ?? 0, malattia: i.MALATTIA ?? 0, carenza: i.CARENZA_INTEGR ?? 0, oneri: c.ONERI ?? 0, tfr: c.TFR ?? 0, imponibile }, ore) };
      }));
      const dopo = mediaMobile(perMese.map((x) => x.coeff));
      const validaDal = `${meseSucc(paghe[paghe.length - 1])}-01`;
      const prima = parametriAlla(par, validaDal);
      agg = { validaDal, perMese, dopo, prima, fonte: `payroll ${paghe.map(it).join(", ")} (media mobile)` };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Personale · consuntivo" title="Consuntivo e riconciliazione"
        subtitle="Quando arrivano le fatture ADIT (~5 settimane dopo il mese) e i Costi del personale PS (dopo il 27), trascinali qui: il sito confronta la stima STD di M con l'ADIT di M e la stima SIC di M con la paga del mese dopo." />
      {can(user, "costi.run") && <ConsuntivoClient righeCdl={righeCdl} />}

      <div className="flex flex-wrap items-center gap-2 text-sm">Mese di competenza:
        {mesi.map((m) => <Link key={m} href={`?mese=${m}`} className={`rounded-full border px-3 py-1 ${m === mese ? "border-brand bg-brand text-white" : "border-[#d5dbe3]"}`}>{it(m)}</Link>)}
        {!mesi.length && <span className="text-ink-muted">nessun consuntivo caricato</span>}
      </div>

      {mese && (
        <section className="card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[19px] font-semibold">STD {it(mese)}: stima vs ADIT {it(mese)}</h2>
            {std && can(user, "costi.run") && <SalvaRiconciliazione mese={mese} popolazione="STD" righe={[...std.righe.map((r) => ({ station: r.station, voce: r.voce, stima: r.stima, consuntivo: r.consuntivo, delta: r.delta })), ...std.sintesi.map((s) => ({ station: s.station, voce: "TOTALE", stima: s.stima, consuntivo: s.consuntivo, delta: s.delta }))]} />}
          </div>
          {!std ? <p className="text-sm text-ink-muted">{!stimaStd ? <>Nessuna stima STD salvata per {it(mese)} (<Link className="underline" href={`/costi/fine-mese?mese=${mese}`}>Fine mese</Link>).</> : `ADIT ${it(mese)} non ancora caricato.`}</p> : (
            <>
              <div className="overflow-x-auto"><table className="table-base text-sm">
                <thead><tr><th>Station</th><th className="text-right">Stima €</th><th className="text-right">ADIT €</th><th className="text-right">Δ €</th><th className="whitespace-nowrap text-right">Δ %</th><th className="text-right">di cui tariffe</th><th className="text-right">ore</th><th className="text-right">trasferte</th><th className="text-right">voci non da tracking</th><th className="text-right">voci non modellate</th><th className="text-right">residui altri mesi</th></tr></thead>
                <tbody>{std.sintesi.map((s) => <tr key={s.station}><td className="font-semibold">{s.station}</td><td className="text-right font-mono">{eur(s.stima)}</td><td className="text-right font-mono">{eur(s.consuntivo)}</td><td className="text-right font-mono">{eur(s.delta)}</td><td className={`text-right font-mono ${BG[s.colore]}`}>{pct(s.stima, s.consuntivo)}</td>
                  {[s.tariffe, s.ore, s.trasferte, s.nonTracking, s.nonModellate, s.residui].map((v, i) => <td key={i} className="text-right font-mono">{eur(v)}</td>)}</tr>)}
                  {(() => { const S = std.sintesi.reduce((a, s) => a + s.stima, 0), C = std.sintesi.reduce((a, s) => a + s.consuntivo, 0); return <tr className="font-semibold"><td>Totale</td><td className="text-right font-mono">{eur(S)}</td><td className="text-right font-mono">{eur(C)}</td><td className="text-right font-mono">{eur(S - C)}</td><td className="text-right font-mono">{pct(S, C)}</td>{(["tariffe", "ore", "trasferte", "nonTracking", "nonModellate", "residui"] as const).map((k) => <td key={k} className="text-right font-mono">{eur(std.sintesi.reduce((a, s) => a + s[k], 0))}</td>)}</tr>; })()}
                </tbody>
              </table></div>
              <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Dettaglio station × voce</summary>
                <div className="mt-2 overflow-x-auto"><table className="table-base text-xs">
                  <thead><tr><th>Station</th><th>Voce</th><th className="text-right">Ore stima</th><th className="text-right">Ore ADIT</th><th className="text-right">€ stima</th><th className="text-right">€ ADIT</th><th className="text-right">Δ €</th><th className="text-right">Δ %</th></tr></thead>
                  <tbody>{std.righe.map((r) => <tr key={r.station + r.voce}><td>{r.station}</td><td>{r.voce}</td><td className="text-right font-mono">{r.oreStima?.toLocaleString("it-IT", { maximumFractionDigits: 1 }) ?? ""}</td><td className="text-right font-mono">{r.oreCons?.toLocaleString("it-IT", { maximumFractionDigits: 1 }) ?? ""}</td><td className="text-right font-mono">{eur(r.stima)}</td><td className="text-right font-mono">{eur(r.consuntivo)}</td><td className="text-right font-mono">{eur(r.delta)}</td><td className={`text-right font-mono ${BG[r.colore]}`}>{pct(r.stima, r.consuntivo)}</td></tr>)}</tbody>
                </table></div></details>
            </>
          )}
        </section>
      )}

      {mese && (
        <section className="card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[19px] font-semibold">SIC {it(mese)}: stima busta vs paga del 27/{it(meseSucc(mese))}</h2>
            {sic && can(user, "costi.run") && <SalvaRiconciliazione mese={mese} popolazione="SIC" righe={sic.flatMap((s) => s.righe.map((r) => ({ station: s.station, voce: r.voce, stima: r.stima, consuntivo: r.consuntivo, delta: r.delta })))} />}
          </div>
          {!sic ? <p className="text-sm text-ink-muted">{!stimaSic ? <>Nessuna stima SIC salvata per {it(mese)}.</> : `Costi del personale ${it(meseSucc(mese))} non ancora caricati.`}</p> : (
            <div className="overflow-x-auto"><table className="table-base text-sm">
              <thead><tr><th>Station</th><th className="text-right">Teste / dip.</th>{sic[0].righe.map((r) => <th key={r.voce} className="text-right">{r.voce}<br /><span className="font-normal normal-case">stima · paga · Δ %</span></th>)}</tr></thead>
              <tbody>{sic.map((s) => <tr key={s.station}><td className="font-semibold">{s.station}</td><td className="text-right font-mono">{s.teste ?? "—"} / {s.dipendenti}</td>
                {s.righe.map((r) => <td key={r.voce} className={`text-right font-mono text-xs ${r.voce === "TOTALE" ? BG[r.colore] : ""}`}>{eur(r.stima)} · {eur(r.consuntivo)} · <span className={BG[r.colore]}>{pct(r.stima, r.consuntivo)}</span></td>)}</tr>)}</tbody>
            </table></div>
          )}
          <p className="mt-2 text-xs text-ink-muted">Altri istituti e assenze della paga × moltiplicatore oneri, per confrontarli con la stima (che li include). &quot;(non in anagrafica)&quot; = dipendenti della paga non trovati per nome nell&apos;anagrafica CDL. Colori: entro ±5 % verde, ±15 % giallo, oltre rosso.</p>
        </section>
      )}

      {agg && (
        <section className="card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[19px] font-semibold">Aggiorna parametri SIC (validi dal {it(agg.validaDal)})</h2>
            {can(user, "costi.parametri") && <AggiornaParametri validaDal={agg.validaDal} valori={agg.dopo} fonte={agg.fonte} />}
          </div>
          <p className="mb-3 text-sm text-ink-muted">€/h = € della paga / ore del tracking del mese prima (dalla stima SIC salvata), media mobile degli ultimi {agg.perMese.length} mesi: {agg.perMese.map((x) => `${it(x.pm)}${x.ore ? "" : " (senza ore: solo oneri e carenza)"}`).join(", ")}. Le tariffe STD non servono: si prendono sempre dall&apos;ultimo ADIT.</p>
          <table className="table-base text-sm"><thead><tr><th>Coefficiente</th><th className="text-right">Prima</th><th className="text-right">Dopo</th>{agg.perMese.map((x) => <th key={x.pm} className="text-right">paga {it(x.pm)}</th>)}</tr></thead>
            <tbody>{Object.keys(PARAMETRI).filter((k) => k.startsWith("SIC_")).map((k) => <tr key={k}><td>{PARAMETRI[k].etichetta}</td><td className="text-right font-mono">{agg.prima[k]?.toLocaleString("it-IT", { maximumFractionDigits: 4 }) ?? "—"}</td>
              <td className="text-right font-mono font-semibold">{agg.dopo[k]?.toLocaleString("it-IT", { maximumFractionDigits: 4 }) ?? "invariato"}</td>{agg.perMese.map((x) => <td key={x.pm} className="text-right font-mono">{x.coeff[k]?.toLocaleString("it-IT", { maximumFractionDigits: 4 }) ?? "—"}</td>)}</tr>)}</tbody></table>
        </section>
      )}

      <section className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Consuntivi caricati</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <table className="table-base text-sm"><thead><tr><th>ADIT (mese)</th><th className="text-right">Righe</th><th className="text-right">€ CDC 5569</th></tr></thead>
            <tbody>{adit.map((a) => <tr key={a.mese}><td>{it(a.mese)}</td><td className="text-right font-mono">{a.righe.toLocaleString("it-IT")}</td><td className="text-right font-mono">{eur(a.costo)}</td></tr>)}</tbody></table>
          <table className="table-base text-sm"><thead><tr><th>Payroll (mese di paga)</th><th className="text-right">Righe</th><th className="text-right">€ CDC 5569</th></tr></thead>
            <tbody>{pay.map((a) => <tr key={a.mese}><td>{it(a.mese)}</td><td className="text-right font-mono">{a.righe.toLocaleString("it-IT")}</td><td className="text-right font-mono">{eur(a.importo)}</td></tr>)}</tbody></table>
        </div>
      </section>
    </div>
  );
}
