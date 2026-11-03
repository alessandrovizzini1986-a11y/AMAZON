import Link from "next/link";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { DS_FATTURATO, indicatoriDs, meseClasse, meseDs, settimanaDs, type Griglia, type RigaFatturato } from "@/domain/fatture/fatturato";
import { stationUtente, utenteCon } from "../dati";
import { Export } from "./Export";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fatturato Amazon — FleetDSP" };

const MESI = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const eur = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const VISTE = { ds: "Mese × DS", classe: "Mese × classe", settimana: "Settimana × DS", indicatori: "Rotte e € per rotta" } as const;

async function righe(anno: number, ds: string | null): Promise<RigaFatturato[]> {
  const r = await db.amazonInvoiceLine.findMany({
    where: { anno, ...(ds ? { ds } : {}) },
    select: { ds: true, anno: true, mese: true, week: true, classe: true, avere: true, quantita: true },
  });
  return r.map((x) => ({ ...x, avere: Number(x.avere) }));
}

export default async function FatturatoPage({ searchParams }: { searchParams: Promise<{ anno?: string; vista?: string; mese?: string; ds?: string }> }) {
  const user = await utenteCon("fatturato.view");
  const p = await searchParams;
  const solo = await stationUtente(user); // RESP_MEZZI: solo la propria station
  const anniDb = await db.amazonInvoiceLine.findMany({ distinct: ["anno"], select: { anno: true }, orderBy: { anno: "desc" }, ...(solo ? { where: { ds: solo } } : {}) });
  const anni = anniDb.map((a) => a.anno);
  const anno = Number(p.anno) || anni[0] || new Date().getFullYear();
  const vista = (p.vista && p.vista in VISTE ? p.vista : "ds") as keyof typeof VISTE;
  const [att, prec] = await Promise.all([righe(anno, solo), righe(anno - 1, solo)]);
  const colDs = solo ? [solo] : DS_FATTURATO;
  const g: Griglia = vista === "classe" ? meseClasse(att, anno) : vista === "settimana" ? settimanaDs(att, anno, colDs) : meseDs(att, anno, colDs);
  const gPrec = prec.length ? meseDs(prec, anno - 1, colDs) : null;
  const mese = Number(p.mese) || null;
  const indicatori = indicatoriDs(att, (r) => !mese || r.mese === mese, colDs);
  const link = (q: Record<string, string | number | null>) => `/fatture-amazon/fatturato?${new URLSearchParams(Object.entries({ anno, vista, ...q }).filter(([, v]) => v !== null && String(v) !== "").map(([k, v]) => [k, String(v)])).toString()}`;
  const dett = mese && p.ds && (!solo || p.ds === solo)
    ? await db.amazonInvoice.findMany({ where: { righe: { some: { anno, mese, ds: p.ds } } }, orderBy: { numero: "asc" }, include: { righe: { where: { anno, mese, ds: p.ds }, select: { avere: true } } } })
    : null;
  const puoRegistro = can(user, "fatture.registro");
  const etichetta = vista === "settimana" ? "Settimana" : "Mese";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={solo ? `Fatture Amazon · fatturato ${solo}` : "Fatture Amazon · fatturato"} title={`Fatturato Amazon ${anno}${solo ? ` · ${solo}` : ""}`}
        subtitle="AVERE (netto IVA) per giorno di servizio della riga, non per data fattura. Fonti: storico del file AGGREGATO e fatture caricate dai PDF." />
      <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Le ultime 2 settimane possono essere incomplete: fatture di rettifica e incentivi arrivano con circa 2 settimane di ritardo.</p>

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(VISTE).map(([k, l]) => <Link key={k} href={link({ vista: k })} className={vista === k ? "btn-primary h-10" : "btn-secondary h-10"}>{l}</Link>)}
        <span className="mx-2 h-6 w-px bg-line" />
        {anni.map((a) => <Link key={a} href={`/fatture-amazon/fatturato?anno=${a}&vista=${vista}`} className={a === anno ? "badge-ok" : "badge-neutral"}>{a}</Link>)}
      </div>

      {att.length === 0 ? (
        <p className="card p-5 text-sm text-ink-muted">Nessuna riga per il {anno}. L&apos;admin carica lo storico da <b>Allinea e storico</b>; le fatture importate dai PDF si aggiungono da sole.</p>
      ) : vista === "indicatori" ? (
        <section className="card overflow-x-auto p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[19px] font-semibold">Rotte e € per rotta {mese ? `· ${MESI[mese]} ${anno}` : `· anno ${anno}`}</h2>
            <Link href={link({ vista: "indicatori" })} className={!mese ? "badge-ok" : "badge-neutral"}>anno</Link>
            {[...new Set(att.map((r) => r.mese))].sort((a, b) => a - b).map((m) => <Link key={m} href={link({ vista: "indicatori", mese: m })} className={mese === m ? "badge-ok" : "badge-neutral"}>{MESI[m]}</Link>)}
          </div>
          <table className="table-base text-sm">
            <thead><tr><th>DS</th><th className="text-right">Rotte</th><th className="text-right">AVERE rotte</th><th className="text-right">€ per rotta</th><th className="text-right">AVERE extra</th><th className="text-right">Extra per rotta</th><th className="text-right">AVERE totale</th></tr></thead>
            <tbody>{indicatori.map((x) => <tr key={x.ds}><td className="font-mono font-semibold">{x.ds}</td><td className="text-right">{x.rotte.toLocaleString("it-IT")}</td><td className="text-right font-mono">{eur(x.avereRotte)}</td><td className="text-right font-mono font-semibold">{eur(x.euroPerRotta)}</td><td className="text-right font-mono">{eur(x.avereExtra)}</td><td className="text-right font-mono">{eur(x.extraPerRotta)}</td><td className="text-right font-mono">{eur(x.avere)}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-ink-faint">Rotte = somma delle quantità delle classi ND_* e SD_*. Extra = tutte le classi EXTRA_* (carburante, bonus, abort, training, incentivi, altro).</p>
        </section>
      ) : (
        <section className="card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[19px] font-semibold">{VISTE[vista]} · {anno}</h2>
            <Export titolo={`${VISTE[vista]} ${anno}`} etichetta={etichetta} g={g} nome={`fatturato_${vista}_${anno}${solo ? "_" + solo : ""}.xlsx`} />
          </div>
          <div className="overflow-x-auto">
            <table className="table-base text-sm">
              <thead><tr><th>{etichetta}</th>{g.colonne.map((c) => <th key={c} className="text-right">{c}</th>)}<th className="text-right">TOTALE</th>{vista === "ds" && gPrec && <><th className="text-right">{anno - 1}</th><th className="text-right">Δ %</th></>}</tr></thead>
              <tbody>
                {g.righe.map((r) => {
                  const k = String(r);
                  const pr = gPrec?.totRiga[k];
                  return (
                    <tr key={k}>
                      <td className="font-semibold">{vista === "settimana" ? `Sett. ${r}` : MESI[Number(r)]}</td>
                      {g.colonne.map((c) => (
                        <td key={c} className="text-right font-mono">
                          {vista === "ds" && g.valori[k][c] ? <Link className="hover:text-brand hover:underline" href={link({ mese: k, ds: c })}>{eur(g.valori[k][c])}</Link> : g.valori[k][c] ? eur(g.valori[k][c]) : ""}
                        </td>
                      ))}
                      <td className="text-right font-mono font-semibold">{eur(g.totRiga[k])}</td>
                      {vista === "ds" && gPrec && <><td className="text-right font-mono text-ink-muted">{pr ? eur(pr) : "—"}</td><td className={`text-right font-mono ${pr ? (g.totRiga[k] >= pr ? "text-ok" : "text-danger") : ""}`}>{pr ? `${(((g.totRiga[k] - pr) / pr) * 100).toFixed(1)}%` : "—"}</td></>}
                    </tr>
                  );
                })}
                <tr className="border-t-2 font-bold"><td>TOTALE</td>{g.colonne.map((c) => <td key={c} className="text-right font-mono">{eur(g.totCol[c])}</td>)}<td className="text-right font-mono">{eur(g.totale)}</td>{vista === "ds" && gPrec && <><td className="text-right font-mono">{eur(gPrec.totale)}</td><td /></>}</tr>
              </tbody>
            </table>
          </div>
          {vista === "ds" && <p className="mt-2 text-xs text-ink-faint">Clicca un importo per vedere le fatture di quel mese e quella DS.</p>}
        </section>
      )}

      {dett && (
        <section className="card overflow-x-auto p-4 md:p-5">
          <h2 className="mb-3 text-[19px] font-semibold">Fatture {p.ds} · {MESI[mese!]} {anno} ({dett.length})</h2>
          <table className="table-base text-sm">
            <thead><tr><th>Numero</th><th>Tipo</th><th>Periodo</th><th>Fonte</th><th className="text-right">AVERE nel mese</th><th className="text-right">AVERE fattura</th></tr></thead>
            <tbody>
              {dett.map((f) => (
                <tr key={f.id}>
                  <td className="font-mono text-xs">{puoRegistro ? <Link className="text-brand hover:underline" href={`/fatture-amazon/registro?q=${f.numero}`}>{f.numero}</Link> : f.numero}</td>
                  <td>{f.tipo}</td><td>{f.periodoDa.toLocaleDateString("it-IT", { timeZone: "UTC" })} – {f.periodoA.toLocaleDateString("it-IT", { timeZone: "UTC" })}</td><td>{f.fonte}</td>
                  <td className="text-right font-mono">{eur(f.righe.reduce((s, x) => s + Number(x.avere), 0))}</td><td className="text-right font-mono">{eur(Number(f.sommaAvere))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
