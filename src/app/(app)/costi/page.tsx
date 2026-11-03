import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { utenteCosti, versioniCDL } from "./dati";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costi del personale — FleetDSP" };

const eur = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 0 });

/** Indice: griglia mesi × (stima STD, stima SIC, ADIT ricevuto, payroll ricevuto, delta %). */
export default async function CostiPage() {
  await utenteCosti();
  const [stime, adit, payroll, versioni] = await Promise.all([
    db.stimaCosti.groupBy({ by: ["mese", "popolazione"], _sum: { importo: true } }).catch(() => []),
    db.aditRiga.groupBy({ by: ["meseFattura"], _sum: { costo: true } }).catch(() => []),
    db.payrollRiga.groupBy({ by: ["mesePaga"], _sum: { importo: true } }).catch(() => []),
    versioniCDL(),
  ]);
  const mesi = new Set<string>();
  const st = new Map<string, number>();
  for (const s of stime) { mesi.add(s.mese); st.set(`${s.mese}|${s.popolazione}`, Number(s._sum.importo ?? 0)); }
  const ad = new Map(adit.map((a) => { mesi.add(a.meseFattura); return [a.meseFattura, Number(a._sum.costo ?? 0)]; }));
  // payroll del mese M+1 (paga del 27) ↔ stima SIC di M
  const prec = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, "0")}`; };
  const pa = new Map(payroll.map((p) => { mesi.add(prec(p.mesePaga)); return [prec(p.mesePaga), Number(p._sum.importo ?? 0)]; }));
  const elenco = [...mesi].sort().reverse();
  const delta = (s?: number, c?: number) => (s && c ? `${(((s - c) / c) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, signDisplay: "always" })} %` : "—");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Costi del personale" title="Costi del personale a fine mese"
        subtitle="STD (Adecco): costo di competenza del mese, confrontato con l'ADIT che arriva ~5 settimane dopo. SIC (interni): busta che si paga il 27 del mese dopo, confrontata con i Costi del personale PS." />
      <section className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Mesi</h2>
        {elenco.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessuna stima salvata e nessun consuntivo caricato. Si parte da <Link className="underline" href="/costi/parametri">Parametri e anagrafica</Link>: controlla tariffe e festivi e carica l&apos;anagrafica CDL. Il calcolo di fine mese arriva con la prossima versione.</p>
        ) : (
          <div className="overflow-x-auto"><table className="table-base text-sm">
            <thead><tr><th>Mese (competenza)</th><th className="text-right">Stima STD €</th><th className="text-right">ADIT €</th><th className="text-right">Δ STD</th><th className="text-right">Stima SIC €</th><th className="text-right">Payroll M+1 €</th><th className="text-right">Δ SIC</th></tr></thead>
            <tbody>{elenco.map((m) => {
              const s1 = st.get(`${m}|STD`), c1 = ad.get(m), s2 = st.get(`${m}|SIC`), c2 = pa.get(m);
              return <tr key={m}><td className="font-semibold">{m.split("-").reverse().join("/")}</td><td className="text-right font-mono">{s1 ? eur(s1) : "—"}</td><td className="text-right font-mono">{c1 ? eur(c1) : "—"}</td><td className="text-right font-mono">{delta(s1, c1)}</td><td className="text-right font-mono">{s2 ? eur(s2) : "—"}</td><td className="text-right font-mono">{c2 ? eur(c2) : "—"}</td><td className="text-right font-mono">{delta(s2, c2)}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </section>
      <p className="text-sm text-ink-muted">Anagrafica CDL in uso: {versioni[0] ? <b>{versioni[0].mese.split("-").reverse().join("/")} ({versioni[0].teste} teste, CDL {eur(versioni[0].cdl)} €)</b> : "nessuna"}.</p>
    </div>
  );
}
