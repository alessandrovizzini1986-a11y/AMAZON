import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { meseScelto } from "@/lib/meseServer";
import { etichettaMese, meseSpostato } from "@/lib/mesi";
import { PageHeader } from "@/components/ui";
import { SelettoreMese } from "@/components/SelettoreMese";
import { SchedePagina } from "@/components/SchedePagina";
import { contoEconomico } from "@/lib/conto/dati";
import { VOCI_COSTO, type Fonte, type RigaConto } from "@/domain/conto/economico";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conto economico — FleetDSP" };

const eur = (x: number | null) => (x === null ? "—" : x.toLocaleString("it-IT", { maximumFractionDigits: 0 }));
const ETICHETTA: Record<string, string> = { personale: "Personale", mezzi: "Mezzi", carburante: "Carburante", pedaggi: "Pedaggi", parcheggi: "Parcheggi", altri: "Altri" };

function Cella({ f }: { f: Fonte }) {
  return <td className="text-right font-mono" title={f.fonte || undefined}>{f.valore === null ? <span className="text-ink-muted" title={f.fonte}>—</span> : eur(f.valore)}</td>;
}
function Margine({ r }: { r: RigaConto }) {
  return (
    <>
      <td className={`text-right font-mono font-semibold ${r.margine !== null && r.margine < 0 ? "text-danger" : ""}`}>{eur(r.margine)}</td>
      <td className={`text-right ${r.marginePct !== null && r.marginePct < 0 ? "text-danger" : ""}`}>{r.marginePct === null ? "—" : `${r.marginePct.toLocaleString("it-IT")} %`}</td>
    </>
  );
}
function Kpi({ titolo, r, nota }: { titolo: string; r: RigaConto; nota: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="text-sm font-semibold text-ink-muted">{titolo}</div>
      <div className="text-[26px] font-bold">{r.margine === null ? "—" : `${eur(r.margine)} €`}</div>
      <div className="text-sm">margine {r.marginePct === null ? "" : `(${r.marginePct.toLocaleString("it-IT")} %)`} · ricavi {eur(r.ricavi.valore)} € · costi {eur(r.totaleCosti)} €</div>
      {r.costi.personale.valore === null && <div className="text-xs font-semibold text-warn">Manca il costo del personale: il margine non è attendibile.</div>}
      <div className="text-xs text-ink-muted">{nota}</div>
    </div>
  );
}

export default async function ContoEconomicoPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await requireUser();
  if (!can(user, "costi.view")) redirect("/");
  const mese = await meseScelto((await searchParams).mese, meseSpostato(new Date().toISOString().slice(0, 7), -1));
  const anno = mese.slice(0, 4);
  const conti = await contoEconomico(`${anno}-01`, `${anno}-12`);
  const qui = conti.find((c) => c.mese === mese)!;
  const mancanti = [...qui.perStation.flatMap((r) => [r.ricavi, ...VOCI_COSTO.map((v) => r.costi[v])]).filter((f) => f.valore === null && f.fonte).map((f) => f.fonte)];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Home" title="Conto economico"
        subtitle="Per cliente e mese: ricavi meno costi di personale, mezzi, carburante, pedaggi e parcheggi, con quello che il sito ha già. Amazon (CDC 5569) per DS, GLS (CDC 5565) con la fattura open book stimata. È una vista di controllo: i numeri ufficiali restano quelli dei file F.O." />
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <SelettoreMese value={mese} href="/conto-economico" />
        <Link href="/costi/fine-mese" className="btn-secondary">Fogli F.O. Amazon</Link>
        <Link href="/costi/gls" className="btn-secondary">Fogli F.O. GLS</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Kpi titolo={`Amazon · ${etichettaMese(mese)}`} r={qui.amazon} nota="Ricavi = imponibile delle fatture Amazon caricate nel mese." />
        <Kpi titolo={`GLS · ${etichettaMese(mese)}`} r={qui.gls} nota="Ricavi = fattura open book stimata (costi del mese prima + accessori + 7 % + 6,5 %)." />
      </div>
      {mancanti.length > 0 && (
        <details className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">
          <summary className="cursor-pointer font-semibold">Dati mancanti per {etichettaMese(mese)}: {new Set(mancanti).size}</summary>
          <ul className="mt-1 list-disc pl-5">{[...new Set(mancanti)].map((m) => <li key={m}>{m}</li>)}</ul>
        </details>
      )}
      <SchedePagina schede={[{ id: "mese", label: `${etichettaMese(mese)} per DS` }, { id: "anno", label: `Andamento ${anno}` }]} />
      <section data-scheda="mese" className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">{etichettaMese(mese)} per DS (€, IVA esclusa)</h2>
        <p className="mb-3 text-xs text-ink-muted">Passa il mouse su un numero per vedere da dove viene. — = dato mancante.</p>
        <table className="table-base text-sm">
          <thead><tr><th>DS</th><th className="text-right">Ricavi</th>{VOCI_COSTO.map((v) => <th key={v} className="text-right">{ETICHETTA[v]}</th>)}<th className="text-right">Costi</th><th className="text-right">Margine</th><th className="text-right">%</th></tr></thead>
          <tbody>
            {[...qui.perStation.filter((r) => r.chiave !== "GLS"), qui.amazon, qui.gls].map((r) => (
              <tr key={r.chiave} className={r.chiave === "Amazon" || r.chiave === "GLS" ? "font-semibold" : ""}>
                <td>{r.chiave === "Amazon" ? "Totale Amazon" : r.chiave}</td><Cella f={r.ricavi} />{VOCI_COSTO.map((v) => <Cella key={v} f={r.costi[v]} />)}
                <td className="text-right font-mono">{eur(r.totaleCosti)}</td><Margine r={r} />
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section data-scheda="anno" className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Andamento {anno} (€)</h2>
        <table className="table-base text-sm">
          <thead><tr><th>Mese</th><th className="text-right">Amazon ricavi</th><th className="text-right">Amazon costi</th><th className="text-right">Amazon margine</th><th className="text-right">%</th><th className="text-right">GLS ricavi</th><th className="text-right">GLS costi</th><th className="text-right">GLS margine</th><th className="text-right">%</th></tr></thead>
          <tbody>
            {conti.filter((c) => c.amazon.ricavi.valore !== null || c.gls.totaleCosti > 0).map((c) => (
              <tr key={c.mese} className={c.mese === mese ? "bg-brand-light" : ""}>
                <td><Link className="underline" href={`/conto-economico?mese=${c.mese}`}>{etichettaMese(c.mese)}</Link></td>
                <Cella f={c.amazon.ricavi} /><td className="text-right font-mono">{eur(c.amazon.totaleCosti)}</td><Margine r={c.amazon} />
                <Cella f={c.gls.ricavi} /><td className="text-right font-mono">{eur(c.gls.totaleCosti)}</td><Margine r={c.gls} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-muted">Il personale SIC è la busta del mese (pagata il 27 del mese dopo); dove c&apos;è il consuntivo (ADIT, payroll) vale lui. I mezzi sono i canoni del sito pro-rata ai giorni nella station: danni, officine e multe non ci sono.</p>
      </section>
    </div>
  );
}
